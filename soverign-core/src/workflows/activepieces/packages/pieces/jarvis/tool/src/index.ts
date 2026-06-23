/**
 * `@soverignpieces/piece-soverign-tool` -- invoke a registered Soverign tool by name
 * directly from a flow. Cheap and deterministic: no LLM round-trip, no agent
 * planning, the caller already knows the tool id.
 *
 * Calls back to the daemon's `/v1/soverign/tools/invoke` endpoint via the
 * engine's per-run `context.server` bearer token.
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { invokeAction } from "./lib/actions/invoke";

export const soverignToolPiece = createPiece({
  displayName: "Soverign: Tool",
  description:
    "Invoke a registered Soverign tool by name with the given parameters. Use this when you know exactly which tool to call; for LLM-picked tool dispatch use soverign-agent.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["soverign"],
  actions: [invokeAction],
  triggers: [],
});
