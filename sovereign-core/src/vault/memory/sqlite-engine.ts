import { getDb, generateId } from '../schema.ts';
import type { MemoryEngine, MemoryEntry, MemorySearchResult, MemorySource, MemoryPriority } from './types.ts';

export class SQLiteMemoryEngine implements MemoryEngine {
  readonly name = 'sqlite';

  constructor() {
    this.ensureTable();
  }

  private ensureTable(): void {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS memory_store (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'chat',
      priority TEXT NOT NULL DEFAULT 'normal',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed INTEGER NOT NULL DEFAULT 0
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_store(expires_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_source ON memory_store(source)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_priority ON memory_store(priority)`);
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'access_count' | 'last_accessed'>): Promise<string> {
    const db = getDb();
    const id = generateId();
    const now = Date.now();
    db.prepare(`INSERT INTO memory_store (id, content, source, priority, metadata, created_at, expires_at, access_count, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`).run(
      id, entry.content, entry.source, entry.priority,
      JSON.stringify(entry.metadata), now, entry.expires_at ?? null
    );
    return id;
  }

  async search(query: string, limit = 10): Promise<MemorySearchResult[]> {
    const db = getDb();
    const now = Date.now();
    db.prepare(`DELETE FROM memory_store WHERE expires_at IS NOT NULL AND expires_at < ?`).run(now);
    const rows = db.prepare(`SELECT * FROM memory_store WHERE content LIKE ? ORDER BY priority DESC, created_at DESC LIMIT ?`)
      .all(`%${query}%`, limit) as any[];
    return rows.map((r: any) => ({
      entry: this.parseRow(r),
      score: r.content.toLowerCase().includes(query.toLowerCase()) ? 0.9 : 0.5,
      engine: 'sqlite',
    }));
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM memory_store WHERE id = ?`).get(id) as any;
    if (!row) return null;
    db.prepare(`UPDATE memory_store SET access_count = access_count + 1, last_accessed = ? WHERE id = ?`).run(Date.now(), id);
    return this.parseRow(row);
  }

  async forget(id: string): Promise<boolean> {
    const db = getDb();
    const result = db.prepare(`DELETE FROM memory_store WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  async flush(): Promise<void> {
    const db = getDb();
    db.exec(`DELETE FROM memory_store`);
  }

  async stats(): Promise<{ total: number; avgAccessCount: number; oldestEntry: number }> {
    const db = getDb();
    const row = db.prepare(`SELECT COUNT(*) as total, COALESCE(AVG(access_count),0) as avgAccess, COALESCE(MIN(created_at),0) as oldest FROM memory_store`).get() as any;
    return { total: row.total, avgAccessCount: row.avgAccess, oldestEntry: row.oldest };
  }

  /** Sweep expired entries. Returns count deleted. */
  sweep(): number {
    const db = getDb();
    const result = db.prepare(`DELETE FROM memory_store WHERE expires_at IS NOT NULL AND expires_at < ?`).run(Date.now());
    return result.changes;
  }

  private parseRow(r: any): MemoryEntry {
    return {
      id: r.id,
      content: r.content,
      source: r.source as MemorySource,
      priority: r.priority as MemoryPriority,
      metadata: JSON.parse(r.metadata || '{}'),
      created_at: r.created_at,
      expires_at: r.expires_at,
      access_count: r.access_count,
      last_accessed: r.last_accessed,
    };
  }
}
