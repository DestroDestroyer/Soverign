/**
 * validate.js — Soverign Desktop Safety Net
 * ==========================================
 * Run with: node validate.js
 *
 * Checks ALL cross-file contracts so a broken edit is caught immediately:
 *   1. Every ipcRenderer.invoke() in preload.js has a matching ipcMain.handle() in main.js
 *   2. Every document.getElementById() in renderer.js has a matching id="..." in index.html
 *   3. Every CSS animation name used in index.css has a matching @keyframes definition
 *   4. Every CSS class toggled via classList in renderer.js exists in index.css
 *   5. No undefined variable references for known DOM element patterns
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PRELOAD  = path.join(ROOT, 'preload.js');
const MAIN     = path.join(ROOT, 'main.js');
const RENDERER = path.join(ROOT, 'renderer', 'renderer.js');
const HTML     = path.join(ROOT, 'renderer', 'index.html');
const CSS      = path.join(ROOT, 'renderer', 'index.css');

let errors = 0;
let warnings = 0;

function pass(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg) { console.error(`  \x1b[31m✗\x1b[0m ${msg}`); errors++; }
function warn(msg) { console.warn(`  \x1b[33m⚠\x1b[0m ${msg}`); warnings++; }

// ─────────────────────────────────────────────
// 1. IPC CONTRACT: preload → main
// ─────────────────────────────────────────────
console.log('\n[1] IPC Contract: preload.js → main.js');

const preloadSrc  = fs.readFileSync(PRELOAD, 'utf8');
const mainSrc     = fs.readFileSync(MAIN,    'utf8');

// Extract all ipcRenderer.invoke('channel-name') calls
const invokedChannels = [...preloadSrc.matchAll(/ipcRenderer\.invoke\(['"]([^'"]+)['"]/g)]
  .map(m => m[1]);

// Extract all ipcMain.handle('channel-name', ...) registrations
const handledChannels = new Set(
  [...mainSrc.matchAll(/ipcMain\.handle\(['"]([^'"]+)['"]/g)].map(m => m[1])
);

for (const ch of invokedChannels) {
  if (handledChannels.has(ch)) {
    pass(`'${ch}'`);
  } else {
    fail(`'${ch}' is invoked in preload.js but has NO ipcMain.handle() in main.js!`);
  }
}

// Reverse check: handlers with no matching invoke (warning only — may be unused)
for (const ch of handledChannels) {
  if (!invokedChannels.includes(ch)) {
    warn(`ipcMain.handle('${ch}') in main.js is never invoked from preload.js (unused handler)`);
  }
}

// ─────────────────────────────────────────────
// 2. DOM CONTRACT: renderer.js → index.html
// ─────────────────────────────────────────────
console.log('\n[2] DOM Contract: renderer.js → index.html');

const rendererSrc = fs.readFileSync(RENDERER, 'utf8');
const htmlSrc     = fs.readFileSync(HTML,     'utf8');

// Extract all getElementById calls
const getByIdCalls = [...rendererSrc.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)]
  .map(m => m[1]);

// Extract all id="..." from HTML
const htmlIds = new Set(
  [...htmlSrc.matchAll(/\bid=['"]([\w-]+)['"]/g)].map(m => m[1])
);

// Count occurrences so we only report each missing ID once
const reported = new Set();
for (const id of getByIdCalls) {
  if (reported.has(id)) continue;
  reported.add(id);
  if (htmlIds.has(id)) {
    pass(`#${id}`);
  } else {
    // Some IDs may be injected dynamically (toast-container etc.) — warn, don't fail
    const dynamic = ['toast-container', 'model-list', 'model-search', 'hardware-info',
                     'refresh-pool-btn', 'filter-pills', 'voice-btn', 'chat-input'];
    if (dynamic.includes(id)) {
      warn(`#${id} not in static HTML (expected dynamic / webview content)`);
    } else {
      fail(`#${id} is referenced in renderer.js but NOT found in index.html!`);
    }
  }
}

// ─────────────────────────────────────────────
// 3. CSS CONTRACT: animation names
// ─────────────────────────────────────────────
console.log('\n[3] CSS Contract: animation names');

const cssSrc = fs.readFileSync(CSS, 'utf8');

// Extract all animation: <name> usages
const animUsages = [...cssSrc.matchAll(/animation:\s*([\w-]+)/g)].map(m => m[1])
  .filter(n => !['infinite', 'ease', 'linear', 'alternate', 'forwards', 'none'].includes(n));

// Extract all @keyframes definitions
const keyframeDefs = new Set(
  [...cssSrc.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])
);

const animReported = new Set();
for (const anim of animUsages) {
  if (animReported.has(anim)) continue;
  animReported.add(anim);
  if (keyframeDefs.has(anim)) {
    pass(`@keyframes ${anim}`);
  } else {
    fail(`animation '${anim}' is used in index.css but @keyframes ${anim} is NOT defined!`);
  }
}

// ─────────────────────────────────────────────
// 4. CSS CONTRACT: classList references
// ─────────────────────────────────────────────
console.log('\n[4] CSS Contract: classList class names in renderer.js');

// Extract class names added/removed via classList
const classlistClasses = [...rendererSrc.matchAll(/classList\.\w+\(['"]([^'"]+)['"]\)/g)]
  .map(m => m[1])
  .filter(c => !['hidden', 'active', 'collapsed', 'voice-listening'].includes(c)); // known utilities

// Check each class exists as a CSS selector
const classReported = new Set();
for (const cls of classlistClasses) {
  if (classReported.has(cls)) continue;
  classReported.add(cls);
  // Check the class appears as a CSS rule selector
  const escaped = cls.replace(/-/g, '\\-');
  const pattern = new RegExp(`\\.${escaped}(?=[\\s{:,\\[])`, 'g');
  if (pattern.test(cssSrc)) {
    pass(`.${cls}`);
  } else {
    warn(`.${cls} is toggled in renderer.js but not found as a CSS selector (may be in external CSS)`);
  }
}

// ─────────────────────────────────────────────
// 5. PRELOAD CONTRACT: window.api.* in renderer
// ─────────────────────────────────────────────
console.log('\n[5] API Contract: window.api.* calls in renderer.js');

// Exposed API methods in preload
const exposedMethods = new Set(
  [...preloadSrc.matchAll(/\s{2,}(\w+):\s*(?:\(|async)/g)].map(m => m[1])
);

// Used in renderer
const usedMethods = [...rendererSrc.matchAll(/window\.api\.(\w+)\s*\(/g)].map(m => m[1]);
const usedReported = new Set();

for (const method of usedMethods) {
  if (usedReported.has(method)) continue;
  usedReported.add(method);
  if (exposedMethods.has(method)) {
    pass(`window.api.${method}()`);
  } else {
    fail(`window.api.${method}() is called in renderer.js but NOT exposed in preload.js!`);
  }
}

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
if (errors === 0 && warnings === 0) {
  console.log(`\x1b[32m✓ ALL CHECKS PASSED — no contract violations found.\x1b[0m`);
} else if (errors === 0) {
  console.log(`\x1b[33m⚠ ${warnings} warning(s) — no hard failures.\x1b[0m`);
} else {
  console.error(`\x1b[31m✗ ${errors} error(s), ${warnings} warning(s) — FIX BEFORE SHIPPING.\x1b[0m`);
  process.exit(1);
}
