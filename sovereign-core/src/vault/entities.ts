import { getDb, generateId, getDbGeneration } from './schema.ts';

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

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export type EntityType = 'person' | 'project' | 'tool' | 'place' | 'concept' | 'event';

export type Entity = {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  source: string | null;
};

type EntityRow = {
  id: string;
  type: EntityType;
  name: string;
  properties: string | null;
  created_at: number;
  updated_at: number;
  source: string | null;
};

function parseEntity(row: EntityRow): Entity {
  return {
    ...row,
    properties: row.properties ? JSON.parse(row.properties) : null,
  };
}

export function createEntity(
  type: EntityType,
  name: string,
  properties?: Record<string, unknown>,
  source?: string
): Entity {
  const id = generateId();
  const now = Date.now();

  const stmt = getCachedStmt(
    'INSERT INTO entities (id, type, name, properties, created_at, updated_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  stmt.run(
    id,
    type,
    name,
    properties ? JSON.stringify(properties) : null,
    now,
    now,
    source ?? null
  );

  return {
    id,
    type,
    name,
    properties: properties ?? null,
    created_at: now,
    updated_at: now,
    source: source ?? null,
  };
}

export function getEntity(id: string): Entity | null {
  const stmt = getCachedStmt('SELECT * FROM entities WHERE id = ?');
  const row = stmt.get(id) as EntityRow | null;
  if (!row) return null;
  return parseEntity(row);
}

export function findEntities(query: {
  type?: EntityType;
  name?: string;
  nameContains?: string;
}): Entity[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.type) {
    conditions.push('type = ?');
    params.push(query.type);
  }

  if (query.name) {
    conditions.push('name = ?');
    params.push(query.name);
  }

  if (query.nameContains) {
    conditions.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(query.nameContains)}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM entities ${where} ORDER BY updated_at DESC`;
  const stmt = getCachedStmt(sql);
  const rows = stmt.all(...params as any[]) as EntityRow[];
  return rows.map(parseEntity);
}

export function updateEntity(
  id: string,
  updates: Partial<Pick<Entity, 'name' | 'properties' | 'type'>>
): Entity | null {
  const entity = getEntity(id);
  if (!entity) return null;

  const fields: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name);
  }

  if (updates.type !== undefined) {
    fields.push('type = ?');
    params.push(updates.type);
  }

  if (updates.properties !== undefined) {
    fields.push('properties = ?');
    params.push(JSON.stringify(updates.properties));
  }

  if (fields.length === 0) return entity;

  const now = Date.now();
  fields.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const stmt = getCachedStmt(`UPDATE entities SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...params as any[]);

  return {
    ...entity,
    ...(updates.name !== undefined && { name: updates.name }),
    ...(updates.type !== undefined && { type: updates.type }),
    ...(updates.properties !== undefined && { properties: updates.properties }),
    updated_at: now,
  } as Entity;
}

export function deleteEntity(id: string): boolean {
  const stmt = getCachedStmt('DELETE FROM entities WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function searchEntitiesByName(query: string): Entity[] {
  const stmt = getCachedStmt("SELECT * FROM entities WHERE name LIKE ? ESCAPE '\\' ORDER BY name");
  const rows = stmt.all(`%${escapeLike(query)}%`) as EntityRow[];
  return rows.map(parseEntity);
}
