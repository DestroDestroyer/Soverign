/**
 * Encrypted secrets store for SOVEREIGN.
 *
 * Stores secrets in an AES-256-GCM encrypted file (~/.sovereign/.secrets.enc)
 * with a random key stored in ~/.sovereign/.secrets.key (chmod 600).
 *
 * This avoids depending on OS keychain daemons (which are unreliable on WSL2).
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { constants as fsConstants, existsSync, readFileSync, mkdirSync, chmodSync, openSync, writeSync, closeSync, renameSync, fsyncSync, statSync } from 'node:fs';
import { open, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SOVEREIGN_DIR = join(homedir(), '.sovereign');
const KEY_PATH = join(SOVEREIGN_DIR, '.secrets.key');
const SECRETS_PATH = join(SOVEREIGN_DIR, '.secrets.enc');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function ensureDir(): void {
  mkdirSync(SOVEREIGN_DIR, { recursive: true, mode: 0o700 });
  try { chmodSync(SOVEREIGN_DIR, 0o700); } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Keychain] Failed to chmod ${SOVEREIGN_DIR} to 700: ${message}`);
  }
}

/**
 * Write a secret file with O_NOFOLLOW so the call fails (ELOOP) if the path
 * is a symlink, preventing redirection to an attacker-controlled target.
 */
function writeSecretFileSync(path: string, data: string | Buffer, mode: number): void {
  const tmpPath = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  const fd = openSync(tmpPath, flags, mode);
  try {
    writeSync(fd, data as never);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try { chmodSync(tmpPath, mode); } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Keychain] Failed to chmod ${tmpPath} to ${mode.toString(8)}: ${message}`);
  }
  renameSync(tmpPath, path);
}

async function writeSecretFileAsync(path: string, data: string | Buffer, mode: number): Promise<void> {
  const tmpPath = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  const handle = await open(tmpPath, flags, mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await chmod(tmpPath, mode); } catch (err) {
    console.warn(`[Keychain] Failed to chmod ${tmpPath} to ${mode.toString(8)}:`, err);
  }
  await rename(tmpPath, path);
}

function getOrCreateKey(): Buffer {
  ensureDir();
  if (existsSync(KEY_PATH)) {
    const hex = readFileSync(KEY_PATH, 'utf-8').trim();
    return Buffer.from(hex, 'hex');
  }
  const key = randomBytes(32);
  writeSecretFileSync(KEY_PATH, key.toString('hex'), 0o600);
  return key;
}

function encrypt(key: Buffer, plaintext: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(key: Buffer, data: Buffer): string {
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
}

let cachedSecrets: Record<string, string> | null = null;
let lastMtime: number = 0;

function loadSecrets(): Record<string, string> {
  if (!existsSync(SECRETS_PATH)) return {};
  try {
    const stats = statSync(SECRETS_PATH);
    if (cachedSecrets && stats.mtimeMs === lastMtime) {
      return cachedSecrets;
    }
    const key = getOrCreateKey();
    const raw = readFileSync(SECRETS_PATH);
    const json = decrypt(key, raw);
    cachedSecrets = JSON.parse(json);
    lastMtime = stats.mtimeMs;
    return cachedSecrets!;
  } catch (err) {
    console.warn('[Keychain] Failed to decrypt secrets file, starting fresh:', err);
    return {};
  }
}

function saveSecrets(secrets: Record<string, string>): void {
  ensureDir();
  const key = getOrCreateKey();
  const json = JSON.stringify(secrets);
  const encrypted = encrypt(key, json);
  
  cachedSecrets = secrets;
  try {
    lastMtime = existsSync(SECRETS_PATH) ? statSync(SECRETS_PATH).mtimeMs : 0;
  } catch { /* ignore */ }

  writeSecretFileAsync(SECRETS_PATH, encrypted, 0o600).catch(err => {
    console.error('[Keychain] Async save failed:', err);
  });
}

export function getSecret(name: string): string | null {
  const secrets = loadSecrets();
  return secrets[name] ?? null;
}

export function setSecret(name: string, value: string): void {
  const secrets = loadSecrets();
  secrets[name] = value;
  saveSecrets(secrets);
}

export function deleteSecret(name: string): void {
  const secrets = loadSecrets();
  delete secrets[name];
  saveSecrets(secrets);
}

export function hasSecret(name: string): boolean {
  const secrets = loadSecrets();
  return name in secrets;
}
