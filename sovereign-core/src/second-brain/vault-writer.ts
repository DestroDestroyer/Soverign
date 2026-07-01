import { join, dirname } from "node:path";
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import type { NoteFrontmatter, NoteType } from "./types.ts";

export class VaultWriter {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  setVaultPath(path: string) {
    this.vaultPath = path;
  }

  getVaultPath(): string {
    return this.vaultPath;
  }

  ensureVaultStructure() {
    const dirs = [
      "permanent", "inbox", "fleeting", "templates", "logs", "references",
      "chats/code", "chats/web",
    ];
    for (const d of dirs) {
      const full = join(this.vaultPath, d);
      if (!existsSync(full)) mkdirSync(full, { recursive: true });
    }
  }

  createDefaultTemplates() {
    const template = `---
title: {{title}}
tags: []
created: {{date}}
updated: {{date}}
status: draft
type: permanent
---

# {{title}}

## Context

## Details

## Related links
`;
    const tp = join(this.vaultPath, "templates", "default-note.md");
    if (!existsSync(tp)) writeFileSync(tp, template, "utf-8");

    const session = `---
title: Session Log - {{date}} - {{description}}
tags: [session-log]
created: {{date}}
updated: {{date}}
status: active
type: session-log
---

# Session: {{description}}

## What was done
{{whatWasDone}}

## Decisions made
{{decisions}}

## Pending items
{{pendingItems}}

## Related notes
{{relatedNotes}}
`;
    const sp = join(this.vaultPath, "templates", "session-log.md");
    if (!existsSync(sp)) writeFileSync(sp, session, "utf-8");
  }

  createNote(
    subdir: string,
    frontmatter: NoteFrontmatter,
    body: string,
  ): string {
    const filename = `${frontmatter.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}.md`;
    const dir = join(this.vaultPath, subdir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filePath = join(dir, filename);

    const yaml = this.buildFrontmatterYaml(frontmatter);
    const content = `${yaml}\n${body}\n`;
    writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  createSessionLog(log: {
    date: string;
    description: string;
    whatWasDone: string[];
    decisions: string[];
    pendingItems: string[];
    modifiedNotes: string[];
  }): string {
    const frontmatter: NoteFrontmatter = {
      title: `Session Log - ${log.date} - ${log.description}`,
      tags: ["session-log"],
      created: log.date,
      updated: log.date,
      status: "active",
      type: "session-log",
      links: log.modifiedNotes,
    };

    const body = [
      `# Session: ${log.description}`,
      "",
      "## What was done",
      ...log.whatWasDone.map((w) => `- ${w}`),
      "",
      "## Decisions made",
      ...log.decisions.map((d) => `- ${d}`),
      "",
      "## Pending items",
      ...log.pendingItems.map((p) => `- ${p}`),
      "",
      "## Related notes",
      ...log.modifiedNotes.map((n) => `- [[${n}]]`),
      "",
    ].join("\n");

    return this.createNote("logs", frontmatter, body);
  }

  createPermanentNote(title: string, tags: string[], body: string): string {
    const frontmatter: NoteFrontmatter = {
      title,
      tags,
      created: new Date().toISOString().split("T")[0],
      updated: new Date().toISOString().split("T")[0],
      status: "active",
      type: "permanent",
    };
    return this.createNote("permanent", frontmatter, body);
  }

  createDecisionNote(title: string, decision: string, context: string): string {
    const frontmatter: NoteFrontmatter = {
      title,
      tags: ["decision", "architecture"],
      created: new Date().toISOString().split("T")[0],
      updated: new Date().toISOString().split("T")[0],
      status: "active",
      type: "permanent",
    };
    const body = [
      `# ${title}`,
      "",
      "## Decision",
      decision,
      "",
      "## Context",
      context,
      "",
      "## Date",
      new Date().toISOString(),
      "",
    ].join("\n");
    return this.createNote("permanent", frontmatter, body);
  }

  appendToClaudeMd(section: string) {
    const claudePath = join(this.vaultPath, "CLAUDE.md");
    const header = `\n## ${section}\n`;
    if (existsSync(claudePath)) {
      appendFileSync(claudePath, header, "utf-8");
    }
  }

  ensureClaudeMd() {
    const claudePath = join(this.vaultPath, "CLAUDE.md");
    if (existsSync(claudePath)) return;

    const content = `# Vault — Instructions for Claude Code

## What is this vault
Centralized knowledge base for all projects.
Persistent memory across sessions.

## Zettelkasten Rules

### Note creation
- Use wikilinks: [[note-name]] (not markdown links)
- Mandatory YAML frontmatter on every note
- Filenames in kebab-case
- 1 concept per permanent note (atomicity)
- Minimum 2 wikilinks per note (dense linking)

### Standard frontmatter
---
title: Note Name
tags: [project, topic]
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active
type: permanent
---

### Never do
- Don't delete notes without asking
- Don't use markdown links for internal notes (use wikilinks)
- Don't create notes without frontmatter

## Session Commands

### /resume
When you receive this command:
1. Read the 3 most recent session logs in logs/
2. Read architecture/decisions for the current project
3. Summarize current state and what's left to do

### /save
When you receive this command:
1. Create a session log in logs/YYYY-MM-DD-description.md
2. Record: what was done, decisions made, pending items
3. Add wikilinks to created/modified notes
4. Run git commit + push if in a repository
`;
    writeFileSync(claudePath, content, "utf-8");
  }

  private buildFrontmatterYaml(fm: NoteFrontmatter): string {
    const lines = ["---"];
    lines.push(`title: ${fm.title}`);
    lines.push(`tags: [${fm.tags.join(", ")}]`);
    lines.push(`created: ${fm.created}`);
    lines.push(`updated: ${fm.updated}`);
    lines.push(`status: ${fm.status}`);
    lines.push(`type: ${fm.type}`);
    if (fm.aliases?.length) lines.push(`aliases: [${fm.aliases.join(", ")}]`);
    if (fm.links?.length) lines.push(`links: [${fm.links.join(", ")}]`);
    lines.push("---");
    return lines.join("\n");
  }
}
