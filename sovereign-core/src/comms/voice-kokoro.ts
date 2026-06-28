/**
 * Kokoro TTS — in-process text-to-speech via kokoro-js.
 *
 * Pure JS/ONNX inference. 82M parameter model. Multiple voices.
 * Runs entirely in-process with no external server or cloud dependency.
 */

import type { TTSProvider } from "./voice.ts";

export class KokoroTTSProvider implements TTSProvider {
  private tts: any = null;
  private voice: string;
  private loaded = false;

  constructor(voice: string = "af_heart") {
    this.voice = voice;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const { KokoroTTS } = await import("kokoro-js");
      this.tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {
          dtype: "q8",
          device: "cpu",
        },
      );

      if (!this.tts) {
        throw new Error("KokoroTTS.from_pretrained returned null");
      }

      this.loaded = true;
      console.log(`[KokoroTTS] Loaded (voice: ${this.voice})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[KokoroTTS] Failed to load: ${message}`);
      this.tts = null;
    }
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.loaded || !this.tts) {
      await this.load();
    }

    if (!this.tts) {
      console.warn("[KokoroTTS] Not available, returning empty audio");
      return Buffer.alloc(0);
    }

    try {
      const result = await this.tts.generate(text, { voice: this.voice });

      // The result is a RawAudio object with .audio (Float32Array) and .sampleRate
      if (result?.audio instanceof Float32Array) {
        return this.float32ToWav(result.audio, result.sampleRate ?? 24000);
      }

      // If the result itself is a Float32Array
      if (result instanceof Float32Array) {
        return this.float32ToWav(result, 24000);
      }

      // If result has a toWav() method
      if (result?.toWav) {
        const wav = await result.toWav();
        if (Buffer.isBuffer(wav)) return wav;
        if (wav instanceof ArrayBuffer) return Buffer.from(wav);
        if (wav instanceof Uint8Array) return Buffer.from(wav);
      }

      return Buffer.alloc(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[KokoroTTS] Synthesis error: ${message}`);
      return Buffer.alloc(0);
    }
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    const sentences = this.splitIntoSentences(text);

    for (const sentence of sentences) {
      const audio = await this.synthesize(sentence);
      if (audio.length > 0) {
        yield audio;
      }
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  setVoice(voice: string): void {
    this.voice = voice;
  }

  getVoice(): string {
    return this.voice;
  }

  static getAvailableVoices(): Array<{ id: string; name: string; gender: string }> {
    return [
      { id: "af_heart", name: "af_heart (Default Female)", gender: "female" },
      { id: "af_bella", name: "af_bella", gender: "female" },
      { id: "af_nicole", name: "af_nicole", gender: "female" },
      { id: "af_sarah", name: "af_sarah", gender: "female" },
      { id: "af_sky", name: "af_sky", gender: "female" },
      { id: "am_adam", name: "am_adam (Male)", gender: "male" },
      { id: "am_michael", name: "am_michael", gender: "male" },
      { id: "am_george", name: "am_george", gender: "male" },
      { id: "bf_emma", name: "bf_emma (British Female)", gender: "female" },
      { id: "bf_isabella", name: "bf_isabella (British Female)", gender: "female" },
      { id: "bm_george", name: "bm_george (British Male)", gender: "male" },
      { id: "bm_lewis", name: "bm_lewis (British Male)", gender: "male" },
    ];
  }

  private float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const buffer = Buffer.alloc(totalSize);

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(totalSize - 8, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      buffer.writeInt16LE(Math.round(intSample), offset);
      offset += 2;
    }

    return buffer;
  }

  private splitIntoSentences(text: string): string[] {
    const collapsed = text.replace(/```[\s\S]*?```/g, "[code block]");
    const sentences = collapsed
      .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\n\n)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return sentences.length > 0 ? sentences : [text];
  }
}
