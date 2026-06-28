import { getDb, generateId } from '../schema.ts';
import type { GraphStore, Triple } from './types.ts';

export class SQLiteGraphStore implements GraphStore {
  constructor() {
    this.ensureTable();
  }

  private ensureTable(): void {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS graph_triples (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_text TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source TEXT,
      timestamp INTEGER NOT NULL
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_subject ON graph_triples(subject)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_predicate ON graph_triples(predicate)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_object ON graph_triples(object_text)`);
  }

  async insert(triple: Triple): Promise<void> {
    const db = getDb();
    db.prepare(`INSERT INTO graph_triples (id, subject, predicate, object_text, confidence, source, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      generateId(), triple.subject, triple.predicate, triple.object,
      triple.confidence ?? 1.0, triple.source ?? null, triple.timestamp ?? Date.now()
    );
  }

  async bulkInsert(triples: Triple[]): Promise<void> {
    for (const t of triples) await this.insert(t);
  }

  async query(_sparql: string): Promise<Triple[]> {
    return [];
  }

  async findBySubject(subject: string): Promise<Triple[]> {
    const db = getDb();
    return (db.prepare(`SELECT * FROM graph_triples WHERE subject = ? ORDER BY confidence DESC`).all(subject) as any[])
      .map(this.parseRow);
  }

  async findByObject(object: string): Promise<Triple[]> {
    const db = getDb();
    return (db.prepare(`SELECT * FROM graph_triples WHERE object_text = ? ORDER BY confidence DESC`).all(object) as any[])
      .map(this.parseRow);
  }

  async findByPredicate(predicate: string): Promise<Triple[]> {
    const db = getDb();
    return (db.prepare(`SELECT * FROM graph_triples WHERE predicate = ? ORDER BY confidence DESC`).all(predicate) as any[])
      .map(this.parseRow);
  }

  async search(query: string): Promise<Triple[]> {
    const db = getDb();
    const pattern = `%${query}%`;
    return (db.prepare(`SELECT * FROM graph_triples WHERE subject LIKE ? OR object_text LIKE ? OR predicate LIKE ? ORDER BY confidence DESC LIMIT 50`)
      .all(pattern, pattern, pattern) as any[]).map(this.parseRow);
  }

  async clear(): Promise<void> {
    getDb().exec(`DELETE FROM graph_triples`);
  }

  async stats(): Promise<{ total: number; uniqueSubjects: number; uniquePredicates: number }> {
    const db = getDb();
    const row = db.prepare(`SELECT COUNT(*) as total, COUNT(DISTINCT subject) as subjects, COUNT(DISTINCT predicate) as predicates FROM graph_triples`).get() as any;
    return { total: row.total, uniqueSubjects: row.subjects, uniquePredicates: row.predicates };
  }

  private parseRow(r: any): Triple {
    return {
      subject: r.subject,
      predicate: r.predicate,
      object: r.object_text,
      confidence: r.confidence,
      source: r.source,
      timestamp: r.timestamp,
    };
  }
}
