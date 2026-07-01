import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, relative, basename, dirname } from "node:path";
import { spawn } from "node:child_process";
import type { GraphPipeline } from "../vault/graph/pipeline.ts";
import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { CodebaseGraph, CodebaseNode, CodebaseEdge, GraphifyProjectConfig } from "./types.ts";

const SUPPORTED_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".java", ".rb", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".kt", ".scala", ".php", ".swift", ".lua", ".zig",
]);

const EXCLUDE_DIRS = new Set([
  "node_modules", ".git", ".svn", "dist", "build", "target",
  "venv", ".venv", "__pycache__", ".next", ".nuxt",
  "coverage", ".nyc_output", "graphify-out",
]);

export class GraphifyService {
  private projectConfigs: Map<string, GraphifyProjectConfig> = new Map();
  private graphs: Map<string, CodebaseGraph> = new Map();
  private graphPipeline: GraphPipeline;
  private memoryOrchestrator: MemoryOrchestrator;
  private cacheDir: string;
  private scanInProgress = false;

  constructor(
    graphPipeline: GraphPipeline,
    memoryOrchestrator: MemoryOrchestrator,
    projectConfigs: GraphifyProjectConfig[] = [],
    cacheDir?: string,
  ) {
    this.graphPipeline = graphPipeline;
    this.memoryOrchestrator = memoryOrchestrator;
    this.cacheDir = cacheDir || join(process.cwd(), "graphify-out");
    for (const cfg of projectConfigs) {
      this.projectConfigs.set(cfg.name, cfg);
    }
  }

  addProject(config: GraphifyProjectConfig) {
    this.projectConfigs.set(config.name, config);
  }

  removeProject(name: string) {
    this.projectConfigs.delete(name);
    this.graphs.delete(name);
  }

  getProjects(): GraphifyProjectConfig[] {
    return [...this.projectConfigs.values()];
  }

  async scanAll(): Promise<Map<string, CodebaseGraph>> {
    const results = new Map<string, CodebaseGraph>();
    for (const [name, config] of this.projectConfigs) {
      if (!config.enabled) continue;
      try {
        const graph = await this.scanProject(name, config);
        results.set(name, graph);
      } catch (err) {
        console.warn(`[Graphify] Failed to scan project "${name}":`, err);
      }
    }
    return results;
  }

  async scanProject(name: string, config: GraphifyProjectConfig): Promise<CodebaseGraph> {
    if (!existsSync(config.rootDir)) {
      throw new Error(`Project root not found: ${config.rootDir}`);
    }

    // Try Python graphifyy first, fall back to built-in scanner
    let graph = await this.tryPythonGraphify(config);
    if (!graph) {
      graph = await this.builtinScan(config);
    }

    this.graphs.set(name, graph);
    await this.saveGraphOutput(name, config, graph);
    await this.syncToMemory(graph, name);
    await this.syncToGraphPipeline(graph, name);

    return graph;
  }

  getGraph(name: string): CodebaseGraph | undefined {
    return this.graphs.get(name);
  }

  private async tryPythonGraphify(config: GraphifyProjectConfig): Promise<CodebaseGraph | null> {
    return new Promise((resolve) => {
      const outDir = join(config.graphOutDir || join(config.rootDir, "graphify-out"));
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const proc = spawn("graphify", [
        "extract", config.rootDir, "--out", outDir, "--no-cluster",
      ], {
        windowsHide: true,
        timeout: 60000,
      });

      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", async (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        try {
          const graphPath = join(outDir, "graph.json");
          if (!existsSync(graphPath)) { resolve(null); return; }
          const raw = JSON.parse(readFileSync(graphPath, "utf-8"));
          resolve(this.parseGraphifyOutput(raw, config));
        } catch {
          resolve(null);
        }
      });
      proc.on("error", () => resolve(null));
    });
  }

  private async builtinScan(config: GraphifyProjectConfig): Promise<CodebaseGraph> {
    const nodes: CodebaseNode[] = [];
    const edges: CodebaseEdge[] = [];
    const fileQueue = [config.rootDir];
    const fileMap = new Map<string, string[]>();
    const processedFiles = new Set<string>();

    while (fileQueue.length > 0) {
      const dir = fileQueue.pop()!;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        let stat;
        try { stat = statSync(fullPath); } catch { continue; }
        if (stat.isDirectory()) {
          if (!EXCLUDE_DIRS.has(entry) && !entry.startsWith(".")) {
            fileQueue.push(fullPath);
          }
        } else if (stat.isFile() && SUPPORTED_EXTS.has(extname(entry))) {
          processedFiles.add(fullPath);
          const relPath = relative(config.rootDir, fullPath);
          const fileNode: CodebaseNode = {
            id: `file:${relPath}`,
            label: basename(relPath),
            kind: "file",
            filePath: relPath,
            lineStart: 1,
            lineEnd: 1,
          };
          nodes.push(fileNode);

          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          fileNode.lineEnd = lines.length;
          fileMap.set(fullPath, lines);

          this.extractNodesFromFile(fullPath, relPath, lines, nodes);
          this.extractEdgesFromFile(fullPath, relPath, lines, nodes, edges);
        }
      }
    }

    // Add module edges (directory hierarchy)
    for (const node of nodes) {
      if (node.kind !== "file") continue;
      const parts = node.filePath.replace(/\\/g, "/").split("/");
      if (parts.length > 1) {
        const parentName = parts.slice(0, -1).join("/");
        const parentNode = nodes.find((n) => n.kind === "module" && n.label === parentName);
        if (parentNode) {
          if (!edges.find((e) => e.from === parentNode.id && e.to === node.id)) {
            edges.push({ from: parentNode.id, to: node.id, label: "contains" });
          }
        } else {
          const moduleNode: CodebaseNode = {
            id: `module:${parentName}`,
            label: parentName,
            kind: "module",
            filePath: parentName,
            lineStart: 1,
            lineEnd: 1,
          };
          nodes.push(moduleNode);
          edges.push({ from: moduleNode.id, to: node.id, label: "contains" });
        }
      }
    }

    const report = this.buildReport(nodes, edges, config);
    return { nodes, edges, report, generatedAt: Date.now() };
  }

  private extractNodesFromFile(
    fullPath: string,
    relPath: string,
    lines: string[],
    nodes: CodebaseNode[],
  ) {
    const ext = extname(fullPath).toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Class declarations
      const classMatch = line.match(
        /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      );
      if (classMatch) {
        nodes.push({
          id: `class:${relPath}:${classMatch[1]}`,
          label: classMatch[1],
          kind: "class",
          filePath: relPath,
          lineStart: i + 1,
          lineEnd: this.findBlockEnd(lines, i),
        });
        continue;
      }

      // Function declarations
      const fnMatch = line.match(
        /^\s*(?:export\s+)?(?:async\s+)?function\s+\*?\s*(\w+)/,
      );
      if (fnMatch) {
        nodes.push({
          id: `function:${relPath}:${fnMatch[1]}`,
          label: fnMatch[1],
          kind: "function",
          filePath: relPath,
          lineStart: i + 1,
          lineEnd: this.findBlockEnd(lines, i),
        });
        continue;
      }

      // Interface declarations
      const ifaceMatch = line.match(
        /^\s*(?:export\s+)?interface\s+(\w+)/,
      );
      if (ifaceMatch) {
        nodes.push({
          id: `interface:${relPath}:${ifaceMatch[1]}`,
          label: ifaceMatch[1],
          kind: "interface",
          filePath: relPath,
          lineStart: i + 1,
          lineEnd: this.findBlockEnd(lines, i),
        });
        continue;
      }

      // Type declarations
      const typeMatch = line.match(
        /^\s*(?:export\s+)?type\s+(\w+)\s*=/,
      );
      if (typeMatch) {
        nodes.push({
          id: `type:${relPath}:${typeMatch[1]}`,
          label: typeMatch[1],
          kind: "type",
          filePath: relPath,
          lineStart: i + 1,
          lineEnd: i + 1,
        });
        continue;
      }

      // Python: class and def
      if (ext === ".py") {
        const pyClassMatch = line.match(/^\s*class\s+(\w+)/);
        if (pyClassMatch) {
          nodes.push({
            id: `class:${relPath}:${pyClassMatch[1]}`,
            label: pyClassMatch[1],
            kind: "class",
            filePath: relPath,
            lineStart: i + 1,
            lineEnd: this.findPythonBlockEnd(lines, i),
          });
          continue;
        }
        const pyFnMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)/);
        if (pyFnMatch) {
          nodes.push({
            id: `function:${relPath}:${pyFnMatch[1]}`,
            label: pyFnMatch[1],
            kind: "function",
            filePath: relPath,
            lineStart: i + 1,
            lineEnd: this.findPythonBlockEnd(lines, i),
          });
          continue;
        }
      }

      // Rust: fn, struct, enum, impl, trait, mod
      if (ext === ".rs") {
        const rustFnMatch = line.match(/^\s*(?:pub\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
        if (rustFnMatch) {
          nodes.push({
            id: `function:${relPath}:${rustFnMatch[1]}`,
            label: rustFnMatch[1],
            kind: "function",
            filePath: relPath,
            lineStart: i + 1,
            lineEnd: this.findRustBlockEnd(lines, i),
          });
          continue;
        }
        const rustStruct = line.match(/^\s*(?:pub\s+)?struct\s+(\w+)/);
        if (rustStruct) {
          nodes.push({
            id: `class:${relPath}:${rustStruct[1]}`,
            label: rustStruct[1],
            kind: "class",
            filePath: relPath,
            lineStart: i + 1,
            lineEnd: i + 1,
          });
          continue;
        }
      }

      // Go: func, type, struct
      if (ext === ".go") {
        const goFnMatch = line.match(/^\s*func\s+(?:\([^)]+\)\s+)?(\w+)/);
        if (goFnMatch) {
          nodes.push({
            id: `function:${relPath}:${goFnMatch[1]}`,
            label: goFnMatch[1],
            kind: "function",
            filePath: relPath,
            lineStart: i + 1,
            lineEnd: this.findGoBlockEnd(lines, i),
          });
          continue;
        }
      }
    }
  }

  private extractEdgesFromFile(
    fullPath: string,
    relPath: string,
    lines: string[],
    nodes: CodebaseNode[],
    edges: CodebaseEdge[],
  ) {
    const ext = extname(fullPath).toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // import statements
      const importMatch = line.match(
        /^\s*import\s+(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]/,
      );
      if (importMatch) {
        const target = importMatch[1];
        const targetFile = nodes.find((n) => n.kind === "file" && target.includes(n.label));
        const sourceFile = nodes.find(
          (n) => n.kind === "file" && n.filePath === relPath,
        );
        if (targetFile && sourceFile) {
          edges.push({
            from: sourceFile.id,
            to: targetFile.id,
            label: "imports",
          });
        }
        continue;
      }

      // require() calls
      const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
      if (requireMatch) {
        const target = requireMatch[1];
        const targetFile = nodes.find((n) => n.kind === "file" && target.includes(n.label));
        const sourceFile = nodes.find((n) => n.kind === "file" && n.filePath === relPath);
        if (targetFile && sourceFile) {
          edges.push({ from: sourceFile.id, to: targetFile.id, label: "requires" });
        }
        continue;
      }

      // Python import
      if (ext === ".py") {
        const pyImport = line.match(/^\s*(?:from\s+(\S+)\s+)?import\s+/);
        if (pyImport && pyImport[1]) {
          const target = pyImport[1].replace(/\./g, "/");
          const targetFile = nodes.find((n) => n.kind === "file" && n.filePath.includes(target));
          const sourceFile = nodes.find((n) => n.kind === "file" && n.filePath === relPath);
          if (targetFile && sourceFile) {
            edges.push({ from: sourceFile.id, to: targetFile.id, label: "imports" });
          }
        }
      }

      // extends / implements (TS/JS)
      const extMatch = line.match(/\bextends\s+(\w+)/);
      if (extMatch) {
        const target = nodes.find((n) => n.label === extMatch[1]);
        const source = this.findEnclosingNode(lines, i, nodes, relPath);
        if (target && source) {
          edges.push({ from: source.id, to: target.id, label: "extends" });
        }
      }

      const implMatch = line.match(/\bimplements\s+([\w,\s]+)/);
      if (implMatch) {
        const targets = implMatch[1].split(",").map((s) => s.trim());
        const source = this.findEnclosingNode(lines, i, nodes, relPath);
        if (source) {
          for (const t of targets) {
            const target = nodes.find((n) => n.label === t);
            if (target) edges.push({ from: source.id, to: target.id, label: "implements" });
          }
        }
      }
    }
  }

  private findEnclosingNode(
    lines: string[],
    lineIndex: number,
    nodes: CodebaseNode[],
    relPath: string,
  ): CodebaseNode | undefined {
    let best: CodebaseNode | undefined;
    for (const node of nodes) {
      if (node.filePath === relPath && node.lineStart <= lineIndex + 1 &&
          node.lineEnd >= lineIndex + 1) {
        if (!best || node.lineStart > best.lineStart) {
          best = node;
        }
      }
    }
    return best;
  }

  private findBlockEnd(lines: string[], start: number): number {
    let braceDepth = 0;
    let started = false;
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === "{") { braceDepth++; started = true; }
        else if (ch === "}") { braceDepth--; }
      }
      if (started && braceDepth <= 0) return i + 1;
    }
    return lines.length;
  }

  private findPythonBlockEnd(lines: string[], start: number): number {
    const baseIndent = lines[start].search(/\S/);
    for (let i = start + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      const indent = lines[i].search(/\S/);
      if (indent <= baseIndent) return i;
    }
    return lines.length;
  }

  private findRustBlockEnd(lines: string[], start: number): number {
    return this.findBlockEnd(lines, start);
  }

  private findGoBlockEnd(lines: string[], start: number): number {
    return this.findBlockEnd(lines, start);
  }

  private parseGraphifyOutput(raw: any, config: GraphifyProjectConfig): CodebaseGraph {
    const nodes: CodebaseNode[] = [];
    const edges: CodebaseEdge[] = [];

    if (raw.nodes) {
      for (const n of raw.nodes) {
        nodes.push({
          id: n.id || n.name || n.label,
          label: n.label || n.name || n.id,
          kind: n.kind || n.type || "file",
          filePath: n.file || n.filePath || n.path || "",
          lineStart: n.lineStart || n.start_line || 1,
          lineEnd: n.lineEnd || n.end_line || 1,
          properties: n.properties || n.metadata || {},
        });
      }
    }

    if (raw.edges) {
      for (const e of raw.edges) {
        edges.push({
          from: e.from || e.source || e.subject,
          to: e.to || e.target || e.object,
          label: e.label || e.type || e.predicate || "depends_on",
        });
      }
    }

    const report = raw.report || this.buildReport(nodes, edges, config);
    return { nodes, edges, report, generatedAt: Date.now() };
  }

  private buildReport(
    nodes: CodebaseNode[],
    edges: CodebaseEdge[],
    config: GraphifyProjectConfig,
  ): string {
    const byKind = new Map<string, number>();
    for (const n of nodes) {
      byKind.set(n.kind, (byKind.get(n.kind) || 0) + 1);
    }

    const files = nodes.filter((n) => n.kind === "file");
    const classes = nodes.filter((n) => n.kind === "class");
    const functions = nodes.filter((n) => n.kind === "function");
    const interfaces = nodes.filter((n) => n.kind === "interface");

    return [
      `# Graphify Report: ${config.name}`,
      "",
      `Generated: ${new Date().toISOString()}`,
      `Root: ${config.rootDir}`,
      "",
      "## Summary",
      `- Total nodes: ${nodes.length}`,
      `- Total edges: ${edges.length}`,
      `- Files: ${files.length}`,
      `- Classes: ${classes.length}`,
      `- Functions: ${functions.length}`,
      `- Interfaces: ${interfaces.length}`,
      "",
      "## Top-level modules",
      ...nodes
        .filter((n) => n.kind === "module" && !n.filePath.includes("/"))
        .map((n) => `- ${n.label}`),
      "",
      "## Most connected files",
      ...this.topConnected(nodes, edges, 10),
      "",
    ].join("\n");
  }

  private topConnected(
    nodes: CodebaseNode[],
    edges: CodebaseEdge[],
    count: number,
  ): string[] {
    const edgeCount = new Map<string, number>();
    for (const e of edges) {
      edgeCount.set(e.from, (edgeCount.get(e.from) || 0) + 1);
      edgeCount.set(e.to, (edgeCount.get(e.to) || 0) + 1);
    }
    return [...edgeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([id, c]) => {
        const node = nodes.find((n) => n.id === id);
        return `- ${node?.label || id} (${c} connections)`;
      });
  }

  private async saveGraphOutput(
    name: string,
    config: GraphifyProjectConfig,
    graph: CodebaseGraph,
  ) {
    const outDir = join(config.graphOutDir || join(config.rootDir, "graphify-out"));
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    writeFileSync(join(outDir, "graph.json"), JSON.stringify(graph, null, 2), "utf-8");
    writeFileSync(join(outDir, "GRAPH_REPORT.md"), graph.report, "utf-8");

    // Generate wiki notes
    const wikiDir = join(outDir, "wiki");
    if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });

    for (const node of graph.nodes) {
      if (node.kind === "file" || node.kind === "module") continue;
      const note = [
        `# ${node.label}`,
        "",
        `- **Kind**: ${node.kind}`,
        `- **File**: \`${node.filePath}\``,
        `- **Lines**: ${node.lineStart}–${node.lineEnd}`,
        "",
        "## Connections",
        ...graph.edges
          .filter((e) => e.from === node.id)
          .map((e) => {
            const target = graph.nodes.find((n) => n.id === e.to);
            return `- → **${e.label}** → [[${target?.label || e.to}]]`;
          }),
        ...graph.edges
          .filter((e) => e.to === node.id)
          .map((e) => {
            const source = graph.nodes.find((n) => n.id === e.from);
            return `- ← **${e.label}** ← [[${source?.label || e.from}]]`;
          }),
        "",
      ].join("\n");
      writeFileSync(join(wikiDir, `${node.label}.md`), note, "utf-8");
    }

    // Generate wiki index
    const index = [
      "# Codebase Wiki",
      "",
      `Project: ${name}`,
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Classes",
      ...graph.nodes.filter((n) => n.kind === "class").map((n) => `- [[${n.label}]]`),
      "",
      "## Functions",
      ...graph.nodes.filter((n) => n.kind === "function").map((n) => `- [[${n.label}]]`),
      "",
      "## Interfaces",
      ...graph.nodes.filter((n) => n.kind === "interface").map((n) => `- [[${n.label}]]`),
      "",
    ].join("\n");
    writeFileSync(join(wikiDir, "index.md"), index, "utf-8");

    // Sync to Obsidian vault if configured
    const vaultPath = config.graphOutDir;
    if (vaultPath && existsSync(dirname(vaultPath))) {
      const vaultGraphDir = vaultPath;
      if (!existsSync(vaultGraphDir)) mkdirSync(vaultGraphDir, { recursive: true });
      writeFileSync(join(vaultGraphDir, "graph.json"), JSON.stringify(graph, null, 2), "utf-8");
      writeFileSync(join(vaultGraphDir, "GRAPH_REPORT.md"), graph.report, "utf-8");
    }
  }

  private async syncToMemory(graph: CodebaseGraph, projectName: string) {
    const summary = [
      `Codebase graph for ${projectName}:`,
      `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
      `Files: ${graph.nodes.filter((n) => n.kind === "file").length}`,
      `Classes: ${graph.nodes.filter((n) => n.kind === "class").length}`,
      `Functions: ${graph.nodes.filter((n) => n.kind === "function").length}`,
    ].join("\n");
    await this.memoryOrchestrator.store(summary, "document", "normal", {
      category: "codebase-graph",
      project: projectName,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    });

    for (const node of graph.nodes) {
      if (node.kind === "file" || node.kind === "module") continue;
      await this.memoryOrchestrator.store(
        `[Code] ${node.kind} ${node.label} in ${node.filePath}`,
        "document",
        "low",
        { category: "code-node", project: projectName, kind: node.kind, file: node.filePath },
      );
    }
  }

  private async syncToGraphPipeline(graph: CodebaseGraph, projectName: string) {
    for (const edge of graph.edges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.from);
      const targetNode = graph.nodes.find((n) => n.id === edge.to);
      if (sourceNode && targetNode) {
        const text = `${sourceNode.label} ${edge.label} ${targetNode.label}`;
        await this.graphPipeline.processText(text, "graphify");
      }
    }
    for (const node of graph.nodes) {
      if (node.kind !== "file" && node.kind !== "module") {
        await this.graphPipeline.processText(
          `${node.label} is a ${node.kind} in ${projectName}`,
          "graphify",
        );
      }
    }
  }
}
