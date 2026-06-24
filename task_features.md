# Soverign — Task Features Tracker

This file tracks the status of all feature implementations, upgrades, and migrations for the Soverign AI Console.

---

## Completed Tasks

### [x] Task 1: Reasoning Guidelines
- [x] Update role/prompt definitions with Chain of Thought instructions.
- [x] Verify system prompt includes reasoning.

### [x] Task 2: Speed Optimization
- [x] Optimize local Ollama config/parameters.
- [x] Test local connection latency.

### [x] Task 3: Glassmorphism UI Theme
- [x] Modify index.css for transparent blurry white layouts.

### [x] Task 4: UI Animations & Transitions
- [x] Add sidebar slide-in transition.
- [x] Add background animated graphics/particles.

### [x] Task 5: Sidebar Toggle
- [x] Create sidebar open/close HTML elements in Electron console.
- [x] Write CSS slide transitions for toggling the settings/options sidebar.
- [x] Write JS control logic in `renderer.js`.

### [x] Task 5.5: Global Name & Directory Rename (Soverign)
- [x] Rename directories and batch scripts.
- [x] Perform search-and-replace of "Jarvis" / "JARVIS" to "Soverign".

### [x] Task 5.6: UI Scrolling & Modal Boundary Fixes
- [x] Update `index.css` to constrain sidebar height and enable vertical scrolling.
- [x] Add max-height and scrolling to settings modal.

### [x] Task 5.7: Hardware Spec Scanning & Adaptation
- [x] Implement system specifications scan (IPC: `scan-hardware`, uses Node.js `os` module).
- [x] Set Qwen default model to 1.5B (`qwen2.5:1.5b` everywhere).
- [x] Suggest model sizes dynamically based on specs.

### [x] Task 5.8: Native Windows Migration (NO WSL)
- [x] Rewrote `main.js`: spawns Bun daemon natively (no `wsl.exe` calls).
- [x] Log streaming via PowerShell `Get-Content -Wait` (native tail).
- [x] Config read/write: Windows-native `~/.soverign/config.yaml`.
- [x] Stop daemon: uses `netstat` + `taskkill` (not wsl pkill).
- [x] Updated `run_soverign.bat`: native Bun start, no WSL dependency.
- [x] Updated `preload.js`: added `scanHardware`, `listLocalModels` bridges.
- [x] Updated `index.html`: labels fixed (no more "WSL Daemon", "7B").
- [x] Updated `renderer.js`: hardware scan wired, ollama shows model field.

---

## Active & Upcoming Tasks

### [ ] Task 6: cURL / Fetch Connectivity
- [ ] Add `fetch_url` tool to `builtin.ts` (Done).
- [ ] Verify HTTP requests natively on Windows.

### [ ] Task 7: Windows Native Migration & Auto-auth
- [ ] Modify `main.js` to spawn Bun on Windows.
- [ ] Remove WSL pathways.
- [ ] Implement auto-approval rules for developer tools.

### [ ] Task 8: Model selection & Auto-testing
- [ ] Create testing mechanism for OpenRouter models.

### [ ] Task 9: Self-Upgrade
- [ ] Add code self-modification tools.

### [ ] Task 10: Windows App Integration
- [ ] Implement desktop app launch/query actions.

### [ ] Task 11: Full Voice Integration
- [ ] Implement Speech-to-Text & Text-to-Speech.

### [ ] Task 12: 24/7 Watchdog Service & Heartbeat
- [ ] Implement watchdog script and bat launcher.
