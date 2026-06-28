# Sovereign — The Sovereign AI Desktop Assistant

<div align="center">

![Sovereign Logo](https://img.shields.io/badge/SOVEREIGN-AI%20Assistant-6C63FF?style=for-the-badge&logo=electron&logoColor=white)
[![Tests](https://github.com/DestroDestroyer/Sovereign/actions/workflows/test.yml/badge.svg)](https://github.com/DestroDestroyer/Sovereign/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Runtime-Bun%201.3%2B-F472B6?logo=bun)](https://bun.sh)
[![Electron](https://img.shields.io/badge/UI-Electron%2031-47848F?logo=electron)](https://www.electronjs.org)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript)](https://www.typescriptlang.org)

**A fully local, privacy-first AI assistant that runs entirely on your Windows machine.**  
No cloud dependency. No subscription. Your data never leaves your device.

</div>

---

## ✨ What is Sovereign?

Sovereign is an autonomous AI system that acts as your **personal executive assistant**. It watches your desktop activity, organises your work, executes tasks, and learns your workflow — all while running 100% locally using open-source LLMs via Ollama.

### Key Highlights

| Feature | Description |
|---------|-------------|
| 🧠 **Local LLM** | Powered by Ollama (Qwen 2.5, Llama 3, Mistral and more) |
| 🎙️ **Local Voice Engine** | High-fidelity offline speech-to-text (Xenova) and text-to-speech (Kokoro) |
| 🕸️ **Graph Memory** | SQLite-based semantic relationship graph memory to retain and link context |
| 🎨 **Spatial Web UI v2** | Modern layout with workspaces, rooms dispatcher, command palettes, and widgets |
| 👁️ **Desktop Awareness** | Watches files, clipboard, running processes, and notifications |
| 🤖 **Multi-Agent Roles** | CEO, Dev Lead, Personal Assistant, Research Specialist and more |
| 🔒 **100% Private** | All processing happens on your machine — no cloud calls |
| 🔧 **Workflow Engine** | Automate tasks with a built-in trigger/action pipeline |
| 💬 **Multi-Channel** | Chat via desktop UI, email, or Telegram |
| 📊 **Hardware Aware** | Auto-detects your GPU VRAM and recommends the best models |
| 🛡️ **Authority Control** | Approve/deny sensitive actions (email, payment, system commands) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SOVEREIGN SYSTEM                                   │
├────────────────────────┬────────────────────────────────────────────────┤
│   ELECTRON DESKTOP UI  │            BUN DAEMON (port 3142)               │
│   sovereign-desktop/    │            sovereign-core/                        │
│                        │                                                  │
│  ┌──────────────────┐  │  ┌──────────────┐  ┌───────────────────────┐  │
│  │   Renderer UI     │  │  │ Agent Service│  │   Observer Service    │  │
│  │  (index.html +   │◄─┼──│  Roles YAML  │  │  File │ Clipboard     │  │
│  │   renderer.js)   │  │  │  Multi-agent │  │  Process │ Notify     │  │
│  └────────┬─────────┘  │  └──────┬───────┘  └──────────────────────┘  │
│           │ IPC         │         │                                       │
│  ┌────────▼─────────┐  │  ┌──────▼───────┐  ┌───────────────────────┐  │
│  │   Preload Bridge  │  │  │  LLM Engine  │  │   Workflow Engine     │  │
│  │  (preload.js)    │  │  │  Ollama      │  │  Triggers + Actions   │  │
│  └──────────────────┘  │  │  Claude API  │  │  Queue + Worker       │  │
│                        │  └──────────────┘  └───────────────────────┘  │
│  ┌──────────────────┐  │                                                  │
│  │   Main Process   │  │  ┌──────────────┐  ┌───────────────────────┐  │
│  │   (main.js)      │  │  │ SQLite Vault │  │  Authority Engine     │  │
│  │   IPC Handlers   │  │  │ Encrypted DB │  │  Approval │ Audit     │  │
│  └──────────────────┘  │  └──────────────┘  └───────────────────────┘  │
└────────────────────────┴────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                        ▼
        Go Sidecar            WebSocket              REST API
      (host automation)    (real-time UI)       (integrations)
```

### Component Overview

| Directory | Language | Role |
|-----------|----------|------|
| `sovereign-desktop/` | JavaScript (Electron) | Desktop GUI, IPC bridge to daemon |
| `sovereign-core/` | TypeScript (Bun) | Daemon: LLM, agents, observers, workflows |
| `sovereign-integrations/` | Mixed | Optional integrations (MCP, external services) |

---

## 📂 File Structure

```
Sovereign/
├── run_sovereign.bat           # One-click Windows launcher
├── health-check.bat           # Quick health check for all services
├── stop_sovereign.bat          # Stop all running Sovereign processes
│
├── sovereign-desktop/          # Electron desktop application
│   ├── main.js                # Main process: window + ALL IPC handlers
│   ├── preload.js             # Secure bridge exposing window.api to renderer
│   ├── validate.js            # Contract checker (IPC / DOM / CSS)
│   └── renderer/
│       ├── index.html         # UI structure (all static element IDs)
│       ├── renderer.js        # UI logic: DOM, events, API calls
│       └── index.css          # Styles + all @keyframes animations
│
└── sovereign-core/             # Bun daemon (TypeScript)
    ├── src/
    │   ├── daemon/            # Server startup, services, health monitor
    │   ├── agents/            # Multi-agent orchestration
    │   ├── llm/               # LLM provider abstraction (Ollama, Claude, GPT)
    │   ├── observers/         # Desktop observers (file, clipboard, process)
    │   ├── workflows/         # Trigger-action automation engine
    │   ├── authority/         # Approval engine, audit trail
    │   ├── vault/             # SQLite database, encrypted secrets
    │   ├── comms/             # Communication channels (email, Telegram)
    │   └── sidecar/           # Go sidecar manager
    └── roles/                 # Agent role definitions (YAML)
        ├── personal-assistant.yaml
        ├── dev-lead.yaml
        ├── ceo-founder.yaml
        └── specialists/       # 12 specialist sub-agents
```

---

## 🚀 Quick Start

### Prerequisites

- **Windows 10/11** (64-bit)
- **[Bun](https://bun.sh)** runtime (auto-installed by launcher if missing)
- **[Ollama](https://ollama.ai)** for local LLM (optional — Claude/GPT API also supported)
- **Node.js 18+** and **npm** (for Electron desktop)

### Installation

```bat
:: 1. Clone the repository
git clone https://github.com/DestroDestroyer/Sovereign.git
cd Sovereign

:: 2. Install core dependencies
cd sovereign-core
bun install
cd ..

:: 3. Install desktop dependencies  
cd sovereign-desktop
npm install
cd ..

:: 4. (Optional) Pull a local LLM model
ollama pull qwen2.5:1.5b
```

### Running the App

```bat
:: One-click launcher (handles everything automatically)
run_sovereign.bat

:: Or manually:
:: Terminal 1 — Start the daemon
cd sovereign-core
bun start

:: Terminal 2 — Start the desktop UI
cd sovereign-desktop
node_modules\.bin\electron.cmd .
```

The **desktop UI** connects to the daemon on `http://localhost:3142`.  
The **web dashboard** is also available at `http://localhost:3142/` in your browser.

---

## ⚙️ Configuration

Configuration is stored in `%USERPROFILE%\.sovereign\config.yaml`:

```yaml
llm:
  provider: ollama          # or: claude, openai, gemini
  model: qwen2.5:1.5b       # any Ollama-compatible model
  api_key: ""               # required for cloud providers

daemon:
  port: 3142
  auth_token: ""            # set to secure the daemon endpoint

telemetry:
  enabled: false            # usage analytics (default: off)
```

---

## 🤖 Agent Roles

Sovereign ships with a full executive team out of the box:

| Role | File | Capabilities |
|------|------|-------------|
| Personal Assistant | `personal-assistant.yaml` | Daily tasks, scheduling, reminders |
| CEO / Founder | `ceo-founder.yaml` | Strategic planning, goal-setting |
| Dev Lead | `dev-lead.yaml` | Code review, project management |
| Chief of Staff | `chief-of-staff.yaml` | Cross-team coordination |
| Research Specialist | `research-specialist.yaml` | Deep research, synthesis |
| Marketing Director | `marketing-director.yaml` | Content strategy, campaigns |
| Executive Assistant | `executive-assistant.yaml` | Calendar, email, meetings |
| Activity Observer | `activity-observer.yaml` | Passive desktop monitoring |
| + 12 Specialists | `roles/specialists/` | Legal, Finance, HR, etc. |

---

## 🔄 Workflow Automation

The built-in workflow engine lets you automate tasks with triggers and actions:

```
Trigger: "New file in ~/Desktop"
  → Action: Summarise file with AI
  → Action: Move to organised folder
  → Action: Notify via desktop notification
```

Workflows are managed through the desktop UI or the REST API at `http://localhost:3142/api/workflows`.

---

## 🛡️ Privacy & Security

- **All LLM inference** happens locally via Ollama by default
- **No telemetry** — disabled by default (`telemetry.enabled: false`)
- **Encrypted secrets** — API keys stored with AES-256-GCM in SQLite vault
- **Authority engine** — sensitive actions (email, payments, shell commands) require explicit approval
- **Audit trail** — all agent actions are logged with full provenance

---

## 🧪 Testing

```bat
:: Run all unit tests (1300+ tests)
cd sovereign-core
bun test

:: Validate IPC contracts (must return 0 errors before any commit)
cd sovereign-desktop
node validate.js

:: Quick health check
health-check.bat
```

CI runs automatically on every push via **GitHub Actions** (`.github/workflows/test.yml`).

---

## 📈 Roadmap

Sovereign is moving fast. Here is our current progress and planned trajectory:

| # | Feature | Status |
|---|---------|--------|
| 1 | Desktop UI + Daemon boot | ✅ Done |
| 2 | Multi-agent roles | ✅ Done |
| 3 | Desktop observers | ✅ Done |
| 4 | Workflow engine | ✅ Done |
| 5 | Hardware spec scanning | ✅ Done |
| 6 | Cognitive Brain & Graph Memory | ✅ Done |
| 7 | Local Voice Integration (Xenova/Kokoro) | ✅ Done |
| 8 | Spatial Web UI v2 & Rooms layout | ✅ Done |
| 9 | cURL / Fetch connectivity test | 🔄 In Progress |
| 10 | Screenshot capture + analysis | 📋 Planned |
| 11 | Telegram / Email channels | 📋 Planned |
| 12 | Google Workspace sync | 📋 Planned |
| 13 | Voice wake-word detection | 📋 Planned |

## 🤝 Contributing

This project is in active development. Contributions welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Run tests: `cd sovereign-core && bun test`
4. Validate contracts: `cd sovereign-desktop && node validate.js`
5. Commit and open a PR

---

## 📄 License

MIT — see [LICENSE](./sovereign-core/LICENSE)

---

<div align="center">
Built with ❤️ on Windows | Powered by Bun + Electron + Ollama
</div>
