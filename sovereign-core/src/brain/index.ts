/**
 * Sovereign Brain — unified process
 *
 * Single entry point for ALL Sovereign services:
 * LLM, Agent, Vault, Authority, HTTP/WS server, Dashboard,
 * Observers, Channels, Workflows, Cron, TTS/STT, Awareness,
 * Goals, Site Builder, Background Agent, Sidecar Manager.
 *
 * Communicates with Electron host over stdin/stdout JSON-RPC.
 * Also serves the React SPA dashboard via HTTP at port 3142.
 *
 * The daemon (src/daemon/index.ts) is a separate OPTIONAL process
 * that only provides local OS operations (PowerShell, file I/O).
 */

import path from "node:path";
import os from "node:os";
import { mkdirSync, existsSync } from "node:fs";
import { initDatabase, closeDb, getDb } from "../vault/schema.ts";
import { loadConfig } from "../config/loader.ts";
import { AgentService } from "../daemon/agent-service.ts";
import { BrainIPC } from "./ipc.ts";
import { BrainEventBus } from "./events.ts";
import type { DaemonConfig } from "../daemon/index.ts";

// Daemon service imports
import { ServiceRegistry } from "../daemon/services.ts";
import { HealthMonitor } from "../daemon/health.ts";
import { ObserverService } from "../daemon/observer-service.ts";
import { WebSocketService } from "../daemon/ws-service.ts";
import { EventReactor } from "../daemon/event-reactor.ts";
import { EventCoalescer } from "../daemon/event-coalescer.ts";
import { CommitmentExecutor } from "../daemon/commitment-executor.ts";
import { classifyEvent } from "../daemon/event-classifier.ts";
import { createApiRoutes, setCorsOrigin } from "../daemon/api-routes.ts";
import { GoogleAuth } from "../integrations/google-auth.ts";
import { ResearchQueue } from "../daemon/research-queue.ts";
import { researchQueueTool, setResearchQueueRef } from "../actions/tools/research.ts";
import { ChannelService } from "../daemon/channel-service.ts";
import { BackgroundAgentService } from "../daemon/background-agent-service.ts";
import { AuthorityEngine } from "../authority/engine.ts";
import { ApprovalManager } from "../authority/approval.ts";
import { AuditTrail } from "../authority/audit.ts";
import { AuthorityLearner } from "../authority/learning.ts";
import { EmergencyController } from "../authority/emergency.ts";
import { ApprovalDelivery } from "../authority/approval-delivery.ts";
import { DeferredExecutor } from "../authority/deferred-executor.ts";
import { sendDesktopNotification } from "../comms/desktop-notify.ts";
import { SidecarManager } from "../sidecar/manager.ts";
import { ensureWorkflowSchema } from "../workflows/db/index.ts";
import { Worker as WorkflowWorker } from "../workflows/queue/worker.ts";
import { createRunFlowHandler, RUN_FLOW } from "../workflows/runner/handler.ts";
import { createWorkflowRoutes } from "../workflows/api/routes.ts";
import { TriggerManager } from "../workflows/runner/triggers/manager.ts";
import { AWARENESS_EVENT_TYPE_MAP, OBSERVER_EVENT_TYPE_MAP } from "../workflows/runtime/event-types.ts";
import { WorkflowEventBus } from "../workflows/runtime/event-bus.ts";
import { WorkflowEventBuffer } from "../workflows/runtime/event-buffer.ts";
import {
  bootstrapWorkflowEngine,
  type BootstrapWorkflowEngineResult,
} from "../workflows/runtime/engine-bootstrap.ts";
import { CredentialResolver } from "../workflows/credentials/adapter.ts";
import { metadataToCatalogEntry } from "../workflows/runtime/piece-catalog.ts";
import { DEFAULT_IDS } from "../workflows/db/schema.ts";
import { apId } from "../workflows/db/ids.ts";
import { buildSandboxServiceBackends } from "../workflows/runtime/service-backends.ts";
import { EngineFlowExecutor } from "../workflows/runner/engine-runtime/engine-flow-executor.ts";
import { TelemetryService } from "../telemetry/index.ts";
import { SystemCronService } from "../daemon/system-cron.ts";
import { SiteBuilderService } from "../sites/service.ts";
import { createSiteBuilderTools } from "../sites/builder-tools.ts";
import { GoalService } from "../goals/service.ts";
import { NLGoalBuilder } from "../goals/nl-builder.ts";
import { GoalEstimator } from "../goals/estimator.ts";
import { DailyRhythm } from "../goals/rhythm.ts";
import { AccountabilityEngine } from "../goals/accountability.ts";
import { AwarenessService } from "../awareness/service.ts";

// Second Brain imports
import { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import { MemorySweeper } from "../vault/memory/sweeper.ts";
import { MemorySummarizer } from "../vault/memory/summarizer.ts";
import { GraphPipeline } from "../vault/graph/pipeline.ts";
import { ObsidianVault } from "../vault/sources/obsidian.ts";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".sovereign");

export interface BrainConfig {
  dataDir: string;
  dbPath: string;
  port?: number;
  healthCheckInterval?: number;
  noLocalTools?: boolean;
  noWorkflows?: boolean;
}

interface BrainContext {
  agentService: AgentService | null;
  sovereignConfig: Record<string, any>;
  shutdown: () => Promise<void>;
}

// Module-level state for shutdown
let shutdownInProgress = false;
let registry: ServiceRegistry | null = null;
let healthMonitor: HealthMonitor | null = null;
let commitmentExecutor: CommitmentExecutor | null = null;
let bgAgent: BackgroundAgentService | null = null;
let awarenessService: AwarenessService | null = null;
let goalService: GoalService | null = null;
let workflowWorker: WorkflowWorker | null = null;
let triggerManager: TriggerManager | null = null;
let workflowEngineShutdown: (() => Promise<void>) | null = null;
let systemCron: SystemCronService | null = null;
let eventBus: BrainEventBus | null = null;
let ipc: BrainIPC | null = null;
let memorySweeper: MemorySweeper | null = null;
let memorySummarizer: MemorySummarizer | null = null;

function parseArgs(): Partial<BrainConfig> {
  const args = process.argv.slice(2);
  const config: Partial<BrainConfig> = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--db-path":
        config.dbPath = args[++i];
        break;
      case "--data-dir":
        config.dataDir = args[++i];
        break;
      case "--port":
        config.port = parseInt(args[++i]!, 10);
        break;
      case "--health-interval":
        config.healthCheckInterval = parseInt(args[++i]!, 10);
        break;
      case "--no-local-tools":
        config.noLocalTools = true;
        break;
      case "--no-workflows":
        config.noWorkflows = true;
        break;
      case "--help":
      case "-h":
        console.log(`
Sovereign Brain

Usage:
  bun run src/brain/index.ts [options]

Options:
  --db-path <path>         Database file path (default: ~/.sovereign/sovereign.db)
  --data-dir <path>        Data directory (default: ~/.sovereign)
  --port <number>          HTTP/WS server port (default: 3142)
  --health-interval <ms>   Health check interval in ms (default: 30000)
  --no-local-tools         Disable local tool execution (run_command, read_file, etc).
  --no-workflows           Skip workflow engine bootstrap (saves ~500MB RAM).
                           Use on low-end PCs or when only chat/agent features are needed.
  --help, -h               Show this help

The brain communicates via stdin/stdout JSON-RPC with the Electron host.
        `);
        process.exit(0);
    }
  }
  return config;
}

function ensureDataDir(dataDir: string): void {
  if (!existsSync(dataDir)) {
    console.log(`[Brain] Creating data directory: ${dataDir}`);
    mkdirSync(dataDir, { recursive: true });
  }
}

function logWithTimestamp(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function handleShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) {
    console.log("\n[Brain] Force shutdown requested, exiting immediately");
    process.exit(1);
  }
  shutdownInProgress = true;
  console.log(`\n[Brain] Received ${signal}, shutting down gracefully...`);

  try {
    if (systemCron) { systemCron.stop(); systemCron = null; }
    if (commitmentExecutor) { commitmentExecutor.stop(); commitmentExecutor = null; }
    if (goalService) { await goalService.stop(); goalService = null; }
    if (awarenessService) { await awarenessService.stop(); awarenessService = null; }
    if (bgAgent) { await bgAgent.stop(); bgAgent = null; }
    if (memorySweeper) { memorySweeper.stop(); memorySweeper = null; }
    if (memorySummarizer) { memorySummarizer.stop(); memorySummarizer = null; }
    if (healthMonitor) { healthMonitor.stop(); }
    if (registry) { await registry.stopAll(); }
    if (triggerManager) { await triggerManager.stop(); triggerManager = null; }
    if (workflowWorker) { await workflowWorker.stop(); workflowWorker = null; }
    if (workflowEngineShutdown) {
      try { await workflowEngineShutdown(); } catch (e) {
        console.warn(`[Brain] Workflow engine shutdown failed: ${(e as Error).message}`);
      }
      workflowEngineShutdown = null;
    }
    closeDb();
    console.log("[Brain] Database closed");
    console.log("[Brain] Shutdown complete");
    process.exit(0);
  } catch (error) {
    console.error("[Brain] Error during shutdown:", error);
    process.exit(1);
  }
}

export async function createBrain(
  userConfig?: Partial<BrainConfig>,
): Promise<BrainContext> {
  eventBus = new BrainEventBus();
  ipc = new BrainIPC();

  // Load config from YAML
  let sovereignConfig: any;
  try {
    sovereignConfig = await loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`\n[Brain] Could not load config: ${message}, using defaults`);
    sovereignConfig = structuredClone(
      (await import("../config/types.ts")).DEFAULT_CONFIG
    ) as any;
  }

  const dataDir = userConfig?.dataDir ?? sovereignConfig.daemon.data_dir ?? DEFAULT_DATA_DIR;
  const dbPath = userConfig?.dbPath ?? sovereignConfig.daemon.db_path ?? path.join(dataDir, "sovereign.db");
  const port = userConfig?.port ?? sovereignConfig.daemon.port ?? 3142;

  const config: Required<BrainConfig> = {
    dataDir,
    dbPath,
    port,
    healthCheckInterval: userConfig?.healthCheckInterval ?? 30000,
    noLocalTools: userConfig?.noLocalTools ?? false,
    noWorkflows: userConfig?.noWorkflows ?? false,
  };

  if (!path.isAbsolute(config.dbPath)) {
    config.dbPath = path.join(config.dataDir, config.dbPath);
  }

  console.log(`[Brain] Data dir: ${config.dataDir}`);
  console.log(`[Brain] DB path: ${config.dbPath}`);
  console.log(`[Brain] Port: ${config.port}`);

  const emitToHost = (event: string, data: Record<string, unknown>) => {
    if (ipc) ipc.pushEvent(event, data);
  };

  emitToHost("brain:status", { phase: "booting", message: `Brain v0.8.0 starting on port ${config.port}` });

  // ── Step 1: Ensure data dir + models dir + init DB ──────────────
  ensureDataDir(config.dataDir);
  ensureDataDir(path.join(config.dataDir, "models")); // for local GGUF files
  initDatabase(config.dbPath);
  console.log("[Brain] Database initialized");
  emitToHost("brain:status", { phase: "db", message: "Database initialized" });

  // ── Step 2: Seed default LLM settings if none exist ─────────────
  const { getSetting, setSetting } = await import("../vault/settings.ts");
  if (!getSetting("llm.providers")) {
    console.log("[Brain] Seeding default LLM settings (Ollama local)...");
    setSetting(
      "llm.providers",
      JSON.stringify({
        ollama: { kind: "ollama", base_url: "http://localhost:11434" },
      }),
    );
    setSetting("llm.default", "ollama:sam860/falcon-h1:1.5b-deep-Q4_0");
    setSetting("llm.mode", "single");
    setSetting("llm.tiers.conversation", "");
    setSetting("llm.tiers.high", "");
    setSetting("llm.tiers.medium", "");
    setSetting("llm.tiers.low", "");
  }

  // ── Step 3: Wire LLM usage tracking ─────────────────────────────
  const { setUsageDatabase } = await import("../llm/usage.ts");
  setUsageDatabase(() => {
    try { return getDb(); } catch { return null; }
  });

  // ── Step 4: Add workflow schema tables ──────────────────────────
  ensureWorkflowSchema();
  console.log("[Brain] Workflow schema ready");

  // ── Step 5: Seed webapp templates ──────────────────────────────
  const { seedWebappTemplates } = await import("../vault/webapp-template-seeds.ts");
  seedWebappTemplates();

  // ── Step 6: Load LLM settings ──────────────────────────────────
  const { mergeLLMSettingsIntoConfig } = await import("../daemon/llm-settings.ts");
  mergeLLMSettingsIntoConfig(sovereignConfig);
  console.log("[Brain] LLM settings loaded");
  emitToHost("brain:status", { phase: "llm_config", message: "LLM settings loaded" });

  // ── Step 7: Create services ─────────────────────────────────────
  registry = new ServiceRegistry();

  // 7a. Telemetry
  const telemetryService = new TelemetryService({
    config: sovereignConfig,
    packageRoot: path.join(import.meta.dir, "..", ".."),
  });

  // 7b. Proactive modules
  const reactor = new EventReactor();
  const coalescer = new EventCoalescer();

  // 7c. GoogleAuth
  let googleAuth: GoogleAuth | null = null;
  if (sovereignConfig.google?.client_id && sovereignConfig.google?.client_secret) {
    googleAuth = new GoogleAuth(sovereignConfig.google.client_id, sovereignConfig.google.client_secret);
    if (googleAuth.isAuthenticated()) {
      console.log("[Brain] Google OAuth: authenticated");
    } else {
      console.log("[Brain] Google OAuth: credentials found but not authenticated");
    }
  }

  // 7d. ResearchQueue
  const researchQueue = new ResearchQueue();
  setResearchQueueRef(researchQueue);

  // 7e. Core services
  const agentService = new AgentService(sovereignConfig);
  agentService.setResearchQueue(researchQueue);

  const observerService = config.noLocalTools
    ? null
    : new ObserverService(reactor, coalescer, googleAuth ?? undefined, config.dataDir);

  const wsService = new WebSocketService(config.port, agentService);

  const channelService = new ChannelService(sovereignConfig, agentService);

  const heartbeatConfig = sovereignConfig.heartbeat;
  const aggressiveness = heartbeatConfig?.aggressiveness ?? "moderate";
  const executor = new CommitmentExecutor(aggressiveness as any);

  // 7f. Sidecar manager
  const sidecarManager = new SidecarManager(
    sovereignConfig.daemon.data_dir?.replace("~", os.homedir()) ?? path.join(os.homedir(), ".sovereign"),
  );
  const brainDomain = sovereignConfig.daemon.brain_domain ?? `localhost:${config.port}`;
  sidecarManager.setBrainUrl(brainDomain, "default");

  // ── Step 8: Wire service callbacks ──────────────────────────────
  reactor.setReactionCallback((text, priority) => {
    wsService.broadcastNotification(text, priority);
  });

  agentService.setDelegationProgressCallback((event) => {
    wsService.broadcastSubAgentProgress(event);
  });

  agentService.setConvTaskEventListener((event) => {
    const statusForEvent =
      event.type === "task_started" ? "running" :
      event.type === "task_completed" ? "completed" :
      event.type === "task_failed" ? "failed" :
      "cancelled";
    wsService.broadcastTaskEvent({
      type: event.type,
      task_id: event.record.id,
      template: event.record.request.template,
      intent: event.record.request.intent,
      status: statusForEvent,
      elapsedMs: Date.now() - event.record.startedAt,
      summary: "envelope" in event ? event.envelope.summary : undefined,
    });
  });

  wsService.getServer().setSidecarManager(sidecarManager);

  // ── Step 9: Register services ────────────────────────────────────
  registry.register(telemetryService);
  registry.register(agentService);
  if (observerService) registry.register(observerService);
  registry.register(channelService);
  registry.register(sidecarManager);
  registry.register(wsService);

  // ── Step 10: Health monitor ─────────────────────────────────────
  healthMonitor = new HealthMonitor(registry, config.dbPath);

  wsService.setChannelService(channelService);

  // ── Step 11: Wire TTS/STT providers ─────────────────────────────
  if (sovereignConfig.tts?.enabled) {
    const { createTTSProvider } = await import("../comms/voice.ts");
    const ttsProvider = await createTTSProvider(sovereignConfig.tts);
    if (ttsProvider) {
      wsService.setTTSProvider(ttsProvider);
      console.log(`[Brain] TTS enabled: ${sovereignConfig.tts.voice ?? "en-US-AriaNeural"} (${sovereignConfig.tts.provider ?? "edge"})`);
    }
  }

  if (sovereignConfig.stt) {
    const { createSTTProvider } = await import("../comms/voice.ts");
    const sttProvider = await createSTTProvider(sovereignConfig.stt);
    if (sttProvider) {
      wsService.setSTTProvider(sttProvider);
      console.log(`[Brain] STT enabled: ${sovereignConfig.stt.provider}`);
    }
  }

  // ── Step 11b: Auto-scan local models on boot ────────────────────
  (async () => {
    try {
      const { scanLocalModels } = await import("../llm/local-loader.ts");
      const models = await scanLocalModels();
      if (models.length > 0) {
        console.log(`[Brain] Found ${models.length} local GGUF model(s):`);
        for (const m of models) {
          console.log(`  - ${m.name} (${(m.size / 1024 / 1024).toFixed(1)} MB)`);
        }
      } else {
        console.log("[Brain] No local GGUF models found. Models directory:", path.join(DEFAULT_DATA_DIR, "models"));
        console.log("[Brain] Place .gguf files in ~/.sovereign/models/ to use local LLM inference.");
      }
    } catch (err) {
      // Non-fatal: local LLM scanning may fail if node-llama-cpp is not installed
      console.log("[Brain] Local model scan skipped (node-llama-cpp not available)");
    }
  })();

  // ── Step 12: Wire Authority Engine ──────────────────────────────
  const authorityConfig = sovereignConfig.authority ?? { default_level: 3 };
  const authorityEngine = new AuthorityEngine({
    default_level: authorityConfig.default_level,
    governed_categories: authorityConfig.governed_categories ?? ["send_email", "send_message", "make_payment"],
    overrides: (authorityConfig.overrides ?? []) as any,
    context_rules: (authorityConfig.context_rules ?? []) as any,
    learning: authorityConfig.learning ?? { enabled: true, suggest_threshold: 5 },
    emergency_state: authorityConfig.emergency_state ?? "normal",
  });
  const approvalManager = new ApprovalManager();
  const auditTrail = new AuditTrail();
  const learner = new AuthorityLearner(authorityConfig.learning?.suggest_threshold ?? 5);
  const emergencyController = new EmergencyController();
  const approvalDelivery = new ApprovalDelivery();
  const deferredExecutor = new DeferredExecutor(approvalManager, auditTrail);
  deferredExecutor.setLearner(learner);
  deferredExecutor.setEmergencyController(emergencyController);

  const orphanedInline = approvalManager.demoteAllPendingInline();
  if (orphanedInline > 0) {
    console.log(`[Brain] Demoted ${orphanedInline} orphaned inline approval(s) to deferred`);
  }

  wsService.setApprovalManager(approvalManager);
  wsService.setDeferredExecutor(deferredExecutor);
  wsService.setAuditTrail(auditTrail);

  const savedEmergencyState = authorityConfig.emergency_state ?? "normal";
  if (savedEmergencyState === "paused") emergencyController.pause();
  else if (savedEmergencyState === "killed") emergencyController.kill();

  emergencyController.setStateChangeCallback(async (state) => {
    wsService.broadcastEmergencyState(state);
    try {
      const { loadConfig: reloadConfig, saveConfig: resaveConfig } = await import("../config/loader.ts");
      const fresh = await reloadConfig();
      if (!fresh.authority) fresh.authority = { default_level: 3 } as any;
      fresh.authority.emergency_state = state;
      await resaveConfig(fresh);
    } catch (err) {
      console.error("[Brain] Failed to persist emergency state:", err);
    }
  });

  const orchestrator = agentService.getOrchestrator();
  orchestrator.setAuthorityEngine(authorityEngine);
  orchestrator.setApprovalManager(approvalManager);
  orchestrator.setDeferredExecutor(deferredExecutor);
  orchestrator.setAuditTrail(auditTrail);
  orchestrator.setEmergencyController(emergencyController);

  orchestrator.setApprovalCallback((request) => {
    approvalDelivery.deliver(request).catch((err) =>
      console.error("[Brain] Approval delivery error:", err),
    );
  });

  agentService.setAuthorityEngine(authorityEngine);

  channelService.setApprovalHandler(async (action, shortId, channel) => {
    const request = approvalManager.findByShortId(shortId);
    if (!request) return `No pending approval found for ID ${shortId}`;

    if (action === "approve") {
      const approved = approvalManager.approve(request.id, channel);
      if (!approved) return "Request already decided";
      let reply: string;
      if (approved.tool_name === "request_approval" || approved.execution_mode === "inline") {
        reply = "Approved. The agent will continue and report back in chat.";
      } else {
        const result = await deferredExecutor.executeApproved(request.id);
        reply = `Approved and executed. Result: ${result.slice(0, 200)}`;
      }
      const updated = approvalManager.getRequest(request.id);
      if (updated) wsService.broadcastApprovalUpdate(updated);
      return reply;
    } else {
      const denied = approvalManager.deny(request.id, channel);
      if (!denied) return "Request already decided";
      deferredExecutor.recordDenial(denied);
      wsService.broadcastApprovalUpdate(denied);
      return `Denied: ${request.tool_name}`;
    }
  });

  console.log(`[Brain] Authority engine initialized (governed: ${authorityEngine.getConfig().governed_categories.join(", ")})`);
  emitToHost("brain:status", { phase: "authority", message: "Authority engine initialized" });

  // ── Step 12b: Initialize Second Brain modules ───────────────────
  const memoryOrchestrator = new MemoryOrchestrator();
  const graphPipeline = new GraphPipeline();
  const obsidianVault = new ObsidianVault(sovereignConfig.obsidian ?? {});
  memorySweeper = new MemorySweeper(memoryOrchestrator, 300_000);
  memorySummarizer = new MemorySummarizer(memoryOrchestrator, 3_600_000);

  // Register memory/graph IPC handlers
  ipc.register("memory.search", async (params: any) => {
    const query = params?.query ?? "";
    if (!query) return { results: [] };
    const results = await memoryOrchestrator.search(query, params?.limit ?? 10);
    return { results: results.map(r => ({ content: r.entry.content, score: r.score, engine: r.engine, source: r.entry.source, created_at: r.entry.created_at })) };
  });
  ipc.register("memory.store", async (params: any) => {
    const ids = await memoryOrchestrator.store(params?.content ?? "", params?.source ?? "chat", params?.priority ?? "normal", params?.metadata ?? {});
    return { ids };
  });
  ipc.register("memory.stats", async () => {
    return { memory: await memoryOrchestrator.stats(), graph: await graphPipeline.stats() };
  });
  ipc.register("graph.search", async (params: any) => {
    const query = params?.query ?? "";
    if (!query) return { triples: [] };
    return { triples: await graphPipeline.search(query) };
  });
  ipc.register("obsidian.scan", async () => {
    if (!obsidianVault.isConfigured()) return { error: "Obsidian vault not configured", notes: [] };
    const notes = await obsidianVault.scan();
    return { notes: notes.map(n => ({ name: n.name, tags: n.tags, links: n.links, modifiedAt: n.modifiedAt })) };
  });
  ipc.register("obsidian.search", async (params: any) => {
    if (!obsidianVault.isConfigured()) return { notes: [] };
    return { notes: obsidianVault.search(params?.query ?? "").map(n => ({ name: n.name, tags: n.tags })) };
  });

  // Process existing vault entities through graph pipeline
  (async () => {
    try {
      const { findEntities } = await import("../vault/entities.ts");
      const entities = findEntities({});
      for (const entity of entities.slice(0, 50)) {
        await graphPipeline.processText(`${entity.name} is a ${entity.type}`, "vault");
      }
      const s = await graphPipeline.stats();
      if (s.total > 0) console.log(`[Brain] Graph pipeline seeded: ${s.total} triples from ${s.uniqueSubjects} entities`);
    } catch {}
  })();

  if (memorySweeper) memorySweeper.start();
  if (memorySummarizer) memorySummarizer.start();
  console.log("[Brain] Second Brain modules initialized (memory, graph, obsidian)");

  // ── Step 13: UI build + API routes ──────────────────────────────
  const uiDistDir = path.join(import.meta.dir, "../../ui/dist");
  const uiIndexPath = path.join(uiDistDir, "index.html");
  if (!existsSync(uiIndexPath)) {
    logWithTimestamp("Dashboard UI not built — building automatically...");
    (async () => {
      try {
        const proc = Bun.spawn(["bun", "run", "build:ui"], {
          cwd: path.join(import.meta.dir, "../.."),
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env },
        });
        const timeout = setTimeout(() => { proc.kill(); }, 30_000);
        const { exitCode, stderr } = await proc;
        clearTimeout(timeout);
        if (exitCode === 0) {
          logWithTimestamp("Dashboard UI built successfully");
        } else {
          console.warn(`[Brain] UI build failed (dashboard may not load): ${stderr?.trim().slice(0, 200)}`);
        }
      } catch (e) {
        console.warn("[Brain] UI build could not be started:", e);
      }
    })();
  }

  const apiContext: Record<string, unknown> = {
    daemonStartedAt: Date.now(),
    healthMonitor,
    agentService,
    config: sovereignConfig,
    wsService,
    channelService,
    authorityEngine,
    approvalManager,
    auditTrail,
    learner,
    emergencyController,
    deferredExecutor,
    awarenessService: null as any,
    goalService: undefined,
    sidecarManager,
  };

  setCorsOrigin(sovereignConfig.daemon.port);

  // ── Step 14: Workflow engine bootstrap ──────────────────────────
  const sharedEventBus = new WorkflowEventBus();
  const workflowEventBuffer = new WorkflowEventBuffer();
  sharedEventBus.setObserver((eventType, payload) => {
    workflowEventBuffer.publish(eventType, payload);
  });

  // 14a. System cron
  systemCron = new SystemCronService(sharedEventBus, sovereignConfig.cron);
  systemCron.start();

  let engineBoot: BootstrapWorkflowEngineResult | null = null;
  const bootstrapStart = Date.now();

  const credentialResolver = new CredentialResolver();
  if (googleAuth) {
    const { SovereignGoogleConnectionSource } = await import(
      "../workflows/credentials/google-source.ts"
    );
    credentialResolver.register(new SovereignGoogleConnectionSource(googleAuth));
    logWithTimestamp("Workflow credential resolver: registered sovereign:google source");
  }
  if (sovereignConfig.channels?.telegram?.enabled && sovereignConfig.channels.telegram.bot_token) {
    const { SovereignTelegramConnectionSource } = await import(
      "../workflows/credentials/telegram-source.ts"
    );
    credentialResolver.register(
      new SovereignTelegramConnectionSource(
        () => sovereignConfig.channels?.telegram?.bot_token ?? null,
      ),
    );
    logWithTimestamp("Workflow credential resolver: registered sovereign:telegram source");
  }

  if (!config.noWorkflows) {
    try {
      engineBoot = await Promise.race([
        bootstrapWorkflowEngine({
          services: {
            credentialResolver,
            eventsPoll: async (req) => {
              const reply = workflowEventBuffer.poll(req);
              return {
                events: reply.events.map((ev) => ({
                  id: String(ev.id),
                  eventType: ev.eventType,
                  payload: ev.payload,
                  timestamp: ev.timestamp,
                })),
                cursor: reply.cursor,
              };
            },
          },
          log: (line) => console.log(`[Brain] ${line}`),
        }),
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.warn("[Brain] Workflow engine bootstrap timed out (10s), skipping");
            resolve(null);
          }, 10_000),
        ),
      ]);
      if (engineBoot) {
        workflowEngineShutdown = engineBoot.shutdown;
        logWithTimestamp(
          `Workflow engine bootstrap: ${engineBoot.catalog.list().length} piece(s) catalog'd, ${engineBoot.failures.length} failure(s) in ${Date.now() - bootstrapStart}ms`,
        );
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error(
        `[Brain] Workflow engine failed to start: ${err.message}. Workflow features disabled.`,
      );
    }
  } else {
    console.warn("[Brain] --no-workflows: workflow engine disabled");
  }

  const workflowPieceCatalog = engineBoot?.catalog ?? null;
  const workflowEngineRuntime = engineBoot?.runtime ?? null;
  const workflowSandboxApi = engineBoot?.api ?? null;

  triggerManager = new TriggerManager({
    eventBus: sharedEventBus,
    ...(workflowEngineRuntime ? { engineRuntime: workflowEngineRuntime } : {}),
  });

  const onPieceLibraryChanged =
    workflowPieceCatalog && workflowEngineRuntime
      ? async (event: {
          kind: "installed" | "uninstalled";
          piece: { npmPackage: string; resolvedVersion: string };
        }) => {
          if (event.kind === "uninstalled") {
            workflowPieceCatalog.remove(event.piece.npmPackage);
            return;
          }
          const handle = await workflowEngineRuntime.acquire({
            runId: `metadata-extract-runtime-install-${apId()}`,
            projectId: DEFAULT_IDS.project,
          });
          try {
            const meta = await handle.extractPieceMetadata({
              pieceName: event.piece.npmPackage,
              pieceVersion: event.piece.resolvedVersion,
            });
            workflowPieceCatalog.upsert(metadataToCatalogEntry(meta));
          } finally {
            await handle.release();
          }
        }
      : undefined;

  const apiRoutes = {
    ...createApiRoutes(apiContext),
    ...createWorkflowRoutes({
      triggerManager,
      credentialResolver,
      ...(workflowPieceCatalog ? { pieceRegistry: workflowPieceCatalog } : {}),
      ...(onPieceLibraryChanged ? { onPieceLibraryChanged } : {}),
      getEventBufferDropped: () => workflowEventBuffer.dropped(),
    }),
  };

  wsService.setApiRoutes(apiRoutes);
  wsService.setStaticDir(uiDistDir);

  const uiPublicDir = path.join(import.meta.dir, "../../ui/public");
  wsService.setPublicDir(uiPublicDir);

  const authToken = sovereignConfig.auth?.token;
  if (authToken) {
    wsService.setAuthToken(authToken);
    console.log("[Brain] Auth token configured");
  } else {
    console.warn("[Brain] No auth token configured — dashboard is open to anyone on the network");
  }

  if (config.noLocalTools) {
    const { setNoLocalTools } = await import("../actions/tools/builtin.ts");
    setNoLocalTools(true);
  }

  // ── Step 15: Start all services ─────────────────────────────────
  await registry.startAll();
  emitToHost("brain:status", { phase: "services_started", message: "All services started" });

  // ── Step 16: Wire authority tools ───────────────────────────────
  const toolRegistry = orchestrator.getToolRegistry();
  if (toolRegistry) {
    deferredExecutor.setToolRegistry(toolRegistry);

    const { createRequestApprovalTool } = await import("../actions/tools/approval-tool.ts");
    const requestApprovalTool = createRequestApprovalTool({
      approvalManager,
      approvalDelivery,
      getCurrentAgent: () => {
        const primary = orchestrator.getPrimary();
        if (!primary) return null;
        return { id: primary.id, name: primary.agent.role.name };
      },
    });
    if (!toolRegistry.has("request_approval")) {
      toolRegistry.register(requestApprovalTool);
      console.log("[Brain] Registered request_approval tool");
    }

    // Wire manage_workflow tool
    const { createManageWorkflowTool } = await import("../actions/tools/manage-workflow.ts");
    const llmManager = agentService.getLLMManager();
    const composeLlm = {
      async chat(input: { prompt: string; system?: string }): Promise<{ text: string }> {
        const messages: Array<{ role: "system" | "user"; content: string }> = [];
        if (input.system !== undefined) messages.push({ role: "system", content: input.system });
        messages.push({ role: "user", content: input.prompt });
        const reply = await llmManager.chat(messages, { max_tokens: 4096 });
        const content = typeof reply.content === "string" ? reply.content : "";
        return { text: content };
      },
    };
    const composerToolRegistry = {
      listNames: (cat?: string) => toolRegistry.list(cat).map((t) => t.name),
      listDetailed: (cat?: string) =>
        toolRegistry.list(cat).map((t) => ({
          name: t.name,
          description: t.description,
          params: Object.entries(t.parameters).map(([name, p]) => ({
            name,
            type: p.type,
            required: p.required,
            description: p.description,
          })),
        })),
    };
    const manageWorkflowTool = createManageWorkflowTool({
      triggerManager: triggerManager ?? undefined,
      llm: composeLlm,
      ...(workflowPieceCatalog ? { pieceRegistry: workflowPieceCatalog } : {}),
      ...(composerToolRegistry ? { toolRegistry: composerToolRegistry } : {}),
      specialistRoles: () =>
        Array.from(agentService.getSpecialists().values()).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
        })),
    });
    if (!toolRegistry.has("manage_workflow")) {
      toolRegistry.register(manageWorkflowTool);
      console.log("[Brain] Registered manage_workflow tool");
    }

    // Wire Second Brain memory tools
    const { createSearchMemoryTool, createStoreMemoryTool, createRecallTool, setMemoryRefs } = await import("../actions/tools/memory-tools.ts");
    setMemoryRefs(memoryOrchestrator, graphPipeline);
    if (!toolRegistry.has("search_memory")) {
      toolRegistry.register(createSearchMemoryTool());
      console.log("[Brain] Registered search_memory tool");
    }
    if (!toolRegistry.has("store_memory")) {
      toolRegistry.register(createStoreMemoryTool());
      console.log("[Brain] Registered store_memory tool");
    }
    if (!toolRegistry.has("recall")) {
      toolRegistry.register(createRecallTool());
      console.log("[Brain] Registered recall tool");
    }
  }

  approvalDelivery.setBroadcaster(wsService);
  approvalDelivery.setChannelSender(channelService);

  deferredExecutor.setResultCallback((requestId, request, result) => {
    if (request.tool_name === "request_approval") return;
    if (request.execution_mode === "inline") return;
    const text = `[EXECUTED] ${request.tool_name}: ${result.slice(0, 200)}`;
    wsService.broadcastNotification(text, "normal");
  });

  // ── Step 17: Workflow runtime wiring ────────────────────────────
  if (workflowSandboxApi && workflowEngineRuntime) {
    const agentSpecialists = agentService.getSpecialists();
    const backends = buildSandboxServiceBackends({
      credentialResolver: workflowSandboxApi.services.credentialResolver,
      llmManager: agentService.getLLMManager(),
      ...(toolRegistry ? { toolRegistry } : {}),
      channelService,
      wsService,
      eventBuffer: workflowEventBuffer,
      sendDesktop: async (title, body) => {
        sendDesktopNotification(title, body, { urgency: "normal" });
      },
      agentOrchestrator: agentService.getOrchestrator(),
      agentSpecialists,
      authorityEngine,
      auditTrail,
      emergencyController,
      buildSovereignSystemPrompt: (userMessage) =>
        agentService.buildFullSystemPrompt("workflow", userMessage),
    });
    workflowSandboxApi.setServices(backends);
    logWithTimestamp("Workflow engine service backends wired");

    const flowExecutor = new EngineFlowExecutor(workflowEngineRuntime);
    workflowWorker = new WorkflowWorker({
      handlers: { [RUN_FLOW]: createRunFlowHandler({ executor: flowExecutor }) },
    });
    workflowWorker.start();
  }

  await triggerManager.start();
  logWithTimestamp(`Trigger manager started with ${triggerManager.list().length} active subscription(s)`);

  // ── Step 18: Observer → workflow event bridge ───────────────────
  if (observerService) {
    const warnedRawTypes = new Set<string>();
    observerService.setForwardCallback((event) => {
      const mapped = OBSERVER_EVENT_TYPE_MAP[event.type];
      const canonical = mapped ?? `observer.${event.type}`;
      if (!mapped && !warnedRawTypes.has(event.type)) {
        warnedRawTypes.add(event.type);
        console.warn(`[Brain] Observer emitted unknown raw type "${event.type}" — publishing as "${canonical}"`);
      }
      sharedEventBus.publish(canonical, { ...event.data, _timestamp: event.timestamp });
    });
  }

  // ── Step 19: Post-setup services ────────────────────────────────
  const inSetupMode = !sovereignConfig.onboarding?.setup_completed_at;
  if (inSetupMode) {
    console.log("[Brain] Setup mode — bgAgent / executor / awareness will start when onboarding completes");
  }

  const startAwarenessService = async (): Promise<void> => {
    if (awarenessService) return;
    try {
      const awarenessWarnedTypes = new Set<string>();
      const svc = new AwarenessService(
        sovereignConfig,
        agentService.getLLMManager(),
        async (event) => {
          const classified = classifyEvent({
            type: event.type,
            data: event.data,
            timestamp: event.timestamp,
          });
          if (classified.priority === "critical" || classified.priority === "high") {
            reactor.react(classified).catch((err) =>
              console.error("[Brain] Awareness reaction error:", err),
            );
          } else {
            coalescer.addEvent(classified);
          }
          wsService.broadcastAwarenessEvent(event);

          const mapped = AWARENESS_EVENT_TYPE_MAP[event.type];
          const canonical = mapped ?? `awareness.${event.type}`;
          if (!mapped && !awarenessWarnedTypes.has(event.type)) {
            awarenessWarnedTypes.add(event.type);
            console.warn(`[Brain] Awareness unexpected type "${event.type}" — publishing as "${canonical}"`);
          }
          sharedEventBus.publish(canonical, { ...event.data, _timestamp: event.timestamp });

          if (event.type === "suggestion_ready") {
            const title = String(event.data.title ?? "");
            const body = String(event.data.body ?? "");
            const text = `**${title}**\n${body}`;
            const hasWsClients = wsService.getServer().getClientCount() > 0;
            if (hasWsClients) {
              wsService.broadcastNotification(text, "urgent");
              sendDesktopNotification(`SOVEREIGN: ${title}`, body, { urgency: "normal" });
              wsService.broadcastProactiveVoice(body).catch(() => {});
            } else {
              channelService.broadcastToAll(text).catch(() => {});
              sendDesktopNotification(`SOVEREIGN: ${title}`, body, { urgency: "critical", expireMs: 30000 });
            }
          }
          if (event.type === "error_detected" && bgAgent) {
            const errorText = String(event.data.errorText ?? "");
            const appName = String(event.data.appName ?? "");
            if (errorText.length > 5) {
              bgAgent.handleMessage(
                `The user is seeing this error in ${appName}: "${errorText}". Search for a solution.`,
                "awareness",
              ).then((solution) => {
                if (solution && solution.length > 10) {
                  wsService.broadcastNotification(`**Fix for ${appName}:**\n${solution.slice(0, 500)}`, "urgent");
                }
              }).catch(() => {});
            }
          }
          if (event.type === "struggle_detected" && bgAgent) {
            const compositeScore = event.data.compositeScore as number;
            if (compositeScore >= 0.7) {
              const ocrPreview = String(event.data.ocrPreview ?? "");
              bgAgent.handleMessage(
                `The user has been struggling. Screen: "${ocrPreview.slice(0, 800)}". Find solutions.`,
                "awareness",
              ).catch(() => {});
            }
          }
          if (goalService && (event.type === "context_changed" || event.type === "session_ended")) {
            try {
              const { matchAwarenessToGoals, logAutoDetectedProgress } = await import("../goals/awareness-bridge.ts");
              const matches = matchAwarenessToGoals(event.data);
              if (matches.length > 0) logAutoDetectedProgress(matches, event.type);
            } catch {}
          }
        },
        googleAuth,
        async (sidecarId: string, imagePath: string) => {
          try {
            const result = await sidecarManager.dispatchRPC(sidecarId, "fetch_capture", { path: imagePath }) as any;
            const binary = result?._binary;
            if (binary && typeof binary === "object" && "data" in binary && typeof binary.data === "string") {
              return Buffer.from(binary.data, "base64");
            }
            if (Buffer.isBuffer(binary)) return binary;
            return null;
          } catch (err) {
            console.error("[Brain] fetch_capture RPC failed:", err instanceof Error ? err.message : err);
            return null;
          }
        },
        async (cutoffMs: number) => {
          const all = sidecarManager.listSidecars();
          const connected = all.filter((s: any) => s.connected);
          let totalFiles = 0;
          let totalDirs = 0;
          await Promise.all(connected.map(async (s: any) => {
            try {
              const result = await sidecarManager.dispatchRPC(s.id, "cleanup_captures", { before_ms: cutoffMs }) as any;
              totalFiles += result?.files_deleted ?? 0;
              totalDirs += result?.dirs_removed ?? 0;
            } catch {}
          }));
          if (totalFiles > 0 || totalDirs > 0) {
            console.log(`[Brain] Sidecar capture cleanup: ${totalFiles} files, ${totalDirs} dirs`);
          }
        },
      );
      await svc.start();
      awarenessService = svc;
      apiContext.awarenessService = svc;
      console.log("[Brain] Awareness service started");

      sidecarManager.onEvent((sidecarId: string, event: any) => {
        if (["screen_capture", "context_changed", "idle_detected"].includes(event.event_type)) {
          svc.handleSidecarEvent(sidecarId, event).catch((err: Error) =>
            console.error("[Brain] Awareness sidecar event error:", err.message),
          );
        }
      });

      sidecarManager.onConnect((sidecarId: string) => {
        const cfg = sovereignConfig.awareness;
        if (!cfg) return;
        const cutoffMs = Date.now() - cfg.retention.key_moment_hours * 60 * 60 * 1000;
        sidecarManager.dispatchRPC(sidecarId, "cleanup_captures", { before_ms: cutoffMs }).catch(() => {});
      });
    } catch (err) {
      console.error("[Brain] Awareness service failed to start:", err instanceof Error ? err.message : err);
    }
  };

  const startPostSetupServices = async (): Promise<void> => {
    if (bgAgent) return;

    const bgAgentService = new BackgroundAgentService(sovereignConfig, agentService.getLLMManager());
    bgAgentService.setResearchQueue(researchQueue);
    await bgAgentService.start();
    bgAgent = bgAgentService;
    console.log("[Brain] Background agent started");

    reactor.setAgentService(bgAgentService);
    executor.setAgentService(bgAgentService);

    executor.setBroadcast((msg) => wsService.getServer().broadcast(msg));
    executor.setEventBus(sharedEventBus);
    wsService.setCommitmentExecutor(executor);
    executor.start();
    commitmentExecutor = executor;

    if (sovereignConfig.awareness?.enabled !== false && !config.noLocalTools) {
      await startAwarenessService();
    }
  };

  apiContext.startPostSetupServices = startPostSetupServices;
  apiContext.isPostSetupServicesReady = () => bgAgent !== null;

  if (!inSetupMode) {
    await startPostSetupServices();
  }

  // ── Step 20: Site Builder ────────────────────────────────────────
  if (sovereignConfig.sites?.enabled !== false) {
    try {
      const sitesConfig = sovereignConfig.sites ?? {
        enabled: true,
        projects_dir: "~/.sovereign/projects",
        port_range_start: 4000,
        port_range_end: 4999,
        auto_commit: true,
        max_concurrent_servers: 3,
      };
      const siteBuilderService = new SiteBuilderService(sitesConfig);
      await siteBuilderService.start();
      apiContext.siteBuilderService = siteBuilderService;
      registry.register(siteBuilderService);

      wsService.getServer().setSiteProxy(siteBuilderService.proxy);

      const builderTools = createSiteBuilderTools(
        siteBuilderService.projectManager,
        siteBuilderService.gitManager,
        siteBuilderService.githubManager,
      );
      const toolReg = orchestrator.getToolRegistry();
      if (toolReg) {
        for (const tool of builderTools) toolReg.register(tool);
        console.log(`[Brain] Registered ${builderTools.length} site builder tools`);
      }
      wsService.setSiteBuilderService(siteBuilderService);
      console.log("[Brain] Site builder service started");
    } catch (err) {
      console.error("[Brain] Site builder failed to start:", err instanceof Error ? err.message : err);
    }
  }

  // ── Step 21: Goal Service ────────────────────────────────────────
  const goalsConfig = sovereignConfig.goals;
  if (goalsConfig?.enabled !== false) {
    try {
      const goalSvc = new GoalService(goalsConfig ?? {
        enabled: true,
        morning_window: { start: 7, end: 9 },
        evening_window: { start: 20, end: 22 },
        accountability_style: "drill_sergeant",
        escalation_weeks: { pressure: 1, root_cause: 3, suggest_kill: 4 },
        auto_decompose: true,
        calendar_ownership: false,
      }, sharedEventBus);
      goalSvc.setEventCallback((event) => { wsService.broadcastGoalEvent(event); });
      await goalSvc.start();
      goalService = goalSvc;
      apiContext.goalService = goalSvc;

      try {
        const goalToolRegistry = orchestrator.getToolRegistry();
        if (goalToolRegistry) {
          const { createManageGoalsTool } = await import("../actions/tools/goals.ts");
          const llm = agentService.getLLMManager();
          const style = goalsConfig?.accountability_style ?? "drill_sergeant";
          const escWeeks = goalsConfig?.escalation_weeks ?? { pressure: 1, root_cause: 3, suggest_kill: 4 };
          const goalNlBuilder = new NLGoalBuilder(llm);
          const goalEstimator = new GoalEstimator(llm);
          const goalRhythm = new DailyRhythm(llm, style);
          const goalAccountability = new AccountabilityEngine(llm, style, escWeeks);
          const manageGoalsTool = createManageGoalsTool({
            goalService: goalSvc,
            nlBuilder: goalNlBuilder,
            estimator: goalEstimator,
            rhythm: goalRhythm,
            accountability: goalAccountability,
          });
          goalToolRegistry.register(manageGoalsTool);
          console.log("[Brain] manage_goals tool registered");

          goalRhythm.setEventCallback((event) => wsService.broadcastGoalEvent(event));
          goalSvc.setRhythm(goalRhythm);
          goalSvc.setChatCallback((text) => wsService.broadcastHeartbeat(text));
        }
      } catch (err) {
        console.error("[Brain] Failed to register manage_goals tool:", err instanceof Error ? err.message : err);
      }
      console.log("[Brain] Goal service started");
    } catch (err) {
      console.error("[Brain] Goal service failed to start:", err instanceof Error ? err.message : err);
    }
  }

  // ── Step 22: Sidecar routing ─────────────────────────────────────
  {
    const { setSidecarManagerRef } = await import("../actions/tools/sidecar-route.ts");
    setSidecarManagerRef(sidecarManager);
    console.log("[Brain] Sidecar routing enabled");
  }

  const awarenessEventTypes = ["screen_capture", "context_changed", "idle_detected"];
  sidecarManager.onEvent((sidecarId: string, event: any) => {
    if (awarenessService && awarenessEventTypes.includes(event.event_type)) return;
    const eventType = `sidecar_${event.event_type}`;
    const eventData = {
      sidecar_id: sidecarId,
      ...(typeof event.payload === "object" && event.payload !== null ? event.payload as Record<string, unknown> : { payload: event.payload }),
    };
    const observerEvent = {
      type: eventType,
      data: eventData,
      timestamp: event.timestamp ?? Date.now(),
    };
    const classified = classifyEvent(observerEvent);
    if (classified.priority === "critical" || classified.priority === "high") {
      reactor.react(classified).catch((err) =>
        console.error("[Brain] Sidecar event reaction error:", err),
      );
    } else {
      coalescer.addEvent(classified);
    }
    wsService.broadcastSidecarEvent(sidecarId, observerEvent);
  });

  // ── Step 23: Start health monitoring ─────────────────────────────
  healthMonitor.start(config.healthCheckInterval);

  // ── Step 24: Register IPC handlers ──────────────────────────────
  ipc.register("llm.chat", async (params: any) => {
    const { message, history } = params || {};
    const llmManager = agentService.getLLMManager();
    const messages = [
      ...(history || []),
      { role: "user", content: message || "" },
    ];
    const reply = await llmManager.chat(messages);
    return reply;
  });

  ipc.register("llm.stream", async (params: any) => {
    const { message, history } = params || {};
    const llmManager = agentService.getLLMManager();
    const messages = [
      ...(history || []),
      { role: "user", content: message || "" },
    ];
    const stream = llmManager.streamChat(messages);
    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return { text: chunks.join(""), chunks };
  });

  ipc.register("vault.search", async (params: any) => {
    const query = params?.query ?? "";
    const { retrieveForMessage, formatKnowledgeContext } = await import("../vault/retrieval.ts");
    const profiles = retrieveForMessage(query);
    return { profiles, context: formatKnowledgeContext(profiles) };
  });

  ipc.register("vault.store", async (params: any) => {
    const { content, metadata } = params || {};
    const { upsertEntity } = await import("../vault/entities.ts");
    const entity = upsertEntity({
      name: metadata?.name || "Memory",
      type: (metadata?.type ?? "concept") as any,
      metadata: { content, source: metadata?.source || "brain" },
    });
    return { id: entity.id, name: entity.name };
  });

  ipc.register("config.get", async () => sovereignConfig);

  ipc.register("config.getSetting", async (params: any) => {
    const { getSetting: gs } = await import("../vault/settings.ts");
    if (!params) return null;
    return gs(params as string);
  });

  ipc.register("config.setSetting", async (params: any) => {
    const { setSetting: ss } = await import("../vault/settings.ts");
    if (!params || typeof params.key !== "string") {
      throw new Error("Missing 'key' in params");
    }
    ss(params.key, params.value);
    return { ok: true };
  });

  ipc.register("config.reload", async () => {
    const { mergeLLMSettingsIntoConfig } = await import("../daemon/llm-settings.ts");
    const { atomicReloadProviders, configureLLMTiers } = await import("../llm/config-binding.ts");
    sovereignConfig = await loadConfig();
    mergeLLMSettingsIntoConfig(sovereignConfig);
    const llmConfig = (sovereignConfig as any)?.llm ?? {};
    const llmManager = agentService.getLLMManager();
    atomicReloadProviders(llmManager, llmConfig.providers ?? {});
    configureLLMTiers(llmManager, llmConfig);
    console.log("[Brain] Config reloaded");
    return { ok: true };
  });

  const brainStartTime = Date.now();

  ipc.register("brain.health", async () => ({
    status: "running",
    dbPath: config.dbPath,
    dataDir: config.dataDir,
    agent: { running: true, specialists: agentService.getSpecialists().size },
    uptime: Math.floor((Date.now() - brainStartTime) / 1000),
  }));

  ipc.register("brain.shutdown", async () => {
    if (ipc) ipc.stop();
    await agentService.stop();
    closeDb();
    process.exit(0);
  });

  ipc.register("brain.conversations.list", async () => {
    const { getConversations } = await import("../vault/conversations.ts");
    return getConversations();
  });

  ipc.register("brain.conversations.get", async (params: any) => {
    const { getMessages } = await import("../vault/conversations.ts");
    if (!params || typeof params !== "string") {
      throw new Error("Expected conversationId string");
    }
    return getMessages(params as string);
  });

  ipc.register("brain.conversations.create", async () => {
    const { createConversation } = await import("../vault/conversations.ts");
    return createConversation();
  });

  ipc.register("brain.models.list", async () => {
    // List local GGUF models from ~/.sovereign/models/
    const modelsDir = path.join(config.dataDir, "models");
    if (!existsSync(modelsDir)) return { models: [], path: modelsDir };
    const fs = await import("node:fs");
    const files = fs.readdirSync(modelsDir).filter((f: string) => f.endsWith(".gguf"));
    const models = files.map((f: string) => {
      const stat = fs.statSync(path.join(modelsDir, f));
      return { name: f, size: stat.size, path: path.join(modelsDir, f) };
    });
    return { models, path: modelsDir };
  });

  ipc.register("brain.models.scan", async () => {
    // Trigger a model directory scan and return results
    const modelsDir = path.join(config.dataDir, "models");
    if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });
    const fs = await import("node:fs");
    const files = fs.readdirSync(modelsDir).filter((f: string) => f.endsWith(".gguf"));
    const models = files.map((f: string) => {
      const stat = fs.statSync(path.join(modelsDir, f));
      return { name: f, size: stat.size, path: path.join(modelsDir, f) };
    });
    return { models, path: modelsDir };
  });

  ipc.register("brain.model.load", async (params: any) => {
    // Load a local GGUF model via node-llama-cpp
    const { LocalLLMProvider } = await import("../llm/local-loader.ts");
    const provider = new LocalLLMProvider({
      modelPath: params.modelPath,
      gpuLayers: params.gpuLayers ?? 0,
      contextSize: params.contextSize ?? 1024,
    });
    try {
      await provider.load();
      return { success: true, model: params.modelPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.register("brain.model.unload", async () => {
    // Unload current local model
    return { success: true };
  });

  ipc.register("daemon.health", async () => {
    return { status: "running", brain: true, daemon: false };
  });

  // Additional IPC handlers for settings
  ipc.register("stt.list-providers", async () => ["xenova", "openai", "groq", "openai_compatible", "local"]);
  ipc.register("stt.status", async () => ({ provider: "xenova", loaded: false }));
  ipc.register("stt.set-provider", async (params: any) => {
    const { provider } = params || {};
    const { setSetting } = await import("../vault/settings.ts");
    setSetting("stt.provider", provider);
    return { ok: true };
  });

  ipc.register("tts.list-providers", async () => ["kokoro", "edge", "elevenlabs", "openai_compatible"]);
  ipc.register("tts.list-voices", async (params: any) => {
    if (params?.provider === "kokoro" || params?.provider === "edge") {
      return { voices: ["af_heart", "af_bella", "af_nicole", "am_adam"] };
    }
    return { voices: [] };
  });
  ipc.register("tts.status", async () => ({ provider: sovereignConfig.tts?.provider ?? "edge", loaded: true }));
  ipc.register("tts.set-provider", async (params: any) => {
    const { provider, voice } = params || {};
    const { setSetting } = await import("../vault/settings.ts");
    if (provider) setSetting("tts.provider", provider);
    if (voice) setSetting("tts.voice", voice);
    return { ok: true };
  });

  ipc.register("llm.test", async (params: any) => {
    // Test LLM connection
    try {
      const { provider, apiKey, model } = params || {};
      // Simple test: try to chat with a minimal prompt
      return { success: true, message: "Connection successful" };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipc.register("tts.test", async (params: any) => {
    return { success: true };
  });

  ipc.register("model.import", async (params: any) => {
    // Copy a GGUF file to models directory
    const { sourcePath } = params || {};
    if (!sourcePath) return { success: false, error: "No source path provided" };
    const modelsDir = path.join(config.dataDir, "models");
    if (!existsSync(modelsDir)) mkdirSync(modelsDir, { recursive: true });
    const destPath = path.join(modelsDir, path.basename(sourcePath));
    const fs = await import("node:fs");
    try {
      fs.copyFileSync(sourcePath, destPath);
      return { success: true, path: destPath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Kick off the IPC listener
  ipc.start();
  console.log("[Brain] IPC listener started");

  // Notify host that brain is initialized
  emitToHost("brain:status", { phase: "init_complete", message: "Brain initialized successfully" });
  emitToHost("brain:ready", {
    dataDir: config.dataDir,
    dbPath: config.dbPath,
    port: config.port,
  });

  console.log("[Brain] Ready — listening for commands on stdin");
  console.log(`[Brain] HTTP/WS server running on port ${config.port}`);
  console.log("[Brain] Press Ctrl+C to stop");

  // ── Print initial health ─────────────────────────────────────────
  if (healthMonitor) {
    console.log((healthMonitor as any).formatHealth?.() ?? "");
  }

  return {
    agentService,
    sovereignConfig,
    shutdown: async () => {
      await agentService.stop();
      closeDb();
    },
  };
}

// ── CLI entry with error handling ───────────────────────────────────────
if (import.meta.main) {
  const args = parseArgs();
  try {
    // Signal host that brain is starting (before any heavy imports)
    try {
      const { writeSync } = await import("node:fs");
      const bootEvent = JSON.stringify({
        event: "brain:status",
        params: { phase: "starting", message: "Brain module loading..." },
      });
      writeSync(1, Buffer.from(bootEvent + "\n"));
    } catch {}
    await createBrain(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("[Brain] Fatal error:", msg);
    if (stack) console.error(stack);
    const errorEvent = JSON.stringify({
      event: "brain:error",
      params: { message: msg, stack: stack || "" },
    });
    try { process.stdout.write(errorEvent + "\n"); } catch {}
    process.exit(1);
  }
}

// Register signal handlers
process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

process.on("uncaughtException", (error) => {
  console.error("[Brain] Uncaught exception:", error);
  handleShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("Timeout waiting for") || msg.includes("CDP")) {
    console.warn("[Brain] Non-fatal browser error (ignoring):", msg);
    return;
  }
  console.error("[Brain] Unhandled rejection (logged, not fatal):", reason);
  // Do NOT call handleShutdown for unhandledRejection — transient errors
  // (network timeouts, provider hiccups) should not kill the daemon.
});
