/**
 * Model Pool CRUD — manages the local metadata pool of AI models.
 * Models are never downloaded here; only metadata is stored.
 */
import type { Database } from '../db/sqlite.ts';

export interface ModelRecord {
  id: string;
  name: string;
  display_name: string;
  provider: string;
  parameter_count: number;
  context_length: number;
  min_ram: number;
  min_vram: number;
  speed_rank: number;
  is_local: 0 | 1;
  download_url: string;
  download_command: string;
  tags: string;
  last_seen_at: number | null;
  created_at: number;
}

export function upsertModel(db: Database, model: Omit<ModelRecord, 'created_at'>): void {
  const now = Date.now();
  db.run(
    `INSERT INTO models (
      id, name, display_name, provider, parameter_count, context_length,
      min_ram, min_vram, speed_rank, is_local, download_url, download_command,
      tags, last_seen_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      display_name = excluded.display_name,
      provider = excluded.provider,
      parameter_count = excluded.parameter_count,
      context_length = excluded.context_length,
      min_ram = excluded.min_ram,
      min_vram = excluded.min_vram,
      speed_rank = excluded.speed_rank,
      is_local = excluded.is_local,
      download_url = excluded.download_url,
      download_command = excluded.download_command,
      tags = excluded.tags,
      last_seen_at = excluded.last_seen_at`,
    [
      model.id,
      model.name,
      model.display_name,
      model.provider,
      model.parameter_count,
      model.context_length,
      model.min_ram,
      model.min_vram,
      model.speed_rank,
      model.is_local,
      model.download_url,
      model.download_command,
      model.tags,
      model.last_seen_at ?? now,
      now,
    ]
  );
}

export function getModels(db: Database): ModelRecord[] {
  return db.all<ModelRecord>(
    `SELECT * FROM models ORDER BY speed_rank ASC, parameter_count ASC`
  );
}

export function getCompatibleModels(
  db: Database,
  systemRamGb: number,
  systemVramGb: number
): ModelRecord[] {
  return db.all<ModelRecord>(
    `SELECT * FROM models
     WHERE min_ram <= ? AND (min_vram = 0 OR min_vram <= ?)
     ORDER BY is_local DESC, speed_rank ASC, parameter_count ASC`,
    [systemRamGb, systemVramGb]
  );
}

export function markModelLocal(db: Database, name: string, isLocal: boolean): void {
  db.run(`UPDATE models SET is_local = ? WHERE name = ?`, [isLocal ? 1 : 0, name]);
}

export function getModelByName(db: Database, name: string): ModelRecord | undefined {
  return db.get<ModelRecord>(`SELECT * FROM models WHERE name = ?`, [name]);
}

export function countModels(db: Database): number {
  const row = db.get<{ n: number }>(`SELECT COUNT(*) as n FROM models`);
  return row?.n ?? 0;
}
