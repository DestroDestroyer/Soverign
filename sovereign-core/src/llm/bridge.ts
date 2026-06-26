/**
 * LLM Bridge — unified query router with automatic fallback.
 * Reads config.yaml to determine provider priority and falls back
 * on failure. Never surfaces provider errors to the user — it tries
 * the next provider transparently.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.sovereign', 'config.yaml');

export interface BridgeOptions {
  temperature?: number;
  maxTokens?: number;
  system?: string;
  stream?: boolean;
}

export interface BridgeResult {
  text: string;
  provider: string;
  model: string;
  fallback: boolean;
}

export interface ProviderHealth {
  provider: string;
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/** Read the current default model from config.yaml */
function readConfigModel(): { provider: string; model: string } {
  try {
    if (!existsSync(CONFIG_PATH)) return { provider: 'ollama', model: 'qwen2.5:1.5b' };
    const yaml = readFileSync(CONFIG_PATH, 'utf8');
    const match = yaml.match(/default:\s*"([^"]+)"/);
    if (!match) return { provider: 'ollama', model: 'qwen2.5:1.5b' };
    const [providerPart, ...modelParts] = match[1].split(':');
    return { provider: providerPart, model: modelParts.join(':') };
  } catch {
    return { provider: 'ollama', model: 'qwen2.5:1.5b' };
  }
}

/** Ping Ollama to check if it's alive */
export async function checkProviderHealth(provider: string): Promise<ProviderHealth> {
  const start = Date.now();
  try {
    if (provider === 'ollama') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
      clearTimeout(timer);
      return { provider, ok: res.ok, latencyMs: Date.now() - start };
    }
    if (provider === 'openrouter') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
      clearTimeout(timer);
      return { provider, ok: res.ok, latencyMs: Date.now() - start };
    }
    // Cloud providers assumed available if network is up
    return { provider, ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { provider, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Query Ollama directly via its REST API */
async function queryOllama(
  model: string,
  prompt: string,
  options: BridgeOptions
): Promise<string> {
  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      system: options.system,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
        num_ctx: 8192,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response;
}

/** Query OpenRouter (free tier if no key) */
async function queryOpenRouter(
  model: string,
  prompt: string,
  options: BridgeOptions,
  apiKey?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://sovereign.app',
    'X-Title': 'Sovereign AI',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'qwen/qwen-2.5-coder-1.5b-instruct:free',
      messages: [
        ...(options.system ? [{ role: 'system', content: options.system }] : []),
        { role: 'user', content: prompt },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Main bridge entry point.
 * Tries the configured primary provider, falls back to alternatives.
 */
export async function queryLlm(
  prompt: string,
  options: BridgeOptions = {}
): Promise<BridgeResult> {
  const { provider, model } = readConfigModel();

  const FALLBACK_CHAIN = [
    { provider, model },
    { provider: 'ollama', model: 'qwen2.5:1.5b' },
    { provider: 'openrouter', model: 'qwen/qwen-2.5-coder-1.5b-instruct:free' },
  ];

  const tried = new Set<string>();
  for (const { provider: p, model: m } of FALLBACK_CHAIN) {
    const key = `${p}:${m}`;
    if (tried.has(key)) continue;
    tried.add(key);

    try {
      let text = '';
      if (p === 'ollama') {
        text = await queryOllama(m, prompt, options);
      } else if (p === 'openrouter') {
        text = await queryOpenRouter(m, prompt, options);
      } else {
        continue; // Other providers route through main manager
      }
      return { text, provider: p, model: m, fallback: key !== `${provider}:${model}` };
    } catch (err) {
      console.warn(`[Bridge] Provider ${p}:${m} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return {
    text: 'All LLM providers failed. Please check Ollama is running or configure a cloud provider.',
    provider: 'none',
    model: 'none',
    fallback: true,
  };
}
