import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

export interface VaultNote {
  path: string;
  name: string;
  content: string;
  modifiedAt: number;
  tags: string[];
  links: string[];
}

export interface ObsidianConfig {
  vaultPath: string;
  syncIntervalMs: number;
  watchSubdirs: boolean;
  excludePatterns: string[];
}

export const DEFAULT_OBSIDIAN_CONFIG: ObsidianConfig = {
  vaultPath: '',
  syncIntervalMs: 300_000,
  watchSubdirs: true,
  excludePatterns: ['node_modules', '.git', '.trash', '.obsidian'],
};

export class ObsidianVault {
  private config: ObsidianConfig;
  private notesCache = new Map<string, VaultNote>();
  private lastScan = 0;
  private scanCount = 0;

  constructor(config?: Partial<ObsidianConfig>) {
    this.config = { ...DEFAULT_OBSIDIAN_CONFIG, ...config };
  }

  isConfigured(): boolean {
    return this.config.vaultPath.length > 0 && existsSync(this.config.vaultPath);
  }

  setVaultPath(path: string): void {
    this.config.vaultPath = path;
    this.notesCache.clear();
    this.lastScan = 0;
  }

  getConfig(): ObsidianConfig { return { ...this.config }; }

  async scan(): Promise<VaultNote[]> {
    if (!this.isConfigured()) return [];
    if (Date.now() - this.lastScan < this.config.syncIntervalMs && this.notesCache.size > 0) {
      return Array.from(this.notesCache.values());
    }
    this.lastScan = Date.now();
    this.notesCache.clear();
    this.scanCount++;
    const files = this.walkDir(this.config.vaultPath);
    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const name = relative(this.config.vaultPath, filePath).replace(/\\/g, '/');
        const note: VaultNote = {
          path: filePath,
          name,
          content,
          modifiedAt: statSync(filePath).mtimeMs,
          tags: this.extractTags(content),
          links: this.extractLinks(content),
        };
        this.notesCache.set(filePath, note);
      } catch {}
    }
    return Array.from(this.notesCache.values());
  }

  getNote(path: string): VaultNote | undefined {
    return this.notesCache.get(path);
  }

  search(query: string): VaultNote[] {
    const q = query.toLowerCase();
    return Array.from(this.notesCache.values()).filter(n =>
      n.content.toLowerCase().includes(q) || n.name.toLowerCase().includes(q)
    );
  }

  getStats(): { fileCount: number; lastScan: number; scanCount: number } {
    return {
      fileCount: this.notesCache.size,
      lastScan: this.lastScan,
      scanCount: this.scanCount,
    };
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (this.shouldExclude(entry.name)) continue;
        if (entry.isDirectory()) {
          if (this.config.watchSubdirs) results.push(...this.walkDir(fullPath));
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
          results.push(fullPath);
        }
      }
    } catch {}
    return results;
  }

  private shouldExclude(name: string): boolean {
    return this.config.excludePatterns.some(p =>
      name === p || name.startsWith(p) || name.endsWith(p)
    );
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const tagRegex = /#([\w/-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(content)) !== null) {
      const tag = match[1].toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }
    return tags;
  }

  private extractLinks(content: string): string[] {
    const links: string[] = [];
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const link = match[1].split('|')[0].split('#')[0].trim();
      if (!links.includes(link)) links.push(link);
    }
    return links;
  }
}
