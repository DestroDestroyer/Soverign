import YAML from 'yaml';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { lstat, rename, unlink } from 'node:fs/promises';
import type { SovereignConfig } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { secureParentDirectory, secureWriteFile } from '../util/fs-secure.ts';

function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/')) {
    return join(homedir(), filepath.slice(2));
  }
  return filepath;
}

function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== 'object') {
    // If source is absent, return a clone of target so callers (or subsequent
    // mutation of the returned value) can never alias shared defaults.
    return source !== undefined ? source : structuredClone(target);
  }

  if (Array.isArray(source)) {
    return [...source];
  }

  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Apply environment variable overrides to config.
 * Env vars take highest precedence (over YAML and defaults).
 */
function applyEnvOverrides(config: SovereignConfig): void {
  const env = process.env;

  if (env.SOVEREIGN_PORT) {
    const port = parseInt(env.SOVEREIGN_PORT, 10);
    if (!isNaN(port)) config.daemon.port = port;
  }

  if (env.SOVEREIGN_HOME) {
    const home = env.SOVEREIGN_HOME;
    config.daemon.data_dir = home;
    config.daemon.db_path = join(home, 'sovereign.db');
  }

  // NOTE: LLM provider configuration is intentionally NOT read from env vars.
  // Providers, credentials, the single-LLM default, and tiers live exclusively
  // in the database + encrypted keychain and are managed from the settings
  // dashboard. There is no env or config.yaml path for LLM config.

  if (env.SOVEREIGN_BRAIN_DOMAIN) {
    config.daemon.brain_domain = env.SOVEREIGN_BRAIN_DOMAIN;
  }

  if (env.SOVEREIGN_AUTH_TOKEN) {
    if (!config.auth) config.auth = {};
    config.auth.token = env.SOVEREIGN_AUTH_TOKEN;
  }

  if (env.SOVEREIGN_WAKE_ENGINE) {
    const engine = env.SOVEREIGN_WAKE_ENGINE;
    if (engine === 'openwakeword' || engine === 'webspeech' || engine === 'auto') {
      if (!config.voice) config.voice = { wake_engine: 'openwakeword' };
      config.voice.wake_engine = engine;
    } else {
      console.warn(`[Config] Invalid SOVEREIGN_WAKE_ENGINE="${engine}" — must be openwakeword|webspeech|auto; ignoring.`);
    }
  }

  // Premium realtime voice (gpt-realtime-2). Truthy values enable; "0"/"false"
  // explicitly disable. See docs/GPT_REALTIME_2_INTEGRATION.md.
  if (env.SOVEREIGN_REALTIME_VOICE !== undefined) {
    if (!config.voice) config.voice = { wake_engine: 'openwakeword' };
    if (!config.voice.realtime) config.voice.realtime = { enabled: false };
    const v = env.SOVEREIGN_REALTIME_VOICE.trim().toLowerCase();
    config.voice.realtime.enabled = v !== '' && v !== '0' && v !== 'false' && v !== 'no';
  }
}

export async function loadConfig(configPath?: string): Promise<SovereignConfig> {
  const path = configPath || expandTilde('~/.sovereign/config.yaml');

  try {
    const file = Bun.file(path);
    const exists = await file.exists();

    if (!exists) {
      console.warn(`Config file not found at ${path}, using defaults`);
      const config = structuredClone(DEFAULT_CONFIG);
      config.daemon.data_dir = expandTilde(config.daemon.data_dir);
      config.daemon.db_path = expandTilde(config.daemon.db_path);
      applyEnvOverrides(config);
      return config;
    }

    // File exists — parse errors should be fatal.
    // `merge: true` enables YAML merge keys (`<<: *anchor`) so configs can share
    // blocks across environments. Removing this flag would silently break any
    // config that relies on anchors — keep it unless you're sure.
    const text = await file.text();
    const doc = YAML.parseDocument(text, { merge: true });
    if (doc.errors.length > 0) {
      // `yaml`'s error.message already embeds `at line X, column Y:` and a caret
      // diagram, so no need to prefix our own position info.
      const formatted = doc.errors.map((entry) => entry.message);
      throw new Error(`Failed to parse YAML config:\n  ${formatted.join('\n  ')}`);
    }
    // `doc.toJS()` returns null for an empty (or comment-only) file — coerce to
    // an empty object so downstream merges fall back cleanly to defaults.
    const parsed = (doc.toJS() ?? {}) as Partial<SovereignConfig>;

    // Deep merge with defaults to ensure all required fields exist
    const config = deepMerge(structuredClone(DEFAULT_CONFIG), parsed) as SovereignConfig;

    // Expand tilde in paths
    config.daemon.data_dir = expandTilde(config.daemon.data_dir);
    config.daemon.db_path = expandTilde(config.daemon.db_path);

    // Apply environment variable overrides
    applyEnvOverrides(config);

    // If the config.yaml explicitly defines a primary LLM, preserve the entire llm block.
    // Otherwise, default to empty settings (to be loaded from DB / defaults).
    if (parsed.llm && parsed.llm.primary) {
      config.llm = parsed.llm;
    } else {
      config.llm = structuredClone(DEFAULT_CONFIG.llm);
    }

    // Force telemetry to be disabled to preserve privacy (strict local-first)
    if (config.telemetry) {
      config.telemetry.enabled = false;
    }

    return config;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Config] Failed to load config at ${path}: ${message}. Falling back to default configuration and attempting auto-repair...`);
    const fallbackConfig = structuredClone(DEFAULT_CONFIG);
    fallbackConfig.daemon.data_dir = expandTilde(fallbackConfig.daemon.data_dir);
    fallbackConfig.daemon.db_path = expandTilde(fallbackConfig.daemon.db_path);
    applyEnvOverrides(fallbackConfig);

    try {
      await saveConfig(fallbackConfig, path);
      console.log(`[Config] Auto-repair succeeded: config.yaml rewritten with defaults.`);
    } catch (saveErr) {
      console.error(`[Config] Auto-repair failed: unable to write clean config:`, saveErr);
    }

    return fallbackConfig;
  }
}

/**
 * Clean up the `llm` block before writing config.yaml.
 * If the config-driven primary LLM is set, we preserve the block but redact API keys
 * to avoid leakage to disk. Otherwise, we strip the entire llm block for DB-first mode.
 */
function stripLLMConfigForYAML(config: SovereignConfig): SovereignConfig {
  const clone = structuredClone(config);
  if (clone.llm && clone.llm.primary) {
    if (clone.llm.providers) {
      for (const [name, entry] of Object.entries(clone.llm.providers)) {
        if (entry.api_key) {
          entry.api_key = '********';
        }
      }
    }
  } else {
    delete (clone as { llm?: unknown }).llm;
  }
  return clone;
}

/** Monotonic per-process counter for unique save temp-file names. */
let saveCounter = 0;

export async function saveConfig(
  config: SovereignConfig,
  configPath?: string
): Promise<void> {
  const path = configPath || expandTilde('~/.sovereign/config.yaml');

  try {
    const canonical = stripLLMConfigForYAML(config);
    const yaml = YAML.stringify(canonical, {
      indent: 2,
      lineWidth: 100,
      defaultStringType: 'PLAIN',
      defaultKeyType: 'PLAIN',
    });

    await secureParentDirectory(path);
    // Write-then-rename so the config is replaced atomically. A direct
    // O_TRUNC write leaves a truncated/empty config.yaml if the daemon is
    // killed mid-write -- on the next boot that parses as defaults and the
    // user loses onboarding state, authority overrides, everything.
    // The tmp name carries pid + a counter so two concurrent saves can
    // never rename each other's half-written file into place.
    const tmpPath = `${path}.${process.pid}.${saveCounter++}.tmp`;
    await secureWriteFile(tmpPath, yaml, 0o600, 'Config');

    // rename() would silently replace a symlinked config.yaml with a
    // regular file (e.g. a link into a dotfiles repo). secureWriteFile
    // refuses symlinks via O_NOFOLLOW; keep that contract here and fail
    // loudly instead of clobbering the link.
    const existing = await lstat(path).catch(() => null);
    if (existing?.isSymbolicLink()) {
      await unlink(tmpPath).catch(() => {});
      throw new Error(`${path} is a symlink; refusing to replace it`);
    }

    try {
      await rename(tmpPath, path);
    } catch {
      // Rename across-the-board works on POSIX; on Windows it can fail
      // transiently (antivirus holding the target). Fall back to the
      // in-place write rather than losing the save entirely.
      await unlink(tmpPath).catch(() => {});
      await secureWriteFile(path, yaml, 0o600, 'Config');
    }
    console.log(`Config saved to ${path}`);
  } catch (err) {
    throw new Error(`Failed to save config to ${path}: ${err}`);
  }
}
