# SOVEREIGN — Codebase Map & Dev Guide

Welcome! This file serves as the entry-point map for the IDE semantic indexer and development assistants.

## 1. Project Directory Structure

```
Sovereign/
  sovereign-core/          ← Brain engine, LLM orchestration, config, and WS server (Bun/TypeScript, port 3142)
    src/
      brain/              ← Core brain entry point (index.ts), agent orchestration, tool registry
      config/             ← Config loader (YAML, auto-recovery on parse errors, defaults fallback)
        loader.ts         ← loadConfig/saveConfig; corrupt YAML is deleted and defaults returned
      daemon/             ← WebSocket service, service registry, health endpoint
        ws-service.ts     ← HTTP + WS server for SPA and API; setStaticDir before registry.startAll()
      workflows/          ← Workflow executors, triggers, sandbox APIs
        sandbox-api/
          routes/         ← Router endpoints (sovereign-llm.ts, connections.ts, etc.)
    ui/dist/              ← Pre-built SPA (Vite output: index.html, CSS, JS bundles)
    roles/                ← System assistant role definitions
  sovereign-desktop/       ← Desktop Control Console interface (Electron/JS/CSS)
    main.js               ← Main process, spawns daemon, tails logs, handles all IPC
    preload.js            ← Context-isolated bridge API (window.api.*)
    renderer/             ← Frontend UI (index.html, renderer.js, index.css)
    validate.js           ← safety contract validation script
    download_electron.ps1 ← Helper to manually download and extract Electron binaries
    install_shortcut.ps1  ← Helper to install Desktop shortcut
  run_sovereign.bat        ← Main launcher: starts bun brain on port 3142 and opens Electron UI
  run-standalone.bat      ← Offline server mode launcher (no desktop)
  stop_sovereign.bat       ← Utility to find and kill port 3142
  other/                  ← Auxiliary files: logs, reports, generated outputs, standalone scripts, test artifacts

```

---

## 2. Command Reference

### Desktop (sovereign-desktop)
* **Start Application:** `npm start` (or `npm.cmd start` on Windows powershell)
* **Manual Electron Download:** `powershell -File download_electron.ps1`
* **Validate Safety Contracts:** `node validate.js` (checks IPC channels, DOM element IDs, CSS keyframes, and preload methods)
* **Create Desktop Shortcut:** `powershell -File install_shortcut.ps1`

### Core Daemon (sovereign-core)
* **Install dependencies:** `bun install`
* **Start Daemon:** `bun start` (runs `src/daemon/index.ts` on port 3142)
* **Run Tests:** `bun test`
* **Run Specific Test:** `bun test <file_path>` (e.g., `bun test src/config/loader.test.ts`)
* **Init Database:** `bun run src/vault/schema.ts`
* **Update UI public assets:** `bun run copy:models`

---

## 3. Key Development Guidelines & Rules

### Auxiliary File Convention
All non-app files — logs, generated reports, standalone scripts, test artifacts, and any output files — go in `other/`. The workspace root should only contain core app directories and launcher scripts. Any new auxiliary file created during development should be placed in `other/`.

### Core Rules (Desktop Console)
1. **IPC Handlers**: Every method exposed in `preload.js` under `ipcRenderer.invoke` must have a corresponding `ipcMain.handle` in `main.js`.
2. **DOM Elements**: Every `document.getElementById` call in `renderer/renderer.js` must target an ID defined in `renderer/index.html`.
3. **CSS Animations**: Every `animation: <name>` used in `renderer/index.css` must have a matching `@keyframes <name>` block.
4. **Validation**: Run `node validate.js` in `sovereign-desktop/` after every edit to verify integrity.

### Account & Secret Management
* Google Cloud Profiles, Gemini API Keys, and ADC credentials can be switched using the manual profile switcher script:
  `python .agents/skills/switch-acc-skill/scripts/switch_accounts.py switch <profile_name>`
* Profile configurations are stored natively under `%USERPROFILE%\.sovereign\config.yaml` or managed by the background quota watchdog.
