/**
 * Xenova Whisper STT — in-process speech-to-text via @xenova/transformers.
 *
 * Runs Whisper Tiny English (75MB) directly in-process using ONNX runtime.
 * No external server needed.
 */

import type { STTProvider } from "./voice.ts";

let pipelineModule: any = null;

export class XenovaWhisperSTT implements STTProvider {
  private transcriber: any = null;
  private modelId: string;
  private loaded = false;

  constructor(modelId: string = "Xenova/whisper-tiny.en") {
    this.modelId = modelId;
  }

  /**
   * Load the Whisper model into memory.
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const { pipeline } = await import("@xenova/transformers");
      pipelineModule = pipeline;
      this.transcriber = await pipeline("automatic-speech-recognition", this.modelId);
      this.loaded = true;
      console.log(`[XenovaWhisper] Loaded: ${this.modelId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[XenovaWhisper] Failed to load: ${message}`);
      throw new Error(`Whisper model load failed: ${message}`);
    }
  }

  /**
   * Transcribe audio buffer to text.
   * Audio must be 16kHz PCM mono float32.
   */
  async transcribe(audio: Buffer): Promise<string> {
    if (!this.loaded || !this.transcriber) {
      await this.load();
    }

    try {
      // Convert Buffer to Float32Array (assumes 16-bit PCM at 16kHz)
      const float32Audio = this.bufferToFloat32(audio);

      const result = await this.transcriber(float32Audio, {
        return_timestamps: false,
        language: "en",
        task: "transcribe",
      });

      return (result as any).text ?? "";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[XenovaWhisper] Transcribe error: ${message}`);
      throw new Error(`Whisper transcription failed: ${message}`);
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Convert a Buffer of 16-bit PCM audio to Float32Array for the model.
   * Assumes: sample rate 16000Hz, mono, 16-bit signed little-endian PCM.
   */
  private bufferToFloat32(buffer: Buffer): Float32Array {
    const numSamples = Math.floor(buffer.length / 2);
    const float32 = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      // Read 16-bit signed integer, little-endian
      const sample = buffer.readInt16LE(i * 2);
      // Convert to float32 in range [-1, 1]
      float32[i] = sample / 32768.0;
    }

    return float32;
  }
}

/**
 * Check if the Xenova Whisper model is cached locally.
 */
export async function checkWhisperModelCached(modelId: string = "Xenova/whisper-tiny.en"): Promise<boolean> {
  try {
    const { env } = await import("@xenova/transformers");
    // Transformers.js caches models in ~/.cache/huggingface/
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cacheDir = path.join(os.homedir(), ".cache", "huggingface", "hub");
    const modelDirName = `models--${modelId.replace("/", "--")}`;
    const modelDir = path.join(cacheDir, modelDirName);
    return fs.existsSync(modelDir);
  } catch {
    return false;
  }
}

import os from "node:os";
