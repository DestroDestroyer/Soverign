import { getDb, generateId, getDbGeneration } from './schema.ts';
import { findEntities } from './entities.ts';

let _stmtCacheGen = -1;
const _stmtCache = new Map<string, ReturnType<ReturnType<typeof getDb>['prepare']>>();

function getCachedStmt(sql: string) {
  const gen = getDbGeneration();
  if (_stmtCacheGen !== gen) {
    _stmtCache.clear();
    _stmtCacheGen = gen;
  }
  let stmt = _stmtCache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    _stmtCache.set(sql, stmt);
  }
  return stmt;
}

export type Fact = {
  id: string;
  subject_id: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string | null;
  created_at: number;
  verified_at: number | null;
};

type FactRow = {
  id: string;
  subject_id: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string | null;
  created_at: number;
  verified_at: number | null;
};

function parseFact(row: FactRow): Fact {
  return { ...row };
}

export function createFact(
  subject_id: string,
  predicate: string,
  object: string,
  opts?: { confidence?: number; source?: string }
): Fact {
  const id = generateId();
  const now = Date.now();
  const confidence = opts?.confidence ?? 1.0;
  const source = opts?.source ?? null;

  const stmt = getCachedStmt(
    'INSERT INTO facts (id, subject_id, predicate, object, confidence, source, created_at, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const objectStr = typeof object === 'string' ? object : JSON.stringify(object);
  stmt.run(id, subject_id, predicate, objectStr, confidence, source, now, null);

  return {
    id,
    subject_id,
    predicate,
    object,
    confidence,
    source,
    created_at: now,
    verified_at: null,
  };
}

export function getFact(id: string): Fact | null {
  const stmt = getCachedStmt('SELECT * FROM facts WHERE id = ?');
  const row = stmt.get(id) as FactRow | null;
  if (!row) return null;
  return parseFact(row);
}

export function findFacts(query: {
  subject_id?: string;
  predicate?: string;
  object?: string;
}): Fact[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.subject_id) {
    conditions.push('subject_id = ?');
    params.push(query.subject_id);
  }

  if (query.predicate) {
    conditions.push('predicate = ?');
    params.push(query.predicate);
  }

  if (query.object) {
    conditions.push('object = ?');
    params.push(query.object);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM facts ${where} ORDER BY created_at DESC`;
  const stmt = getCachedStmt(sql);
  const rows = stmt.all(...params as any[]) as FactRow[];
  return rows.map(parseFact);
}

export function queryFact(subjectName: string, predicate: string): Fact | null {
  const entities = findEntities({ name: subjectName });
  if (entities.length === 0) return null;
  const facts = findFacts({ subject_id: entities[0]!.id, predicate });
  return facts.length > 0 ? facts[0]! : null;
}

export function updateFact(
  id: string,
  updates: Partial<Pick<Fact, 'predicate' | 'object' | 'confidence' | 'source'>>
): Fact | null {
  const fact = getFact(id);
  if (!fact) return null;

  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.predicate !== undefined) {
    fields.push('predicate = ?');
    params.push(updates.predicate);
  }

  if (updates.object !== undefined) {
    fields.push('object = ?');
    params.push(updates.object);
  }

  if (updates.confidence !== undefined) {
    fields.push('confidence = ?');
    params.push(updates.confidence);
  }

  if (updates.source !== undefined) {
    fields.push('source = ?');
    params.push(updates.source);
  }

  if (fields.length === 0) return fact;

  params.push(id);

  const stmt = getCachedStmt(`UPDATE facts SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params as any[]);

  return {
    ...fact,
    ...(updates.predicate !== undefined && { predicate: updates.predicate }),
    ...(updates.object !== undefined && { object: updates.object }),
    ...(updates.confidence !== undefined && { confidence: updates.confidence }),
    ...(updates.source !== undefined && { source: updates.source }),
  };
}

export function deleteFact(id: string): boolean {
  const stmt = getCachedStmt('DELETE FROM facts WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function verifyFact(id: string): void {
  const stmt = getCachedStmt('UPDATE facts SET verified_at = ? WHERE id = ?');
  stmt.run(Date.now(), id);
}
