/**
 * `/v1/soverign/llm/chat` -- backs the `soverign-ask` piece's `ask` action.
 *
 * The piece-side action posts `{ prompt, system?, overrideSystem?,
 * parseJson? }` and expects back `{ text, parsed? }`. Implementation
 * here is a thin wrapper around a `LlmChatFn` injected via
 * `SandboxApiServices.llmChat`; the real LLM client is provided by the
 * daemon. Keeping the function pluggable lets tests substitute a
 * deterministic fake.
 *
 * System-prompt semantics (decided in the daemon backend, not here):
 *   - default                   : Soverign identity + role + personality
 *   - `system` set              : Soverign prompt + "\n\n" + `system`
 *   - `system` + overrideSystem : `system` only (Soverign context dropped)
 *
 * The endpoint is auth-gated like the rest of `/v1/*` (Bearer engineToken).
 * It is not exposed externally -- only the engine subprocess hits it.
 */

import { json, err, parseJsonObject, type RouteContext, type RouteHandler } from "./shared";

export interface LlmChatRequest {
  prompt: string;
  system?: string;
  /**
   * When true, the `system` field replaces the Soverign system prompt
   * entirely. When false / unset, `system` is appended to the Soverign
   * prompt. Default off so the common case ("ask Soverign to do X") still
   * carries the Soverign identity.
   */
  overrideSystem?: boolean;
  parseJson?: boolean;
}

export interface LlmChatResponse {
  text: string;
  parsed?: unknown;
}

export type LlmChatFn = (
  req: LlmChatRequest,
  ctx: { runId: string; projectId: string },
) => Promise<LlmChatResponse>;

export interface SoverignLlmRouteDeps {
  /**
   * If unset, the route returns 503 -- handy default for tests/setup that
   * don't care about LLM until they explicitly wire it.
   */
  llmChat?: LlmChatFn;
}

export function createSoverignLlmChatRoute(deps: SoverignLlmRouteDeps): RouteHandler {
  return async (ctx: RouteContext) => {
    if (!deps.llmChat) {
      return err("soverign llm chat not configured", 503);
    }
    const raw = await parseJsonObject(ctx);
    if (raw instanceof Response) return raw;
    if (typeof raw.prompt !== "string" || raw.prompt.length === 0) {
      return err("prompt must be a non-empty string", 400);
    }
    const body: LlmChatRequest = { prompt: raw.prompt };
    if (typeof raw.system === "string") body.system = raw.system;
    if (raw.overrideSystem === true) body.overrideSystem = true;
    if (raw.parseJson === true) body.parseJson = true;
    const reply = await deps.llmChat(body, {
      runId: ctx.claims.runId,
      projectId: ctx.claims.projectId,
    });
    return json(reply);
  };
}
