import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { VaultWriter } from "./vault-writer.ts";
import type { SessionLog, ResumeContext } from "./types.ts";

export class SessionManager {
  private memoryOrchestrator: MemoryOrchestrator;
  private vaultWriter: VaultWriter;

  constructor(memoryOrchestrator: MemoryOrchestrator, vaultWriter: VaultWriter) {
    this.memoryOrchestrator = memoryOrchestrator;
    this.vaultWriter = vaultWriter;
  }

  async resume(projectDir?: string): Promise<ResumeContext> {
    const recentLogs = this.readRecentSessionLogs(3);
    const activeGoals = await this.fetchActiveGoals();
    const lastDecisions = this.collectDecisions(recentLogs);
    const pendingItems = this.collectPendingItems(recentLogs);
    const architectureNotes = this.readArchitectureNotes(projectDir);
    const summary = this.buildSummary(recentLogs, activeGoals, lastDecisions, pendingItems);

    return {
      recentLogs,
      activeGoals,
      lastDecisions,
      pendingItems,
      architectureNotes,
      summary,
    };
  }

  async save(log: Omit<SessionLog, "date">): Promise<string> {
    const date = new Date().toISOString().split("T")[0];
    const fullLog: SessionLog = { ...log, date };

    const vaultPath = this.vaultWriter.createSessionLog(fullLog);

    await this.memoryOrchestrator.store(
      `[Session Log ${date}] ${log.description}\nDone: ${log.whatWasDone.join("; ")}\nDecisions: ${log.decisions.join("; ")}\nPending: ${log.pendingItems.join("; ")}`,
      "chat",
      "high",
      { category: "session-log", date, description: log.description },
    );

    for (const decision of log.decisions) {
      await this.memoryOrchestrator.store(
        `[Decision ${date}] ${decision}`,
        "chat",
        "high",
        { category: "decision", date },
      );
    }

    return vaultPath;
  }

  private readRecentSessionLogs(count: number): SessionLog[] {
    const logsDir = join(this.vaultWriter.getVaultPath(), "logs");
    if (!existsSync(logsDir)) return [];

    const files = readdirSync(logsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, count);

    return files.map((f) => {
      const content = readFileSync(join(logsDir, f), "utf-8");
      return this.parseSessionLog(content, f);
    });
  }

  private parseSessionLog(content: string, filename: string): SessionLog {
    const whatWasDone: string[] = [];
    const decisions: string[] = [];
    const pendingItems: string[] = [];
    const modifiedNotes: string[] = [];
    let currentSection = "";
    let description = filename.replace(".md", "");

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (/^## What was done/i.test(trimmed)) { currentSection = "done"; continue; }
      if (/^## Decisions? made/i.test(trimmed)) { currentSection = "decisions"; continue; }
      if (/^## Pending items/i.test(trimmed)) { currentSection = "pending"; continue; }
      if (/^## Related notes/i.test(trimmed)) { currentSection = "notes"; continue; }
      if (/^## /.test(trimmed)) { currentSection = ""; continue; }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const item = trimmed.slice(2).trim();
        switch (currentSection) {
          case "done": whatWasDone.push(item); break;
          case "decisions": decisions.push(item); break;
          case "pending": pendingItems.push(item); break;
          case "notes": modifiedNotes.push(item.replace(/\[\[([^\]]+)\]\]/g, "$1")); break;
        }
      }
      if (currentSection === "" && trimmed.startsWith("# Session:")) {
        description = trimmed.slice("# Session:".length).trim();
      }
    }

    const date = filename.slice(0, 10);
    return { date, description, whatWasDone, decisions, pendingItems, modifiedNotes };
  }

  private async fetchActiveGoals(): Promise<string[]> {
    try {
      const goals = await this.memoryOrchestrator.search("goal", 10);
      return goals.map((g) => g.entry.content.slice(0, 100));
    } catch {
      return [];
    }
  }

  private collectDecisions(logs: SessionLog[]): string[] {
    const decisions = new Set<string>();
    for (const log of logs) {
      for (const d of log.decisions) decisions.add(d);
    }
    return [...decisions];
  }

  private collectPendingItems(logs: SessionLog[]): string[] {
    const pending = new Set<string>();
    for (const log of logs) {
      for (const p of log.pendingItems) pending.add(p);
    }
    return [...pending];
  }

  private readArchitectureNotes(projectDir?: string): string[] {
    if (!projectDir) return [];
    const archDir = join(projectDir, "architecture");
    if (!existsSync(archDir)) return [];

    return readdirSync(archDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const content = readFileSync(join(archDir, f), "utf-8");
        return `## ${f.replace(".md", "")}\n${content.slice(0, 500)}`;
      });
  }

  private buildSummary(
    logs: SessionLog[],
    goals: string[],
    decisions: string[],
    pending: string[],
  ): string {
    const parts: string[] = [];

    if (logs.length > 0) {
      parts.push(`## Recent Sessions (${logs.length})`);
      for (const log of logs) {
        parts.push(`- ${log.date}: ${log.description}`);
      }
    }

    if (goals.length > 0) {
      parts.push(`\n## Active Goals`);
      for (const g of goals) parts.push(`- ${g}`);
    }

    if (decisions.length > 0) {
      parts.push(`\n## Key Decisions`);
      for (const d of decisions) parts.push(`- ${d}`);
    }

    if (pending.length > 0) {
      parts.push(`\n## Pending Items`);
      for (const p of pending) parts.push(`- ${p}`);
    }

    return parts.join("\n");
  }
}
