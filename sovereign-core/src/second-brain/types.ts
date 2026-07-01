import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { GraphPipeline } from "../vault/graph/pipeline.ts";
import type { ObsidianVault } from "../vault/sources/obsidian.ts";

export interface SecondBrainConfig {
  vaultPath: string;
  graphifyProjects: GraphifyProjectConfig[];
  sessionLogRetention: number;
  chatImportEnabled: boolean;
  autoSyncIntervalMs: number;
  defaultModel: string;
  lowSpecMode: boolean;
}

export interface GraphifyProjectConfig {
  name: string;
  rootDir: string;
  graphOutDir: string;
  enabled: boolean;
  deepMode: boolean;
}

export type NoteType = "permanent" | "fleeting" | "chat" | "session-log" | "graphify" | "reference" | "template";

export interface NoteFrontmatter {
  title: string;
  tags: string[];
  created: string;
  updated: string;
  status: "active" | "draft" | "archived";
  type: NoteType;
  aliases?: string[];
  links?: string[];
}

export interface ChatImport {
  sourcePath: string;
  sourceType: "code" | "web";
  title: string;
  date: string;
  tags: string[];
  content: string;
  decisions: string[];
  importedAt: string;
}

export interface SessionLog {
  date: string;
  description: string;
  whatWasDone: string[];
  decisions: string[];
  pendingItems: string[];
  modifiedNotes: string[];
  gitCommit?: string;
}

export interface CodebaseGraph {
  nodes: CodebaseNode[];
  edges: CodebaseEdge[];
  report: string;
  generatedAt: number;
}

export interface CodebaseNode {
  id: string;
  label: string;
  kind: "function" | "class" | "module" | "file" | "interface" | "type" | "variable";
  filePath: string;
  lineStart: number;
  lineEnd: number;
  properties?: Record<string, unknown>;
}

export interface CodebaseEdge {
  from: string;
  to: string;
  label: string;
}

export interface ResumeContext {
  recentLogs: SessionLog[];
  activeGoals: string[];
  lastDecisions: string[];
  pendingItems: string[];
  architectureNotes: string[];
  summary: string;
}

export interface SecondBrainServices {
  memoryOrchestrator: MemoryOrchestrator;
  graphPipeline: GraphPipeline;
  obsidianVault: ObsidianVault;
}
