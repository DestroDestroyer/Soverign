import type {
  LLMProvider,
  LLMMessage,
  LLMOptions,
  LLMResponse,
  LLMStreamEvent,
  LLMTool,
  LLMToolCall,
} from './provider.ts';
import { classifyHttpStatus } from './provider.ts';
import { compactHistory, calculateHistoryBudget } from './history.ts';

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
};

type OllamaToolDef = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OllamaResponse = {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaStreamChunk = {
  model: string;
  created_at: string;
  message?: {
    role: 'assistant';
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaModelInfo = {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
};

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl = 'http://localhost:11434', defaultModel = 'sam860/falcon-h1:1.5b-deep-Q4_0') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultModel = defaultModel;
  }

  async chat(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const { model = this.defaultModel, temperature, max_tokens, num_ctx, tools, keep_alive } = options;

    // Compact history budget: if caller specified num_ctx use that, otherwise
    // let Ollama auto-size (avoids 400 errors on models with small contexts).
    const ctxSize = num_ctx ?? 4096;
    const budget = calculateHistoryBudget(ctxSize);
    const compactedMessages = messages.length < 3 ? messages : compactHistory(messages, budget);

    const keepAlive = keep_alive ?? process.env.SOVEREIGN_OLLAMA_KEEP_ALIVE ?? "2m";
    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(compactedMessages),
      stream: false,
      keep_alive: keepAlive,
    };

    // Build Ollama options bag — only include fields explicitly set.
    // DO NOT hardcode num_ctx; many small models (0.5B–1.5B) only support
    // 2048–4096 tokens and Ollama returns HTTP 400 if num_ctx exceeds
    // the model's maximum, causing the "AI provider rejected" error.
    const ollamaOptions: Record<string, unknown> = {};
    if (num_ctx !== undefined) ollamaOptions.num_ctx = num_ctx;
    if (temperature !== undefined) ollamaOptions.temperature = temperature;
    // Lift the default 128-token cap so responses aren't truncated.
    if (max_tokens !== undefined) ollamaOptions.num_predict = max_tokens;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    // Only attach tools if the model should support them (no-op guard).
    if (tools && tools.length > 0) {
      body.tools = this.convertTools(tools);
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const lowerError = errorText.toLowerCase();
      // If the model doesn't support tool calls, retry WITHOUT tools.
      // Guard: only retry if we actually sent tools (prevents infinite loop).
      if (
        response.status === 400 &&
        (lowerError.includes('does not support tools') || lowerError.includes('does not support tool')) &&
        tools && tools.length > 0
      ) {
        console.warn(`[Ollama] Model '${model}' does not support tools — retrying without tools.`);
        return this.chat(messages, { ...options, tools: undefined });
      }
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as OllamaResponse;
    return this.convertResponse(data);
  }

  async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncIterable<LLMStreamEvent> {
    const { model = this.defaultModel, temperature, max_tokens, num_ctx, tools, keep_alive } = options;

    // Mirror chat()'s approach: don't hardcode num_ctx.
    const ctxSize = num_ctx ?? 4096;
    const budget = calculateHistoryBudget(ctxSize);
    const compactedMessages = messages.length < 3 ? messages : compactHistory(messages, budget);

    const keepAlive = keep_alive ?? process.env.SOVEREIGN_OLLAMA_KEEP_ALIVE ?? "2m";
    const body: Record<string, unknown> = {
      model,
      messages: this.convertMessages(compactedMessages),
      stream: true,
      keep_alive: keepAlive,
    };

    // See chat() for why num_ctx is optional — hardcoding causes HTTP 400
    // on small models that have a lower context ceiling.
    const ollamaOptions: Record<string, unknown> = {};
    if (num_ctx !== undefined) ollamaOptions.num_ctx = num_ctx;
    if (temperature !== undefined) ollamaOptions.temperature = temperature;
    if (max_tokens !== undefined) ollamaOptions.num_predict = max_tokens;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    if (tools && tools.length > 0) {
      body.tools = this.convertTools(tools);
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const lowerError = errorText.toLowerCase();
      // Retry stream without tools if model doesn't support them.
      // Guard: only if tools were actually sent (prevents infinite recursion).
      if (
        response.status === 400 &&
        (lowerError.includes('does not support tools') || lowerError.includes('does not support tool')) &&
        tools && tools.length > 0
      ) {
        console.warn(`[Ollama] Model '${model}' does not support tools — retrying stream without tools.`);
        yield* this.stream(messages, { ...options, tools: undefined });
        return;
      }
      yield {
        type: 'error',
        error: `Ollama API error (${response.status}): ${errorText}`,
        code: classifyHttpStatus(response.status),
      };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body', code: 'network' };
      return;
    }

    let accumulatedText = '';
    const toolCalls: LLMToolCall[] = [];
    let responseModel = model;
    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let readerDone = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { readerDone = true; break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;
            responseModel = chunk.model;

            if (chunk.message?.content) {
              accumulatedText += chunk.message.content;
              yield { type: 'text', text: chunk.message.content };
            }

            if (chunk.message?.tool_calls) {
              for (const toolCall of chunk.message.tool_calls) {
                const id = `ollama_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                const call: LLMToolCall = {
                  id,
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                };
                toolCalls.push(call);
                yield { type: 'tool_call', tool_call: call };
              }
            }

            if (chunk.done) {
              inputTokens = chunk.prompt_eval_count || 0;
              outputTokens = chunk.eval_count || 0;

              yield {
                type: 'done',
                response: {
                  content: accumulatedText,
                  tool_calls: toolCalls,
                  usage: { input_tokens: inputTokens, output_tokens: outputTokens },
                  model: responseModel,
                  finish_reason: toolCalls.length > 0 ? 'tool_use' : 'stop',
                },
              };
            }
          } catch (err) {
            console.error('Failed to parse Ollama chunk:', err);
          }
        }
      }
    } catch (err) {
      yield { type: 'error', error: `Stream error: ${err}`, code: 'network' };
    } finally {
      // Ensure the reader is always cancelled so the underlying HTTP
      // connection is released, even if the caller breaks early.
      if (!readerDone) {
        try { reader.cancel(); } catch {}
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as { models: OllamaModelInfo[] };
        return (data.models ?? []).map(m => m.name).sort();
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      // Return empty array — don't return fake models that will cause further errors.
      console.warn('[Ollama] Could not list models (is Ollama running?):', err instanceof Error ? err.message : err);
      return [];
    }
  }

  private convertMessages(messages: LLMMessage[]): OllamaMessage[] {
    return messages.map(m => {
      if (typeof m.content === 'string') {
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
      }

      // ContentBlock[] — extract text and images separately
      let text = '';
      const images: string[] = [];

      for (const block of m.content) {
        if (block.type === 'text') {
          text += (text ? '\n' : '') + block.text;
        } else if (block.type === 'image') {
          images.push(block.source.data);
        }
      }

      const msg: OllamaMessage = {
        role: m.role as 'system' | 'user' | 'assistant',
        content: text,
      };
      if (images.length > 0) {
        msg.images = images;
      }
      return msg;
    });
  }

  private convertTools(tools: LLMTool[]): OllamaToolDef[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private convertResponse(response: OllamaResponse): LLMResponse {
    const content = response.message.content;
    const tool_calls: LLMToolCall[] = [];

    if (response.message.tool_calls) {
      for (const toolCall of response.message.tool_calls) {
        const id = `ollama_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        tool_calls.push({
          id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
    }

    return {
      content,
      tool_calls,
      usage: {
        input_tokens: response.prompt_eval_count || 0,
        output_tokens: response.eval_count || 0,
      },
      model: response.model,
      finish_reason: tool_calls.length > 0 ? 'tool_use' : 'stop',
    };
  }
}
