import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { GraphPipeline } from "../vault/graph/pipeline.ts";
import type { ObsidianVault } from "../vault/sources/obsidian.ts";
import { VaultWriter } from "./vault-writer.ts";
import { GraphifyService } from "./graphify.ts";
import { ChatImporter } from "./chat-importer.ts";
import { SessionManager } from "./session-manager.ts";
import { initVault, generateDefaultConfig, detectProjects, getSystemInfo } from "./setup.ts";
import type { SecondBrainConfig, ResumeContext, SessionLog, ChatImport, CodebaseGraph, GraphifyProjectConfig, SecondBrainServices } from "./types.ts";

type LogFn = (msg: string) => void;

export class SecondBrain {
  private config: SecondBrainConfig;
  private services: SecondBrainServices;
  private vaultWriter: VaultWriter;
  private graphifyService: GraphifyService;
  private chatImporter: ChatImporter;
  private sessionManager: SessionManager;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private log: LogFn;
  private started = false;

  constructor(
    services: SecondBrainServices,
    config?: Partial<SecondBrainConfig>,
    logFn?: LogFn,
  ) {
    this.services = services;
    this.config = generateDefaultConfig(config);

    const vaultPath = this.getResolvedVaultPath();
    this.vaultWriter = new VaultWriter(vaultPath);

    this.graphifyService = new GraphifyService(
      services.graphPipeline,
      services.memoryOrchestrator,
      this.config.graphifyProjects,
    );

    this.chatImporter = new ChatImporter(
      services.memoryOrchestrator,
      this.vaultWriter,
      this.getImportDir(),
      this.config.chatImportEnabled,
    );

    this.sessionManager = new SessionManager(
      services.memoryOrchestrator,
      this.vaultWriter,
    );

    this.log = logFn || console.log;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.log("[SecondBrain] Starting...");

    if (!existsSync(this.getResolvedVaultPath())) {
      this.log(`[SecondBrain] No vault found at ${this.getResolvedVaultPath()}, running without vault`);
    }

    await this.syncObsidianToMemory();

    if (this.config.chatImportEnabled) {
      const imports = await this.chatImporter.importAll();
      if (imports.length > 0) {
        this.log(`[SecondBrain] Imported ${imports.length} chats`);
      }
    }

    if (this.config.autoSyncIntervalMs > 0) {
      this.syncTimer = setInterval(() => {
        this.autoSync().catch((err) =>
          this.log(`[SecondBrain] Auto-sync error: ${err.message}`)
        );
      }, this.config.autoSyncIntervalMs);
    }

    this.started = true;
    this.log("[SecondBrain] Started");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.started = false;
    this.log("[SecondBrain] Stopped");
  }

  health(): { status: string; vaultConfigured: boolean; projectCount: number } {
    return {
      status: this.started ? "healthy" : "unhealthy",
      vaultConfigured: existsSync(this.getResolvedVaultPath()),
      projectCount: this.graphifyService.getProjects().length,
    };
  }

  // ── Vault operations ──────────────────────────────────────────

  setupVault(vaultPath?: string): string {
    const path = vaultPath || this.getResolvedVaultPath();
    const writer = initVault(path);
    this.vaultWriter = writer;
    this.services.obsidianVault.setVaultPath(path);
    this.log(`[SecondBrain] Vault initialized at ${path}`);
    return path;
  }

  getVaultPath(): string {
    return this.getResolvedVaultPath();
  }

  getVaultWriter(): VaultWriter {
    return this.vaultWriter;
  }

  // ── Graphify operations ───────────────────────────────────────

  addGraphifyProject(config: GraphifyProjectConfig): void {
    this.graphifyService.addProject(config);
    this.config.graphifyProjects.push(config);
  }

  removeGraphifyProject(name: string): void {
    this.graphifyService.removeProject(name);
    this.config.graphifyProjects = this.config.graphifyProjects.filter(
      (p) => p.name !== name,
    );
  }

  getGraphifyProjects(): GraphifyProjectConfig[] {
    return this.graphifyService.getProjects();
  }

  scanGraphifyProject(name: string): Promise<CodebaseGraph> {
    const config = this.graphifyService.getProjects().find((p) => p.name === name);
    if (!config) throw new Error(`Graphify project not found: ${name}`);
    return this.graphifyService.scanProject(name, config);
  }

  scanAllGraphifyProjects(): Promise<Map<string, CodebaseGraph>> {
    return this.graphifyService.scanAll();
  }

  getCodebaseGraph(name: string): CodebaseGraph | undefined {
    return this.graphifyService.getGraph(name);
  }

  detectProjects(): GraphifyProjectConfig[] {
    return detectProjects();
  }

  // ── Session operations ────────────────────────────────────────

  resumeSession(projectDir?: string): Promise<ResumeContext> {
    return this.sessionManager.resume(projectDir);
  }

  saveSession(log: Omit<SessionLog, "date">): Promise<string> {
    return this.sessionManager.save(log);
  }

  // ── Chat import operations ────────────────────────────────────

  importChats(): Promise<ChatImport[]> {
    return this.chatImporter.importAll();
  }

  isChatImportEnabled(): boolean {
    return this.config.chatImportEnabled;
  }

  setChatImportEnabled(enabled: boolean): void {
    this.config.chatImportEnabled = enabled;
    this.chatImporter.setEnabled(enabled);
  }

  // ── Memory helpers ────────────────────────────────────────────

  async storeDecision(decision: string, context: string, title?: string): Promise<void> {
    const noteTitle = title || `Decision: ${decision.slice(0, 60)}`;
    this.vaultWriter.createDecisionNote(noteTitle, decision, context);
    await this.services.memoryOrchestrator.store(
      `[Decision] ${noteTitle}: ${decision}`,
      "chat",
      "high",
      { category: "decision" },
    );
  }

  async storeNote(title: string, tags: string[], body: string): Promise<string> {
    return this.vaultWriter.createPermanentNote(title, tags, body);
  }

  async searchMemory(query: string, limit = 10) {
    return this.services.memoryOrchestrator.search(query, limit);
  }

  // ── System info ───────────────────────────────────────────────

  getSystemInfo(): { totalRamGb: number; cpuCores: number; cpuModel: string; isLowSpec: boolean } {
    return getSystemInfo();
  }

  getConfig(): SecondBrainConfig {
    return { ...this.config };
  }

  // ── Internal ──────────────────────────────────────────────────

  private getResolvedVaultPath(): string {
    return this.config.vaultPath || join(homedir(), "vault");
  }

  private getImportDir(): string {
    return join(homedir(), "claude-exports");
  }

  private async syncObsidianToMemory(): Promise<void> {
    if (!existsSync(this.getResolvedVaultPath())) return;
    const notes = await this.services.obsidianVault.scan();
    if (notes.length === 0) return;

    this.log(`[SecondBrain] Syncing ${notes.length} vault notes to memory`);
    for (const note of notes.slice(0, 50)) {
      await this.services.memoryOrchestrator.store(
        note.content.slice(0, 1000),
        "obsidian",
        "normal",
        { vaultPath: note.path, tags: note.tags, links: note.links },
      );
    }
  }

  private async autoSync(): Promise<void> {
    if (this.config.chatImportEnabled) {
      await this.chatImporter.importAll();
    }
    await this.syncObsidianToMemory();
  }
}
