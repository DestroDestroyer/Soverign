# Sovereign Application Comprehensive Guide & Codebase

This document serves as the absolute knowledge base, architectural reference, and unified source code repository for the **Sovereign AI Desktop Application**. It consolidates all the information, codebase structures, troubleshooting procedures, and updates implemented across both the `sovereign-core` and `sovereign-desktop` layers.

---

## 1. Architectural Overview & Services

Sovereign is a unified, local-first personal AI assistant built using **Electron (Frontend Desktop console)** and **Bun (Backend Daemon service)**. 

### 1.1 Core Components
- **Main process (`main.js`)**: Coordinates Electron windows, registers IPC (Inter-Process Communication) handlers, and controls daemon execution.
- **Preload bridge (`preload.js`)**: Safe bridge exposing `window.api` methods (with strict Electron IPC handlers validation).
- **Renderer UI (`renderer.js` / `index.html` / `index.css`)**: Dynamic glassmorphic UI showcasing health status dot, local model manager, focus mode toggle, and real-time logs.
- **Daemon (`sovereign-core`)**: The Bun backend process that runs the sqlite database, runs LLM agent workflows, manages observers (file watcher, clipboard, process list), and exposes a websocket server on port 3142.

---

## 2. Issues Diagnosed & Resolved

### 2.1 Hidden Launching on Windows Startup
- **Problem:** When configured to run at startup, the daemon would display a black Command Prompt console window on the screen.
- **Fix:** Introduced `run-hidden.vbs` VBScript wrapper, executing the command via `wscript.exe` with `vbHide` (0) flag to run Bun completely silently in the background.

### 2.2 White Screen with "Not Found" error
- **Problem:** The Sovereign Desktop Console would open but show a blank page saying "Not found".
- **Cause:** The dashboard UI assets (`ui/dist`) were either missing or failed to compile because of non-existent OpenWakeWord `.onnx` models referenced in `package.json`.
- **Fix:** Provided a fallback static `ui/index.html` file, removed the invalid `copy:models` build commands, and ensured the static assets server starts successfully.

### 2.3 System Restart / Boot-Up Failures (Self-Healing Config Loader)
- **Problem:** Every time the system restarted, the daemon refused to launch, showing a syntax parsing error for `config.yaml`.
- **Cause:** Windows abrupt shutdowns write cached file sectors incomplete, resulting in NTFS Zero-Fill corruption (where `config.yaml` is padded with null bytes). On reboot, YAML parser throws a fatal error causing immediate process termination.
- **Fix:** Enhanced `sovereign-core/src/config/loader.ts` to wrap parsing in `try/catch`. If config reading or parsing fails, it logs a warning, falls back to `DEFAULT_CONFIG` defaults to keep the daemon online, and automatically rewrites/repairs `config.yaml` with clean default values.

---

## 3. Comprehensive Source Code

Below is the complete source code for all primary files that define the Sovereign App, grouped by file path.


## SYSTEM_TROUBLESHOOTING_PROCESS.md

```markdown
# Sovereign System Troubleshooting Processes

This file outlines the standard processes to follow when encountering specific known issues with the Sovereign system, particularly involving the daemon, background service, and the UI.

## Issue 1: Black Command Prompt Window Remains on Screen
**Symptom:** After installing and launching the background service, a persistent blank command prompt window remains on the desktop with a black screen (without the "Administrator" title).
**Cause:** The Windows Scheduled Task was launching `cmd.exe /c` directly. Even with the Task Scheduler `-Hidden` setting, the console window can be forced visible by the system for the logged-in interactive user.
**Process to Fix:**
1. Do not use `cmd.exe` or `powershell.exe` directly as the Scheduled Task action.
2. Ensure the install script (`d:\Sovereign\sovereign-desktop\scripts\install-windows-tasks.ps1`) dynamically creates a `run-hidden.vbs` script.
3. Configure the Scheduled Task to run `wscript.exe` passing the VBScript and the command arguments. 
4. The VBScript uses `WshShell.Run WScript.Arguments(0), 0, False` (0 means `vbHide`) to silently launch the background daemon.

## Issue 2: White Screen with "Not Found" in the Desktop Console
**Symptom:** The Sovereign Desktop Console opens, connects to the daemon, but shows a white screen with "Not found" in the upper-left corner.
**Cause:** The daemon hosts the UI statically at `http://localhost:3142/` by serving `sovereign-core/ui/dist`. If the UI is not built, or the build failed (e.g., due to missing OpenWakeWord model files during `copy:models`), the `ui/dist` folder will be empty or missing `index.html`.
**Process to Fix:**
1. Check if `d:\Sovereign\sovereign-core\ui\index.html` exists. If not, create a basic `index.html` file in `ui/` to serve as the entry point.
2. Open `d:\Sovereign\sovereign-core\package.json`. If the `copy:models` script is failing due to missing `.onnx` files, remove the references to the non-existent files (such as `hey_sovereign_v0.1.onnx`) so the build can proceed.
3. Run `bun run build:ui` in the `d:\Sovereign\sovereign-core` directory.
4. Verify that `d:\Sovereign\sovereign-core\ui\dist\index.html` was generated successfully.
5. Restart the Desktop application to reload the webview; the UI should now render successfully.


```

---

## parse_blueprint.py

```python
import os
import re

input_file = r"C:\Users\Akash\.gemini\antigravity\brain\4b850ce7-17bf-4916-8610-18f34fd2108f\extracted_user_code.md"
output_dir = r"d:\Sovereign\sovereign-core\src"

with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

# The full code block starts after "## Full Source Code (All Files in One Block)"
if "## Full Source Code (All Files in One Block)" in content:
    content = content.split("## Full Source Code (All Files in One Block)")[1]
    # Remove the ```typescript and ``` markdown
    content = content.replace("```typescript\n", "").replace("\n```\n", "")
else:
    print("Could not find the full source code section.")
    exit(1)

# Split based on the block
# // ================================
# // FILE: filename.ts
# // ================================
pattern = re.compile(r'// ================================\n// FILE: (.+?)\n// ================================')

parts = pattern.split(content)

if len(parts) > 1:
    for i in range(1, len(parts), 2):
        filename = parts[i].strip()
        code = parts[i+1].strip()
        
        os.makedirs(output_dir, exist_ok=True)
        file_path = os.path.join(output_dir, filename)
        
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as out:
            out.write(code + '\n')
        print(f"Written {file_path}")
else:
    print("No files found!")

```

---

## sovereign-desktop/scripts/install-windows-tasks.ps1

```powershell
#Requires -RunAsAdministrator
<#
  Sovereign — Install 24/7 Background Service
  ---------------------------------------------------------------------------
  Registers the UNIFIED Sovereign Daemon as a Windows Scheduled Task.

  The daemon already manages everything internally:
    • AI chat / agent services
    • SidecarManager (Claude Code auth + connections)
    • WebSocket server on port 3142
    • Workflow engine
    • Observer + awareness services

  One task. One process. Zero complexity.

  Usage (run as Administrator):
    .\install-windows-tasks.ps1
#>

$ErrorActionPreference = 'Stop'

# ── Resolve bun.exe ──────────────────────────────────────────────────────────
function Resolve-BunPath {
  $cmd = Get-Command bun.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "bun.exe not found on PATH or at $fallback. Install Bun: https://bun.sh"
}

$bunPath = Resolve-BunPath

# ── Resolve project paths ────────────────────────────────────────────────────
# Script is at: <root>\sovereign-desktop\scripts\install-windows-tasks.ps1
$scriptDir     = $PSScriptRoot
$desktopDir    = (Get-Item $scriptDir).Parent.FullName
$workspaceRoot = (Get-Item $desktopDir).Parent.FullName
$coreDir       = Join-Path $workspaceRoot "sovereign-core"
$daemonScript  = Join-Path $coreDir "src\daemon\index.ts"

if (-not (Test-Path $daemonScript)) {
  throw "Daemon entry point not found: $daemonScript"
}

# ── Ensure data / log directory ──────────────────────────────────────────────
$dataDir = Join-Path $env:USERPROFILE ".sovereign"
$logFile = Join-Path $dataDir "sovereign.log"

if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
if (-not (Test-Path $logFile))  { New-Item -ItemType File    -Path $logFile -Force | Out-Null }

# ── Ensure config.yaml is valid (no duplicate keys) ─────────────────────────
$configFile = Join-Path $dataDir "config.yaml"
$defaultConfig = @"
llm:
  default: "ollama:qwen2.5:1.5b"
  providers:
    ollama:
      kind: ollama
      base_url: "http://127.0.0.1:11434"
  tiers: {}
"@
if (-not (Test-Path $configFile)) {
  $defaultConfig | Set-Content $configFile -Encoding UTF8
  Write-Host "[OK] Created default config.yaml" -ForegroundColor Green
}

# ── Print summary ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Bun:    $bunPath"     -ForegroundColor Cyan
Write-Host "Core:   $coreDir"    -ForegroundColor Cyan
Write-Host "Entry:  $daemonScript" -ForegroundColor Cyan
Write-Host "Log:    $logFile"    -ForegroundColor Cyan
Write-Host ""

# ── Remove old separate tasks (clean up legacy setup) ────────────────────────
foreach ($old in @('SovereignDaemon','SovereignSidecar')) {
  Unregister-ScheduledTask -TaskName $old -Confirm:$false -ErrorAction SilentlyContinue
}

# ── Build the single unified task ────────────────────────────────────────────
# We use a .vbs wrapper to launch cmd.exe silently so no black window remains.
$vbsScript = Join-Path $dataDir "run-hidden.vbs"
$vbsContent = "Set WshShell = CreateObject(`"WScript.Shell`")`nWshShell.Run WScript.Arguments(0), 0, False"
Set-Content -Path $vbsScript -Value $vbsContent -Encoding Ascii

# cmd.exe wrapping ensures bun stdout/stderr are flushed to the log file
$cmdArg = "/c `"`"$bunPath`" run `"$daemonScript`" >> `"$logFile`" 2>&1`""
$taskArg = "`"$vbsScript`" `"cmd.exe $cmdArg`""

$action   = New-ScheduledTaskAction -Execute "wscript.exe" -Argument $taskArg -WorkingDirectory $coreDir
$trigger  = New-ScheduledTaskTrigger -AtLogOn

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -Hidden

Register-ScheduledTask `
  -TaskName    "SovereignService" `
  -Action      $action `
  -Trigger     $trigger `
  -Settings    $settings `
  -RunLevel    Highest `
  -Description "Sovereign unified AI daemon. Manages all AI, sidecar, and workflow services. Runs 24/7, auto-restarts on crash." | Out-Null

Write-Host "[OK] SovereignService task registered." -ForegroundColor Green

# ── Start task immediately ────────────────────────────────────────────────────
Write-Host "Starting service now..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "SovereignService"
Start-Sleep -Seconds 2

$status = (Get-ScheduledTaskInfo -TaskName "SovereignService").LastTaskResult
Write-Host "[OK] SovereignService started (last result: $status)." -ForegroundColor Green

Write-Host ""
Write-Host "Done! Sovereign now runs 24/7, survives app close, and auto-restarts on crash." -ForegroundColor Cyan
Write-Host "Manage via Task Scheduler (taskschd.msc) or the Sovereign Console." -ForegroundColor Cyan

```

---

## sovereign-core/src/index.ts

```typescript
import { RepositoryService } from './repository';
import { DesktopApp } from './desktop';
import { Daemon } from './daemon';
import { Sidecar } from './sidecar';
import { AuthorityService } from './authority';
import { GoalsService } from './goals';
import { AwarenessService } from './awareness';
import { TelemetryService } from './telemetry';
import { VoiceStack } from './voice';
import { BrainManager } from './brain';
import { RetryManager } from './retry';
import { HealthMonitor } from './health';
import { MemoryManager } from './memory';
import { GraphifyService } from './graphify';
import { ObsidianIntegration } from './obsidian';
import { FailoverService } from './failover';
import { WindowsIntegration } from './windows';
import { SecurityService } from './security';
import { AutomationService } from './automation';
import { RoadmapService } from './roadmap';
import { logger } from './interfaces';

async function main() {
  const repo = new RepositoryService();
  const desktop = new DesktopApp();
  const daemon = new Daemon();
  const sidecar = new Sidecar();
  const auth = new AuthorityService();
  const goals = new GoalsService();
  const awareness = new AwarenessService();
  const telemetry = new TelemetryService();
  const voice = new VoiceStack();
  const brain = new BrainManager();
  const retry = new RetryManager();
  const health = new HealthMonitor();
  const memory = new MemoryManager();
  const graph = new GraphifyService();
  const obsidian = new ObsidianIntegration();
  const failover = new FailoverService();
  const windows = new WindowsIntegration();
  const security = new SecurityService();
  const automation = new AutomationService();
  const roadmap = new RoadmapService();

  health.registerService('repository', repo);
  health.registerService('desktop', desktop);
  health.registerService('daemon', daemon);
  health.registerService('sidecar', sidecar);
  health.registerService('authority', auth);
  health.registerService('goals', goals);
  health.registerService('awareness', awareness);
  health.registerService('telemetry', telemetry);
  health.registerService('voice', voice);
  health.registerService('brain', brain);
  health.registerService('retry', retry);
  health.registerService('memory', memory);
  health.registerService('graphify', graph);
  health.registerService('obsidian', obsidian);
  health.registerService('failover', failover);
  health.registerService('windows', windows);
  health.registerService('security', security);
  health.registerService('automation', automation);
  health.registerService('roadmap', roadmap);

  await repo.start();
  await desktop.start();
  await daemon.start();
  await sidecar.start();
  await auth.start();
  await goals.start();
  await awareness.start();
  await telemetry.start();
  await voice.start();
  await brain.start();
  await retry.start();
  await memory.start();
  await graph.start();
  await obsidian.start();
  await failover.start();
  await windows.start();
  await security.start();
  await automation.start();
  await roadmap.start();
  await health.start();

  logger.info('All services started successfully.');
}

main().catch(err => {
  logger.error('Fatal error', err);
  process.exit(1);
});

```

---

## sovereign-core/src/authority.ts

```typescript
import { Service, bus, logger } from './interfaces';

interface User {
  id: string;
  roles: string[];
}

export class AuthorityService implements Service {
  private users = new Map<string, User>();
  private running = false;

  async start() {
    logger.info('AuthorityService starting...');
    bus.on('auth:login', (creds) => this.login(creds));
    bus.on('auth:check', (data) => this.checkPermission(data));
    this.running = true;
    bus.emit('authority:ready', {});
  }

  async stop() {
    logger.info('AuthorityService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private login({ username, password }: any) {
    const user = this.users.get(username) || { id: username, roles: ['user'] };
    bus.emit('auth:token', { token: 'jwt-token', user });
  }

  private checkPermission({ userId, resource, action }: any) {
    const user = this.users.get(userId);
    const allowed = user && user.roles.includes('admin');
    bus.emit('auth:permission', { allowed });
  }

  addUser(user: User) {
    this.users.set(user.id, user);
  }
}

```

---

## sovereign-core/src/automation.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class AutomationService implements Service {
  private running = false;

  async start() {
    logger.info('AutomationService starting...');
    bus.on('automation:run', (data) => this.runAutomation(data));
    this.running = true;
    bus.emit('automation:ready', {});
  }

  async stop() {
    logger.info('AutomationService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private runAutomation({ script, params }: any) {
    logger.info(`Running automation: ${script}`);
    const result = `Automation result for ${script}`;
    bus.emit('automation:result', { result });
  }
}

```

---

## sovereign-core/src/awareness.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class AwarenessService implements Service {
  private running = false;

  async start() {
    logger.info('AwarenessService starting...');
    bus.on('awareness:snapshot', () => this.takeSnapshot());
    this.running = true;
    bus.emit('awareness:ready', {});
  }

  async stop() {
    logger.info('AwarenessService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private takeSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      activeWindow: 'Sovereign Deep',
      userPresent: true,
      screenContent: '...',
    };
    bus.emit('awareness:snapshot-result', snapshot);
  }
}

```

---

## sovereign-core/src/brain.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class BrainManager implements Service {
  private running = false;

  async start() {
    logger.info('BrainManager starting...');
    bus.on('brain:query', (data) => this.processQuery(data));
    bus.on('brain:context', (data) => this.updateContext(data));
    this.running = true;
    bus.emit('brain:ready', {});
  }

  async stop() {
    logger.info('BrainManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processQuery({ prompt, history }: any) {
    const response = `Response to: ${prompt}`;
    bus.emit('brain:response', { response });
  }

  private updateContext(context: any) {
    bus.emit('brain:context-updated', { context });
  }
}

```

---

## sovereign-core/src/daemon.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class Daemon implements Service {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;

  async start() {
    logger.info('Daemon starting...');
    bus.on('daemon:schedule', (data) => this.scheduleTask(data));
    this.intervalId = setInterval(() => this.heartbeat(), 5000);
    this.running = true;
    bus.emit('daemon:ready', {});
  }

  async stop() {
    logger.info('Daemon stopping...');
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private heartbeat() {
    bus.emit('daemon:heartbeat', { timestamp: Date.now() });
  }

  private scheduleTask(task: any) {
    logger.info('Daemon executing task', task);
  }
}

```

---

## sovereign-core/src/desktop.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class DesktopApp implements Service {
  private running = false;

  async start() {
    logger.info('DesktopApp starting...');
    bus.on('repository:changed', (data) => this.onDataChanged(data));
    bus.on('goals:updated', (data) => this.onGoalsUpdated(data));
    this.running = true;
    bus.emit('desktop:ready', {});
  }

  async stop() {
    logger.info('DesktopApp stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  onUserCommand(command: string) {
    bus.emit('desktop:command', { command });
  }

  onDataChanged(data: any) {
    logger.debug('Desktop: data changed', data);
  }

  onGoalsUpdated(data: any) {
    logger.debug('Desktop: goals updated', data);
  }

  sendVoiceInput(audioBuffer: Buffer) {
    bus.emit('voice:input', { audio: audioBuffer });
  }
}

```

---

## sovereign-core/src/failover.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class FailoverService implements Service {
  private primary: Service | null = null;
  private secondary: Service | null = null;
  private active: 'primary' | 'secondary' = 'primary';
  private running = false;

  registerPrimary(service: Service) { this.primary = service; }
  registerSecondary(service: Service) { this.secondary = service; }

  async start() {
    logger.info('FailoverService starting...');
    bus.on('failover:trigger', () => this.switchOver());
    this.running = true;
    bus.emit('failover:ready', {});
  }

  async stop() {
    logger.info('FailoverService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async switchOver() {
    const current = this.active === 'primary' ? this.primary : this.secondary;
    const next = this.active === 'primary' ? this.secondary : this.primary;
    if (next) {
      await next.start();
      await current?.stop();
      this.active = this.active === 'primary' ? 'secondary' : 'primary';
      logger.info(`Failover: switched to ${this.active}`);
      bus.emit('failover:switched', { active: this.active });
    }
  }
}

```

---

## sovereign-core/src/goals.ts

```typescript
import { Service, bus, logger } from './interfaces';

interface Goal {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export class GoalsService implements Service {
  private goals = new Map<string, Goal>();
  private running = false;

  async start() {
    logger.info('GoalsService starting...');
    bus.on('goals:create', (data) => this.createGoal(data));
    bus.on('goals:update', (data) => this.updateGoal(data));
    bus.on('goals:list', () => this.listGoals());
    this.running = true;
    bus.emit('goals:ready', {});
  }

  async stop() {
    logger.info('GoalsService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createGoal(goal: Partial<Goal>) {
    const id = `goal-${Date.now()}`;
    const newGoal: Goal = { id, description: goal.description || '', status: 'pending', ...goal };
    this.goals.set(id, newGoal);
    bus.emit('goals:created', newGoal);
  }

  private updateGoal({ id, status }: any) {
    const goal = this.goals.get(id);
    if (goal) {
      goal.status = status;
      bus.emit('goals:updated', goal);
    }
  }

  private listGoals() {
    const all = Array.from(this.goals.values());
    bus.emit('goals:list-result', { goals: all });
  }
}

```

---

## sovereign-core/src/graphify.ts

```typescript
import { Service, bus, logger } from './interfaces';

interface Node { id: string; label: string; properties: any; }
interface Edge { from: string; to: string; label: string; properties: any; }

export class GraphifyService implements Service {
  private nodes = new Map<string, Node>();
  private edges: Edge[] = [];
  private running = false;

  async start() {
    logger.info('GraphifyService starting...');
    bus.on('graph:add-node', (data) => this.addNode(data));
    bus.on('graph:add-edge', (data) => this.addEdge(data));
    bus.on('graph:query', (data) => this.queryGraph(data));
    this.running = true;
    bus.emit('graphify:ready', {});
  }

  async stop() {
    logger.info('GraphifyService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addNode(node: Node) {
    this.nodes.set(node.id, node);
    bus.emit('graph:node-added', node);
  }

  private addEdge(edge: Edge) {
    this.edges.push(edge);
    bus.emit('graph:edge-added', edge);
  }

  private queryGraph({ query }: any) {
    const results = this.nodes.values();
    bus.emit('graph:query-result', { results: Array.from(results) });
  }
}

```

---

## sovereign-core/src/health.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class HealthMonitor implements Service {
  private running = false;
  private intervalId: NodeJS.Timeout | null = null;
  private services: Map<string, Service> = new Map();

  registerService(name: string, service: Service) {
    this.services.set(name, service);
  }

  async start() {
    logger.info('HealthMonitor starting...');
    this.intervalId = setInterval(() => this.checkAll(), 10000);
    this.running = true;
    bus.emit('health:ready', {});
  }

  async stop() {
    logger.info('HealthMonitor stopping...');
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async checkAll() {
    for (const [name, service] of this.services) {
      try {
        const status = await service.health();
        bus.emit('health:status', { service: name, status });
      } catch (err) {
        bus.emit('health:error', { service: name, error: err });
      }
    }
  }
}

```

---

## sovereign-core/src/interfaces.ts

```typescript
export interface Service {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }>;
}

export type EventCallback = (data: any) => void;

export class EventBus {
  private listeners: Map<string, EventCallback[]> = new Map();

  on(event: string, callback: EventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(callback);
  }

  emit(event: string, data: any) {
    const callbacks = this.listeners.get(event) || [];
    for (const cb of callbacks) cb(data);
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx !== -1) callbacks.splice(idx, 1);
    }
  }
}

export const bus = new EventBus();

```

---

## sovereign-core/src/logger.ts

```typescript
export const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
};

```

---

## sovereign-core/src/memory.ts

```typescript
import { Service, bus, logger } from './interfaces';

interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  timestamp: number;
}

export class MemoryManager implements Service {
  private shortTerm: MemoryEntry[] = [];
  private longTerm: Map<string, MemoryEntry> = new Map();
  private running = false;

  async start() {
    logger.info('MemoryManager starting...');
    bus.on('memory:store', (data) => this.storeMemory(data));
    bus.on('memory:recall', (data) => this.recallMemory(data));
    this.running = true;
    bus.emit('memory:ready', {});
  }

  async stop() {
    logger.info('MemoryManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private storeMemory({ content, longTerm = false }: any) {
    const entry: MemoryEntry = {
      id: `mem-${Date.now()}`,
      content,
      timestamp: Date.now(),
    };
    if (longTerm) {
      this.longTerm.set(entry.id, entry);
    } else {
      this.shortTerm.push(entry);
      if (this.shortTerm.length > 100) this.shortTerm.shift();
    }
    bus.emit('memory:stored', entry);
  }

  private recallMemory({ query }: any) {
    const results = this.shortTerm.filter(e => e.content.includes(query));
    bus.emit('memory:recall-result', { results });
  }
}

```

---

## sovereign-core/src/obsidian.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class ObsidianIntegration implements Service {
  private running = false;

  async start() {
    logger.info('ObsidianIntegration starting...');
    bus.on('obsidian:create-note', (data) => this.createNote(data));
    bus.on('obsidian:search', (data) => this.searchNotes(data));
    this.running = true;
    bus.emit('obsidian:ready', {});
  }

  async stop() {
    logger.info('ObsidianIntegration stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private createNote({ title, content }: any) {
    const note = { id: `note-${Date.now()}`, title, content };
    bus.emit('obsidian:note-created', note);
  }

  private searchNotes({ query }: any) {
    const results: any[] = [];
    bus.emit('obsidian:search-result', { results });
  }
}

```

---

## sovereign-core/src/repository.ts

```typescript
import { Service, EventBus, bus, logger } from './interfaces';

interface Entity { id: string; [key: string]: any; }

export class RepositoryService implements Service {
  private store = new Map<string, Entity>();
  private running = false;

  async start() {
    logger.info('RepositoryService starting...');
    this.running = true;
    bus.emit('repository:ready', {});
  }

  async stop() {
    logger.info('RepositoryService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  create(entity: Entity): Entity {
    this.store.set(entity.id, entity);
    bus.emit('repository:changed', { action: 'create', entity });
    return entity;
  }

  read(id: string): Entity | undefined {
    return this.store.get(id);
  }

  update(id: string, data: Partial<Entity>): Entity | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    bus.emit('repository:changed', { action: 'update', entity: updated });
    return updated;
  }

  delete(id: string): boolean {
    const result = this.store.delete(id);
    if (result) bus.emit('repository:changed', { action: 'delete', id });
    return result;
  }

  query(filter: (e: Entity) => boolean): Entity[] {
    return Array.from(this.store.values()).filter(filter);
  }

  getAll(): Entity[] {
    return Array.from(this.store.values());
  }
}

```

---

## sovereign-core/src/retry.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class RetryManager implements Service {
  private running = false;

  async start() {
    logger.info('RetryManager starting...');
    bus.on('retry:execute', (data) => this.executeWithRetry(data));
    this.running = true;
    bus.emit('retry:ready', {});
  }

  async stop() {
    logger.info('RetryManager stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private async executeWithRetry({ task, maxAttempts = 3 }: any) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        const result = await task();
        bus.emit('retry:success', { result });
        return;
      } catch (err) {
        attempts++;
        logger.warn(`Retry attempt ${attempts} failed`);
        await this.delay(1000 * Math.pow(2, attempts));
      }
    }
    bus.emit('retry:failed', { error: 'All attempts exhausted' });
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

```

---

## sovereign-core/src/roadmap.ts

```typescript
import { Service, bus, logger } from './interfaces';

interface Milestone {
  id: string;
  description: string;
  targetDate: Date;
  status: 'pending' | 'in-progress' | 'completed';
}

export class RoadmapService implements Service {
  private milestones: Milestone[] = [];
  private running = false;

  async start() {
    logger.info('RoadmapService starting...');
    bus.on('roadmap:add', (data) => this.addMilestone(data));
    bus.on('roadmap:list', () => this.listMilestones());
    this.running = true;
    bus.emit('roadmap:ready', {});
  }

  async stop() {
    logger.info('RoadmapService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private addMilestone(milestone: Partial<Milestone>) {
    const newMilestone: Milestone = {
      id: `ms-${Date.now()}`,
      description: milestone.description || '',
      targetDate: milestone.targetDate || new Date(),
      status: 'pending',
      ...milestone,
    };
    this.milestones.push(newMilestone);
    bus.emit('roadmap:added', newMilestone);
  }

  private listMilestones() {
    bus.emit('roadmap:list-result', { milestones: this.milestones });
  }
}

```

---

## sovereign-core/src/security.ts

```typescript
import { Service, bus, logger } from './interfaces';
import crypto from 'crypto';

export class SecurityService implements Service {
  private running = false;
  private key: Buffer | null = null;

  async start() {
    logger.info('SecurityService starting...');
    this.key = crypto.randomBytes(32);
    bus.on('security:encrypt', (data) => this.encrypt(data));
    bus.on('security:decrypt', (data) => this.decrypt(data));
    this.running = true;
    bus.emit('security:ready', {});
  }

  async stop() {
    logger.info('SecurityService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private encrypt({ plaintext }: any) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key!, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    bus.emit('security:encrypted', { encrypted, iv: iv.toString('hex'), authTag: authTag.toString('hex') });
  }

  private decrypt({ encrypted, iv, authTag }: any) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key!, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let plaintext = decipher.update(encrypted, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    bus.emit('security:decrypted', { plaintext });
  }
}

```

---

## sovereign-core/src/sidecar.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class Sidecar implements Service {
  private running = false;

  async start() {
    logger.info('Sidecar starting...');
    bus.on('sidecar:forward', (data) => this.forwardRequest(data));
    bus.on('sidecar:log', (data) => this.logData(data));
    this.running = true;
    bus.emit('sidecar:ready', {});
  }

  async stop() {
    logger.info('Sidecar stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private forwardRequest(request: any) {
    logger.debug('Sidecar forwarding', request);
    bus.emit('sidecar:forwarded', { original: request });
  }

  private logData(data: any) {
    logger.info('Sidecar log:', data);
  }
}

```

---

## sovereign-core/src/telemetry.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class TelemetryService implements Service {
  private metrics: any[] = [];
  private running = false;

  async start() {
    logger.info('TelemetryService starting...');
    bus.on('telemetry:record', (data) => this.recordMetric(data));
    this.running = true;
    bus.emit('telemetry:ready', {});
  }

  async stop() {
    logger.info('TelemetryService stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private recordMetric(metric: any) {
    this.metrics.push({ ...metric, timestamp: Date.now() });
    logger.debug('Telemetry metric', metric);
  }

  getMetrics() {
    return this.metrics;
  }
}

```

---

## sovereign-core/src/voice.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class VoiceStack implements Service {
  private running = false;

  async start() {
    logger.info('VoiceStack starting...');
    bus.on('voice:input', (data) => this.processAudio(data));
    bus.on('voice:speak', (data) => this.synthesize(data));
    this.running = true;
    bus.emit('voice:ready', {});
  }

  async stop() {
    logger.info('VoiceStack stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private processAudio({ audio }: any) {
    const text = '[transcribed text]';
    bus.emit('voice:transcription', { text });
  }

  private synthesize({ text }: any) {
    const audioBuffer = Buffer.from('fake audio');
    bus.emit('voice:audio-output', { audio: audioBuffer });
  }
}

```

---

## sovereign-core/src/windows.ts

```typescript
import { Service, bus, logger } from './interfaces';

export class WindowsIntegration implements Service {
  private running = false;

  async start() {
    logger.info('WindowsIntegration starting...');
    bus.on('windows:get-active-window', () => this.getActiveWindow());
    bus.on('windows:send-keys', (data) => this.sendKeys(data));
    this.running = true;
    bus.emit('windows:ready', {});
  }

  async stop() {
    logger.info('WindowsIntegration stopping...');
    this.running = false;
  }

  async health() {
    return { status: this.running ? 'healthy' : 'unhealthy' };
  }

  private getActiveWindow() {
    const windowInfo = { title: 'Sovereign Deep', handle: 0x1234 };
    bus.emit('windows:active-window', windowInfo);
  }

  private sendKeys({ keys }: any) {
    logger.info(`Sending keys: ${keys}`);
    bus.emit('windows:keys-sent', { success: true });
  }
}

```

---

## sovereign-core/ui/index.html

```html
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Sovereign Daemon</title><style>body { background-color: #0b0b1a; color: #e0e0ff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .container { text-align: center; padding: 2rem; border: 1px solid #3b3b8a; border-radius: 8px; background: rgba(0,0,0,0.4); } h1 { color: #00f2fe; }</style></head><body><div class="container"><h1>Sovereign Core Daemon</h1><p>The daemon is running and successfully connected.</p></div></body></html>

```

---

## sovereign-core/src/config/loader.ts

```typescript
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

```

---

## sovereign-core/src/config/types.ts

```typescript
export type HeartbeatConfig = {
  interval_minutes: number;
  active_hours: { start: number; end: number };
  aggressiveness: 'passive' | 'moderate' | 'aggressive';
};

/**
 * System-level cron expressions. Published as `cron.<name>` events on the
 * shared event bus so other subsystems can react instead of polling.
 */
export type SystemCronConfig = {
  morning?: string;   // default "0 7 * * *"
  evening?: string;   // default "0 20 * * *"
  hourly?: string;    // default "37 * * * *"
};

export type GoogleConfig = {
  client_id: string;
  client_secret: string;
};

export type ChannelConfig = {
  telegram?: {
    enabled: boolean;
    bot_token: string;
    allowed_users: number[];  // Telegram user IDs
  };
  discord?: {
    enabled: boolean;
    bot_token: string;
    allowed_users: string[];  // Discord user IDs
    guild_id?: string;        // restrict to single guild
  };
};

export type WakeEngine = 'openwakeword' | 'webspeech' | 'auto';

/**
 * OpenAI realtime reasoning-effort ladder. Higher = more deliberate answers at
 * the cost of latency and tokens. User-selectable in the Voice settings UI.
 * Default is "low" (OpenAI's default for gpt-realtime-2).
 */
export type RealtimeReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Premium opt-in speech-to-speech voice via OpenAI's Realtime API
 * (`gpt-realtime-2`). When enabled, the realtime session reuses the OpenAI
 * provider configured under `llm.providers` (matched by `kind: 'openai'`) -
 * there is no separate realtime key. When disabled (default) SOVEREIGN uses the
 * standard STT -> text LLM -> TTS pipeline.
 *
 * See docs/GPT_REALTIME_2_INTEGRATION.md.
 */
export type RealtimeVoiceConfig = {
  /** Master opt-in. Default false. Env: SOVEREIGN_REALTIME_VOICE. */
  enabled: boolean;
  /** Realtime model id. Default 'gpt-realtime-2'. */
  model?: string;
  /** OpenAI realtime voice id (e.g. 'marin', 'cedar'). */
  voice?: string;
  /** User-selectable reasoning effort (settings UI). Default 'low'. */
  reasoning_effort?: RealtimeReasoningEffort;
  /** Hard cap on a single realtime session length (cost guard). Default 10. */
  max_session_minutes?: number;
  /** Optional monthly USD spend ceiling; block new sessions past it. */
  monthly_budget_usd?: number;
  /**
   * Action categories that stay BLOCKED even though realtime auto-approves
   * everything else (safety backstop for destructive/irreversible tools).
   * When unset, defaults to all `destructive`-impact categories (payments,
   * deletes, shell exec, installs, settings changes, agent termination) so an
   * open mic can't trigger them unattended — see DEFAULT_BLOCKED_CATEGORIES.
   * Set to an explicit array (including `[]`) to override the default. Phase 3.
   */
  blocked_categories?: string[];
};

export type VoiceConfig = {
  /**
   * Wake-word engine used by the browser UI.
   *  - "openwakeword": local on-device model (default, private).
   *  - "webspeech":    browser SpeechRecognition (Chromium only; streams audio
   *                    to the browser vendor's cloud for transcription).
   *  - "auto":         prefer webspeech when available, fall back to openwakeword.
   * Env: SOVEREIGN_WAKE_ENGINE
   */
  wake_engine: WakeEngine;
  /** Premium opt-in realtime speech-to-speech voice (gpt-realtime-2). */
  realtime?: RealtimeVoiceConfig;
};

export type STTConfig = {
  provider: 'openai' | 'groq' | 'local' | 'sarvam';
  openai?: { api_key: string; model?: string };
  groq?: { api_key: string; model?: string };
  local?: { endpoint: string; model?: string; server_type?: 'whisper_cpp' | 'openai_compatible' };
  sarvam?: { api_key: string; model?: string; language?: string };
};

export type TTSConfig = {
  enabled: boolean;
  provider?: 'edge' | 'elevenlabs' | 'sarvam';  // default: 'edge'
  voice?: string;       // e.g. 'en-US-AriaNeural' (edge)
  rate?: string;        // e.g. '+0%', '+10%' (edge)
  volume?: string;      // e.g. '+0%' (edge)
  elevenlabs?: {
    api_key: string;
    voice_id?: string;
    model?: string;           // 'eleven_flash_v2_5' | 'eleven_multilingual_v2'
    stability?: number;       // 0-1
    similarity_boost?: number; // 0-1
  };
  sarvam?: {
    api_key: string;
    model?: string;
    language?: string;
    speaker?: string;
    sampling_rate?: number;
  };
};

export type DesktopConfig = {
  enabled: boolean;
  sidecar_port: number;
  sidecar_path?: string;
  auto_launch: boolean;
  tree_depth: number;
  snapshot_max_elements: number;
};

export type AwarenessConfig = {
  enabled: boolean;
  capture_interval_ms: number;
  min_change_threshold: number;       // 0.0-1.0 pixel diff percentage
  cloud_vision_enabled: boolean;
  cloud_vision_cooldown_ms: number;
  stuck_threshold_ms: number;
  struggle_grace_ms: number;          // min time before struggle fires
  struggle_cooldown_ms: number;       // min gap between struggle detections
  suggestion_rate_limit_ms: number;
  overlay_autolaunch: boolean;        // auto-open floating overlay widget on start
  retention: {
    full_hours: number;
    key_moment_hours: number;
  };
};

export type PerActionOverride = {
  action: string;            // ActionCategory
  role_id?: string;
  allowed: boolean;
  requires_approval?: boolean;
};

export type ContextRule = {
  id: string;
  action: string;            // ActionCategory
  condition: 'time_range' | 'tool_name' | 'always';
  params: Record<string, unknown>;
  effect: 'allow' | 'deny' | 'require_approval';
  description: string;
};

export type AuthorityConfig = {
  default_level: number;
  governed_categories: string[];       // ActionCategory[]
  overrides: PerActionOverride[];
  context_rules: ContextRule[];
  learning: {
    enabled: boolean;
    suggest_threshold: number;
  };
  emergency_state: 'normal' | 'paused' | 'killed';
};

export type WorkflowConfig = {
  enabled: boolean;
  maxConcurrentExecutions: number;
  defaultRetries: number;
  defaultTimeoutMs: number;
  selfHealEnabled: boolean;
  autoSuggestEnabled: boolean;
};

export type GoalConfig = {
  enabled: boolean;
  morning_window: { start: number; end: number };
  evening_window: { start: number; end: number };
  accountability_style: 'drill_sergeant' | 'supportive' | 'balanced';
  escalation_weeks: { pressure: number; root_cause: number; suggest_kill: number };
  auto_decompose: boolean;
  calendar_ownership: boolean;
};

export type AuthConfig = {
  /** Shared secret token. If unset, auth is disabled (open access). Env: SOVEREIGN_AUTH_TOKEN */
  token?: string;
};

export type UserConfig = {
  name?: string;
};

/**
 * Anonymous usage telemetry. Opt-out model: enabled by default so the
 * project can measure unique installs and retention. Disable with
 * `enabled: false`, the `SOVEREIGN_TELEMETRY=0` env var, or the community
 * standard `DO_NOT_TRACK=1`.
 */
export type TelemetryConfig = {
  enabled: boolean;
};

/**
 * Onboarding completion state — persists in `~/.sovereign/config.yaml` so
 * the dashboard knows which phase (setup / profile interview / tutorial)
 * to show on next load. Each `*_completed_at` is a `Date.now()` stamp;
 * `null` means not yet done. Reset endpoint clears subsets per scope.
 *
 * See `docs/ONBOARDING_PLAN.md` for the gate logic and reset semantics.
 */
export type OnboardingConfig = {
  /** Phase A — LLM provider + key + model + TTS choice all saved. */
  setup_completed_at: number | null;
  /** Phase B opt-out — user clicked Skip on the profile interview. */
  setup_skipped_profile?: boolean;
  /** Phase C completion stamp. */
  tutorial_completed_at: number | null;
  /** Phase C dismissal stamp (one-shot snooze; user can replay). */
  tutorial_dismissed_at?: number | null;
  /** Resume key for an in-progress tutorial. */
  tutorial_progress_step?: string;
  /** Set by the reset endpoint — useful for debugging "did the reset
   *  actually fire" or rate-limiting accidental resets later. */
  last_reset_at?: number;
};

/**
 * LLM provider classes that the system knows how to instantiate. The `kind`
 * field on a provider entry selects one of these; the canonical default is
 * the provider's name (the key in `providers`).
 */
export type LLMProviderKind =
  | 'anthropic'
  | 'openai'
  | 'groq'
  | 'gemini'
  | 'ollama'
  | 'openrouter'
  | 'nvidia'
  | 'openai_compatible'
  | 'litellm';

/**
 * Credentials + endpoint for one provider instance. The `kind` field is
 * optional; when absent, the key in `LLMConfig.providers` is assumed to be
 * the provider class (e.g. `anthropic`). Specify `kind` explicitly when you
 * want multiple instances of the same class (e.g. two ollama backends with
 * different keys/URLs).
 * 
 * FIXED: api_key is now required for cloud providers, optional only for
 * local/self-hosted providers (identified by kind: 'ollama', 'openai_compatible').
 */
export type LLMProviderEntry = {
  /** Which provider class to use. Defaults to the map key. */
  kind?: LLMProviderKind;
  /** API key for cloud providers. Required unless using local/self-hosted. */
  api_key?: string;
  /** Base URL for self-hosted / local providers (ollama, openai-compatible, litellm). */
  base_url?: string;
};

/**
 * Model reference string in the form "<provider-name>:<model-id>" where
 * `provider-name` is a key in `LLMConfig.providers`. Examples:
 *   "anthropic:claude-sonnet-4-6"
 *   "openai:gpt-4o-mini"
 *   "ollama:llama3"
 *   "ollama-remote:qwen2.5"   (custom-named provider instance)
 */
export type LLMModelRef = string;

export type LLMTiersConfig = {
  conversation?: LLMModelRef;
  high?: LLMModelRef;
  medium?: LLMModelRef;
  low?: LLMModelRef;
};

export type LLMConfig = {
  /** Primary provider (e.g. 'ollama') */
  primary?: string;
  /** Sequenced fallback providers (e.g. ['anthropic']) */
  fallback?: string[];

  /**
   * Provider credentials, keyed by the name you reference them as in model
   * strings. Set `kind` when you want a custom name (e.g. two ollama
   * instances "ollama-local" + "ollama-remote", both with kind=ollama).
   */
  providers?: Record<string, LLMProviderEntry>;

  /**
   * Single-LLM mode model reference. When set and `tiers` is absent, all
   * task tiers (low/medium/high) resolve to this model and the classic
   * orchestrator runs. Ignored when `tiers` is configured.
   */
  default?: LLMModelRef;

  /**
   * Per-tier model map. This is the in-memory runtime representation, sourced
   * EXCLUSIVELY from the DB (dashboard-managed) - it is NOT read from or
   * written to config.yaml. Any `llm.tiers` block in config.yaml is discarded
   * on load and stripped on save; only the single-LLM `default` may be set via
   * the config file. The `conversation` tier switches the system into
   * router-first mode (conv LLM delegates to task tiers); task tiers
   * (low/medium/high) without an explicit assignment fall up.
   */
  tiers?: LLMTiersConfig;
};

export type SovereignConfig = {
  user?: UserConfig;
  onboarding?: OnboardingConfig;
  telemetry?: TelemetryConfig;
  daemon: {
    port: number;
    data_dir: string;
    db_path: string;
    /**
     * Canonical origin signed into sidecar enrollment JWTs as the `brain`
     * (WebSocket) and `jwks` (public-key fetch) claims, so this is what the
     * sidecar will keep using once enrolled.
     *
     * NOT the brain's bind address. If the brain is fronted by a reverse
     * proxy or accessed across NAT, this must be the externally-reachable
     * URL (e.g. `https://brain.example.com` or `wss://brain.example.com`),
     * not the internal `localhost:PORT` the brain listens on.
     *
     * Accepts a full URL (`https://...`, `wss://...`) or a bare host[:port]
     * (`brain.example.com`, `10.0.0.5:3142`). Bare local hosts default to
     * ws/http; everything else defaults to wss/https.
     *
     * Precedence: `SOVEREIGN_BRAIN_DOMAIN` env var > this field > internal
     * `localhost:<port>` fallback (with a startup warning).
     *
     * Sidecars must be able to reach both derived endpoints from the
     * enrolled machine, or JWKS fetch / WebSocket connect will fail until
     * the token is re-issued with a reachable origin.
     */
    brain_domain?: string;
  };
  auth?: AuthConfig;
  google?: GoogleConfig;
  channels?: ChannelConfig;
  stt?: STTConfig;
  tts?: TTSConfig;
  voice?: VoiceConfig;
  desktop?: DesktopConfig;
  awareness?: AwarenessConfig;
  llm: LLMConfig;
  personality: {
    core_traits: string[];
    assistant_name?: string;
  };
  workflows?: WorkflowConfig;
  goals?: GoalConfig;
  sites?: {
    enabled: boolean;
    projects_dir: string;
    port_range_start: number;
    port_range_end: number;
    auto_commit: boolean;
    max_concurrent_servers: number;
  };
  authority: AuthorityConfig;
  heartbeat: HeartbeatConfig;
  cron?: SystemCronConfig;
  active_role: string;  // role file name
};

export const DEFAULT_CONFIG: SovereignConfig = {
  user: {
    name: '',
  },
  telemetry: {
    enabled: true,
  },
  daemon: {
    port: 3142,
    data_dir: '~/.sovereign',
    db_path: '~/.sovereign/sovereign.db',
  },
  channels: {
    telegram: { enabled: false, bot_token: '', allowed_users: [] },
    discord: { enabled: false, bot_token: '', allowed_users: [] },
  },
  stt: {
    provider: 'openai',
  },
  tts: {
    enabled: false,
    provider: 'edge',
    voice: 'en-US-AriaNeural',
    rate: '+0%',
    volume: '+0%',
  },
  voice: {
    wake_engine: 'openwakeword',
    realtime: {
      enabled: false,
      model: 'gpt-realtime-2',
      reasoning_effort: 'low',
      max_session_minutes: 10,
    },
  },
  desktop: {
    enabled: true,
    sidecar_port: 9224,
    auto_launch: true,
    tree_depth: 5,
    snapshot_max_elements: 60,
  },
  awareness: {
    enabled: true,
    capture_interval_ms: 7000,
    min_change_threshold: 0.02,
    cloud_vision_enabled: true,
    cloud_vision_cooldown_ms: 30000,
    stuck_threshold_ms: 120000,
    struggle_grace_ms: 45000,
    struggle_cooldown_ms: 90000,
    suggestion_rate_limit_ms: 60000,
    overlay_autolaunch: true,
    retention: {
      full_hours: 1,
      key_moment_hours: 24,
    },
  },
  llm: {
    providers: {},
    tiers: {},
  },
  personality: {
    core_traits: [
      'loyal',
      'efficient',
      'proactive',
      'respectful',
      'adaptive',
    ],
    assistant_name: 'Sovereign',
  },
  sites: {
    enabled: true,
    projects_dir: '~/.sovereign/projects',
    port_range_start: 4000,
    port_range_end: 4999,
    auto_commit: true,
    max_concurrent_servers: 3,
  },
  authority: {
    default_level: 3,
    governed_categories: ['send_email', 'send_message', 'make_payment'],
    overrides: [],
    context_rules: [],
    learning: {
      enabled: true,
      suggest_threshold: 5,
    },
    emergency_state: 'normal',
  },
  heartbeat: {
    interval_minutes: 15,
    active_hours: { start: 8, end: 23 },
    aggressiveness: 'aggressive',
  },
  active_role: 'personal-assistant',
};

```

---

## sovereign-core/src/util/fs-secure.ts

```typescript
/**
 * File system helpers for handling local secrets safely.
 *
 * - `secureDirectory` / `secureParentDirectory` create or tighten directory
 *   permissions to 0o700 by default so secrets stored under them cannot leak
 *   to other local users.
 * - `secureWriteFile` writes secret data with `O_NOFOLLOW` so a hostile or
 *   stale symlink at the target path cannot redirect the write to an
 *   unrelated file (e.g. `~/.bash_history`).
 * - `chmodWithWarning` re-applies a mode after writes (defeating the process
 *   umask) and surfaces failures via `console.warn` instead of silently
 *   swallowing them.
 */

import { chmod, mkdir, open, rename } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname } from 'node:path';

/** Create `dirPath` (recursively) and chmod it to `mode` (default 0o700). */
export async function secureDirectory(dirPath: string, mode: number = 0o700): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode });
  await chmod(dirPath, mode);
}

/**
 * Secure the parent directory of `filePath`.
 *
 * Skips when `dirname` resolves to `.` or `''` so callers that pass a
 * bare-relative path (e.g. `config.yaml`) don't end up chmod'ing the current
 * working directory.
 */
export async function secureParentDirectory(filePath: string, mode: number = 0o700): Promise<void> {
  const dir = dirname(filePath);
  if (dir === '.' || dir === '') return;
  await secureDirectory(dir, mode);
}

/**
 * Write `data` to `filePath` with the requested `mode`, using `O_NOFOLLOW`
 * so the open call fails (with `ELOOP`) if `filePath` is a symlink. This
 * prevents an attacker (or stale state) from redirecting a secret write to
 * an unrelated target.
 *
 * Re-chmods after the write to defeat the process umask, and surfaces
 * chmod failures via `console.warn` (labeled with `label`).
 *
 * Note: `O_NOFOLLOW` is a POSIX feature; on Windows the constant is `0` and
 * has no effect, which matches Node's behavior for the rest of the path
 * constants.
 */
export async function secureWriteFile(
  filePath: string,
  data: string | Uint8Array,
  mode: number,
  label: string,
): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
  const handle = await open(tmpPath, flags, mode);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmodWithWarning(tmpPath, mode, label);
  await rename(tmpPath, filePath);
}

/** Chmod with a `console.warn` on failure rather than silently swallowing. */
export async function chmodWithWarning(filePath: string, mode: number, label: string): Promise<void> {
  try {
    await chmod(filePath, mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[${label}] Failed to chmod ${filePath} to ${mode.toString(8)}: ${message}`);
  }
}

```

---

## sovereign-desktop/main.js

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const net = require('net');

let mainWindow;
let logTailProcess = null;
let watchdogProcess = null;
const configPath = path.join(__dirname, 'config.json');

// Native Windows data directory (same as what the Bun daemon uses)
const sovereignDataDir = path.join(os.homedir(), '.sovereign');
const sovereignLogFile = path.join(sovereignDataDir, 'sovereign.log');
const sovereignConfigYaml = path.join(sovereignDataDir, 'config.yaml');

// Core project root (parent of sovereign-desktop)
const projectRoot = path.join(__dirname, '..');
const coreDir = path.join(projectRoot, 'sovereign-core');
const daemonScript  = path.join(coreDir, 'src', 'daemon',  'index.ts');

// Windows Task Scheduler task names — these are the 24/7 background
// processes. They are installed once via scripts/install-windows-tasks.ps1
// and from then on run independently of this Electron app (survive app
// close, survive logoff/restart if "Run whether user is logged on or not"
// is configured, and auto-restart on crash). No Docker, no WSL, no cloud,
// no internet required — pure native Windows Task Scheduler.
const DAEMON_TASK = 'SovereignService';

// Default config
let config = {
  token: '',
  bunPath: 'bun' // override if bun is not in PATH
};

// Load config
if (fs.existsSync(configPath)) {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
  } catch (e) {
    console.error('Failed to parse config:', e);
  }
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Sovereign Desktop Console',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    },
    frame: true,
    show: false,
    backgroundColor: '#0b0b1e'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanupProcesses();
  });
}

function cleanupProcesses() {
  // Only stop things that belong to THIS Electron process (the local log
  // tail helper). The daemon is owned by Windows Task
  // Scheduler now, so it keeps running 24/7 even after this window closes.
  stopLogTail();
}

// Check if Sovereign Daemon port (3142) is active
function checkDaemonPort() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(800);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(3142, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
  });
}

// Log streaming helper
function sendLog(source, data) {
  if (mainWindow) {
    mainWindow.webContents.send('log-data', { source, text: data.toString() });
  }
}

// Tail the daemon log file natively on Windows
function startLogTail() {
  stopLogTail();

  // Ensure log file exists
  if (!fs.existsSync(sovereignDataDir)) {
    fs.mkdirSync(sovereignDataDir, { recursive: true });
  }
  if (!fs.existsSync(sovereignLogFile)) {
    fs.writeFileSync(sovereignLogFile, '', 'utf8');
  }

  sendLog('daemon', '[SYSTEM] Starting native log stream...\n');

  // Use PowerShell Get-Content -Wait (Windows native tail)
  logTailProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Get-Content -Path "${sovereignLogFile}" -Wait -Tail 100`
  ], { windowsHide: true });

  logTailProcess.stdout.on('data', (data) => {
    sendLog('daemon', data);
  });
  logTailProcess.stderr.on('data', (data) => {
    sendLog('daemon', data);
  });
  logTailProcess.on('close', (code) => {
    sendLog('daemon', `[SYSTEM] Log stream closed (code ${code})\n`);
    logTailProcess = null;
  });
}

function stopLogTail() {
  if (logTailProcess) {
    try {
      exec(`taskkill /pid ${logTailProcess.pid} /T /F`);
    } catch (e) {}
    logTailProcess = null;
  }
}

// Read/write Windows-native config.yaml
function readSovereignConfig() {
  try {
    if (fs.existsSync(sovereignConfigYaml)) {
      return fs.readFileSync(sovereignConfigYaml, 'utf8');
    }
  } catch (e) {
    console.error('Failed to read Sovereign config:', e);
  }
  return null;
}

function writeSovereignConfig(content) {
  try {
    if (!fs.existsSync(sovereignDataDir)) {
      fs.mkdirSync(sovereignDataDir, { recursive: true });
    }
    fs.writeFileSync(sovereignConfigYaml, content, 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write Sovereign config:', e);
    return false;
  }
}

// ─── Windows Task Scheduler helpers ────────────────────────────────────────

// Run a schtasks.exe command and capture output without throwing.
function runSchtasks(args) {
  return new Promise((resolve) => {
    exec(`schtasks ${args}`, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function isTaskRegistered(taskName) {
  const { ok } = await runSchtasks(`/query /tn "${taskName}"`);
  return ok;
}

async function getTaskStatus(taskName) {
  const { ok, stdout } = await runSchtasks(`/query /tn "${taskName}" /fo list /v`);
  if (!ok) return 'NotInstalled';
  const match = stdout.match(/Status:\s*(.+)/i);
  return match ? match[1].trim() : 'Unknown';
}

// Launch a .ps1 script elevated (UAC prompt) without fragile shell-quoting.
// Returns once the elevated script has finished (-Wait).
function runElevatedPowerShellScript(scriptPath, extraArgs = []) {
  return new Promise((resolve) => {
    const argList = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs];
    const argListLiteral = argList.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
    const innerCommand = `Start-Process -FilePath powershell -ArgumentList ${argListLiteral} -Verb RunAs -Wait`;

    const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', innerCommand], {
      windowsHide: true
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ success: code === 0, code, stderr }));
    proc.on('error', (err) => resolve({ success: false, error: err.message }));
  });
}

// ─── IPC Handlers: app config ──────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  return { success: true };
});

// ─── IPC Handlers: 24/7 background service (install / uninstall) ──────────

ipcMain.handle('check-service-installed', async () => {
  const daemon  = await isTaskRegistered(DAEMON_TASK);
  return { daemon, both: daemon };
});

ipcMain.handle('install-windows-service', async () => {
  if (!fs.existsSync(daemonScript)) {
    return { success: false, error: `Daemon script not found: ${daemonScript}` };
  }

  const scriptPath = path.join(__dirname, 'scripts', 'install-windows-tasks.ps1');
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'scripts/install-windows-tasks.ps1 not found' };
  }

  sendLog('daemon', '[SYSTEM] Requesting admin rights to install the 24/7 background service...\n');
  const result = await runElevatedPowerShellScript(scriptPath, []);

  if (!result.success) {
    sendLog('daemon', '[ERROR] Service install failed or the UAC prompt was cancelled.\n');
    return { success: false, error: result.stderr || result.error || 'Install was cancelled' };
  }

  sendLog('daemon', '[SYSTEM] The service is now installed and running 24/7.\n');
  startLogTail();
  return { success: true };
});

ipcMain.handle('uninstall-windows-service', async () => {
  const scriptPath = path.join(__dirname, 'scripts', 'uninstall-windows-tasks.ps1');
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: 'scripts/uninstall-windows-tasks.ps1 not found' };
  }

  sendLog('daemon', '[SYSTEM] Requesting admin rights to remove the 24/7 background service...\n');
  const result = await runElevatedPowerShellScript(scriptPath);

  if (!result.success) {
    return { success: false, error: result.stderr || result.error || 'Uninstall was cancelled' };
  }

  sendLog('daemon', '[SYSTEM] 24/7 background service removed.\n');
  return { success: true };
});

// ─── IPC Handlers: Daemon (now backed by the SovereignDaemon scheduled task)

ipcMain.handle('check-daemon-status', async () => {
  const isRunning = await checkDaemonPort();
  return isRunning;
});

// Direct-launch fallback — used when the scheduled task is not installed
let daemonDirectProcess = null;

ipcMain.handle('start-daemon', async () => {
  const isRunning = await checkDaemonPort();
  if (isRunning) {
    startLogTail();
    return { success: true, alreadyRunning: true };
  }

  if (!fs.existsSync(daemonScript)) {
    const msg = `[ERROR] Daemon script not found: ${daemonScript}\n`;
    sendLog('daemon', msg);
    return { success: false, error: msg };
  }

  const registered = await isTaskRegistered(DAEMON_TASK);

  if (registered) {
    // ── Path A: Task Scheduler (24/7 mode) ──────────────────────────────
    sendLog('daemon', '[SYSTEM] Starting Sovereign Daemon (via Windows Task Scheduler)...\n');
    await runSchtasks(`/run /tn "${DAEMON_TASK}"`);
  } else {
    // ── Path B: Direct bun spawn (no task installed) ─────────────────────
    sendLog('daemon', '[SYSTEM] Task Scheduler service not installed — launching daemon directly...\n');
    sendLog('daemon', `[SYSTEM] Command: ${config.bunPath || 'bun'} run ${daemonScript}\n`);

    // Ensure log dir exists
    if (!fs.existsSync(sovereignDataDir)) {
      fs.mkdirSync(sovereignDataDir, { recursive: true });
    }

    const bunExe = config.bunPath || 'bun';
    daemonDirectProcess = spawn(bunExe, ['run', daemonScript], {
      cwd: coreDir,
      windowsHide: true,
      detached: false,
      shell: false,
    });

    daemonDirectProcess.stdout?.on('data', (d) => sendLog('daemon', d.toString()));
    daemonDirectProcess.stderr?.on('data', (d) => sendLog('daemon', d.toString()));
    daemonDirectProcess.on('error', (err) => {
      sendLog('daemon', `[ERROR] Failed to start daemon: ${err.message}\n`);
      if (err.code === 'ENOENT') {
        sendLog('daemon', `[HINT] "bun" not found. Set the correct Bun path in Advanced Settings.\n`);
      }
      daemonDirectProcess = null;
    });
    daemonDirectProcess.on('close', (code) => {
      sendLog('daemon', `[SYSTEM] Daemon process exited (code ${code})\n`);
      daemonDirectProcess = null;
    });

    sendLog('daemon', '[SYSTEM] Daemon process launched. Waiting for port 3142...\n');
  }

  // ── Wait for port to open (shared for both paths) ─────────────────────
  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const running = await checkDaemonPort();
      if (running) {
        clearInterval(interval);
        sendLog('daemon', '[SYSTEM] Sovereign Daemon is running on port 3142!\n');
        startLogTail();
        resolve({ success: true });
      } else if (attempts >= 20) {
        clearInterval(interval);
        sendLog('daemon', '[WARNING] Port 3142 check timed out. Daemon may still be loading.\n');
        startLogTail();
        resolve({ success: true, timeout: true });
      }
    }, 1000);
  });
});

ipcMain.handle('stop-daemon', async () => {
  sendLog('daemon', '[SYSTEM] Stopping Sovereign Daemon...\n');
  stopLogTail();

  // Stop direct process if running
  if (daemonDirectProcess) {
    try { exec(`taskkill /pid ${daemonDirectProcess.pid} /T /F`); } catch (e) {}
    daemonDirectProcess = null;
  }

  // Also stop the task if registered
  const registered = await isTaskRegistered(DAEMON_TASK);
  if (registered) {
    await runSchtasks(`/end /tn "${DAEMON_TASK}"`);
  }

  return { success: true };
});



// Pull a model via Ollama (native)
ipcMain.handle('pull-model', (event, modelName) => {
  sendLog('daemon', `[SYSTEM] Pulling Ollama model: "${modelName}"...\n`);

  return new Promise((resolve) => {
    const pullProcess = spawn('ollama', ['pull', modelName], { shell: true });

    pullProcess.stdout.on('data', (data) => sendLog('daemon', data));
    pullProcess.stderr.on('data', (data) => sendLog('daemon', data));
    pullProcess.on('close', (code) => {
      if (code === 0) {
        sendLog('daemon', `[SYSTEM] Model "${modelName}" downloaded successfully!\n`);
        resolve({ success: true });
      } else {
        sendLog('daemon', `[ERROR] Ollama pull failed (exit code ${code})\n`);
        resolve({ success: false, error: `Exit code ${code}` });
      }
    });
    pullProcess.on('error', (err) => {
      sendLog('daemon', `[ERROR] Ollama not found: ${err.message}\n`);
      sendLog('daemon', '[HINT] Download Ollama from https://ollama.ai\n');
      resolve({ success: false, error: err.message });
    });
  });
});

// List locally installed Ollama models
ipcMain.handle('list-local-models', () => {
  return new Promise((resolve) => {
    exec('ollama list', (err, stdout) => {
      if (err) return resolve({ success: false, models: [] });
      const lines = stdout.trim().split('\n').slice(1); // skip header
      const models = lines
        .filter(l => l.trim())
        .map(l => l.trim().split(/\s+/)[0]);
      resolve({ success: true, models });
    });
  });
});

// Scan hardware specs (CPU, RAM, GPU VRAM)
ipcMain.handle('scan-hardware', () => {
  return new Promise((resolve) => {
    const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
    const freeRamGb = Math.round(os.freemem() / (1024 ** 3));
    const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
    const cpuCores = os.cpus().length;
    const platform = os.platform();
    const arch = os.arch();

    // Query GPU VRAM via PowerShell
    exec(
      'powershell -NoProfile -Command "Get-WmiObject Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json"',
      { timeout: 8000 },
      (err, stdout) => {
        let gpuName = 'Unknown GPU';
        let gpuVramGb = 0;
        let gpuVramMb = 0;

        if (!err && stdout && stdout.trim()) {
          try {
            const gpu = JSON.parse(stdout.trim());
            gpuName = gpu.Name || 'Unknown GPU';
            const adapterRam = Number(gpu.AdapterRAM) || 0;
            gpuVramMb = Math.round(adapterRam / (1024 ** 2));
            gpuVramGb = Math.round(adapterRam / (1024 ** 3));
          } catch (parseErr) {
            // GPU query parse failed — default to 0
          }
        }

        // Recommend model size based on effective memory (RAM or VRAM, whichever is larger)
        const effectiveMem = Math.max(totalRamGb, gpuVramGb);
        let recommended = 'qwen2.5:0.5b';
        let recommendation = '';
        if (effectiveMem >= 64) {
          recommended = 'qwen2.5-coder:32b';
          recommendation = '32B model recommended (64GB+ RAM/VRAM)';
        } else if (effectiveMem >= 32) {
          recommended = 'qwen2.5-coder:14b';
          recommendation = '14B model recommended (32GB+ RAM/VRAM)';
        } else if (effectiveMem >= 16) {
          recommended = 'qwen2.5-coder:7b';
          recommendation = '7B model recommended (16GB+ RAM/VRAM)';
        } else if (effectiveMem >= 8) {
          recommended = 'qwen2.5-coder:3b';
          recommendation = '3B model recommended (8–16GB RAM/VRAM)';
        } else if (effectiveMem >= 4) {
          recommended = 'qwen2.5:1.5b';
          recommendation = '1.5B model recommended (4–8GB RAM/VRAM)';
        } else {
          recommended = 'qwen2.5:0.5b';
          recommendation = '0.5B model recommended (<4GB RAM/VRAM)';
        }

        resolve({
          totalRamGb,
          freeRamGb,
          cpuModel,
          cpuCores,
          platform,
          arch,
          gpuName,
          gpuVramGb,
          gpuVramMb,
          recommended,
          recommendation,
        });
      }
    );
  });
});

// Fine-grained query for just GPU VRAM
ipcMain.handle('get-gpu-vram', () => {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-WmiObject Win32_VideoController | Select-Object -First 1 AdapterRAM | ConvertTo-Json"',
      { timeout: 8000 },
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          try {
            const gpu = JSON.parse(stdout.trim());
            const adapterRam = Number(gpu.AdapterRAM) || 0;
            const gpuVramGb = Math.round(adapterRam / (1024 ** 3));
            return resolve({ success: true, gpuVramGb });
          } catch (e) {}
        }
        resolve({ success: false, gpuVramGb: 0 });
      }
    );
  });
});

// Launch Claude Code (Windows native)
ipcMain.handle('launch-claude-win', () => {
  sendLog('daemon', '[SYSTEM] Launching Claude Code (Windows)...\n');
  spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'claude'], { shell: true });
  return { success: true };
});

// Save API/LLM config to Windows-native config.yaml
ipcMain.handle('save-api-config', async (event, data) => {
  const { provider, apiKey, customModel } = data;
  sendLog('daemon', `[SYSTEM] Saving LLM config for provider: "${provider}"...\n`);

  const originalConfig = readSovereignConfig();
  let currentYaml = originalConfig || '';

  let defaultModel = '';
  let providerDetails = '';

  if (provider === 'ollama-local') {
    // Use 1.5B by default — user can override with custom model
    const model = customModel || 'qwen2.5:1.5b';
    defaultModel = `ollama:${model}`;
    providerDetails = `    ollama:\n      kind: ollama\n      base_url: "http://127.0.0.1:11434"`;
  } else if (provider === 'anthropic-cloud') {
    defaultModel = `anthropic:${customModel || 'claude-3-5-haiku-latest'}`;
    providerDetails = `    anthropic:\n      api_key: "${apiKey}"`;
  } else if (provider === 'gemini-cloud') {
    defaultModel = `gemini:${customModel || 'gemini-1.5-flash'}`;
    providerDetails = `    gemini:\n      api_key: "${apiKey}"`;
  } else if (provider === 'openai-cloud') {
    defaultModel = `openai:${customModel || 'gpt-4o-mini'}`;
    providerDetails = `    openai:\n      api_key: "${apiKey}"`;
  } else if (provider === 'openrouter-cloud') {
    defaultModel = `openrouter:${customModel || 'qwen/qwen-2.5-coder-1.5b-instruct:free'}`;
    providerDetails = `    openrouter:\n      api_key: "${apiKey}"`;
  } else if (provider === 'groq-cloud') {
    defaultModel = `groq:${customModel || 'llama-3.3-70b-versatile'}`;
    providerDetails = `    groq:\n      api_key: "${apiKey}"`;
  } else if (provider === 'nvidia-cloud') {
    defaultModel = `nvidia:${customModel || 'meta/llama-3.1-70b-instruct'}`;
    providerDetails = `    nvidia:\n      api_key: "${apiKey}"`;
  }

  const newLlmBlock = `llm:\n  default: "${defaultModel}"\n  providers:\n${providerDetails}\n  tiers: {}\n`;

  let updatedYaml;
  if (/^([ \t]*)llm:/m.test(currentYaml)) {
    updatedYaml = currentYaml.replace(/^([ \t]*)llm:[\s\S]*?(?=^[ \t]*\w+:|$)/m, newLlmBlock);
  } else {
    // Append if no llm block
    updatedYaml = currentYaml.trim() + '\n\n' + newLlmBlock;
  }

  const ok = writeSovereignConfig(updatedYaml);
  if (ok) {
    sendLog('daemon', `[SYSTEM] Config updated! Sovereign will use "${defaultModel}"\n`);
    return { success: true };
  }
  return { success: false, error: 'Failed to write config.yaml' };
});

ipcMain.handle('get-api-config', () => {
  const content = readSovereignConfig();
  if (!content) return { provider: 'ollama-local', apiKey: '', customModel: 'qwen2.5:1.5b' };

  const defaultMatch = content.match(/default:\s*"([^"]+)"/);
  if (!defaultMatch) return { provider: 'ollama-local', apiKey: '', customModel: 'qwen2.5:1.5b' };

  const modelRef = defaultMatch[1];
  const colonIdx = modelRef.indexOf(':');
  const providerName = colonIdx >= 0 ? modelRef.slice(0, colonIdx) : modelRef;
  const modelId = colonIdx >= 0 ? modelRef.slice(colonIdx + 1) : '';

  let provider = 'ollama-local';
  let apiKey = '';
  let customModel = modelId || 'qwen2.5:1.5b';

  if (providerName === 'anthropic')   provider = 'anthropic-cloud';
  else if (providerName === 'gemini')   provider = 'gemini-cloud';
  else if (providerName === 'openai')   provider = 'openai-cloud';
  else if (providerName === 'openrouter') provider = 'openrouter-cloud';
  else if (providerName === 'groq')    provider = 'groq-cloud';
  else if (providerName === 'nvidia')  provider = 'nvidia-cloud';

  if (provider !== 'ollama-local') {
    const keyMatch = content.match(/api_key:\s*"([^"]+)"/);
    if (keyMatch) apiKey = keyMatch[1];
  }

  return { provider, apiKey, customModel };
});

// Get hardware-compatible models from the daemon DB via HTTP
ipcMain.handle('get-compatible-models', async (event, ramGb, vramGb) => {
  try {
    const response = await fetch(
      `http://127.0.0.1:3142/api/models/compatible?ram=${ramGb || 8}&vram=${vramGb || 0}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!response.ok) return { success: false, models: [] };
    const data = await response.json();
    return { success: true, models: data };
  } catch (err) {
    return { success: false, models: [], error: err.message };
  }
});

// Trigger model pool refresh via daemon API
ipcMain.handle('refresh-model-pool', async () => {
  try {
    const response = await fetch('http://127.0.0.1:3142/api/models/refresh', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return { success: false };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});



// ─── Watchdog ───────────────────────────────────────────────────────────────
// NOTE: now that Task Scheduler's own "restart on failure" handles crash
// recovery for the daemon/sidecar, this custom watchdog is mostly a backup.
// Left untouched / optional.

ipcMain.handle('start-watchdog', () => {
  if (watchdogProcess) return { success: false, error: 'Watchdog already running' };
  const watchdogScript = path.join(__dirname, 'watchdog.ps1');
  if (!fs.existsSync(watchdogScript)) {
    return { success: false, error: 'watchdog.ps1 not found' };
  }
  watchdogProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', watchdogScript
  ], { windowsHide: true });
  watchdogProcess.on('error', (err) => {
    sendLog('daemon', `[WATCHDOG] Error: ${err.message}\n`);
    watchdogProcess = null;
  });
  watchdogProcess.on('close', (code) => {
    sendLog('daemon', `[WATCHDOG] Stopped (code ${code})\n`);
    watchdogProcess = null;
    if (mainWindow) mainWindow.webContents.send('watchdog-status-changed', false);
  });
  watchdogProcess.stdout?.on('data', (d) => sendLog('daemon', `[WATCHDOG] ${d}`));
  if (mainWindow) mainWindow.webContents.send('watchdog-status-changed', true);
  sendLog('daemon', '[WATCHDOG] Watchdog started.\n');
  return { success: true };
});

ipcMain.handle('stop-watchdog', () => {
  if (!watchdogProcess) return { success: false };
  try {
    exec(`taskkill /pid ${watchdogProcess.pid} /T /F`);
  } catch (e) {}
  watchdogProcess = null;
  if (mainWindow) mainWindow.webContents.send('watchdog-status-changed', false);
  sendLog('daemon', '[WATCHDOG] Watchdog stopped.\n');
  return { success: true };
});

ipcMain.handle('check-watchdog-status', () => watchdogProcess !== null);

// Health check — used by preload.js healthCheck() API
ipcMain.handle('health-check', async () => {
  const isRunning = await checkDaemonPort();
  return {
    status: isRunning ? 'running' : 'stopped',
    port:   3142,
    ts:     Date.now(),
  };
});

// ─── Focus Mode ─────────────────────────────────────────────────────────────
// Uses PowerShell to lower/restore process priorities.
// Excludes critical system and Sovereign processes.
// Returns the count of processes affected.

const FOCUS_EXCLUDE = 'bun|sovereign|ollama|electron|System|Idle|svchost|explorer|csrss|lsass|wininit|services|smss|winlogon|dwm|audiodg|fontdrvhost';

ipcMain.handle('start-focus-mode', () => {
  return new Promise((resolve) => {
    sendLog('daemon', '[SYSTEM] Focus Mode ON — lowering priority of background processes...\n');
    // Script: collect matching processes, set BelowNormal, output count as JSON
    const ps = [
      `$exclude = '${FOCUS_EXCLUDE}'`,
      `$procs = Get-Process | Where-Object {`,
      `  $_.PriorityClass -eq 'Normal' -and $_.ProcessName -notmatch $exclude`,
      `}`,
      `$count = 0`,
      `foreach ($p in $procs) {`,
      `  try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal; $count++ } catch {}`,
      `}`,
      `Write-Output $count`
    ].join('; ');

    exec(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { timeout: 10000 }, (err, stdout) => {
      const loweredCount = parseInt((stdout || '0').trim(), 10) || 0;
      if (err) {
        sendLog('daemon', `[FOCUS] Warning: ${err.message}\n`);
      }
      sendLog('daemon', `[FOCUS] Lowered priority of ${loweredCount} background processes.\n`);
      resolve({ success: true, loweredCount });
    });
  });
});

ipcMain.handle('stop-focus-mode', () => {
  return new Promise((resolve) => {
    sendLog('daemon', '[SYSTEM] Focus Mode OFF — restoring background process priorities...\n');
    const ps = [
      `$exclude = '${FOCUS_EXCLUDE}'`,
      `$procs = Get-Process | Where-Object {`,
      `  $_.PriorityClass -eq 'BelowNormal' -and $_.ProcessName -notmatch $exclude`,
      `}`,
      `$count = 0`,
      `foreach ($p in $procs) {`,
      `  try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal; $count++ } catch {}`,
      `}`,
      `Write-Output $count`
    ].join('; ');

    exec(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { timeout: 10000 }, (err, stdout) => {
      const restoredCount = parseInt((stdout || '0').trim(), 10) || 0;
      if (err) {
        sendLog('daemon', `[FOCUS] Warning: ${err.message}\n`);
      }
      sendLog('daemon', `[FOCUS] Restored priority of ${restoredCount} background processes.\n`);
      resolve({ success: true, restoredCount });
    });
  });
});

// ─── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

```

---

## sovereign-desktop/preload.js

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  checkDaemonStatus: () => ipcRenderer.invoke('check-daemon-status'),
  startDaemon: (options) => ipcRenderer.invoke('start-daemon', options),
  stopDaemon: () => ipcRenderer.invoke('stop-daemon'),
  pullModel: (modelName) => ipcRenderer.invoke('pull-model', modelName),
  listLocalModels: () => ipcRenderer.invoke('list-local-models'),
  launchClaudeWin: () => ipcRenderer.invoke('launch-claude-win'),
  saveApiConfig: (data) => ipcRenderer.invoke('save-api-config', data),
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  scanHardware: () => ipcRenderer.invoke('scan-hardware'),
  getSystemSpecs: () => ipcRenderer.invoke('scan-hardware'),
  getGpuVram: () => ipcRenderer.invoke('get-gpu-vram'),
  getCompatibleModels: (ram, vram) => ipcRenderer.invoke('get-compatible-models', ram, vram),
  refreshModelPool: () => ipcRenderer.invoke('refresh-model-pool'),
  startWatchdog: () => ipcRenderer.invoke('start-watchdog'),
  stopWatchdog: () => ipcRenderer.invoke('stop-watchdog'),
  checkWatchdogStatus: () => ipcRenderer.invoke('check-watchdog-status'),
  healthCheck: () => ipcRenderer.invoke('health-check'),
  
  // Service Installer
  checkServiceInstalled: () => ipcRenderer.invoke('check-service-installed'),
  installWindowsService: () => ipcRenderer.invoke('install-windows-service'),
  uninstallWindowsService: () => ipcRenderer.invoke('uninstall-windows-service'),

  // Focus Mode
  startFocusMode: () => ipcRenderer.invoke('start-focus-mode'),
  stopFocusMode: () => ipcRenderer.invoke('stop-focus-mode'),

  // Log event subscriptions
  onLog: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('log-data', subscription);
    return () => ipcRenderer.removeListener('log-data', subscription);
  }
});

```

---

## sovereign-desktop/validate.js

```javascript
/**
 * validate.js — Sovereign Desktop Safety Net
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

```

---

## sovereign-desktop/renderer/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sovereign Desktop Console</title>
  <link rel="stylesheet" href="index.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Animated Background Orbs -->
  <div class="particles-container">
    <div class="particle p1"></div>
    <div class="particle p2"></div>
    <div class="particle p3"></div>
  </div>
  <div class="app-container">
    
    <!-- Sidebar Controls -->
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-ring">
          <div class="logo-core"></div>
        </div>
        <div class="brand-text">
          <h1>Sovereign</h1>
          <span>DESKTOP CONSOLE</span>
        </div>
      </div>

      <nav class="nav-menu">
        <div class="control-group">
          <h3>Services</h3>
          
          <!-- Daemon Control -->
          <div class="service-card" id="daemon-card">
            <div class="service-header">
              <span class="service-name">Sovereign Daemon</span>
              <span class="status-indicator stopped" id="daemon-status-dot"></span>
            </div>
            <div class="status-text" id="daemon-status-text">Checking...</div>
            <div class="btn-group">
              <button id="btn-start-daemon" class="btn btn-primary btn-sm">Start</button>
              <button id="btn-stop-daemon" class="btn btn-secondary btn-sm" disabled>Stop</button>
            </div>
          </div>

          <!-- System Health Mini Panel -->
          <div class="service-card" id="health-card" style="margin-top:8px;">
            <div class="service-header">
              <span class="service-name">System Health</span>
              <span class="status-indicator stopped" id="health-status-dot"></span>
            </div>
            <div class="status-text" id="health-status-text">—</div>
          </div>

        </div>

        <!-- Model & API Keys Configuration -->
        <div class="control-group">
          <h3>Model & API Configuration</h3>
          <div class="config-card">
            <label for="sel-model-provider">Select Provider</label>
            <select id="sel-model-provider" class="btn-block" style="background:#1a1a3a; color:#fff; border:1px solid #3b3b8a; padding:6px; border-radius:4px; margin-bottom:8px; width:100%;">
              <option value="ollama-local">Qwen 2.5 — Local (Ollama)</option>
              <option value="anthropic-cloud">Claude (Anthropic)</option>
              <option value="gemini-cloud">Gemini (Google)</option>
              <option value="openai-cloud">GPT-4o (OpenAI)</option>
              <option value="openrouter-cloud">OpenRouter (Any Model)</option>
              <option value="groq-cloud">Groq (Fast Inference)</option>
              <option value="nvidia-cloud">NVIDIA NIM</option>
            </select>

            <div id="api-key-container" class="hidden">
              <label for="api-key-input">API Key</label>
              <div class="input-wrapper">
                <input type="password" id="api-key-input" placeholder="Paste API Key here..." autocomplete="new-password">
                <button class="btn-icon" id="btn-toggle-key-visibility" type="button">👁️</button>
              </div>
            </div>

            <div id="custom-model-container" class="hidden" style="margin-top: 8px;">
              <label for="custom-model-input">Custom Model ID (Optional)</label>
              <input type="text" id="custom-model-input" placeholder="e.g. claude-3-5-haiku-latest" style="background:#1a1a3a; color:#fff; border:1px solid #3b3b8a; padding:6px; border-radius:4px; width:100%;">
            </div>
            
            <button id="btn-save-api-config" class="btn btn-accent btn-block btn-sm" style="margin-top:8px;">Save &amp; Apply Settings</button>
          </div>
        </div>

        <!-- Ollama Model Downloader -->
        <div class="control-group">
          <h3>Ollama Model Downloader</h3>
          <div class="config-card">
            <label for="txt-pull-model">Model Name</label>
            <input type="text" id="txt-pull-model" placeholder="e.g. llama3.1, phi3, mistral" style="background:#1a1a3a; color:#fff; border:1px solid #3b3b8a; padding:6px; border-radius:4px; margin-bottom:8px; width:100%;">
            <button id="btn-pull-model" class="btn btn-primary btn-block btn-sm">📥 Download Model</button>

            <!-- Local models list -->
            <div style="margin-top:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-size:0.75em; color:var(--text-muted);">Installed models</span>
                <button id="btn-refresh-local-models" class="btn btn-outline btn-xs">↻</button>
              </div>
              <div id="local-models-list" style="font-size:0.72em; color:var(--text-muted); max-height:80px; overflow-y:auto; line-height:1.8;">
                —
              </div>
            </div>
          </div>
        </div>

        <!-- Claude Code Integration -->
        <div class="control-group">
          <h3>Claude Code Integration</h3>
          <div class="config-card" style="display:flex; flex-direction:column; gap:8px;">
            <button id="btn-launch-claude-win" class="btn btn-primary btn-block btn-sm">🚀 Launch Claude Code (Windows)</button>
          </div>
        </div>

        <!-- AI Settings Toggle -->
        <div class="control-group">
          <h3>AI Configuration</h3>
          <div class="config-card">
            <div class="settings-checkbox" style="margin-bottom: 8px;">
              <input type="checkbox" id="chk-use-qwen" checked>
              <label for="chk-use-qwen" style="font-size: 0.85em;">Use Qwen 2.5 (1.5B — Fast)</label>
            </div>
            <div class="settings-checkbox" style="margin-bottom: 8px;">
              <input type="checkbox" id="chk-auto-correct" checked>
              <label for="chk-auto-correct" style="font-size: 0.85em;">Auto-Correct Bugs</label>
            </div>
          </div>
        </div>


        <!-- Hardware Scan & Model Advisor -->
        <div class="control-group">
          <h3>⚙️ Hardware Advisor</h3>
          <div class="config-card" style="display:flex; flex-direction:column; gap:8px;">
            <div id="hw-info" style="font-size:0.75em; color: var(--text-muted); min-height:40px;">
              Click Scan to check your PC specs.
            </div>
            <button id="btn-scan-hardware" class="btn btn-outline btn-block btn-sm">🔍 Scan Specs</button>
            <div id="hw-recommendation" class="hidden" style="font-size:0.8em; padding:8px; background:rgba(0,242,254,0.07); border-radius:8px; border:1px solid rgba(0,242,254,0.2); color: var(--accent-cyan);"></div>
          </div>
        </div>

        <!-- Focus Mode (Memory Management) -->
        <div class="control-group">
          <h3>🧠 Focus Mode</h3>
          <div class="config-card" style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:0.75em; color: var(--text-muted);">
              Lowers priority of non-essential background tasks to free memory for local AI models.
            </div>
            <button id="btn-start-focus" class="btn btn-primary btn-block btn-sm">Enable Focus Mode</button>
            <button id="btn-stop-focus" class="btn btn-secondary btn-block btn-sm" style="display: none;">Disable Focus Mode</button>
          </div>
        </div>

        <!-- Utility controls -->
        <div class="control-group utils">
          <h3>Controls</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <button id="btn-start-all" class="btn btn-primary btn-block btn-sm">🚀 Start All Services</button>
            <div style="display:flex; gap:8px;">
              <button id="btn-reload-webview" class="btn btn-outline btn-sm" style="flex:1;">🔄 Reload Interface</button>
              <button id="btn-toggle-logs" class="btn btn-outline btn-sm" style="flex:1;">💻 Toggle Logs</button>
            </div>
            <button id="btn-settings" class="btn btn-outline btn-block btn-sm">⚙️ Advanced Settings</button>
          </div>
        </div>
      </nav>
      
      <div class="sidebar-footer">
        <span>v1.1.0 • Sovereign Core</span>
      </div>
    </aside>

    <!-- Main View Content -->
    <main class="main-content">
      
      <!-- Top Header Bar -->
      <header class="main-header">
        <button id="btn-toggle-sidebar" class="btn-sidebar-toggle" title="Toggle Sidebar">
          <span>☰</span>
        </button>
        <div class="header-title">Sovereign Console</div>
      </header>
      
      <!-- Splash Screen (when daemon is stopped) -->
      <div class="splash-screen" id="splash-view">
        <div class="splash-content">
          <div class="hologram-logo">
            <div class="circle outer"></div>
            <div class="circle middle"></div>
            <div class="circle inner"></div>
            <div class="pulsar"></div>
          </div>
          <h2>Initialize System Brain</h2>
          <p>The Sovereign daemon is offline. Click Boot to start the local AI engine on this Windows PC.</p>
          <button id="btn-boot-system" class="btn btn-primary btn-lg">🚀 Boot Sovereign</button>
          
          <!-- Loading Progress Container -->
          <div id="boot-loading-container" class="hidden" style="margin-top: 20px; width: 300px; margin-left: auto; margin-right: auto; text-align: left;">
            <div style="display: flex; justify-content: space-between; font-size: 0.85em; margin-bottom: 6px; color: #8a8ab5; font-family: 'Outfit', sans-serif;">
              <span id="boot-status-text">Starting services...</span>
              <span id="boot-timer">10s</span>
            </div>
            <div style="background: #121230; height: 6px; border-radius: 3px; overflow: hidden; border: 1px solid #3b3b8a;">
              <div id="boot-progress-bar" style="background: linear-gradient(90deg, #00b0ff, #00e676); width: 0%; height: 100%; transition: width 0.3s ease;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dashboard View (embedded webview) -->
      <div class="webview-container hidden" id="dashboard-view">
        <webview id="sovereign-webview" src="about:blank" style="width:100%; height:100%"></webview>
      </div>

      <!-- Advanced Settings Panel (hidden by default) -->
      <div class="settings-overlay hidden" id="settings-view">
        <div class="settings-modal">
          <div class="modal-header">
            <h2>Advanced Settings</h2>
            <button class="btn-close" id="btn-close-settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-field">
              <label for="bun-path-input">Bun Executable Path</label>
              <input type="text" id="bun-path-input" value="bun">
              <small>Path to the Bun executable on Windows (defaults to 'bun').</small>
            </div>
            <div class="settings-checkbox">
              <input type="checkbox" id="chk-auto-daemon" checked>
              <label for="chk-auto-daemon">Auto-start Daemon when app opens</label>
            </div>
            
            <hr style="border:0; border-top:1px solid #3b3b8a; margin: 15px 0;">
            <h3>24/7 Background Service</h3>
            <p style="font-size: 0.8em; color: var(--text-muted); margin-bottom: 10px;">
              Install Sovereign as a native Windows scheduled task to run in the background 24/7.
            </p>
            <div style="display:flex; gap: 8px; margin-bottom: 15px;">
              <button id="btn-install-service" class="btn btn-primary btn-sm" style="flex:1;">Install Service</button>
              <button id="btn-uninstall-service" class="btn btn-outline btn-sm" style="flex:1;">Uninstall Service</button>
            </div>
            <div id="service-status" style="font-size: 0.8em; color: var(--accent-cyan); margin-bottom: 15px;">Checking service status...</div>

            <hr style="border:0; border-top:1px solid #3b3b8a; margin: 15px 0;">
            <h3>System Information</h3>
            <div id="sys-info-panel" style="font-size:0.78em; color:var(--text-muted); line-height:1.9; background:rgba(0,0,0,0.3); border-radius:8px; padding:10px; margin-bottom:15px;">
              <span id="sys-info-text">Click 'Scan Specs' in the sidebar to populate.</span>
            </div>

            <button id="btn-save-settings" class="btn btn-primary">Save Settings</button>
          </div>
        </div>
      </div>

      <!-- Logs Terminal Drawer (collapsible) -->
      <div class="logs-drawer collapsed" id="logs-drawer">
        <div class="drawer-header">
          <div class="drawer-tabs">
            <button class="drawer-tab active" data-tab="daemon-logs">Daemon Output</button>
          </div>
          <div class="drawer-actions">
            <button id="btn-clear-logs" class="btn btn-outline btn-xs">Clear</button>
            <button id="btn-close-logs" class="btn btn-outline btn-xs">&times;</button>
          </div>
        </div>
        <div class="drawer-body">
          <div class="tab-content active" id="daemon-logs">
            <pre class="terminal-stdout" id="daemon-terminal"></pre>
          </div>
        </div>
      </div>

    </main>

  </div>
  <script src="renderer.js"></script>
</body>
</html>

```

---

## sovereign-desktop/renderer/index.css

```css
:root {
  --bg-color: #f5f3ef;
  --sidebar-bg: rgba(248, 246, 244, 0.45);
  --card-bg: rgba(255, 255, 255, 0.5);
  --border-color: rgba(0, 0, 0, 0.08);
  --border-hover: rgba(74, 144, 226, 0.4);
  --text-color: #2c2c2c;
  --text-muted: #626262;
  --accent-cyan: #4a90e2;
  --accent-purple: #8e24aa;
  --color-green: #2e7d32;
  --color-red: #d32f2f;
  --font-sans: 'Outfit', 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
  --font-mono: 'Fira Code', Consolas, Monaco, monospace;
  --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  
  /* Glassmorphism White-Marble Theme Tokens */
  --glass-bg: rgba(255, 255, 255, 0.2);
  --glass-border: rgba(255, 255, 255, 0.4);
  --glass-shadow: 0 8px 32px 0 rgba(142, 150, 185, 0.12);
  --marble-primary: #f8f6f4;
  --marble-accent: #e8e4e0;
  --text-primary: #2c2c2c;
  --text-secondary: #5a5a5a;
  --accent-blue: #4a90e2;
  --accent-green: #00e676;
  --accent-red: #ff5252;
  --blur-amount: 25px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  user-select: none;
}

body {
  font-family: var(--font-sans);
  background: linear-gradient(135deg, #f8f6f4 0%, #edeae6 25%, #e2ded8 50%, #eae7e2 75%, #f8f6f4 100%);
  background-size: 400% 400%;
  animation: marbleShift 20s ease infinite;
  color: var(--text-color);
  height: 100vh;
  overflow: hidden;
  position: relative;
}

@keyframes marbleShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* App Container Layout */
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
}

/* Sidebar Styling */
.sidebar {
  width: 280px;
  height: 100vh;
  background-color: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 20px;
  flex-shrink: 0;
  box-shadow: 5px 0 25px rgba(0, 0, 0, 0.3);
  z-index: 10;
  overflow: hidden;
}

.brand {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
}

.logo-ring {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 2px solid var(--accent-cyan);
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  animation: logo-spin 6s linear infinite;
}

.logo-core {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--accent-cyan);
  box-shadow: 0 0 15px var(--accent-cyan);
}

.brand-text h1 {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 2px;
  background: linear-gradient(to right, var(--accent-cyan), #4facfe);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-text span {
  font-size: 0.65rem;
  letter-spacing: 3px;
  color: var(--text-muted);
  display: block;
}

.nav-menu {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 5px;
}

/* Scrollbar styling for side menu */
.nav-menu::-webkit-scrollbar {
  width: 4px;
}
.nav-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.control-group {
  margin-bottom: 25px;
}

.control-group h3 {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-muted);
  margin-bottom: 10px;
  padding-left: 5px;
}

/* Service Card Styling */
.service-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  backdrop-filter: blur(8px);
  transition: var(--transition);
}

.service-card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.05);
}

.service-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.service-name {
  font-size: 0.85rem;
  font-weight: 600;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.status-indicator.stopped {
  background-color: var(--color-red);
  box-shadow: 0 0 8px var(--color-red);
}

.status-indicator.running {
  background-color: var(--color-green);
  box-shadow: 0 0 8px var(--color-green);
  animation: pulse-green 1.5s infinite;
}

.status-indicator.pending {
  background-color: #ffaa00;
  box-shadow: 0 0 8px #ffaa00;
  animation: pulse-orange 1s infinite;
}

.status-text {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* Config Card Input */
.config-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 15px;
  backdrop-filter: blur(8px);
}

.config-card label {
  font-size: 0.75rem;
  color: var(--text-muted);
  display: block;
  margin-bottom: 6px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.input-wrapper input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 35px 8px 10px;
  color: var(--text-color);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  outline: none;
  transition: var(--transition);
}

.input-wrapper input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.15);
}

.btn-icon {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-icon:hover {
  color: var(--text-color);
}

/* Button UI */
.btn-group {
  display: flex;
  gap: 8px;
}

.btn {
  font-family: var(--font-sans);
  font-weight: 600;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: var(--transition);
  outline: none;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.75rem;
}

.btn-md {
  padding: 10px 20px;
  font-size: 0.9rem;
}

.btn-lg {
  padding: 14px 28px;
  font-size: 1rem;
  border-radius: 8px;
}

.btn-xs {
  padding: 3px 8px;
  font-size: 0.65rem;
  border-radius: 4px;
}

.btn-block {
  width: 100%;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent-cyan), #00b0ff);
  color: #030310;
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.2);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0, 242, 254, 0.35);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-accent {
  background: linear-gradient(135deg, var(--accent-purple), #9e00ff);
  color: white;
  box-shadow: 0 4px 15px rgba(127, 0, 255, 0.25);
}

.btn-accent:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(127, 0, 255, 0.4);
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(0, 242, 254, 0.03);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.sidebar-footer {
  padding-top: 15px;
  border-top: 1px solid var(--border-color);
  font-size: 0.65rem;
  color: var(--text-muted);
  text-align: center;
}

/* Main Content Area */
.main-content {
  flex-grow: 1;
  background-color: var(--bg-color);
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Webview Container */
.webview-container {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  background-color: #ffffff;
}

.hidden {
  display: none !important;
}

/* Splash / Loading Screen */
.splash-screen {
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #0e0e30, #04040e);
}

.splash-content {
  text-align: center;
  max-width: 480px;
  padding: 40px;
}

.splash-content h2 {
  font-size: 1.8rem;
  font-weight: 600;
  margin: 30px 0 10px 0;
  letter-spacing: 1px;
}

.splash-content p {
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin-bottom: 30px;
}

/* Hologram Logo Animation */
.hologram-logo {
  position: relative;
  width: 160px;
  height: 160px;
  margin: 0 auto;
}

.hologram-logo .circle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid var(--accent-cyan);
}

.hologram-logo .circle.outer {
  width: 140px;
  height: 140px;
  border-style: dashed;
  border-width: 2px;
  opacity: 0.3;
  animation: logo-spin 20s linear infinite;
}

.hologram-logo .circle.middle {
  width: 100px;
  height: 100px;
  border-width: 1px;
  opacity: 0.5;
  border-style: dotted;
  animation: logo-spin-reverse 15s linear infinite;
}

.hologram-logo .circle.inner {
  width: 60px;
  height: 60px;
  border-width: 2px;
  opacity: 0.8;
  box-shadow: inset 0 0 15px rgba(0, 242, 254, 0.2);
}

.hologram-logo .pulsar {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: var(--accent-cyan);
  box-shadow: 0 0 25px var(--accent-cyan);
  animation: pulse-core 2s ease-in-out infinite;
}

/* Logs Drawer System */
.logs-drawer {
  height: 250px;
  width: 100%;
  background-color: #03030a;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 100;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.5);
}

.logs-drawer.collapsed {
  transform: translateY(100%);
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #070714;
  padding: 6px 15px;
  border-bottom: 1px solid var(--border-color);
  height: 38px;
}

.drawer-tabs {
  display: flex;
  gap: 5px;
}

.drawer-tab {
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: var(--transition);
}

.drawer-tab:hover {
  color: var(--text-color);
  background-color: rgba(255, 255, 255, 0.04);
}

.drawer-tab.active {
  color: var(--accent-cyan);
  background-color: rgba(0, 242, 254, 0.08);
}

.drawer-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.drawer-actions button {
  border-color: rgba(255, 255, 255, 0.15);
}

.drawer-body {
  flex-grow: 1;
  overflow: hidden;
  position: relative;
}

.tab-content {
  display: none;
  width: 100%;
  height: 100%;
  padding: 15px;
  overflow: auto;
}

.tab-content.active {
  display: block;
}

.terminal-stdout {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  color: #a5b4fc;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Advanced Settings Modal Overlay */
.settings-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(3, 3, 10, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.settings-modal {
  background: #0c0c24;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 25px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: scale-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h2 {
  font-size: 1.2rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
}

.btn-close:hover {
  color: var(--text-color);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-field label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 600;
}

.settings-field input {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--text-color);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  outline: none;
}

.settings-field input:focus {
  border-color: var(--accent-cyan);
}

.settings-field small {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-checkbox input {
  cursor: pointer;
  accent-color: var(--accent-cyan);
}

.settings-checkbox label {
  font-size: 0.8rem;
  color: var(--text-color);
  cursor: pointer;
}

/* Animations */
@keyframes logo-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes logo-spin-reverse {
  from { transform: translate(-50%, -50%) rotate(360deg); }
  to { transform: translate(-50%, -50%) rotate(0deg); }
}

@keyframes pulse-core {
  0%, 100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.8; box-shadow: 0 0 15px var(--accent-cyan); }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; box-shadow: 0 0 35px var(--accent-cyan); }
}

@keyframes pulse-green {
  0%, 100% { opacity: 0.6; box-shadow: 0 0 6px var(--color-green); }
  50% { opacity: 1; box-shadow: 0 0 12px var(--color-green); }
}

@keyframes pulse-orange {
  0%, 100% { opacity: 0.6; box-shadow: 0 0 6px #ffaa00; }
  50% { opacity: 1; box-shadow: 0 0 12px #ffaa00; }
}

@keyframes scale-up {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* ==========================================
   Task 3: Glassmorphism & Marble White Theme
   ========================================== */

body.sovereign-activated {
  background: linear-gradient(-45deg, #f3f4f6, #e5e7eb, #d1d5db, #f9fafb);
  background-size: 400% 400%;
  animation: gradient-flow 12s ease infinite;
}

body.sovereign-activated .sidebar {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-right: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.06);
}

body.sovereign-activated .brand-text h1 {
  background: linear-gradient(to right, #1d4ed8, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

body.sovereign-activated .control-group h3 {
  color: #4b5563;
  font-weight: 700;
}

body.sovereign-activated .service-card,
body.sovereign-activated .config-card {
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
}

body.sovereign-activated .service-card:hover,
body.sovereign-activated .config-card:hover {
  border-color: rgba(37, 99, 235, 0.3);
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}

body.sovereign-activated .service-name,
body.sovereign-activated .config-card label,
body.sovereign-activated label {
  color: #1f2937;
  font-weight: 600;
}

body.sovereign-activated .status-text {
  color: #4b5563;
}

body.sovereign-activated select,
body.sovereign-activated input {
  background: rgba(255, 255, 255, 0.8) !important;
  color: #111827 !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  font-weight: 500;
}

body.sovereign-activated select:focus,
body.sovereign-activated input:focus {
  border-color: #2563eb !important;
  box-shadow: 0 0 8px rgba(37, 99, 235, 0.15) !important;
}

body.sovereign-activated .btn-outline {
  border-color: rgba(0, 0, 0, 0.12);
  color: #4b5563;
  font-weight: 600;
}

body.sovereign-activated .btn-outline:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.05);
}

body.sovereign-activated .sidebar-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  color: #4b5563;
}

/* Advanced Settings Modal Glassmorphism */
body.sovereign-activated .settings-overlay {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

body.sovereign-activated .settings-modal {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  color: #111827;
}

body.sovereign-activated .modal-header h2 {
  background: linear-gradient(to right, #1d4ed8, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

body.sovereign-activated .settings-field label {
  color: #374151;
}

body.sovereign-activated .settings-field input {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(0, 0, 0, 0.15);
  color: #111827;
}

body.sovereign-activated .settings-field small {
  color: #6b7280;
}

body.sovereign-activated .settings-checkbox label {
  color: #374151;
}

/* ==========================================
   Task 4: Moving Graphics & Keyframes
   ========================================== */

@keyframes gradient-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.2; }
  50% { transform: scale(1.05); opacity: 0.4; }
  100% { transform: scale(0.95); opacity: 0.2; }
}

/* Smooth layout transition for app view */
.app-container {
  transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Sidebar uses max-width transition for smooth collapse without layout jump */
.sidebar {
  transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s ease,
              padding 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.3s ease,
              background-color 0.3s ease;
}

.main-content {
  transition: background-color 0.3s ease;
}

/* Background Particle Orbs */
.particles-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
  display: none;
}

body.sovereign-activated .particles-container {
  display: block;
}

.particle {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, rgba(37, 99, 235, 0) 70%);
  filter: blur(40px);
  opacity: 0.6;
}

.particle.p1 {
  width: 350px;
  height: 350px;
  top: 5%;
  left: 15%;
  animation: float-particle-1 25s ease-in-out infinite alternate;
}

.particle.p2 {
  width: 450px;
  height: 450px;
  bottom: 5%;
  right: 10%;
  background: radial-gradient(circle, rgba(127, 0, 255, 0.12) 0%, rgba(127, 0, 255, 0) 70%);
  animation: float-particle-2 30s ease-in-out infinite alternate;
}

.particle.p3 {
  width: 250px;
  height: 250px;
  top: 35%;
  right: 35%;
  background: radial-gradient(circle, rgba(0, 242, 254, 0.15) 0%, rgba(0, 242, 254, 0) 70%);
  animation: float-particle-3 20s ease-in-out infinite alternate;
}

@keyframes float-particle-1 {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(120px, 60px) scale(1.15); }
}

@keyframes float-particle-2 {
  0% { transform: translate(0, 0) scale(1.1); }
  100% { transform: translate(-140px, -90px) scale(0.95); }
}

@keyframes float-particle-3 {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(80px, -80px) rotate(180deg); }
}

/* Header Bar Styling */
.main-header {
  height: 50px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 15px;
  position: relative;
  z-index: 20;
  flex-shrink: 0;
}

.header-title {
  margin-left: 50px; /* Leave space for the toggle button */
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

/* Sidebar Collapse Styling */
.btn-sidebar-toggle {
  position: absolute;
  top: 6px; /* Centered in 50px height header */
  left: 15px;
  z-index: 50;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-sidebar-toggle:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(0, 242, 254, 0.15);
}

body.sovereign-activated .btn-sidebar-toggle {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(255, 255, 255, 0.6);
  color: #1f2937;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

body.sovereign-activated .btn-sidebar-toggle:hover {
  border-color: #2563eb;
  color: #2563eb;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 4px 15px rgba(37, 99, 235, 0.12);
}

/* Sidebar collapse — uses max-width so flexbox collapses smoothly without jump */
.app-container.sidebar-collapsed .sidebar {
  max-width: 0;
  padding: 0;
  border-right: none;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Glassmorphism sidebar overrides */
.sidebar {
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
  background-color: var(--sidebar-bg);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.05);
  max-width: 280px;   /* anchor for collapse transition */
  overflow: hidden;   /* clip content during collapse animation */
  width: 280px;       /* keep fixed width; max-width controls collapse */
  flex-shrink: 0;
}

.main-content {
  background-color: transparent;
}

.splash-screen {
  background: transparent !important;
}

.service-card, .config-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

.service-card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 4px 20px rgba(74, 144, 226, 0.1);
}

/* Fix dropdown and input styling to override hardcoded values */
select#sel-model-provider,
input#custom-model-input,
input#txt-pull-model,
input#api-key-input,
.settings-modal input {
  background: rgba(255, 255, 255, 0.65) !important;
  color: var(--text-color) !important;
  border: 1px solid var(--border-color) !important;
  outline: none;
  transition: var(--transition);
}

select#sel-model-provider option {
  background-color: #f5f3ef;
  color: #2c2c2c;
}

select#sel-model-provider:focus,
input#custom-model-input:focus,
input#txt-pull-model:focus,
input#api-key-input:focus,
.settings-modal input:focus {
  border-color: var(--accent-cyan) !important;
  box-shadow: 0 0 8px rgba(74, 144, 226, 0.25) !important;
}

/* Advanced Settings Modal */
.settings-overlay {
  background: rgba(248, 246, 244, 0.45);
  backdrop-filter: blur(var(--blur-amount));
  -webkit-backdrop-filter: blur(var(--blur-amount));
}

.settings-modal {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
  color: var(--text-color);
}

/* Logs Drawer Contrast */
.logs-drawer {
  background-color: rgba(20, 20, 35, 0.95);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.3);
}

.drawer-header {
  background-color: rgba(10, 10, 25, 0.98);
}

.terminal-stdout {
  color: #a5b4fc;
}

/* Scrollbar and Boundary constraints */
.nav-menu, .settings-modal, .drawer-body, .tab-content {
  overflow-y: auto !important;
  max-height: 100%;
  box-sizing: border-box;
}

.nav-menu::-webkit-scrollbar,
.settings-modal::-webkit-scrollbar {
  width: 6px;
}

.nav-menu::-webkit-scrollbar-thumb,
.settings-modal::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
}

/* Dynamic floating particles */
.particle.p1 {
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(74, 144, 226, 0.08) 0%, rgba(74, 144, 226, 0) 70%);
}

.particle.p2 {
  width: 250px;
  height: 250px;
  background: radial-gradient(circle, rgba(142, 36, 170, 0.05) 0%, rgba(142, 36, 170, 0) 70%);
}

.particle.p3 {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(74, 144, 226, 0.06) 0%, rgba(74, 144, 226, 0) 70%);
}

/* Smooth transition animations — excludes sidebar (handled separately above) */
.main-content, .service-card, .config-card, .settings-modal {
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
              opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), 
              background-color 0.3s ease, 
              border-color 0.3s ease;
}

/* ==========================================
   Toast Notification System
   ========================================== */

#toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  pointer-events: all;
  animation: toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  color: #fff;
}

@keyframes toast-slide-in {
  from { transform: translateX(120%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

.toast-success { background: rgba(0, 180, 100, 0.85); border-color: rgba(0,230,118,0.4); }
.toast-error   { background: rgba(200, 40, 40, 0.88);  border-color: rgba(255,82,82,0.4); }
.toast-warn    { background: rgba(200, 130, 0, 0.85);  border-color: rgba(255,170,0,0.4); }
.toast-info    { background: rgba(30, 80, 180, 0.85);  border-color: rgba(74,144,226,0.4); }

.toast-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.toast-msg {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.toast-close:hover { color: #fff; }

/* ==========================================
   Voice Button
   ========================================== */

.voice-listening {
  animation: pulse-core 1s ease-in-out infinite !important;
  border-color: #ff5252 !important;
  color: #ff5252 !important;
}

/* ==========================================
   Model Pool Cards (injected into webview / daemon page)
   ========================================== */

.model-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 14px;
  background: var(--card-bg);
  margin-bottom: 10px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.model-card:hover {
  border-color: var(--accent-cyan);
  box-shadow: 0 4px 12px rgba(74,144,226,0.12);
}

.model-card.model-local {
  border-left: 3px solid var(--color-green);
}

.model-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.model-name { font-weight: 700; font-size: 0.9rem; }

.model-provider {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(74,144,226,0.15);
  color: var(--accent-cyan);
}

.badge-ollama   { background: rgba(0,200,100,0.15); color: #00e676; }
.badge-anthropic { background: rgba(142,36,170,0.15); color: #ce93d8; }
.badge-openai   { background: rgba(100,180,60,0.15);  color: #a5d6a7; }
.badge-gemini   { background: rgba(74,144,226,0.15);  color: var(--accent-cyan); }

.model-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.meta-pill {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(0,0,0,0.08);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
}

.model-card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-download, .btn-use {
  font-family: var(--font-sans);
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  transition: opacity 0.2s, transform 0.1s;
}

.btn-download {
  background: linear-gradient(135deg, var(--accent-cyan), #00b0ff);
  color: #030310;
}

.btn-use {
  background: rgba(74,144,226,0.12);
  border: 1px solid rgba(74,144,226,0.3);
  color: var(--accent-cyan);
}

.btn-download:hover, .btn-use:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}

.status-badge.status-local {
  font-size: 0.72rem;
  color: var(--color-green);
  font-weight: 600;
}

.model-loading, .model-error, .model-empty {
  padding: 20px;
  text-align: center;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.model-error { color: var(--accent-red); }


```

---

## sovereign-desktop/renderer/renderer.js

```javascript
// ── Toast Notification System ────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
    return el;
  })();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warn' ? '⚠' : 'ℹ'}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  const delay = type === 'error' || type === 'warn' ? 5000 : 3000;
  setTimeout(() => toast.remove(), delay);
}
window.showToast = showToast;

// ── DOM elements ──────────────────────────────────────────────────────────────
const daemonStatusDot  = document.getElementById('daemon-status-dot');
const daemonStatusText = document.getElementById('daemon-status-text');
const btnStartDaemon   = document.getElementById('btn-start-daemon');
const btnStopDaemon    = document.getElementById('btn-stop-daemon');

// Health panel
const healthStatusDot  = document.getElementById('health-status-dot');
const healthStatusText = document.getElementById('health-status-text');

// Model & API Elements
const selModelProvider       = document.getElementById('sel-model-provider');
const apiKeyContainer        = document.getElementById('api-key-container');
const apiKeyInput            = document.getElementById('api-key-input');
const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
const customModelContainer   = document.getElementById('custom-model-container');
const customModelInput       = document.getElementById('custom-model-input');
const btnSaveApiConfig       = document.getElementById('btn-save-api-config');

// Model Downloader & Claude Code
const txtPullModel       = document.getElementById('txt-pull-model');
const btnPullModel       = document.getElementById('btn-pull-model');
const btnLaunchClaudeWin = document.getElementById('btn-launch-claude-win');
const localModelsList    = document.getElementById('local-models-list');
const btnRefreshLocalModels = document.getElementById('btn-refresh-local-models');

// Boot / splash elements
const bootLoadingContainer = document.getElementById('boot-loading-container');
const bootStatusText       = document.getElementById('boot-status-text');
const bootTimer            = document.getElementById('boot-timer');
const bootProgressBar      = document.getElementById('boot-progress-bar');

// Top bar / layout controls
const btnStartAll       = document.getElementById('btn-start-all');
const btnReloadWebview  = document.getElementById('btn-reload-webview');
const btnToggleLogs     = document.getElementById('btn-toggle-logs');
const btnToggleSidebar  = document.getElementById('btn-toggle-sidebar');
const btnCloseLogs      = document.getElementById('btn-close-logs');
const btnClearLogs      = document.getElementById('btn-clear-logs');
const btnSettings       = document.getElementById('btn-settings');
const btnCloseSettings  = document.getElementById('btn-close-settings');
const btnSaveSettings   = document.getElementById('btn-save-settings');

// Service management
const btnInstallService   = document.getElementById('btn-install-service');
const btnUninstallService = document.getElementById('btn-uninstall-service');
const serviceStatusText   = document.getElementById('service-status');

// Focus mode
const btnStartFocus = document.getElementById('btn-start-focus');
const btnStopFocus  = document.getElementById('btn-stop-focus');

// Checkboxes / misc
const chkUseQwen     = document.getElementById('chk-use-qwen');
const chkAutoCorrect = document.getElementById('chk-auto-correct');

// Views
const splashView    = document.getElementById('splash-view');
const dashboardView = document.getElementById('dashboard-view');
const settingsView  = document.getElementById('settings-view');
const logsDrawer    = document.getElementById('logs-drawer');
const btnBootSystem = document.getElementById('btn-boot-system');

const sovereignWebview = document.getElementById('sovereign-webview');

// Advanced settings
const bunPathInput  = document.getElementById('bun-path-input');
const chkAutoDaemon = document.getElementById('chk-auto-daemon');
const sysInfoText   = document.getElementById('sys-info-text');

// Terminal / drawer
const daemonTerminal = document.getElementById('daemon-terminal');
const drawerTabs     = document.querySelectorAll('.drawer-tab');
const tabContents    = document.querySelectorAll('.tab-content');

// ── App state ─────────────────────────────────────────────────────────────────
let appConfig             = null;
let daemonRunning         = false;
let activeTab             = 'daemon-logs';
let webviewLoaded         = false;
let statusCheckInProgress = false;

// ── Provider default model map ────────────────────────────────────────────────
const PROVIDER_DEFAULTS = {
  'ollama-local':    { placeholder: 'e.g. qwen2.5:1.5b, phi3:mini, mistral', needsKey: false },
  'anthropic-cloud': { placeholder: 'e.g. claude-3-5-haiku-latest',          needsKey: true  },
  'gemini-cloud':    { placeholder: 'e.g. gemini-1.5-flash',                  needsKey: true  },
  'openai-cloud':    { placeholder: 'e.g. gpt-4o-mini',                       needsKey: true  },
  'openrouter-cloud':{ placeholder: 'e.g. qwen/qwen-2.5-coder-1.5b-instruct:free', needsKey: true },
  'groq-cloud':      { placeholder: 'e.g. llama-3.3-70b-versatile',           needsKey: true  },
  'nvidia-cloud':    { placeholder: 'e.g. meta/llama-3.1-70b-instruct',       needsKey: true  },
};

// ── Initialize app ────────────────────────────────────────────────────────────
async function init() {
  appConfig = await window.api.getConfig();

  // Populate advanced settings
  bunPathInput.value    = appConfig.bunPath || 'bun';
  chkAutoDaemon.checked = appConfig.autoStartDaemon !== false;

  // Populate API configuration
  const apiConfig = await window.api.getApiConfig();
  selModelProvider.value = apiConfig.provider;
  apiKeyInput.value      = apiConfig.apiKey;
  customModelInput.value = apiConfig.customModel;
  updateProviderFields();

  setupEventListeners();

  // Register log listener
  window.api.onLog(({ source, text }) => {
    appendLog(source, text);
  });

  // Initial status checks
  await checkSystemStatus();
  if (typeof checkServiceStatus === 'function') await checkServiceStatus();

  // Load local Ollama models
  refreshLocalModels();

  // Periodic status checks (concurrency-guarded)
  setInterval(checkSystemStatus, 3000);

  // Auto-start
  if (appConfig.autoStartDaemon !== false && !daemonRunning) {
    bootDaemon();
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
  // Daemon controls
  btnStartDaemon.addEventListener('click', bootDaemon);
  btnBootSystem.addEventListener('click', bootDaemon);
  btnStopDaemon.addEventListener('click', stopDaemon);

  // API Config
  selModelProvider.addEventListener('change', updateProviderFields);
  btnSaveApiConfig.addEventListener('click', saveApiConfig);
  btnToggleKeyVisibility.addEventListener('click', toggleKeyVisibility);

  // Model Manager
  btnPullModel.addEventListener('click', pullModel);
  if (btnRefreshLocalModels) btnRefreshLocalModels.addEventListener('click', refreshLocalModels);

  // Claude Code
  btnLaunchClaudeWin.addEventListener('click', () => window.api.launchClaudeWin());

  // Hardware scan
  const btnScanHardware = document.getElementById('btn-scan-hardware');
  if (btnScanHardware) btnScanHardware.addEventListener('click', scanHardware);

  // Layout
  btnStartAll.addEventListener('click', startAllServices);
  btnReloadWebview.addEventListener('click', () => {
    if (daemonRunning) {
      appendLog('daemon', '[SYSTEM] Reloading Sovereign Interface...\n');
      sovereignWebview.reload();
    }
  });
  btnToggleLogs.addEventListener('click', toggleLogsDrawer);
  btnToggleSidebar.addEventListener('click', () => {
    document.querySelector('.app-container').classList.toggle('sidebar-collapsed');
  });
  btnCloseLogs.addEventListener('click', () => logsDrawer.classList.add('collapsed'));
  btnClearLogs.addEventListener('click', clearActiveTerminal);

  // Drawer tab switching
  drawerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      drawerTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');
    });
  });

  // Settings modal
  btnSettings.addEventListener('click', async () => {
    settingsView.classList.remove('hidden');
    if (typeof checkServiceStatus === 'function') await checkServiceStatus();
  });
  btnCloseSettings.addEventListener('click', () => settingsView.classList.add('hidden'));
  btnSaveSettings.addEventListener('click', saveSettings);
  settingsView.addEventListener('click', (e) => {
    if (e.target === settingsView) settingsView.classList.add('hidden');
  });

  // Service installer
  if (btnInstallService)   btnInstallService.addEventListener('click', installService);
  if (btnUninstallService) btnUninstallService.addEventListener('click', uninstallService);

  // Focus Mode
  if (btnStartFocus) btnStartFocus.addEventListener('click', startFocusMode);
  if (btnStopFocus)  btnStopFocus.addEventListener('click', stopFocusMode);
}

// ── Provider field visibility ─────────────────────────────────────────────────
function updateProviderFields() {
  const provider = selModelProvider.value;
  const cfg = PROVIDER_DEFAULTS[provider] || { needsKey: true, placeholder: '' };

  if (cfg.needsKey) {
    apiKeyContainer.classList.remove('hidden');
  } else {
    apiKeyContainer.classList.add('hidden');
  }
  customModelContainer.classList.remove('hidden');
  customModelInput.placeholder = cfg.placeholder;
}

// ── API Key visibility toggle ─────────────────────────────────────────────────
function toggleKeyVisibility() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    btnToggleKeyVisibility.textContent = '🔒';
  } else {
    apiKeyInput.type = 'password';
    btnToggleKeyVisibility.textContent = '👁️';
  }
}

// ── Save API configuration ────────────────────────────────────────────────────
async function saveApiConfig() {
  const provider    = selModelProvider.value;
  const apiKey      = apiKeyInput.value.trim();
  const customModel = customModelInput.value.trim();

  const cfg = PROVIDER_DEFAULTS[provider] || { needsKey: true };
  if (cfg.needsKey && !apiKey) {
    showToast('Please enter an API Key for the selected provider!', 'warn');
    return;
  }

  const result = await window.api.saveApiConfig({ provider, apiKey, customModel });
  if (result.success) {
    const original = btnSaveApiConfig.textContent;
    btnSaveApiConfig.textContent = '✓ Config Applied';
    btnSaveApiConfig.style.background = 'linear-gradient(135deg, #00e676, #00b0ff)';
    setTimeout(() => {
      btnSaveApiConfig.textContent = original;
      btnSaveApiConfig.style.background = '';
    }, 2000);
    showToast('Provider config saved!', 'success');
  } else {
    showToast(`Failed to save config: ${result.error}`, 'error');
  }
}

// ── Pull local models ─────────────────────────────────────────────────────────
async function pullModel() {
  const modelName = txtPullModel.value.trim();
  if (!modelName) {
    showToast('Please enter a valid model name (e.g. phi3, mistral).', 'warn');
    return;
  }

  btnPullModel.disabled = true;
  btnPullModel.textContent = '📥 Downloading...';
  logsDrawer.classList.remove('collapsed');
  const logTab = document.querySelector('[data-tab="daemon-logs"]');
  if (logTab) logTab.click();

  const result = await window.api.pullModel(modelName);
  btnPullModel.disabled = false;
  btnPullModel.textContent = '📥 Download Model';

  if (result.success) {
    showToast(`Model "${modelName}" downloaded successfully!`, 'success');
    txtPullModel.value = '';
    refreshLocalModels();
  } else {
    showToast(`Failed to download model: ${result.error}`, 'error');
  }
}

// ── List locally installed Ollama models ──────────────────────────────────────
async function refreshLocalModels() {
  if (!localModelsList) return;
  localModelsList.textContent = 'Loading...';
  try {
    const result = await window.api.listLocalModels();
    if (result.success && result.models.length > 0) {
      localModelsList.innerHTML = result.models
        .map(m => `<div style="display:flex;justify-content:space-between;"><span>• ${m}</span><button onclick="activateModel('${m}','ollama')" style="background:none;border:none;color:var(--accent-cyan);cursor:pointer;font-size:0.9em;">Use</button></div>`)
        .join('');
    } else {
      localModelsList.textContent = 'No models installed.';
    }
  } catch (e) {
    localModelsList.textContent = 'Ollama not found.';
  }
}

// ── Hardware scan ─────────────────────────────────────────────────────────────
async function scanHardware() {
  const hwInfo           = document.getElementById('hw-info');
  const hwRecommendation = document.getElementById('hw-recommendation');
  const btnScan          = document.getElementById('btn-scan-hardware');
  if (!hwInfo || !hwRecommendation || !btnScan) return;

  btnScan.disabled = true;
  btnScan.textContent = '🔍 Scanning...';
  hwInfo.textContent = 'Scanning...';

  try {
    const specs = await window.api.scanHardware();

    hwInfo.innerHTML = `
      <b>${specs.cpuModel.split(' ').slice(0, 5).join(' ')}</b><br>
      🧠 RAM: ${specs.totalRamGb}GB total, ${specs.freeRamGb}GB free<br>
      ⚡ CPU Cores: ${specs.cpuCores}<br>
      🖥️ GPU: ${specs.gpuName || 'None'} ${specs.gpuVramGb ? `(${specs.gpuVramGb}GB VRAM)` : ''}
    `;

    hwRecommendation.classList.remove('hidden');
    hwRecommendation.innerHTML = `
      💡 <b>Recommended:</b> ${specs.recommended}<br>
      ${specs.recommendation}
    `;

    // Mirror specs into Settings > System Info panel
    if (sysInfoText) {
      sysInfoText.innerHTML = `
        🖥️ <b>CPU:</b> ${specs.cpuModel} (${specs.cpuCores} cores)<br>
        🧠 <b>RAM:</b> ${specs.totalRamGb}GB total / ${specs.freeRamGb}GB free<br>
        ⚡ <b>GPU:</b> ${specs.gpuName || 'Unknown'} (${specs.gpuVramGb || 0}GB VRAM)<br>
        🏷️ <b>OS:</b> ${specs.platform} / ${specs.arch}<br>
        💡 <b>Recommended model:</b> ${specs.recommended}
      `;
    }

    // Auto-fill the model input
    if (customModelInput) {
      customModelInput.value = specs.recommended;
      selModelProvider.value = 'ollama-local';
      updateProviderFields();
    }
  } catch (err) {
    hwInfo.textContent = 'Scan failed: ' + err.message;
  }

  btnScan.disabled = false;
  btnScan.textContent = '🔍 Scan Specs';
}

// ── Status checks ─────────────────────────────────────────────────────────────
async function checkSystemStatus() {
  if (statusCheckInProgress) return;
  statusCheckInProgress = true;
  try {
    const daemonStatus = await window.api.checkDaemonStatus();
    updateDaemonUI(daemonStatus);

    // Lightweight health check if daemon is running
    if (daemonStatus) {
      const health = await window.api.healthCheck();
      updateHealthUI(health);
    } else {
      updateHealthUI(null);
    }
  } finally {
    statusCheckInProgress = false;
  }
}

function updateDaemonUI(isRunning) {
  daemonRunning = isRunning;
  document.body.classList.toggle('sovereign-activated', isRunning);

  if (isRunning) {
    daemonStatusDot.className = 'status-indicator running';
    daemonStatusText.textContent = 'Online (Port 3142)';
    btnStartDaemon.disabled = true;
    btnStopDaemon.disabled  = false;

    splashView.classList.add('hidden');
    dashboardView.classList.remove('hidden');

    if (!webviewLoaded) {
      appendLog('daemon', '[SYSTEM] Directing interface view to http://localhost:3142\n');
      sovereignWebview.src = 'http://localhost:3142';
      webviewLoaded = true;
    }
  } else {
    daemonStatusDot.className = 'status-indicator stopped';
    daemonStatusText.textContent = 'Offline';
    btnStartDaemon.disabled = false;
    btnStopDaemon.disabled  = true;

    splashView.classList.remove('hidden');
    dashboardView.classList.add('hidden');

    if (webviewLoaded) {
      sovereignWebview.src = 'about:blank';
      webviewLoaded = false;
    }
  }
}

function updateHealthUI(health) {
  if (!healthStatusDot || !healthStatusText) return;
  if (!health) {
    healthStatusDot.className = 'status-indicator stopped';
    healthStatusText.textContent = '—';
    return;
  }
  if (health.status === 'running') {
    healthStatusDot.className = 'status-indicator running';
    healthStatusText.textContent = `Port ${health.port} active`;
  } else {
    healthStatusDot.className = 'status-indicator stopped';
    healthStatusText.textContent = 'Not responding';
  }
}

// ── Daemon Actions ────────────────────────────────────────────────────────────
async function bootDaemon() {
  daemonStatusDot.className = 'status-indicator pending';
  daemonStatusText.textContent = 'Booting...';
  btnStartDaemon.disabled = true;
  btnBootSystem.disabled  = true;

  bootLoadingContainer.classList.remove('hidden');
  logsDrawer.classList.remove('collapsed');

  const options = {
    useQwen:     chkUseQwen.checked,
    autoCorrect: chkAutoCorrect.checked
  };

  let progress      = 0;
  let remainingTime = 10;
  bootProgressBar.style.width = '0%';
  bootTimer.textContent = '10s';

  const statuses = [
    { threshold: 8, text: 'Initializing Sovereign environment...'    },
    { threshold: 6, text: 'Booting Sovereign Brain...'               },
    { threshold: 4, text: 'Loading local model configuration...'    },
    { threshold: 2, text: 'Starting channels & websocket server...' },
    { threshold: 0, text: 'Connecting to system interface...'       },
  ];

  const bootInterval = setInterval(() => {
    progress      += 10;
    remainingTime -= 1;
    bootProgressBar.style.width = `${progress}%`;
    bootTimer.textContent = `${remainingTime}s`;

    const status = statuses.find(s => remainingTime >= s.threshold);
    if (status) bootStatusText.textContent = status.text;

    if (remainingTime <= 0) clearInterval(bootInterval);
  }, 1000);

  const result = await window.api.startDaemon(options);

  clearInterval(bootInterval);
  bootProgressBar.style.width = '100%';
  bootTimer.textContent = '0s';
  bootStatusText.textContent = 'Sovereign is Ready!';

  setTimeout(async () => {
    bootLoadingContainer.classList.add('hidden');
    await checkSystemStatus();
    btnBootSystem.disabled  = false;
    btnStartDaemon.disabled = false;

    if (result && !result.success) {
      showToast(`Daemon failed to start: ${result.error || 'Unknown error'}`, 'error');
      logsDrawer.classList.remove('collapsed');
    }
  }, 800);
}

async function stopDaemon() {
  if (confirm('Are you sure you want to shut down the Sovereign daemon?')) {
    daemonStatusDot.className = 'status-indicator pending';
    daemonStatusText.textContent = 'Stopping...';
    btnStopDaemon.disabled = true;

    await window.api.stopDaemon();
    await checkSystemStatus();
  }
}

async function startAllServices() {
  if (!daemonRunning) await bootDaemon();
}

// ── Service Management ────────────────────────────────────────────────────────
async function installService() {
  if (!btnInstallService) return;
  btnInstallService.disabled = true;
  if (serviceStatusText) serviceStatusText.textContent = 'Installing... (approve the UAC prompt)';
  try {
    const result = await window.api.installWindowsService();
    if (result.success) {
      showToast('✅ Background service installed and running 24/7!', 'success');
    } else {
      showToast(`Failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    await checkServiceStatus();
    btnInstallService.disabled = false;
  }
}

async function uninstallService() {
  if (!btnUninstallService) return;
  btnUninstallService.disabled = true;
  if (serviceStatusText) serviceStatusText.textContent = 'Uninstalling service...';
  try {
    const result = await window.api.uninstallWindowsService();
    if (result.success) {
      showToast('Background service uninstalled successfully', 'success');
    } else {
      showToast(`Failed to uninstall service: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    await checkServiceStatus();
    btnUninstallService.disabled = false;
  }
}

async function checkServiceStatus() {
  if (!serviceStatusText) return;
  try {
    const status   = await window.api.checkServiceInstalled();
    const daemonOk = status?.daemon ?? status === true;

    if (daemonOk) {
      serviceStatusText.textContent = '✅ Service installed & running 24/7';
      serviceStatusText.style.color = '#00e676';
      if (btnInstallService)   btnInstallService.style.display   = 'none';
      if (btnUninstallService) btnUninstallService.style.display = 'block';
    } else {
      serviceStatusText.textContent = '❌ Service not installed';
      serviceStatusText.style.color = 'var(--text-muted)';
      if (btnInstallService)   { btnInstallService.style.display = 'block'; btnInstallService.textContent = '⚡ Install 24/7 Service'; }
      if (btnUninstallService) btnUninstallService.style.display = 'none';
    }
  } catch (err) {
    serviceStatusText.textContent = 'Status: Unknown';
  }
}

// ── Focus Mode ────────────────────────────────────────────────────────────────
async function startFocusMode() {
  if (!btnStartFocus) return;
  btnStartFocus.disabled = true;
  try {
    const result = await window.api.startFocusMode();
    if (result.success) {
      showToast(`Focus Mode enabled. Lowered priority of ${result.loweredCount} processes.`, 'success');
      btnStartFocus.style.display = 'none';
      if (btnStopFocus) btnStopFocus.style.display = 'block';
    } else {
      showToast(`Failed to start Focus Mode: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    btnStartFocus.disabled = false;
  }
}

async function stopFocusMode() {
  if (!btnStopFocus) return;
  btnStopFocus.disabled = true;
  try {
    const result = await window.api.stopFocusMode();
    if (result.success) {
      showToast(`Focus Mode disabled. Restored priority of ${result.restoredCount} processes.`, 'success');
      if (btnStartFocus) btnStartFocus.style.display = 'block';
      btnStopFocus.style.display = 'none';
    } else {
      showToast(`Failed to stop Focus Mode: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    btnStopFocus.disabled = false;
  }
}

// ── Settings Save ─────────────────────────────────────────────────────────────
async function saveSettings() {
  const bunPath        = bunPathInput.value.trim();
  const autoStartDaemon = chkAutoDaemon.checked;

  if (!bunPath) {
    showToast('Bun path cannot be empty!', 'warn');
    return;
  }

  appConfig.bunPath        = bunPath;
  appConfig.autoStartDaemon = autoStartDaemon;

  await window.api.saveConfig({ bunPath, autoStartDaemon });
  appendLog('daemon', `[SYSTEM] Saved settings. Bun Path: ${bunPath}\n`);
  showToast('Settings saved!', 'success');
  settingsView.classList.add('hidden');
}

// ── Log management ────────────────────────────────────────────────────────────
function toggleLogsDrawer() {
  logsDrawer.classList.toggle('collapsed');
}

function clearActiveTerminal() {
  if (activeTab === 'daemon-logs') daemonTerminal.textContent = '';
}

function appendLog(source, text) {
  const terminal = daemonTerminal;
  if (!terminal) return;

  // Strip ANSI escape codes
  const clean = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  terminal.textContent += clean;

  // Cap at 5000 lines
  const lines = terminal.textContent.split('\n');
  if (lines.length > 5000) {
    terminal.textContent = lines.slice(lines.length - 5000).join('\n');
  }

  // Auto-scroll
  const container = terminal.parentElement;
  container.scrollTop = container.scrollHeight;
}

// ── Voice Recognition ─────────────────────────────────────────────────────────
(function initVoice() {
  window.addEventListener('DOMContentLoaded', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn  = document.getElementById('voice-btn');
    const chatInput = document.getElementById('chat-input') || document.querySelector('textarea, input[type=text]');

    if (!SpeechRecognition || !voiceBtn) return;

    const recognition    = new SpeechRecognition();
    recognition.continuous     = false;
    recognition.interimResults = true;
    recognition.lang           = localStorage.getItem('sovereign_voice_lang') || 'en-US';

    let listening = false;

    voiceBtn.addEventListener('click', () => {
      listening ? recognition.stop() : recognition.start();
    });

    recognition.onstart = () => {
      listening = true;
      voiceBtn.classList.add('voice-listening');
      showToast('Listening...', 'info');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      if (chatInput) chatInput.value = transcript;
    };

    recognition.onend = () => {
      listening = false;
      voiceBtn.classList.remove('voice-listening');
    };

    recognition.onerror = (event) => {
      listening = false;
      voiceBtn.classList.remove('voice-listening');
      showToast(`Voice error: ${event.error}`, 'error');
    };
  });
})();

// ── Text-to-Speech ────────────────────────────────────────────────────────────
function speakText(text) {
  if (!window.speechSynthesis) return;
  if (localStorage.getItem('sovereign_tts') !== 'true') return;
  window.speechSynthesis.cancel();
  const utter     = new SpeechSynthesisUtterance(text);
  const voiceName = localStorage.getItem('sovereign_tts_voice');
  if (voiceName) {
    const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
    if (voice) utter.voice = voice;
  }
  utter.rate  = 1.0;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}
window.speakText = speakText;

// ── Model Pool & Hardware Recommender ─────────────────────────────────────────
async function initModelPool() {
  const hardwareInfo = document.getElementById('hardware-info');
  const modelList    = document.getElementById('model-list');
  const searchInput  = document.getElementById('model-search');
  const refreshBtn   = document.getElementById('refresh-pool-btn');

  if (!hardwareInfo || !modelList) return;

  let specs = null;
  try {
    specs = await window.api.scanHardware();
    if (hardwareInfo) {
      hardwareInfo.textContent = `CPU: ${specs.cpuModel} (${specs.cpuCores} cores) | RAM: ${specs.totalRamGb}GB | GPU: ${specs.gpuName || 'None'} ${specs.gpuVramGb ? `(${specs.gpuVramGb}GB VRAM)` : ''}`;
    }
  } catch (e) {
    if (hardwareInfo) hardwareInfo.textContent = 'Hardware scan failed';
  }

  let allModels = [];

  async function loadModels() {
    if (!modelList) return;
    modelList.innerHTML = '<div class="model-loading">Loading...</div>';
    try {
      const result = await window.api.getCompatibleModels(
        specs?.totalRamGb || 8,
        specs?.gpuVramGb  || 0
      );
      allModels = result.models || [];
      renderModels(allModels);
    } catch (e) {
      modelList.innerHTML = '<div class="model-error">Failed to load models. Is the daemon running?</div>';
    }
  }

  function renderModels(models) {
    if (!modelList) return;
    const query       = (searchInput?.value || '').toLowerCase();
    const activeFilter = document.querySelector('.pill.active')?.dataset.filter || 'all';

    const filtered = models.filter(m => {
      const tags = (m.tags || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      const matchSearch = !query || name.includes(query) || tags.includes(query);
      const matchFilter = activeFilter === 'all' ||
        (activeFilter === 'local' && m.is_local) ||
        (activeFilter === 'cloud' && !m.is_local) ||
        (activeFilter === 'free'  && tags.includes('free'));
      return matchSearch && matchFilter;
    });

    if (filtered.length === 0) {
      modelList.innerHTML = '<div class="model-empty">No models match your filter.</div>';
      return;
    }

    modelList.innerHTML = filtered.map(m => `
      <div class="model-card ${m.is_local ? 'model-local' : ''}" data-name="${m.name}">
        <div class="model-card-header">
          <span class="model-name">${m.display_name}</span>
          <span class="model-provider badge-${m.provider}">${m.provider}</span>
        </div>
        <div class="model-card-meta">
          <span class="meta-pill">⚡ Speed ${m.speed_rank}</span>
          ${m.parameter_count ? `<span class="meta-pill">${m.parameter_count}B params</span>` : ''}
          ${m.context_length  ? `<span class="meta-pill">${(m.context_length/1000).toFixed(0)}K ctx</span>` : ''}
          <span class="meta-pill">${m.min_ram}GB RAM</span>
        </div>
        <div class="model-card-actions">
          ${m.is_local
            ? '<span class="status-badge status-local">✓ Installed</span>'
            : m.download_command
              ? `<button class="btn-download" onclick="downloadModel('${m.name}', '${m.download_command}')">⬇ Download</button>`
              : `<a class="btn-download" href="${m.download_url}" target="_blank">↗ View</a>`
          }
          <button class="btn-use" onclick="activateModel('${m.name}', '${m.provider}')">Use</button>
        </div>
      </div>
    `).join('');
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '↻ Refreshing...';
      refreshBtn.disabled    = true;
      try {
        await window.api.refreshModelPool();
        showToast('Model pool refreshed!', 'success');
        await loadModels();
      } catch (e) {
        showToast('Refresh failed: ' + e.message, 'error');
      } finally {
        refreshBtn.textContent = '↻ Refresh';
        refreshBtn.disabled    = false;
      }
    });
  }

  if (searchInput) searchInput.addEventListener('input', () => renderModels(allModels));

  document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderModels(allModels);
    });
  });

  await loadModels();
}

// ── Global model helpers (called from inline HTML) ────────────────────────────
window.downloadModel = async function(name) {
  showToast(`Starting download: ${name}`, 'info');
  try {
    const result = await window.api.pullModel(name);
    if (result.success) {
      showToast(`Download complete: ${name}`, 'success');
      refreshLocalModels();
    } else {
      showToast(`Download failed: ${result.error}`, 'error');
    }
  } catch (e) {
    showToast(`Download error: ${e.message}`, 'error');
  }
};

window.activateModel = async function(name, provider) {
  showToast(`Activating ${name}...`, 'info');
  try {
    const providerKey = provider === 'ollama' ? 'ollama-local' : `${provider}-cloud`;
    await window.api.saveApiConfig({ provider: providerKey, customModel: name, apiKey: '' });
    selModelProvider.value = providerKey;
    customModelInput.value = name;
    updateProviderFields();
    showToast(`Now using: ${name}`, 'success');
  } catch (e) {
    showToast('Failed to activate model', 'error');
  }
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Init model pool after daemon has time to start
  setTimeout(initModelPool, 2000);
});

```

---

