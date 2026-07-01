import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, extname } from "node:path";
import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { VaultWriter } from "./vault-writer.ts";
import type { ChatImport, NoteFrontmatter } from "./types.ts";

const KEYWORD_TAGS: Record<string, string> = {
  python: "python",
  typescript: "typescript",
  javascript: "javascript",
  react: "react",
  supabase: "supabase",
  deploy: "deploy",
  bug: "debugging",
  refactor: "refactoring",
  api: "api",
  database: "database",
  test: "testing",
  config: "configuration",
  docker: "docker",
  auth: "authentication",
  memory: "memory",
  agent: "agent",
  workflow: "workflow",
  llm: "llm",
  obsidian: "obsidian",
  graph: "graph",
};

export class ChatImporter {
  private memoryOrchestrator: MemoryOrchestrator;
  private vaultWriter: VaultWriter;
  private importDir: string;
  private enabled: boolean;

  constructor(
    memoryOrchestrator: MemoryOrchestrator,
    vaultWriter: VaultWriter,
    importDir: string,
    enabled = true,
  ) {
    this.memoryOrchestrator = memoryOrchestrator;
    this.vaultWriter = vaultWriter;
    this.importDir = importDir;
    this.enabled = enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async importAll(): Promise<ChatImport[]> {
    if (!this.enabled) return [];
    const imports: ChatImport[] = [];
    const dirs = [
      { sub: "code", type: "code" as const },
      { sub: "web", type: "web" as const },
    ];

    for (const { sub, type } of dirs) {
      const dir = join(this.importDir, sub);
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter((f) => extname(f) === ".md");
      for (const file of files) {
        try {
          const chat = this.importFile(join(dir, file), type);
          imports.push(chat);
          await this.storeInMemory(chat);
        } catch (err) {
          console.warn(`[ChatImporter] Failed to import ${file}:`, err);
        }
      }
    }
    return imports;
  }

  importFile(filePath: string, sourceType: "code" | "web"): ChatImport {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const title = this.extractTitle(lines) || filePath.split(/[/\\]/).pop()?.replace(".md", "") || "Untitled";
    const tags = this.extractTags(content);
    const decisions = this.extractDecisions(content);

    const chat: ChatImport = {
      sourcePath: filePath,
      sourceType,
      title,
      date: this.extractDate(lines) || new Date().toISOString(),
      tags,
      content,
      decisions,
      importedAt: new Date().toISOString(),
    };

    this.saveToVault(chat);
    return chat;
  }

  private async storeInMemory(chat: ChatImport) {
    const summary = [
      `Title: ${chat.title}`,
      `Type: Claude ${chat.sourceType} chat`,
      `Date: ${chat.date}`,
      `Tags: ${chat.tags.join(", ")}`,
      chat.decisions.length ? `Decisions: ${chat.decisions.join("; ")}` : "",
      "",
      chat.content.slice(0, 2000),
    ]
      .filter(Boolean)
      .join("\n");

    await this.memoryOrchestrator.store(
      summary,
      "chat",
      chat.decisions.length > 0 ? "high" : "normal",
      {
        title: chat.title,
        sourceType: chat.sourceType,
        importedAt: chat.importedAt,
        tags: chat.tags,
        decisionCount: chat.decisions.length,
      },
    );

    for (const decision of chat.decisions) {
      await this.memoryOrchestrator.store(
        `[Decision] ${chat.title}: ${decision}`,
        "chat",
        "high",
        { category: "decision", sourceTitle: chat.title, sourceType: chat.sourceType },
      );
    }
  }

  private saveToVault(chat: ChatImport) {
    const subdir = chat.sourceType === "code" ? "chats/code" : "chats/web";
    const frontmatter: NoteFrontmatter = {
      title: chat.title,
      tags: [...new Set([...chat.tags, "chat-import"])],
      created: chat.date.split("T")[0],
      updated: new Date().toISOString().split("T")[0],
      status: "active",
      type: "chat",
    };

    const decisionSection = chat.decisions.length
      ? `\n## Decisions\n${chat.decisions.map((d) => `- ${d}`).join("\n")}`
      : "";

    const body = [
      `# ${chat.title}`,
      "",
      `Imported from Claude ${chat.sourceType === "code" ? "Code" : "Web"} on ${chat.importedAt}`,
      decisionSection,
      "",
      "## Content",
      "",
      chat.content,
    ].join("\n");

    this.vaultWriter.createNote(subdir, frontmatter, body);
  }

  private extractTitle(lines: string[]): string | undefined {
    for (const line of lines) {
      if (line.startsWith("# ")) return line.slice(2).trim();
      if (line.startsWith("title:")) return line.slice(6).trim();
    }
    return undefined;
  }

  private extractDate(lines: string[]): string | undefined {
    for (const line of lines) {
      if (line.startsWith("created:")) return line.slice(8).trim();
      if (line.startsWith("date:")) return line.slice(5).trim();
    }
    return undefined;
  }

  private extractTags(content: string): string[] {
    const tags = new Set<string>();
    const lower = content.toLowerCase();
    for (const [keyword, tag] of Object.entries(KEYWORD_TAGS)) {
      if (lower.includes(keyword)) tags.add(tag);
    }
    if (content.includes("---")) tags.add("chat-import");
    return [...tags];
  }

  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    const lines = content.split("\n");
    let inDecisions = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#+ decisions?/i.test(trimmed)) {
        inDecisions = true;
        continue;
      }
      if (inDecisions) {
        if (/^#/.test(trimmed) && !/^#{5,}/.test(trimmed)) break;
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          decisions.push(trimmed.slice(2).trim());
        }
      }
    }
    return decisions;
  }
}
