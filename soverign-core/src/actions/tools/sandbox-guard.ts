/**
 * Sandbox Guard — validates file paths and commands to prevent
 * the agent from writing outside its allowed workspace.
 */
import { resolve, normalize } from 'node:path';
import { homedir } from 'node:os';

const SOVERIGN_DATA_DIR = resolve(homedir(), '.soverign');

/** Paths the agent is always allowed to write to */
const ALWAYS_ALLOWED_PREFIXES = [
  SOVERIGN_DATA_DIR,
  // Add project workspace roots dynamically via setWorkspaceRoot()
];

let _workspaceRoot: string | null = null;

export function setWorkspaceRoot(root: string): void {
  _workspaceRoot = resolve(root);
}

/**
 * Check if a file path is within the allowed sandbox.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export function validateWritePath(rawPath: string): { allowed: boolean; reason?: string } {
  let normalized: string;
  try {
    normalized = normalize(resolve(rawPath));
  } catch {
    return { allowed: false, reason: 'Invalid path' };
  }

  // Block path traversal attempts
  if (normalized.includes('..')) {
    return { allowed: false, reason: 'Path traversal detected' };
  }

  // Allow writes within the Soverign data dir
  for (const allowed of ALWAYS_ALLOWED_PREFIXES) {
    if (normalized.startsWith(allowed)) return { allowed: true };
  }

  // Allow writes within the configured workspace root
  if (_workspaceRoot && normalized.startsWith(_workspaceRoot)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Write to "${normalized}" is outside the allowed sandbox. Allowed: ${[...ALWAYS_ALLOWED_PREFIXES, _workspaceRoot].filter(Boolean).join(', ')}`,
  };
}

/**
 * Dangerous command pattern detection.
 * Returns { safe: true } or { safe: false, reason: string }
 */
export function validateCommand(command: string): { safe: boolean; reason?: string } {
  const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\/(?!tmp|var\/tmp)/i,    // rm -rf / (not /tmp)
    /format\s+[cCdDeEfF]:/i,              // format C:
    /del\s+\/[fFsS]\s+\/[qQ]\s+\/[sS]/i, // del /f /q /s system dirs
    /rd\s+\/[sS]\s+\/[qQ]\s+[cCdD]:\/Windows/i, // rd /s Windows dir
    /shutdown\s+\/[sfSF]/i,               // shutdown /f or /s
    /mkfs|fdisk|dd\s+if=/i,               // disk-level operations
  ];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `Command matches dangerous pattern: ${pattern.source}` };
    }
  }

  return { safe: true };
}
