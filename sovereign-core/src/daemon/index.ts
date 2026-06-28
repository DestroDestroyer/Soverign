/**
 * Sovereign Daemon — PowerShell Bridge (optional 24/7 service)
 *
 * Thin process that only provides local OS operations to the brain.
 * Listens on stdin/stdout for tool execution requests.
 *
 * When running as a 24/7 Windows service (Task Scheduler), the brain
 * forwards `run_command`, `read_file`, `write_file`, `list_directory`
 * tool calls to this process for execution.
 *
 * Without the daemon, the brain uses Bun's built-in APIs for file I/O
 * and falls back to limited tool execution.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".sovereign");

interface DaemonConfig {
  dataDir: string;
}

interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface RpcEvent {
  event: string;
  params: Record<string, unknown>;
}

let buffer = "";
let running = false;

function parseArgs(): Partial<DaemonConfig> {
  const args = process.argv.slice(2);
  const config: Partial<DaemonConfig> = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--data-dir":
        config.dataDir = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
Sovereign Daemon — PowerShell Bridge

Usage:
  bun run src/daemon/index.ts [options]

Options:
  --data-dir <path>   Data directory (default: ~/.sovereign)
  --help, -h          Show this help

Methods:
  daemon.execute({ tool: "run_command", args: ["powershell", "-Command", "..."] })
  daemon.execute({ tool: "read_file", args: ["path"] })
  daemon.execute({ tool: "write_file", args: ["path", "content"] })
  daemon.execute({ tool: "list_directory", args: ["path"] })
  daemon.execute({ tool: "file_exists", args: ["path"] })
  daemon.execute({ tool: "make_directory", args: ["path"] })
  daemon.execute({ tool: "delete_file", args: ["path"] })

The daemon communicates via stdin/stdout JSON-RPC.
        `);
        process.exit(0);
    }
  }
  return config;
}

function writeResponse(id: number | string, result: unknown, error: { code: number; message: string } | null): void {
  const response: RpcResponse = { id, result, error: error ?? undefined };
  try {
    process.stdout.write(JSON.stringify(response) + "\n");
  } catch {}
}

function pushEvent(event: string, params: Record<string, unknown>): void {
  const msg: RpcEvent = { event, params };
  try {
    process.stdout.write(JSON.stringify(msg) + "\n");
  } catch {}
}

function processLine(line: string): void {
  let request: RpcRequest;
  try {
    request = JSON.parse(line) as RpcRequest;
  } catch {
    return;
  }

  if (!request.method) {
    writeResponse(request.id, null, { code: -32600, message: "Invalid request: missing method" });
    return;
  }

  // Only handle daemon.execute method
  if (request.method !== "daemon.execute") {
    writeResponse(request.id, null, { code: -32601, message: `Method not found: ${request.method}` });
    return;
  }

  const params = request.params as any;
  const tool = params?.tool as string;
  const args = (params?.args as string[]) ?? [];

  try {
    let result: unknown;

    switch (tool) {
      case "run_command": {
        if (args.length < 1) throw new Error("run_command requires at least 1 arg");
        const cmd = args[0];
        const cmdArgs = args.slice(1);
        const allowedCmds = ['ollama', 'bun', 'node', 'npm', 'npx', 'git', 'ls', 'cat', 'echo', 'dir', 'type', 'find', 'where', 'pwsh', 'powershell'];
        if (!allowedCmds.includes(cmd)) throw new Error(`Command not allowed: ${cmd}`);
        const output = spawnSync(cmd, cmdArgs, {
          encoding: "utf-8",
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
          shell: false,
        });
        result = { stdout: output.stdout || "", stderr: output.stderr || "", exitCode: output.status ?? -1 };
        break;
      }

      case "read_file": {
        if (args.length < 1) throw new Error("read_file requires a path");
        const filePath = path.resolve(args[0]);
        if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
        const content = readFileSync(filePath, "utf-8");
        result = { content, path: filePath };
        break;
      }

      case "write_file": {
        if (args.length < 2) throw new Error("write_file requires path and content");
        const writePath = path.resolve(args[0]);
        if (!existsSync(path.dirname(writePath))) throw new Error(`Parent directory not found: ${path.dirname(writePath)}`);
        writeFileSync(writePath, args[1], "utf-8");
        result = { success: true, path: writePath };
        break;
      }

      case "list_directory": {
        if (args.length < 1) throw new Error("list_directory requires a path");
        const dirPath = path.resolve(args[0]);
        if (!existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
        const entries = readdirSync(dirPath).map((name) => {
          const fullPath = path.join(dirPath, name);
          let stat: ReturnType<typeof statSync>;
          try { stat = statSync(fullPath); } catch { return { name, type: "unknown" }; }
          return {
            name,
            type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
            size: stat.size,
            modified: stat.mtimeMs,
          };
        });
        result = { entries, path: dirPath };
        break;
      }

      case "file_exists": {
        if (args.length < 1) throw new Error("file_exists requires a path");
        result = { exists: existsSync(path.resolve(args[0])), path: args[0] };
        break;
      }

      case "make_directory": {
        if (args.length < 1) throw new Error("make_directory requires a path");
        mkdirSync(path.resolve(args[0]), { recursive: true });
        result = { success: true, path: args[0] };
        break;
      }

      case "delete_file": {
        if (args.length < 1) throw new Error("delete_file requires a path");
        const resolvedPath = path.resolve(args[0]);
        if (!existsSync(resolvedPath)) throw new Error(`File not found: ${resolvedPath}`);
        rmSync(resolvedPath, { recursive: true, force: true });
        result = { success: true, path: resolvedPath };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    writeResponse(request.id, result, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeResponse(request.id, null, { code: -1, message });
  }
}

function start(): void {
  if (running) return;
  running = true;

  process.stdin.setEncoding("utf-8" as BufferEncoding);
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) processLine(trimmed);
    }
  });

  process.stdin.on("error", (err: Error) => {
    console.error("[Daemon] stdin error:", err.message);
  });

  pushEvent("daemon:ready", { status: "running", dataDir: DEFAULT_DATA_DIR });
  console.log("[Daemon] Ready — listening for tool execution requests on stdin");
}

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

if (import.meta.main) {
  const args = parseArgs();
  start();
}
