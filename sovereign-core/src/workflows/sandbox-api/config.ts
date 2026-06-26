/**
 * Filesystem locations for sandbox-api side-files.
 *
 * Centralized so tests can override via env without leaking $HOME state.
 * Defaults to `~/.sovereign/workflow-files/` and `~/.sovereign/workflow-logs/`,
 * matching the rest of the daemon's `~/.sovereign/...` tree.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

const ROOT_ENV = "SOVEREIGN_WORKFLOW_DATA_DIR";

function root(): string {
  const override = process.env[ROOT_ENV];
  if (override) return resolve(override);
  return resolve(homedir(), ".sovereign");
}

export function workflowFileBase(): string {
  return resolve(root(), "workflow-files");
}

export function workflowLogsBase(): string {
  return resolve(root(), "workflow-logs");
}
