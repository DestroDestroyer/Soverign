/**
 * Model Metadata Fetcher — downloads ONLY metadata (no weights).
 * Runs daily in the background to keep the model pool fresh.
 */
import type { Database } from '../db/sqlite.ts';
import { upsertModel, countModels, markModelLocal } from '../vault/models.ts';
import { MODEL_SEEDS } from '../vault/model-seeds.ts';
import { execSync } from 'node:child_process';

const FETCH_TIMEOUT_MS = 15_000;

async function safeFetch(url: string, options?: RequestInit): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function computeSpeedRank(paramB: number): number {
  if (paramB <= 1) return 1;
  if (paramB <= 2) return 2;
  if (paramB <= 4) return 3;
  if (paramB <= 8) return 5;
  if (paramB <= 14) return 7;
  if (paramB <= 32) return 9;
  if (paramB <= 70) return 12;
  return 15;
}

function computeMinRam(paramB: number): number {
  // ~2 bytes/param for Q4 quantized, in GB, round up
  return Math.max(2, Math.ceil((paramB * 2) / 1024 * 1000 / 1000));
}

async function fetchOllamaModels(db: Database): Promise<number> {
  const data = await safeFetch('https://ollama.com/api/search?q=&per_page=100') as any;
  if (!data || !Array.isArray(data?.models)) return 0;
  let count = 0;
  for (const m of data.models as any[]) {
    const name = m.name as string;
    if (!name) continue;
    const paramStr = (m.parameter_size as string || '').toLowerCase();
    const paramB = parseFloat(paramStr) || 0;
    const contextLength = (m.context_length as number) || 4096;
    const minRam = computeMinRam(paramB);
    upsertModel(db, {
      id: `ollama:${name}`,
      name,
      display_name: m.title || name,
      provider: 'ollama',
      parameter_count: paramB,
      context_length: contextLength,
      min_ram: minRam,
      min_vram: 0,
      speed_rank: computeSpeedRank(paramB),
      is_local: 0,
      download_url: `https://ollama.com/library/${name.split(':')[0]}`,
      download_command: `ollama pull ${name}`,
      tags: `local,${m.categories?.join(',') || ''}`,
      last_seen_at: Date.now(),
    });
    count++;
  }
  return count;
}

async function fetchOpenRouterModels(db: Database): Promise<number> {
  const data = await safeFetch('https://openrouter.ai/api/v1/models') as any;
  if (!data || !Array.isArray(data?.data)) return 0;
  let count = 0;
  for (const m of data.data as any[]) {
    const name = m.id as string;
    if (!name) continue;
    const isFree = name.endsWith(':free') || m.pricing?.prompt === '0';
    const contextLength = (m.context_length as number) || 4096;
    upsertModel(db, {
      id: `openrouter:${name}`,
      name,
      display_name: m.name || name,
      provider: 'openrouter',
      parameter_count: 0,
      context_length: contextLength,
      min_ram: 0,
      min_vram: 0,
      speed_rank: 5,
      is_local: 0,
      download_url: `https://openrouter.ai/${name}`,
      download_command: '',
      tags: `cloud,openrouter${isFree ? ',free' : ''}`,
      last_seen_at: Date.now(),
    });
    count++;
  }
  return count;
}

function getLocalOllamaModels(): string[] {
  try {
    const out = execSync('ollama list', { encoding: 'utf8', timeout: 5000 });
    return out.split('\n')
      .slice(1)
      .map(l => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchAllProviders(db: Database): Promise<void> {
  console.log('[ModelFetch] Starting model metadata refresh...');

  // Ensure seeds are loaded first if DB is empty
  if (countModels(db) === 0) {
    console.log('[ModelFetch] Seeding initial model pool...');
    const now = Date.now();
    for (const seed of MODEL_SEEDS) {
      upsertModel(db, { ...seed, is_local: 0, last_seen_at: now });
    }
  }

  // Fetch live metadata from providers
  const ollamaCount = await fetchOllamaModels(db);
  const openRouterCount = await fetchOpenRouterModels(db);

  // Mark locally installed Ollama models
  const localModels = getLocalOllamaModels();
  for (const localName of localModels) {
    markModelLocal(db, localName, true);
  }

  console.log(
    `[ModelFetch] Done: Ollama=${ollamaCount}, OpenRouter=${openRouterCount}, Local=${localModels.length}`
  );
}

export async function refreshIfStale(db: Database, maxAgeMs = 24 * 60 * 60 * 1000): Promise<void> {
  // Check last fetch timestamp from a simple sentinel model
  const sentinel = db.get<{ last_seen_at: number | null }>(
    `SELECT last_seen_at FROM models ORDER BY last_seen_at DESC LIMIT 1`
  );
  const lastFetch = sentinel?.last_seen_at ?? 0;
  if (Date.now() - lastFetch < maxAgeMs) {
    console.log('[ModelFetch] Pool is fresh, skipping refresh.');
    return;
  }
  await fetchAllProviders(db);
}
