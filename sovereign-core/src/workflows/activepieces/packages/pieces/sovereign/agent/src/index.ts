/**
 * `@sovereignpieces/piece-sovereign-agent` -- delegate a goal to a Sovereign sub-agent
 * (M7). The agent runs its own LLM + tool-loop and returns a final message
 * plus the trace of tools it invoked. Use this when the LLM should plan and
 * pick tools; for known-tool invocation use `sovereign-tool`, for single-shot
 * LLM completion use `sovereign-ask`.
 *
 * Calls back to `/v1/sovereign/agent/delegate`.
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { delegateAction } from "./lib/actions/delegate";

export const sovereignAgentPiece = createPiece({
  displayName: "Sovereign: Agent",
  description:
    "Run a Sovereign sub-agent (M7) with a goal. The agent uses its full reasoning + tool loop and returns the final answer plus the tool-call trace.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["sovereign"],
  actions: [delegateAction],
  triggers: [],
});
