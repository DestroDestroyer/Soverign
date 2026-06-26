# Sovereign — Complete Migration & Operations Package

This folder contains the complete audit, migration details, credentials, and custom helper scripts for the **Sovereign** project. Use this folder to migrate the project to another location or set up a new workspace.

---

## 🔑 User Information & Credentials

### 1. Google OAuth Credentials (Google Drive & VideoForge)
These credentials enable Google Drive and VideoForge automations:
- **Project ID:** `videoforge-499705`
- **Client ID:** `103194522284-ommd4uq7f17hi9p7lsg1hkrvp1vmj1ko.apps.googleusercontent.com`
- **Client Secret:** `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`
- **Scopes Authorized:** `["https://www.googleapis.com/auth/drive"]`
- **OAuth Authorization Token Details:** Saved in the local [drive_token.json](file:///C:/Ai/project/sovereign-migration-info/drive_token.json) file.

### 2. Instagram Saved Reels Link
The target collection used to extract Sovereign AI features:
- **Link:** https://www.instagram.com/akash_makkara/saved/jarvis/17996691965787105/

---

## 🛠️ Work Done & System Configuration

### 1. WSL Daemon & Ubuntu Removal (100% Native Windows)
- **Problem:** The previous version was entirely dependent on WSL2/Ubuntu to boot the backend daemon, which caused launch failures if WSL was not installed or running.
- **Solution:** 
  - Rewrote the Electron main process [main.js](file:///C:/Ai/project/sovereign-desktop/main.js) and launch scripts to boot natively on Windows.
  - The daemon is now started natively using `bun run src/daemon/index.ts` inside the `sovereign-core` directory.
  - Migrated the daemon log streamer in Electron to tail the Windows-native log file (`~/.sovereign/sovereign.log`) using PowerShell's native `Get-Content -Wait` command.
  - Replaced WSL-localhost paths with Windows-native user profile path (`~/.sovereign/config.yaml`) for reading/writing configuration files.
  - Cleaned up the WSL Distro settings from the Advanced Settings overlay and replaced it with a **Bun Executable Path** setting so that users can override the Bun location if it is not globally present on the Windows `PATH`.

### 2. Desktop Shortcut Renaming & Repair
- **Problem:** The desktop shortcut was named `J.A.R.V.I.S..lnk` and pointed to the non-existent old project folder.
- **Solution:** Modified [install_shortcut.ps1](file:///C:/Ai/project/sovereign-desktop/install_shortcut.ps1) to delete the old shortcut and create a new `Sovereign.lnk` shortcut pointing to the native Electron executable (`C:\Ai\project\sovereign-desktop\node_modules\electron\dist\electron.exe`) with arguments targeting the correct `sovereign-desktop` project folder.

### 3. Windows Desktop Control & Surveillance
- **Problem:** The previous version relied on a C# sidecar placeholder to control Windows apps.
- **Solution:** Fully implemented native Windows automation in [windows.ts](file:///C:/Ai/project/sovereign-core/src/actions/app-control/windows.ts). It writes dynamic PowerShell scripts on-the-fly, executing Win32 API calls (`EnumWindows`, `GetWindowRect`, Mouse/Keyboard events) and using `System.Windows.Automation` to query UI elements and interact with Windows desktop apps from the local runtime context.

### 4. Low-Spec Hardware Optimization
- **Problem:** The default model was set to `qwen2.5-coder:7b` which would crash low-RAM machines (like the user's AMD Ryzen 3 3250U 8GB RAM PC).
- **Solution:** 
  - Changed the default model in all configuration objects, main process files, and UI labels to `qwen2.5:1.5b` (which takes ~1.2GB VRAM/RAM and runs extremely fast).
  - Implemented an interactive hardware scanner in Electron (`scan-hardware` IPC using Node's `os` module) to automatically analyze the system's specs (CPU, total RAM, free RAM) and suggest the optimal local model size.

### 5. Native HTTP cURL/Fetch Tool
- **Problem:** The agent lacked a native tool to perform HTTP requests on Windows.
- **Solution:** Created the `fetch_url` tool in [builtin.ts](file:///C:/Ai/project/sovereign-core/src/actions/tools/builtin.ts), implementing a native fetch engine with automatic HTML-to-text sanitization (stripping script/style tags) and JSON formatting.

---

## 🗂️ Python Scripts & Helper Utilities

The following helper scripts are packaged in the `scripts/` directory:
1. **[run_sovereign.bat](file:///C:/Ai/project/sovereign-migration-info/scripts/run_sovereign.bat):** Native Windows launcher script. It checks if the Sovereign Daemon is active on port 3142, starts it in the background if not, and then launches the Electron desktop console.
2. **[stop_sovereign.bat](file:///C:/Ai/project/sovereign-migration-info/scripts/stop_sovereign.bat):** Native Windows script to find and terminate any process running on port 3142, effectively shutting down the Sovereign Daemon.
3. **[install_shortcut.ps1](file:///C:/Ai/project/sovereign-migration-info/scripts/install_shortcut.ps1):** PowerShell script to install a working, clean desktop shortcut called `Sovereign.lnk` pointing to the local Electron app folder.
4. **[enum_windows.ps1](file:///C:/Ai/project/sovereign-migration-info/scripts/enum_windows.ps1):** Low-level Win32 API script that lists all currently open desktop windows with their titles and process IDs.
5. **[get_active_window.ps1](file:///C:/Ai/project/sovereign-migration-info/scripts/get_active_window.ps1):** Script that returns details (bounds, process name, title, PID) of the window currently in focus.
6. **[list_windows.ps1](file:///C:/Ai/project/sovereign-migration-info/scripts/list_windows.ps1):** Script that lists details of all visible window frames on the screen.

---

The following features were extracted from the user's saved AI Reels Insights (To Be Fully Integrated)
1. **Headroom Context Compressor:** Strips console logs, history noise, and large file trees from the LLM prompt to save context tokens.
2. **Odysseus Workspace Wrapper:** A persistent local workspace wrapper with automated email triage and memory persistence.
3. **Claude Flow Swarms:** Coordinate multiple specialized subagents (planner, writer, tester, security) running concurrently and sharing a local SQLite memory layer.
4. **Graphify / Agent Brain:** Mapped graph-based memory nodes into Obsidian to visualize conversations, tasks, and code relationships.
5. **Agentic OS Dashboard:** Premium control panel showing CPU/RAM usage, active context token metrics, and a Command Deck.
6. **Double-Clap Trigger:** A Python microphone script that uses a double-clap sound threshold to trigger voice/text tasks.

---

## 🔮 Next Steps & Upcoming Work
The following items are planned next:
1. **Local-Only Privacy Guard:** Add config properties to intercept all LLM calls and block cloud endpoints unless whitelisted.
2. **Self-Hosted GGUF Model Loader:** Integrate `node-llama-cpp` or `llama-server.exe` directly in the Bun daemon to support local GGUF models if Ollama is not installed or offline.
3. **Reels Feature Integration:** Build out the Double-Clap trigger script and the Graphify Obsidian memory mapping.
