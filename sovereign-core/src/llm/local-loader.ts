/**
 * Local LLM Provider — loads GGUF files via node-llama-cpp in-process.
 *
 * Falls back gracefully if node-llama-cpp is not available or fails to load.
 * Auto-scans ~/.sovereign/models/ for .gguf files on boot.
 */

import path from "node:path";
import os from "node:os";
import { existsSync, readdirSync, statSync, mkdirSync } from "node:fs";

export interface LocalModelConfig {
  modelPath: string;
  gpuLayers?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
}

export interface LocalModelInfo {
  name: string;
  path: string;
  size: number;
  loaded: boolean;
}

export const DEFAULT_MODELS_DIR = path.join(os.homedir(), ".sovereign", "models");

let llamaInstance: any = null;
let currentModelPath: string | null = null;

/**
 * Scan for GGUF files in the models directory.
 */
export function scanLocalModels(modelsDir?: string): LocalModelInfo[] {
  const dir = modelsDir ?? DEFAULT_MODELS_DIR;
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".gguf"));
  return files.map((name) => {
    const fullPath = path.join(dir, name);
    let size = 0;
    try { size = statSync(fullPath).size; } catch {}
    return { name, path: fullPath, size, loaded: fullPath === currentModelPath };
  });
}

/**
 * Load a GGUF model via node-llama-cpp.
 */
export async function loadModel(config: LocalModelConfig): Promise<{ success: boolean; error?: string }> {
  // Unload existing model first
  if (llamaInstance) {
    await unloadModel();
  }

  if (!existsSync(config.modelPath)) {
    return { success: false, error: `Model file not found: ${config.modelPath}` };
  }

  try {
    const { LlamaModel, LlamaContext, LlamaChatSession } = await tryImportNodeLlamaCpp();
    if (!LlamaModel) {
      return { success: false, error: "node-llama-cpp not available (native addon not compiled)" };
    }

    const model = new LlamaModel({
      modelPath: config.modelPath,
      gpuLayers: config.gpuLayers ?? 0,
      useMlock: false,
    });

    const context = new LlamaContext({
      model,
      contextSize: config.contextSize ?? 1024,
      batchSize: config.batchSize ?? 512,
      threads: config.threads ?? 2,
    });

    const session = new LlamaChatSession({ context });

    llamaInstance = { model, context, session };
    currentModelPath = config.modelPath;

    console.log(`[LocalLLM] Loaded: ${path.basename(config.modelPath)}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LocalLLM] Failed to load model: ${message}`);
    llamaInstance = null;
    currentModelPath = null;
    return { success: false, error: message };
  }
}

/**
 * Unload the current model to free memory.
 */
export async function unloadModel(): Promise<void> {
  if (!llamaInstance) return;
  try {
    // node-llama-cpp doesn't have explicit unload, but we null the references
    // and let GC handle it. The native addon should release the memory.
    llamaInstance.session = null;
    llamaInstance.context = null;
    llamaInstance.model = null;
    llamaInstance = null;
    currentModelPath = null;
    console.log("[LocalLLM] Model unloaded");
  } catch (err) {
    console.error("[LocalLLM] Error unloading model:", err);
  }
}

/**
 * Chat with the loaded model.
 */
export async function chat(
  messages: Array<{ role: string; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): Promise<{ content: string }> {
  if (!llamaInstance) {
    throw new Error("No model loaded. Call loadModel() first.");
  }

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  const systemMessage = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");

  const prompt = systemMessage
    ? `${systemMessage}\n\nUser: ${lastUserMessage?.content ?? ""}\nAssistant:`
    : lastUserMessage?.content ?? "";

  const response = await llamaInstance.session.prompt(prompt, {
    maxTokens: options?.maxTokens ?? 256,
    temperature: options?.temperature ?? 0.7,
    topP: 0.9,
  });

  return { content: response };
}

/**
 * Stream chat with the loaded model.
 */
export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
): AsyncIterable<string> {
  if (!llamaInstance) {
    throw new Error("No model loaded. Call loadModel() first.");
  }

  const lastUserMessage = messages.filter((m) => m.role === "user").pop();
  const systemMessage = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");

  const prompt = systemMessage
    ? `${systemMessage}\n\nUser: ${lastUserMessage?.content ?? ""}\nAssistant:`
    : lastUserMessage?.content ?? "";

  const stream = await llamaInstance.session.prompt(prompt, {
    maxTokens: options?.maxTokens ?? 256,
    temperature: options?.temperature ?? 0.7,
    topP: 0.9,
    onToken: (token: string) => token,
  });

  for await (const chunk of stream) {
    yield chunk;
  }
}

export function isLoaded(): boolean {
  return llamaInstance !== null;
}

export function getLoadedModelPath(): string | null {
  return currentModelPath;
}

// Ensure models directory exists
export function ensureModelsDir(modelsDir?: string): string {
  const dir = modelsDir ?? DEFAULT_MODELS_DIR;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Try to import node-llama-cpp. Returns null if not available.
 */
async function tryImportNodeLlamaCpp(): Promise<{
  LlamaModel: any;
  LlamaContext: any;
  LlamaChatSession: any;
}> {
  try {
    const mod = await import("node-llama-cpp");
    return {
      LlamaModel: mod.LlamaModel,
      LlamaContext: mod.LlamaContext,
      LlamaChatSession: mod.LlamaChatSession,
    };
  } catch {
    console.warn("[LocalLLM] node-llama-cpp not available. Install with: bun add node-llama-cpp");
    return { LlamaModel: null, LlamaContext: null, LlamaChatSession: null };
  }
}
