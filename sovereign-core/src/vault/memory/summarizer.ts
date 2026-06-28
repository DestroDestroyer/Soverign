import type { MemoryOrchestrator } from './orchestrator.ts';

export class MemorySummarizer {
  private orchestrator: MemoryOrchestrator;
  private summarizeIntervalMs: number;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(orchestrator: MemoryOrchestrator, intervalMs = 3_600_000) {
    this.orchestrator = orchestrator;
    this.summarizeIntervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.run().catch(() => {}), this.summarizeIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async run(): Promise<void> {
    const stats = await this.orchestrator.stats();
    for (const [engine, s] of Object.entries(stats)) {
      if (s.total > 1000) {
        console.log(`[Memory] ${engine}: ${s.total} entries (age: ${Math.round((Date.now() - s.oldestEntry) / 86400000)}d) — consider archiving`);
      }
    }
  }
}
