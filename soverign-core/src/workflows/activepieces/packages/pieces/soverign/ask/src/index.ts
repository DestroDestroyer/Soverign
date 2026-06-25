/**
 * `@soverignpieces/piece-soverign-ask` -- the production "ask the LLM" piece,
 * ported from the legacy `SoverignPiece` interface to upstream's `createPiece`.
 *
 * The action calls back to the daemon's `/v1/soverign/llm/chat` endpoint via
 * `context.server.token` + `context.server.apiUrl` so the LLM provider stays
 * inside the daemon process (no key plumbing through the engine subprocess).
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { askAction } from "./lib/actions/ask";

export const soverignAskPiece = createPiece({
  displayName: "Soverign: Ask",
  description: "Send a prompt to the daemon's LLM and receive the reply.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["soverign"],
  actions: [askAction],
  triggers: [],
});
