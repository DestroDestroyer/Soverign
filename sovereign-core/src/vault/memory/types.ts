export type MemorySource = 'chat' | 'document' | 'obsidian' | 'manual';
export type MemoryPriority = 'low' | 'normal' | 'high';
export type MemoryTTL = number;

export interface MemoryEntry {
  id: string;
  content: string;
  source: MemorySource;
  priority: MemoryPriority;
  metadata: Record<string, unknown>;
  embedding?: Float32Array;
  created_at: number;
  expires_at: number | null;
  access_count: number;
  last_accessed: number;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  engine: string;
}

export interface MemoryEngine {
  readonly name: string;
  store(entry: Omit<MemoryEntry, 'id' | 'created_at' | 'access_count' | 'last_accessed'>): Promise<string>;
  search(query: string, limit?: number): Promise<MemorySearchResult[]>;
  get(id: string): Promise<MemoryEntry | null>;
  forget(id: string): Promise<boolean>;
  flush(): Promise<void>;
  stats(): Promise<{ total: number; avgAccessCount: number; oldestEntry: number }>;
}
