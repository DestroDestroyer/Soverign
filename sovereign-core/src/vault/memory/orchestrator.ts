import type { MemoryEngine, MemoryEntry, MemorySearchResult } from './types.ts';
import { SQLiteMemoryEngine } from './sqlite-engine.ts';

export class MemoryOrchestrator {
  private engines: MemoryEngine[] = [];
  private sqlite: SQLiteMemoryEngine;

  constructor() {
    this.sqlite = new SQLiteMemoryEngine();
    this.engines.push(this.sqlite);
  }

  registerEngine(engine: MemoryEngine): void {
    if (!this.engines.find(e => e.name === engine.name)) {
      this.engines.push(engine);
    }
  }

  async store(
    content: string,
    source: MemoryEntry['source'] = 'chat',
    priority: MemoryEntry['priority'] = 'normal',
    metadata: Record<string, unknown> = {},
    ttlMs?: number,
  ): Promise<string[]> {
    const ids: string[] = [];
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    for (const engine of this.engines) {
      try {
        const id = await engine.store({ content, source, priority, metadata, expires_at: expiresAt } as any);
        ids.push(id);
      } catch (err) {
        console.warn(`[Memory] ${engine.name} store failed:`, (err as Error).message);
      }
    }
    return ids;
  }

  async search(query: string, limit = 10): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    for (const engine of this.engines) {
      try {
        const hits = await engine.search(query, limit);
        results.push(...hits);
      } catch (err) {
        console.warn(`[Memory] ${engine.name} search failed:`, (err as Error).message);
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async get(id: string): Promise<MemoryEntry | null> {
    for (const engine of this.engines) {
      try {
        const entry = await engine.get(id);
        if (entry) return entry;
      } catch (err) {
        console.warn(`[Memory] ${engine.name}.get() failed:`, (err as Error).message);
      }
    }
    return null;
  }

  async forget(id: string): Promise<boolean> {
    for (const engine of this.engines) {
      try { await engine.forget(id); } catch (err) {
        console.warn(`[Memory] ${engine.name}.forget() failed:`, (err as Error).message);
      }
    }
    return true;
  }

  async flush(): Promise<void> {
    for (const engine of this.engines) {
      try { await engine.flush(); } catch (err) {
        console.warn(`[Memory] ${engine.name}.flush() failed:`, (err as Error).message);
      }
    }
  }

  async stats(): Promise<Record<string, { total: number; avgAccessCount: number; oldestEntry: number }>> {
    const result: Record<string, any> = {};
    for (const engine of this.engines) {
      try {
        result[engine.name] = await engine.stats();
      } catch (err) {
        console.warn(`[Memory] ${engine.name}.stats() failed:`, (err as Error).message);
      }
    }
    return result;
  }

  sweep(): number {
    return this.sqlite.sweep();
  }
}
