import { MemoryOrchestrator } from './orchestrator.ts';

export class MemorySweeper {
  private orchestrator: MemoryOrchestrator;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;

  constructor(orchestrator: MemoryOrchestrator, intervalMs = 300_000) {
    this.orchestrator = orchestrator;
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.sweep(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private sweep(): void {
    try {
      const deleted = this.orchestrator.sweep();
      if (deleted > 0) {
        console.log(`[MemorySweeper] Swept ${deleted} expired entries`);
      }
    } catch (err) {
      console.warn('[MemorySweeper] Sweep failed:', (err as Error).message);
    }
  }
}
