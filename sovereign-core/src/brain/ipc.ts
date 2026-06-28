/**
 * Brain IPC — JSON-RPC 2.0 over stdin/stdout
 *
 * The brain process (Bun) uses stdin/stdout JSON-line protocol to
 * communicate with the Electron main process (Node.js). This avoids
 * HTTP/WS dependency so the brain stays a pure service layer.
 *
 * Protocol:
 *   → {"id":1,"method":"llm.chat","params":{...}}\n
 *   ← {"id":1,"result":{...}}\n
 *   ← {"id":1,"error":{"code":-1,"message":"..."}}\n
 *
 * The brain also pushes events to Electron:
 *   ← {"event":"brain:log","params":{"message":"..."}}\n
 */

import { writeSync } from "node:fs";

import type { RpcRequest, RpcResponse, RpcEvent } from "./types.ts";

type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

export class BrainIPC {
  private handlers = new Map<string, RpcHandler>();
  private buffer = "";
  private running = false;
  private onData: ((chunk: string) => void) | null = null;

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Read from stdin using the data event (works in both Bun and Node.js)
    process.stdin.setEncoding("utf-8" as BufferEncoding);
    this.onData = (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    };
    process.stdin.on("data", this.onData as (...args: any[]) => void);

    process.stdin.on("error", (err: Error) => {
      console.error("[BrainIPC] stdin error:", err.message);
    });
  }

  stop(): void {
    this.running = false;
    if (this.onData) {
      process.stdin.removeListener("data", this.onData as (...args: any[]) => void);
      this.onData = null;
    }
  }

  pushEvent(event: string, params: Record<string, unknown>): void {
    const msg: RpcEvent = { event, params };
    this.writeLine(JSON.stringify(msg));
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.processRequest(trimmed).catch((err) =>
          console.error("[BrainIPC] Handler error:", err),
        );
      }
    }
  }

  private async processRequest(line: string): Promise<void> {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      this.writeResponse("", null, { code: -32700, message: "Parse error" });
      return;
    }

    if (!request.method) {
      this.writeResponse(request.id, null, {
        code: -32600,
        message: "Invalid request: missing method",
      });
      return;
    }

    const handler = this.handlers.get(request.method);
    if (!handler) {
      this.writeResponse(request.id, null, {
        code: -32601,
        message: `Method not found: ${request.method}`,
      });
      return;
    }

    try {
      const result = await handler(request.params);
      this.writeResponse(request.id, result, null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[BrainIPC] Method ${request.method} failed:`, message);
      this.writeResponse(request.id, null, { code: -1, message });
    }
  }

  private writeResponse(
    id: number | string,
    result: unknown,
    error: { code: number; message: string } | null,
  ): void {
    const response: RpcResponse = { id, result, error: error ?? undefined };
    this.writeLine(JSON.stringify(response));
  }

  private writeLine(text: string): void {
    try {
      const buf = Buffer.from(text + "\n");
      // Use writeSync(1, ...) to bypass pipe buffering on Windows
      writeSync(1, buf);
    } catch (err) {
      console.error("[BrainIPC] Write error:", err);
    }
  }
}
