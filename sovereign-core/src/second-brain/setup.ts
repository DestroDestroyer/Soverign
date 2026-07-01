import { join } from "node:path";
import { homedir, totalmem, cpus } from "node:os";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { VaultWriter } from "./vault-writer.ts";
import type { SecondBrainConfig, GraphifyProjectConfig } from "./types.ts";

const DEFAULT_VAULT_PATH = join(homedir(), "vault");

export function defaultVaultPath(): string {
  return DEFAULT_VAULT_PATH;
}

export function generateDefaultConfig(overrides?: Partial<SecondBrainConfig>): SecondBrainConfig {
  return {
    vaultPath: DEFAULT_VAULT_PATH,
    graphifyProjects: [],
    sessionLogRetention: 30,
    chatImportEnabled: true,
    autoSyncIntervalMs: 300_000,
    defaultModel: "qwen2.5:0.5b",
    lowSpecMode: false,
    ...overrides,
  };
}

export function detectProjects(): GraphifyProjectConfig[] {
  const projects: GraphifyProjectConfig[] = [];
  const home = homedir();
  const candidates = [
    join(home, "Sovereign"),
    join(home, "sovereign-core"),
    join(home, "sovereign-desktop"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) {
      projects.push({
        name: dir.split(/[/\\]/).pop() || "project",
        rootDir: dir,
        graphOutDir: join(DEFAULT_VAULT_PATH, "graphify", dir.split(/[/\\]/).pop() || "project"),
        enabled: true,
        deepMode: false,
      });
    }
  }
  return projects;
}

export function initVault(vaultPath?: string): VaultWriter {
  const path = vaultPath || DEFAULT_VAULT_PATH;
  const writer = new VaultWriter(path);
  writer.ensureVaultStructure();
  writer.ensureClaudeMd();
  writer.createDefaultTemplates();

  // Create project placeholder folders
  const projectDirs = [
    "architecture", "pipeline", "data", "features",
  ];
  for (const sub of projectDirs) {
    const dir = join(path, "my-project", sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  return writer;
}

export function getSystemInfo() {
  const totalRamGb = Math.round(totalmem() / (1024 ** 3));
  const cpuCores = cpus().length;
  const cpuModel = cpus()[0]?.model || "Unknown";
  const isLowSpec = totalRamGb < 8 || cpuCores < 4;
  return { totalRamGb, cpuCores, cpuModel, isLowSpec };
}
