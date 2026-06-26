# SOVEREIGN — Codebase Map & Dev Guide

Welcome! This file serves as the entry-point map for the IDE semantic indexer and development assistants.

## 1. Project Directory Structure

```
Sovereign/
  sovereign-core/          ← Daemon engine, triggers, and workflow runtime (Bun/TypeScript)
    src/
      daemon/             ← Core daemon entry point (index.ts)
      workflows/          ← Workflow executors, triggers, and sandbox APIs
        sandbox-api/      ← HTTP & WebSockets worker endpoint surface
          routes/         ← Router endpoints (sovereign-llm.ts, connections.ts, etc.)
    ui/                   ← Front-end assets and templates
    roles/                ← System assistant role definitions
  sovereign-desktop/       ← Desktop Control Console interface (Electron/JS/CSS)
    main.js               ← Main process, spawns daemon, tails logs, handles all IPC
    preload.js            ← Context-isolated bridge API (window.api.*)
    renderer/             ← Frontend UI (index.html, renderer.js, index.css)
    validate.js           ← safety contract validation script
    download_electron.ps1 ← Helper to manually download and extract Electron binaries
    install_shortcut.ps1  ← Helper to install Desktop shortcut
  colab_pipeline.py       ← High-performance cloud video generation pipeline (FFmpeg/Pillow)
  run_kaggle.py           ← Local orchestrator to upload and monitor Kaggle cloud runs
  rebuild_video_locally.py← Ryzen CPU-only local fallback video generation script
  run_sovereign.bat        ← Main launcher: starts the daemon on port 3142 and opens Electron UI
  run-standalone.bat      ← Offline server mode launcher
  stop_sovereign.bat       ← Utility to find and kill port 3142
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
* **Run Specific Test:** `bun test <file_path>` (e.g., `bun test src/workflows/sandbox-api/worker-rpc.test.ts`)
* **Init Database:** `bun run src/vault/schema.ts`
* **Update UI public assets:** `bun run copy:models`

---

## 3. Key Development Guidelines & Rules

### Core Rules (Desktop Console)
1. **IPC Handlers**: Every method exposed in `preload.js` under `ipcRenderer.invoke` must have a corresponding `ipcMain.handle` in `main.js`.
2. **DOM Elements**: Every `document.getElementById` call in `renderer/renderer.js` must target an ID defined in `renderer/index.html`.
3. **CSS Animations**: Every `animation: <name>` used in `renderer/index.css` must have a matching `@keyframes <name>` block.
4. **Validation**: Run `node validate.js` in `sovereign-desktop/` after every edit to verify integrity.

### Account & Secret Management
* Google Cloud Profiles, Gemini API Keys, and ADC credentials can be switched using the manual profile switcher script:
  `python .agents/skills/switch-acc-skill/scripts/switch_accounts.py switch <profile_name>`
* Profile configurations are stored natively under `%USERPROFILE%\.sovereign\config.yaml` or managed by the background quota watchdog.
