import { initDatabase } from '../vault/schema.ts';
import { setSetting, getSetting, deleteSetting } from '../vault/settings.ts';
import { setSecret, getSecret, deleteSecret } from '../vault/keychain.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dbPath = join(homedir(), '.sovereign', 'sovereign.db');

try {
  initDatabase(dbPath);
} catch (e) {
  // If database is locked (e.g. daemon is running), bun:sqlite can still open it in read-only/WAL mode
  // but if we are just querying, that's fine.
}

const action = process.argv[2];
const key = process.argv[3];
const value = process.argv[4];

if (!action || !key) {
  console.error('Usage: bun manage-settings.ts <get|set|delete|getSecret|setSecret|deleteSecret> <key> [value]');
  process.exit(1);
}

if (action === 'get') {
  const val = getSetting(key);
  console.log(val ?? '');
} else if (action === 'set') {
  if (value === undefined) {
    console.error('Value is required for set action');
    process.exit(1);
  }
  setSetting(key, value);
  console.log(`Successfully set ${key}`);
} else if (action === 'delete') {
  deleteSetting(key);
  console.log(`Successfully deleted ${key}`);
} else if (action === 'getSecret') {
  const val = getSecret(key);
  console.log(val ?? '');
} else if (action === 'setSecret') {
  if (value === undefined) {
    console.error('Value is required for setSecret action');
    process.exit(1);
  }
  setSecret(key, value);
  console.log(`Successfully set secret ${key}`);
} else if (action === 'deleteSecret') {
  deleteSecret(key);
  console.log(`Successfully deleted secret ${key}`);
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

process.exit(0);
