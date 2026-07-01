const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');
const net = require('net');
const { BrainBridge } = require('./brain-bridge');

const BRAIN_PORT = 3142;
const configPath = path.join(__dirname, 'config.json');

// Native Windows data directory (same as what the Bun daemon uses)
const sovereignDataDir = path.join(os.homedir(), '.sovereign');
const sovereignLogFile = path.join(sovereignDataDir, 'sovereign.log');
const sovereignConfigYaml = path.join(sovereignDataDir, 'config.yaml');

// ─── Crash Reporting ────────────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('[CRASH] Uncaught Exception:', error);
  try {
    fs.appendFileSync(sovereignLogFile, `[CRASH] Uncaught Exception: ${error?.stack || error}\n`, 'utf8');
  } catch {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    fs.appendFileSync(sovereignLogFile, `[CRASH] Unhandled Rejection: ${reason?.stack || reason}\n`, 'utf8');
  } catch {}
});

// Core project root (parent of sovereign-desktop)
const projectRoot = path.join(__dirname, '..');
const coreDir = path.join(projectRoot, 'sovereign-core');
const brainScript   = path.join(coreDir, 'src', 'brain',   'index.ts');
const daemonScript  = brainScript; // brain is now the unified process (handles HTTP/WS on port BRAIN_PORT)

// Windows Task Scheduler task name
const DAEMON_TASK = 'SovereignBrain';

// Focus mode exclude list - exclude common browsers and editors
const FOCUS_EXCLUDE = 'chrome.exe|firefox.exe|msedge.exe|brave.exe|safari.exe|opera.exe|Code.exe|code.exe|vim.exe|neovim.exe|cursor.exe|SublimeText.exe|NOTEPAD++.exe';

// Default config
let config = {
  token: '',
  bunPath: 'bun', // override if bun is not in PATH
  autoStartDaemon: true  // auto-start daemon on app launch
};

// ─── Resource Manager ────────────────────────────────────────────────────────
class ResourceManager {
  constructor() {
    this.resources = new Set();
  }

  register(resource, cleanup) {
    this.resources.add({ resource, cleanup });
  }

  unregister(resource) {
    for (const entry of this.resources) {
      if (entry.resource === resource) {
        entry.cleanup();
        this.resources.delete(entry);
        break;
      }
    }
  }

  cleanupAll() {
    for (const { cleanup } of this.resources) {
      try {
        cleanup();
      } catch (error) {
        console.error('Resource cleanup error:', error);
      }
    }
    this.resources.clear();
  }
}

// ─── Secure PowerShell Executor ─────────────────────────────────────────────
class SecurePowerShellExecutor {
  constructor() {
    this.allowedScripts = new Set([
      path.normalize(path.join(__dirname, 'scripts', 'install-windows-tasks.ps1')),
      path.normalize(path.join(__dirname, 'scripts', 'uninstall-windows-tasks.ps1')),
      path.normalize(path.join(__dirname, 'watchdog.ps1'))
    ]);
    this.allowedArgs = new Set([
      'max-memory', 'max-threads', 'gpu-memory'
    ]);
  }

  isPathAllowed(scriptPath) {
    const normalizedPath = path.normalize(scriptPath);
    return this.allowedScripts.has(normalizedPath);
  }

  isArgsAllowed(args) {
    return args.every(arg => this.allowedArgs.has(arg) || /^\d+$/.test(arg) || /^[a-zA-Z0-9_-]+$/.test(arg));
  }

  runElevated(scriptPath, extraArgs = []) {
    return new Promise((resolve) => {
      if (!this.isPathAllowed(scriptPath)) {
        return resolve({ success: false, error: 'Script path not allowed' });
      }
      if (!this.isArgsAllowed(extraArgs)) {
        return resolve({ success: false, error: 'Arguments not allowed' });
      }
      if (!fs.existsSync(scriptPath)) {
        return resolve({ success: false, error: `Script not found: ${scriptPath}` });
      }

      // Sanitize arguments
      const sanitizedArgs = extraArgs.map(arg => String(arg).replace(/[^a-zA-Z0-9_-]/g, ''));

      // Build argument list as a proper PowerShell array
      const argList = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...sanitizedArgs
      ];

      const argListLiteral = argList.map(a => {
        const escaped = String(a).replace(/"/g, '""').replace(/`/g, '``');
        return `"${escaped}"`;
      }).join(', ');

      const innerCommand = `Start-Process -FilePath powershell -ArgumentList @(${argListLiteral}) -Verb RunAs -Wait`;

      const proc = spawn('powershell', [
        '-NoProfile', 
        '-NonInteractive', 
        '-ExecutionPolicy', 'Bypass',
        '-Command', innerCommand
      ], {
        windowsHide: true
      });

      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => resolve({ success: code === 0, code, stderr }));
      proc.on('error', (err) => resolve({ success: false, error: err.message }));
    });
  }
}

// ─── Thread Safe State ───────────────────────────────────────────────────────
class ThreadSafeState {
  constructor() {
    this.state = {
      mainWindow: null,
      logTailProcess: null,
      watchdogProcess: null,
      daemonDirectProcess: null,
      isShuttingDown: false
    };
    this.lock = Promise.resolve();
  }

  acquireLock(operation) {
    const next = this.lock.then(async () => {
      try {
        return await operation();
      } finally {
        // Lock released
      }
    });
    this.lock = next.catch(() => {});
    return next;
  }

  setMainWindow(window) {
    this.state.mainWindow = window;
  }

  getMainWindow() {
    return this.state.mainWindow;
  }

  setShuttingDown(value) {
    this.state.isShuttingDown = value;
  }

  isShuttingDown() {
    return this.state.isShuttingDown;
  }
}

// ─── Error Handling Service ─────────────────────────────────────────────────
class ErrorHandlingService {
  constructor() {
    this.retryAttempts = new Map();
  }

  async withRetry(operationName, operation, maxRetries = 3, baseDelay = 1000) {
    const key = `${operationName}_${Date.now()}`;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        this.retryAttempts.delete(key);
        return result;
      } catch (error) {
        console.error(`${operationName} attempt ${attempt + 1} failed:`, error);
        if (attempt === maxRetries) {
          this.retryAttempts.set(key, 0);
          throw error;
        }
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    throw new Error(`${operationName} failed after ${maxRetries} attempts`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Memory Leak Protection ──────────────────────────────────────────────────
class MemoryLeakProtection {
  constructor() {
    this.timers = new Set();
    this.intervals = new Set();
    this.processes = new Set();
  }

  setTimeout(callback, delay) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      try { callback(); } catch (e) { console.error('Timeout error:', e); }
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  clearTimeout(timer) {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  setInterval(callback, delay) {
    const interval = setInterval(() => {
      try {
        callback();
      } catch (error) {
        console.error('Interval callback error:', error);
      }
    }, delay);
    this.intervals.add(interval);
    return interval;
  }

  clearInterval(interval) {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  registerProcess(proc) {
    this.processes.add(proc);
  }

  unregisterProcess(proc) {
    this.processes.delete(proc);
  }

  cleanupAll() {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    for (const proc of this.processes) {
      try {
        if (proc.pid) {
          const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
          killer.unref();
        }
      } catch (error) {
        console.error('Process termination error:', error);
      }
    }
    this.processes.clear();
  }
}
// ─── Soverign Desktop Application ──────────────────────────────────────────

class SovereignDesktopApp {
  constructor() {
    this.resourceManager = new ResourceManager();
    this.secureExecutor = new SecurePowerShellExecutor();
    this.threadSafe = new ThreadSafeState();
    this.errorHandler = new ErrorHandlingService();
    this.memoryProtector = new MemoryLeakProtection();
    this.brain = new BrainBridge();
    
    this.daemonDirectProcess = null;
  }

  async initialize() {
    this.loadConfig();
    this.setupIPC();
    this.setupCleanupHandlers();

    // Resolve Bun path from known locations if not in config
    await this.autoResolveBunPath();

    // First-run auto-setup: install missing core deps silently
    this.autoSetupDeps().catch(err => {
      console.warn('[Main] Auto-setup warning:', err.message);
    });

    // Auto-start the brain (core AI services) at app launch.
    this.startBrain().catch(err => {
      console.error('[Main] Brain startup failed:', err.message);
    });
  }

  async autoResolveBunPath() {
    if (config.bunPath && config.bunPath !== 'bun' && fs.existsSync(config.bunPath)) return;
    const knownPaths = [
      path.join(os.homedir(), '.bun', 'bin', 'bun.exe'),
      path.join(os.homedir(), '.bun', 'bin', 'bun'),
      'C:\\Program Files\\Bun\\bun.exe',
    ];
    for (const p of knownPaths) {
      if (fs.existsSync(p)) {
        config.bunPath = p;
        this.saveConfig();
        return;
      }
    }
    // Check PATH with proper error handling
    try {
      const which = spawn('where', ['bun'], { windowsHide: true });
      const onPath = await new Promise((resolve, reject) => {
        let out = '';
        which.stdout.on('data', (d) => { out += d.toString(); });
        which.on('error', (err) => {
          console.warn('[autoResolveBunPath] where bun error:', err.message);
          resolve('');
        });
        which.on('close', (code) => {
          if (code !== 0) resolve('');
          else resolve(out.trim());
        });
      });
      if (onPath) {
        config.bunPath = onPath.split('\n')[0].trim();
        this.saveConfig();
      }
    } catch (err) {
      console.warn('[autoResolveBunPath] Failed to check PATH for bun:', err.message);
    }
  }

  async autoSetupDeps() {
    const win = this.threadSafe.getMainWindow();
    const send = (msg) => {
      if (win && !win.isDestroyed()) win.webContents.send('log-data', { source: 'brain', text: msg });
    };

    // Check core deps
    const coreDeps = await this.checkDeps(true);
    if (!coreDeps) {
      const bunOk = await this.execCommand((config.bunPath || 'bun') + ' --version');
      if (!bunOk) {
        send('[SETUP] Bun not found. Click Verify & Download in Settings.\n');
        return;
      }
      send('[SETUP] Installing core dependencies...\n');
      try {
        await this.installDeps(true);
        send('[SETUP] Core dependencies installed.\n');
      } catch (e) {
        send(`[SETUP] Core dep install failed: ${e.message}\n`);
        return;
      }
    }

    // Auto-detect hardware and recommend low-spec model
    const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
    const cpuCores = os.cpus().length;
    const NO_GPU_MODEL = 'qwen2.5:0.5b';
    let recommendedModel = NO_GPU_MODEL;
    if (totalRamGb >= 16 && cpuCores >= 4) recommendedModel = 'qwen2.5-coder:3b';
    else if (totalRamGb >= 8) recommendedModel = 'qwen2.5:1.5b';
    else recommendedModel = NO_GPU_MODEL;

    if (!config.lowSpecMode && totalRamGb < 8) {
      config.lowSpecMode = true;
      this.saveConfig();
      send(`[SETUP] Low-RAM mode enabled (${totalRamGb}GB). Default model: ${recommendedModel}\n`);
    }
  }

  startBrain() {
    if (this._brainDebounceTimer) return Promise.resolve(false);
    return this._brainStart();
  }

  async _brainStart() {
    this._brainDebounceTimer = setTimeout(() => { this._brainDebounceTimer = null; }, 5000);
    const dataDir = path.join(os.homedir(), '.sovereign');

    // Skip if brain is already running on port 3142 (e.g. via Windows service)
    const alreadyRunning = await this.checkDaemonPort();
    if (alreadyRunning) {
      this._brainDebounceTimer = null;
      console.log(`[Main] Brain already running on port ${BRAIN_PORT} — using existing process`);
      this.brain.ready = true;
      this.brain.started = true;
      this.emitBrainReady();
      return;
    }

    try {
      await this.brain.start(config.bunPath || 'bun', dataDir);
      console.log('[Main] Brain is ready');

      // Remove any stale listeners from a previous startBrain() call
      this.brain.removeAllListeners();

      // Forward brain logs to the renderer
      const onBrainLog = (text) => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('log-data', { source: 'brain', text });
        }
      };
      this.brain.on('log', onBrainLog);

      // Forward brain events to renderer
      this.brain.on('brain:log', (params) => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('brain-event', { event: 'log', data: params });
        }
      });

      this.brain.on('brain:ready', () => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('brain-status', { running: true });
        }
      });

      this.brain.on('brain:status', (params) => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          // Forward status to renderer — show "Starting..." during boot
          if (params.phase === 'starting' || params.phase === 'booting') {
            win.webContents.send('brain-status', { running: false, starting: true });
          }
          this.sendLog('brain', `[STATUS] ${params.message}\n`);
        }
      });

      this.brain.on('exit', () => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('brain-status', { running: false });
        }
      });

      this.brain.on('brain:error', (params) => {
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('brain-status', { running: false, error: params.message });
        }
        this.sendLog('brain', `[ERROR] ${params.message}\n`);
      });
    } catch (err) {
      console.error('[Main] Failed to start brain:', err.message);
      this.sendLog('brain', `[ERROR] Brain failed to start: ${err.message}\n`);
      this.sendLog('brain', '[HINT] Ensure Bun is installed and accessible.\n');
    }
  }

  loadConfig() {
    if (fs.existsSync(configPath)) {
      try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      } catch (e) {
        console.error('Failed to parse config:', e);
      }
    }
  }

  saveConfig() {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  createWindow() {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'Soverign Desktop Console',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: true,
        allowRunningInsecureContent: false
      },
      frame: true,
      show: false,
      backgroundColor: '#0b0b1e'
    });

    this.threadSafe.setMainWindow(win);

    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Allow webview to navigate to any URL (localhost for the daemon SPA)
    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      webPreferences.preload = path.join(__dirname, 'preload.js');
      webPreferences.allowRunningInsecureContent = false;
    });

    // Renderer Crash Watchdog
    win.webContents.on('render-process-gone', (event, details) => {
      console.error('[CRASH] Renderer process gone:', details);
      try {
        fs.appendFileSync(sovereignLogFile, `[CRASH] Renderer process gone: ${JSON.stringify(details)}\n`, 'utf8');
      } catch {}
    });

    win.once('ready-to-show', () => {
      win.show();
    });

    win.on('closed', () => {
      this.threadSafe.setMainWindow(null);
      this.cleanupProcesses();
    });
  }

  cleanupProcesses() {
    this.stopLogTail();
    if (this.brain) {
      this.brain.stop();
    }
    // Stop direct daemon process if it was started locally
    const daemonProc = this.daemonDirectProcess;
    if (daemonProc) {
      try {
        if (daemonProc.pid) {
          const killer = spawn('taskkill', ['/pid', String(daemonProc.pid), '/T', '/F']);
          killer.unref();
        }
      } catch (e) {
        console.warn('Failed to kill daemon process on cleanup:', e.message);
      }
      this.daemonDirectProcess = null;
      this.memoryProtector.unregisterProcess(daemonProc);
    }

    // Kill watchdog if running
    const watchdogProc = this.threadSafe.state.watchdogProcess;
    if (watchdogProc) {
      try {
        if (watchdogProc.pid) {
          const killer = spawn('taskkill', ['/pid', String(watchdogProc.pid), '/T', '/F']);
          killer.unref();
        }
      } catch (e) {
        console.warn('[cleanup] Failed to kill watchdog:', e.message);
      }
      this.threadSafe.state.watchdogProcess = null;
      this.memoryProtector.unregisterProcess(watchdogProc);
    }
  }

  checkDaemonPort() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const onError = () => {
        socket.destroy();
        resolve(false);
      };
      socket.setTimeout(800);
      socket.once('error', onError);
      socket.once('timeout', onError);
      socket.connect(BRAIN_PORT, '127.0.0.1', () => {
        socket.end();
        resolve(true);
      });
    });
  }

  emitBrainReady() {
    const win = this.threadSafe.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('brain-status', { running: true });
    }
    this.sendLog('brain', `[SYSTEM] Brain is already running (port ${BRAIN_PORT})\n`);
  }

  sendLog(source, data) {
    const win = this.threadSafe.getMainWindow();
    if (win && !win.isDestroyed()) {
      let text = data.toString();
      text = text.replace(/(Bearer\s+)[a-zA-Z0-9_\-\.]{10,}/g, '$1[REDACTED]');
      text = text.replace(/(api_key["']?\s*:\s*["'])[a-zA-Z0-9_\-\.]{10,}(["'])/gi, '$1[REDACTED]$2');
      text = text.replace(/(apiKey["']?\s*:\s*["'])[a-zA-Z0-9_\-\.]{10,}(["'])/gi, '$1[REDACTED]$2');
      text = text.replace(/(password["']?\s*:\s*["'])[a-zA-Z0-9_\-\.]{4,}(["'])/gi, '$1[REDACTED]$2');
      text = text.replace(/(token["']?\s*:\s*["'])[a-zA-Z0-9_\-\.]{10,}(["'])/gi, '$1[REDACTED]$2');
      text = text.replace(/(secret["']?\s*:\s*["'])[a-zA-Z0-9_\-\.]{10,}(["'])/gi, '$1[REDACTED]$2');
      win.webContents.send('log-data', { source, text });
    }
  }

  notifyWebviewRefresh() {
    const win = this.threadSafe.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('refresh-webview');
    }
  }

  startLogTail() {
    this.stopLogTail();
    this.logTailIntentionallyStopped = false;

    // Ensure log file exists
    if (!fs.existsSync(sovereignDataDir)) {
      fs.mkdirSync(sovereignDataDir, { recursive: true });
    }
    if (!fs.existsSync(sovereignLogFile)) {
      fs.writeFileSync(sovereignLogFile, '', 'utf8');
    }

    this.sendLog('daemon', '[SYSTEM] Starting native log stream...\n');

    const logTailProcess = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Get-Content -Path "${sovereignLogFile}" -Wait -Tail 100`
    ], { windowsHide: true });

    this.threadSafe.state.logTailProcess = logTailProcess;
    this.memoryProtector.registerProcess(logTailProcess);

    logTailProcess.stdout.on('data', (data) => {
      this.sendLog('daemon', data);
    });
    logTailProcess.stderr.on('data', (data) => {
      this.sendLog('daemon', data);
    });
    logTailProcess.on('close', (code) => {
      this.sendLog('daemon', `[SYSTEM] Log stream closed (code ${code})\n`);
      this.threadSafe.state.logTailProcess = null;
      this.memoryProtector.unregisterProcess(logTailProcess);
      
      // Auto-reconnect if not intentionally stopped
      if (!this.logTailIntentionallyStopped) {
        this.sendLog('daemon', `[SYSTEM] Log stream ended unexpectedly. Reconnecting in 2 seconds...\n`);
        setTimeout(() => {
          if (!this.logTailIntentionallyStopped) {
            this.startLogTail();
          }
        }, 2000);
      }
    });
  }

  stopLogTail() {
    this.logTailIntentionallyStopped = true;
    const proc = this.threadSafe.state.logTailProcess;
    if (proc) {
      try {
        if (proc.pid) {
          const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
          killer.unref();
        }
      } catch (e) {
        console.warn('[stopLogTail] Failed to kill log tail:', e.message);
      }
      this.threadSafe.state.logTailProcess = null;
      this.memoryProtector.unregisterProcess(proc);
    }
  }

  readSovereignConfig() {
    try {
      if (fs.existsSync(sovereignConfigYaml)) {
        return fs.readFileSync(sovereignConfigYaml, 'utf8');
      }
    } catch (e) {
      console.error('Failed to read Sovereign config:', e);
    }
    return null;
  }

  writeSovereignConfig(content) {
    try {
      if (!fs.existsSync(sovereignDataDir)) {
        fs.mkdirSync(sovereignDataDir, { recursive: true });
      }
      fs.writeFileSync(sovereignConfigYaml, content, 'utf8');

      // Verify that the write was successful by reading it back
      const readBack = fs.readFileSync(sovereignConfigYaml, 'utf8');
      if (readBack !== content) {
        throw new Error('Config YAML write verification failed: content mismatch.');
      }
      return true;
    } catch (e) {
      console.error('Failed to write Sovereign config:', e);
      return false;
    }
  }

  updateLlmInYaml(currentYaml, defaultModel, providerDetails) {
    // Preserve all sections except the existing llm block, which we replace.
    const lines = currentYaml.split(/\r?\n/);
    const result = [];
    let inLlm = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('llm:')) {
        // Begin llm block – skip it.
        inLlm = true;
        continue;
      }
      if (inLlm) {
        // Skip indented lines belonging to llm block.
        if (line.startsWith(' ') || line.startsWith('\t')) {
          continue;
        } else {
          // End of llm block.
          inLlm = false;
        }
      }
      if (!inLlm) {
        result.push(line);
      }
    }
    const newLlmBlock = `llm:\n  default: "${defaultModel}"\n  providers:\n${providerDetails}\n  tiers: {}`;
    const prefix = result.join('\n').trim();
    return (prefix ? prefix + '\n\n' : '') + newLlmBlock + '\n';
  }

  runSchtasks(args) {
    return new Promise((resolve) => {
      const proc = spawn('schtasks', args, { windowsHide: true, timeout: 10000 });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, stdout: '', stderr: 'Timed out', success: false }); }, 10000);
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr, success: code === 0 });
      });
      proc.on('error', () => { clearTimeout(timer); resolve({ ok: false, stdout: '', stderr: 'Failed to start', success: false }); });
    });
  }

  async isTaskRegistered(taskName) {
    const { ok } = await this.runSchtasks(['/query', '/tn', taskName]);
    return ok;
  }

  async getTaskStatus(taskName) {
    const { ok, stdout } = await this.runSchtasks(['/query', '/tn', taskName, '/fo', 'list', '/v']);
    if (!ok) return 'NotInstalled';
    const match = stdout.match(/Status:\s*(.+)/i);
    return match ? match[1].trim() : 'Unknown';
  }

  startWatchdog() {
    if (this.threadSafe.state.watchdogProcess) {
      return { success: false, error: 'Watchdog already running' };
    }
    const watchdogScript = path.join(__dirname, 'watchdog.ps1');
    if (!fs.existsSync(watchdogScript)) {
      return { success: false, error: 'watchdog.ps1 not found' };
    }

    const watchdogProcess = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', watchdogScript
    ], { windowsHide: true });

    this.threadSafe.state.watchdogProcess = watchdogProcess;
    this.memoryProtector.registerProcess(watchdogProcess);

    watchdogProcess.on('error', (err) => {
      this.sendLog('daemon', `[WATCHDOG] Error: ${err.message}\n`);
      this.threadSafe.state.watchdogProcess = null;
      this.memoryProtector.unregisterProcess(watchdogProcess);
    });

    watchdogProcess.on('close', (code) => {
      this.sendLog('daemon', `[WATCHDOG] Stopped (code ${code})\n`);
      this.threadSafe.state.watchdogProcess = null;
      this.memoryProtector.unregisterProcess(watchdogProcess);
      const win = this.threadSafe.getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send('watchdog-status-changed', false);
    });

    watchdogProcess.stdout?.on('data', (d) => this.sendLog('daemon', `[WATCHDOG] ${d}`));

    const win = this.threadSafe.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('watchdog-status-changed', true);

    this.sendLog('daemon', '[WATCHDOG] Watchdog started.\n');
    return { success: true };
  }

  stopWatchdog() {
    const proc = this.threadSafe.state.watchdogProcess;
    if (!proc) return { success: false };
    try {
      if (proc.pid) {
        const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
        killer.unref();
      }
    } catch (e) {
      console.warn('[stopWatchdog] Failed to kill watchdog:', e.message);
    }
    this.threadSafe.state.watchdogProcess = null;
    this.memoryProtector.unregisterProcess(proc);

    const win = this.threadSafe.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('watchdog-status-changed', false);
    this.sendLog('daemon', '[WATCHDOG] Watchdog stopped.\n');
    return { success: true };
  }

  startPafWatchdog() {
    const pafScript = path.join(projectRoot, '.agents', 'problem-detect-and-fix.ts');
    if (!fs.existsSync(pafScript)) {
      this.sendLog('daemon', '[PAF] problem-detect-and-fix.ts not found, skipping\n');
      return;
    }
    // Check if already running via tasklist
    try {
      const result = execSync(`tasklist /fi "IMAGENAME eq bun.exe" /v /fo csv 2>nul`, { timeout: 3000, encoding: 'utf-8' });
      if (result.includes('problem-detect-and-fix') || result.includes('PAF-Watchdog')) {
        this.sendLog('daemon', '[PAF] Watchdog already running\n');
        return;
      }
    } catch {}
    const proc = spawn('bun', ['run', pafScript, '--watchdog', '--poll=10000'], {
      cwd: projectRoot, windowsHide: true, detached: true, shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.unref();
    proc.stdout?.on('data', (d) => this.sendLog('daemon', `[PAF] ${d}`));
    proc.stderr?.on('data', (d) => this.sendLog('daemon', `[PAF:ERR] ${d}`));
    proc.on('error', (e) => this.sendLog('daemon', `[PAF] Error: ${e.message}\n`));
    this.sendLog('daemon', '[PAF] Problem Detect & Fix watchdog started\n');
  }

  setupIPC() {
    ipcMain.handle('get-config', () => {
      return config;
    });

    ipcMain.handle('save-config', (event, newConfig) => {
      config = { ...config, ...newConfig };
      this.saveConfig();
      return { success: true };
    });

    ipcMain.handle('check-service-installed', async () => {
      const daemon = await this.isTaskRegistered(DAEMON_TASK);
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

      this.sendLog('daemon', '[SYSTEM] Requesting admin rights to install the 24/7 background service...\n');
      const result = await this.secureExecutor.runElevated(scriptPath, []);

      if (!result.success) {
        this.sendLog('daemon', '[ERROR] Service install failed or the UAC prompt was cancelled.\n');
        return { success: false, error: result.stderr || result.error || 'Install was cancelled' };
      }

      this.sendLog('daemon', '[SYSTEM] The service is now installed and running 24/7.\n');
      this.startLogTail();
      return { success: true };
    });

    ipcMain.handle('uninstall-windows-service', async () => {
      const scriptPath = path.join(__dirname, 'scripts', 'uninstall-windows-tasks.ps1');
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: 'scripts/uninstall-windows-tasks.ps1 not found' };
      }

      this.sendLog('daemon', '[SYSTEM] Requesting admin rights to remove the 24/7 background service...\n');
      const result = await this.secureExecutor.runElevated(scriptPath);

      if (!result.success) {
        return { success: false, error: result.stderr || result.error || 'Uninstall was cancelled' };
      }

      this.sendLog('daemon', '[SYSTEM] 24/7 background service removed.\n');
      return { success: true };
    });

    ipcMain.handle('check-daemon-status', async () => {
      try { return await this.checkDaemonPort(); } catch (err) { return { running: false, error: err.message }; }
    });

    ipcMain.handle('get-system-status', async () => {
      const daemonRunning = await this.checkDaemonPort();
      let brainRunning = false;
      let brainStarting = false;
      let brainError = '';

      try {
        if (this.brain.isReady()) {
          brainRunning = true;
        } else if (daemonRunning) {
          this.brain.ready = true;
          this.brain.started = true;
          brainRunning = true;
        }
      } catch (err) {
        console.warn('[get-system-status] brain check failed:', err);
      }

      if (!brainRunning) {
        brainStarting = this.brain._starting || false;
        brainError = this.brain._startError || '';
      }

      const health = daemonRunning ? {
        status: 'running',
        port: BRAIN_PORT,
        ts: Date.now(),
      } : null;

      let serviceInstalled = false;
      try {
        serviceInstalled = await this.isTaskRegistered(DAEMON_TASK);
      } catch {}

      return {
        daemonRunning,
        brainRunning,
        brainStarting,
        brainError,
        health,
        serviceInstalled
      };
    });

    ipcMain.handle('get-bun-path', () => config.bunPath || 'bun');

    ipcMain.handle('start-daemon', async (_event, _options) => {
      return this.threadSafe.acquireLock(async () => {
        if (this.threadSafe.isShuttingDown()) return { success: false, error: 'App shutting down' };

        // Check if already running on port BRAIN_PORT
        const isRunning = await this.checkDaemonPort();
        if (isRunning) {
          this.brain.ready = true;
          this.brain.started = true;
          this.emitBrainReady();
          this.startLogTail();
          this.startPafWatchdog();
          return { success: true, alreadyRunning: true };
        }

        // BrainBridge should have started the brain during initialize().
        // If it hasn't become ready yet, wait for it.
        if (this.brain._starting) {
          this.sendLog('daemon', '[SYSTEM] BrainBridge is already starting the brain — waiting...\n');
          try {
            const result = await Promise.race([
              new Promise((r) => this.brain.once('brain:ready', r)),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000)),
            ]);
            this.sendLog('daemon', '[SYSTEM] BrainBridge brain became ready!\n');
            return { success: true };
          } catch {
            this.sendLog('daemon', '[WARNING] BrainBridge startup timed out.\n');
          }
        }

        // If BrainBridge not available or brain not running, spawn the process directly
        if (!fs.existsSync(daemonScript)) {
          return { success: false, error: `Brain script not found: ${daemonScript}` };
        }

        const bunExe = config.bunPath || 'bun';
        this.sendLog('daemon', `[SYSTEM] Spawning brain: ${bunExe} run ${daemonScript}\n`);

        const proc = spawn(bunExe, ['run', daemonScript], {
          cwd: coreDir, windowsHide: true, detached: false, shell: false,
        });
        this.daemonDirectProcess = proc;
        this.memoryProtector.registerProcess(proc);
        proc.stdout?.on('data', (d) => this.sendLog('daemon', d.toString()));
        proc.stderr?.on('data', (d) => this.sendLog('daemon', d.toString()));
        proc.on('error', (e) => {
          this.sendLog('daemon', `[ERROR] Brain spawn failed: ${e.message}\n`);
          this.daemonDirectProcess = null;
        });
        proc.on('close', () => { this.daemonDirectProcess = null; });

        // Wait up to 35s for port BRAIN_PORT
        for (let i = 0; i < 35; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          if (await this.checkDaemonPort()) {
            this.brain.ready = true;
            this.brain.started = true;
            this.emitBrainReady();
            this.startLogTail();
            this.sendLog('daemon', `[SYSTEM] Brain is running on port ${BRAIN_PORT}!\n`);
            // Auto-start PAF watchdog (Problem Detect & Fix)
            this.startPafWatchdog();
            return { success: true };
          }
        }
        this.sendLog('daemon', `[WARNING] Brain did not respond on port ${BRAIN_PORT} within 35s.\n`);
        this.startLogTail();
        return { success: false, error: 'Brain did not start within 35s. Check logs.' };
      });
    });

    ipcMain.handle('stop-daemon', async () => {
      return this.threadSafe.acquireLock(async () => {
        this.sendLog('daemon', '[SYSTEM] Stopping Sovereign Daemon...\n');
        this.stopLogTail();

        const daemonDirectProcess = this.daemonDirectProcess;
        if (daemonDirectProcess) {
          try {
            if (daemonDirectProcess.pid) {
              const killer = spawn('taskkill', ['/pid', String(daemonDirectProcess.pid), '/T', '/F']);
              killer.unref();
            }
          } catch (e) {
            console.warn('[stop-daemon] Failed to kill daemon:', e.message);
          }
          this.daemonDirectProcess = null;
          this.memoryProtector.unregisterProcess(daemonDirectProcess);
        }

        try {
          const registered = await this.isTaskRegistered(DAEMON_TASK);
          if (registered) {
            await this.runSchtasks(['/end', '/tn', DAEMON_TASK]);
          }
        } catch (err) {
          console.warn('[stop-daemon] Failed to unregister task:', err);
        }

        // Wait up to 5 seconds for the port to be freed
        let portFreed = false;
        for (let i = 0; i < 10; i++) {
          const isAlive = await this.checkDaemonPort();
          if (!isAlive) {
            portFreed = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        if (portFreed) {
          this.sendLog('daemon', '[SYSTEM] Sovereign Daemon stopped and port 3142 freed.\n');
        } else {
          this.sendLog('daemon', '[WARNING] Sovereign Daemon stopped, but port 3142 is still bound.\n');
        }

        return { success: true };
      });
    });

    ipcMain.handle('pull-model', (event, modelName) => {
      this.sendLog('daemon', `[SYSTEM] Pulling Ollama model: "${modelName}"...\n`);

      return new Promise((resolve) => {
        const modelNameStr = String(modelName).trim();
        if (modelNameStr.includes(' ')) {
          this.sendLog('daemon', `[ERROR] Model name contains spaces: "${modelNameStr}"\n`);
          resolve({ success: false, error: 'Model name cannot contain spaces.' });
          return;
        }
        // Strict validation: must be "model", "owner/model", "model:tag", or "owner/model:tag"
        const modelRegex = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?(?::[a-zA-Z0-9_.-]+)?$/;
        if (!modelRegex.test(modelNameStr)) {
          this.sendLog('daemon', `[ERROR] Invalid model name format: "${modelNameStr}"\n`);
          resolve({ success: false, error: 'Invalid model name format.' });
          return;
        }
        const sanitizedModel = modelNameStr;
        const pullProcess = spawn('ollama', ['pull', sanitizedModel], { shell: false, windowsHide: true });
        this.memoryProtector.registerProcess(pullProcess);
        const pullTimeout = setTimeout(() => {
          this.memoryProtector.unregisterProcess(pullProcess);
          pullProcess.kill();
          resolve({ success: false, error: 'Model pull timed out after 60 minutes.' });
        }, 3600000);

        pullProcess.stdout.on('data', (data) => this.sendLog('daemon', data));
        pullProcess.stderr.on('data', (data) => this.sendLog('daemon', data));
        pullProcess.on('close', (code) => {
          clearTimeout(pullTimeout);
          this.memoryProtector.unregisterProcess(pullProcess);
          if (code === 0) {
            this.sendLog('daemon', `[SYSTEM] Model "${sanitizedModel}" downloaded successfully!\n`);
            resolve({ success: true });
          } else {
            this.sendLog('daemon', `[ERROR] Ollama pull failed (exit code ${code})\n`);
            resolve({ success: false, error: `Exit code ${code}` });
          }
        });
        pullProcess.on('error', (err) => {
          clearTimeout(pullTimeout);
          this.memoryProtector.unregisterProcess(pullProcess);
          this.sendLog('daemon', `[ERROR] Ollama not found: ${err.message}\n`);
          this.sendLog('daemon', '[HINT] Download Ollama from https://ollama.ai\n');
          resolve({ success: false, error: err.message });
        });
      });
    });

    let modelCache = { models: [], ts: 0 };
    const MODEL_CACHE_TTL = 30000;
    ipcMain.handle('list-local-models', () => {
      const now = Date.now();
      if (modelCache.models.length > 0 && now - modelCache.ts < MODEL_CACHE_TTL) {
        return Promise.resolve({ success: true, models: modelCache.models, cached: true });
      }
      return new Promise((resolve) => {
          const checkProc = spawn('ollama', ['--version'], { windowsHide: true });
          let missing = false;
          let modelTimeout = null;
          checkProc.on('error', () => { missing = true; });
          checkProc.on('close', (code) => {
              if (missing || code !== 0) {
                  resolve({ success: false, error: 'Ollama not found', models: [] });
                  return;
              }
              let stdout = '';
              const listProc = spawn('ollama', ['list'], { windowsHide: true });
              modelTimeout = setTimeout(() => {
                listProc.kill();
                resolve({ success: false, error: 'Ollama list timed out', models: [] });
              }, 10000);
              listProc.stdout.on('data', (data) => { stdout += data.toString(); });
              listProc.on('close', () => {
                if (modelTimeout) clearTimeout(modelTimeout);
                const lines = stdout.trim().split('\n').slice(1);
                const models = lines
                  .filter(l => l.trim())
                  .map(l => {
                      const parts = l.trim().split(/\s+/);
                      return parts[0];
                  });
                  modelCache = { models, ts: Date.now() };
                  resolve({ success: true, models });
              });
          });
      });
    });

    ipcMain.handle('check-ollama-server', async () => {
      let host = '127.0.0.1';
      let port = 11434;

      try {
        const configText = this.readSovereignConfig();
        if (configText) {
          const ollamaMatch = configText.match(/ollama:\s*\n((\s+.*\n)+)/);
          if (ollamaMatch) {
            const block = ollamaMatch[1];
            const urlMatch = block.match(/(?:endpoint|url):\s*["']?https?:\/\/([^:/]+):(\d+)/i);
            if (urlMatch) {
              host = urlMatch[1];
              port = parseInt(urlMatch[2], 10);
            }
          }
        }
      } catch (e) {
        console.warn('[check-ollama-server] Error parsing ollama config, using default 127.0.0.1:11434:', e.message);
      }

      return new Promise((resolve) => {
        const socket = new net.Socket();
        const onError = () => { socket.destroy(); resolve({ running: false }); };
        socket.setTimeout(500);
        socket.once('error', onError);
        socket.once('timeout', onError);
        socket.connect(port, host, () => {
          socket.end();
          resolve({ running: true });
        });
      });
    });

    ipcMain.handle('scan-hardware', async () => {
      const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
      const freeRamGb = Math.round(os.freemem() / (1024 ** 3));
      const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
      const cpuCores = os.cpus().length;
      const platform = os.platform();
      const arch = os.arch();

      let gpuName = 'Unknown GPU';
      let gpuVramGb = 0;
      let gpuVramMb = 0;
      try {
        const gpuResult = await new Promise((resolve) => {
          let stdout = '';
          const proc = spawn('powershell', [
            '-NoProfile', '-NonInteractive',
            '-Command', 'Get-WmiObject Win32_VideoController | Select-Object -First 1 Name,AdapterRAM | ConvertTo-Json'
          ], { windowsHide: true, timeout: 8000 });
          const timer = setTimeout(() => { proc.kill(); resolve(''); }, 8000);
          proc.stdout.on('data', (d) => { stdout += d.toString(); });
          proc.on('close', () => { clearTimeout(timer); resolve(stdout); });
          proc.on('error', () => { clearTimeout(timer); resolve(''); });
        });
        if (gpuResult && gpuResult.trim()) {
          try {
            const gpu = JSON.parse(gpuResult.trim());
            gpuName = gpu.Name || 'Unknown GPU';
            const adapterRam = Number(gpu.AdapterRAM) || 0;
            gpuVramMb = Math.round(adapterRam / (1024 ** 2));
            gpuVramGb = Math.round(adapterRam / (1024 ** 3));
          } catch (parseErr) {
            console.warn('[scan-hardware] GPU JSON parse failed:', parseErr, 'Result was:', gpuResult);
          }
        }
      } catch (scanErr) {
        console.warn('[scan-hardware] GPU scan failed:', scanErr);
      }

            const effectiveMem = Math.max(totalRamGb, gpuVramGb);
            let recommended = 'qwen2.5:0.5b';
            let recommendation = '0.5B model (works on any system, even <4GB RAM)';
            if (effectiveMem >= 64) {
              recommended = 'qwen2.5-coder:32b';
              recommendation = '32B model (64GB+ RAM/VRAM)';
            } else if (effectiveMem >= 32) {
              recommended = 'qwen2.5-coder:14b';
              recommendation = '14B model (32GB+ RAM/VRAM)';
            } else if (effectiveMem >= 16) {
              recommended = 'qwen2.5-coder:7b';
              recommendation = '7B model (16GB+ RAM/VRAM)';
            } else if (effectiveMem >= 8) {
              recommended = 'qwen2.5-coder:3b';
              recommendation = '3B model (8–16GB RAM/VRAM)';
            } else if (effectiveMem >= 4) {
              recommended = 'qwen2.5:1.5b';
              recommendation = '1.5B model (4–8GB RAM/VRAM)';
            } else {
              recommended = 'qwen2.5:0.5b';
              recommendation = '0.5B model (<4GB RAM — guaranteed to run)';
            }

            return {
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
            };
    });

    ipcMain.handle('get-gpu-vram', async () => {
      try {
        const gpuResult = await new Promise((resolve) => {
          let stdout = '';
          const proc = spawn('powershell', [
            '-NoProfile', '-NonInteractive',
            '-Command', 'Get-WmiObject Win32_VideoController | Select-Object -First 1 AdapterRAM | ConvertTo-Json'
          ], { windowsHide: true, timeout: 8000 });
          const timer = setTimeout(() => { proc.kill(); resolve(''); }, 8000);
          proc.stdout.on('data', (d) => { stdout += d.toString(); });
          proc.on('close', () => { clearTimeout(timer); resolve(stdout); });
          proc.on('error', () => { clearTimeout(timer); resolve(''); });
        });
        if (gpuResult && gpuResult.trim()) {
          try {
            const gpu = JSON.parse(gpuResult.trim());
            const adapterRam = Number(gpu.AdapterRAM) || 0;
            const gpuVramGb = Math.round(adapterRam / (1024 ** 3));
            return { success: true, gpuVramGb };
          } catch (e) {
            console.warn('[get-gpu-vram] GPU JSON parse failed:', e, 'Result was:', gpuResult);
          }
        }
      } catch (e) { console.warn('[get-gpu-vram] GPU scan failed:', e); }
      return { success: false, gpuVramGb: 0 };
    });

    ipcMain.handle('launch-claude-win', () => {
      this.sendLog('daemon', '[SYSTEM] Launching Claude Code (Windows)...\n');
      const proc = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'claude'], { shell: true, windowsHide: false });
      this.memoryProtector.registerProcess(proc);
      return { success: true };
    });

    ipcMain.handle('save-api-config', async (event, data) => {
      const { provider, apiKey, customModel, baseUrl } = data;
      this.sendLog('daemon', `[SYSTEM] Saving LLM config for provider: "${provider}"...\n`);

      const needsKey = !['ollama', 'local'].includes(provider);
      let defaultModel = '';
      let providerEntry = {};

      if (provider === 'ollama') {
        const model = customModel || 'qwen2.5:1.5b';
        defaultModel = `ollama:${model}`;
        providerEntry = { kind: 'ollama', base_url: baseUrl || 'http://127.0.0.1:11434' };
      } else if (provider === 'local') {
        defaultModel = `local:${customModel || 'qwen2.5:1.5b'}`;
        providerEntry = { kind: 'local' };
      } else if (provider === 'anthropic') {
        defaultModel = `anthropic:${customModel || 'claude-3-5-haiku-latest'}`;
        providerEntry = { kind: 'anthropic', api_key: apiKey || '' };
      } else if (provider === 'gemini') {
        defaultModel = `gemini:${customModel || 'gemini-1.5-flash'}`;
        providerEntry = { kind: 'gemini', api_key: apiKey || '' };
      } else if (provider === 'openai') {
        defaultModel = `openai:${customModel || 'gpt-4o-mini'}`;
        providerEntry = { kind: 'openai', api_key: apiKey || '' };
      } else if (provider === 'openrouter') {
        defaultModel = `openrouter:${customModel || 'qwen/qwen-2.5-coder-1.5b-instruct:free'}`;
        providerEntry = { kind: 'openrouter', api_key: apiKey || '' };
      } else if (provider === 'groq') {
        defaultModel = `groq:${customModel || 'llama-3.3-70b-versatile'}`;
        providerEntry = { kind: 'groq', api_key: apiKey || '' };
      } else if (provider === 'nvidia') {
        defaultModel = `nvidia:${customModel || 'meta/llama-3.1-70b-instruct'}`;
        providerEntry = { kind: 'nvidia', api_key: apiKey || '' };
      }

      if (this.brain && this.brain.isReady()) {
        try {
          await this.brain.request('llm.saveSettings', {
            providers: {
              [provider]: providerEntry
            },
            default: defaultModel
          });
          await this.brain.request('config.reload', {});
          this.notifyWebviewRefresh();
          this.sendLog('daemon', `[SYSTEM] Config updated! Using "${defaultModel}"\n`);
          return { success: true };
        } catch (err) {
          this.sendLog('daemon', `[ERROR] Brain config update failed: ${err.message}\n`);
          return { success: false, error: err.message };
        }
      }

      // Fallback: write to YAML for when the brain hasn't started yet.
      const originalConfig = this.readSovereignConfig();
      const providerDetails = Object.entries(providerEntry)
        .map(([k, v]) => `      ${k}: "${v}"`)
        .join('\n');
      const updatedYaml = this.updateLlmInYaml(originalConfig || '', defaultModel,
        `    ${provider}:\n${providerDetails}`);
      if (this.writeSovereignConfig(updatedYaml)) {
        this.sendLog('daemon', `[SYSTEM] Config written to YAML (brain not ready). Will use "${defaultModel}" on next start.\n`);
        return { success: true };
      }
      return { success: false, error: 'Failed to write config.yaml' };
    });

    ipcMain.handle('get-api-config', async () => {
      // Prefer brain DB (authoritative source).
      if (this.brain && this.brain.isReady()) {
        try {
          const providersJson = await this.brain.request('config.getSetting', 'llm.providers');
          const dbDefault = await this.brain.request('config.getSetting', 'llm.default');
          if (providersJson && dbDefault) {
            let providers = {};
            try {
              providers = typeof providersJson === 'string' ? JSON.parse(providersJson) : providersJson;
            } catch {
              // fallback if invalid
            }
            const modelRef = dbDefault;
            const colonIdx = modelRef.indexOf(':');
            const providerName = colonIdx >= 0 ? modelRef.slice(0, colonIdx) : modelRef;
            const modelId = colonIdx >= 0 ? modelRef.slice(colonIdx + 1) : '';
            const entry = providers[providerName];
            return {
              provider: providerName || 'ollama',
              apiKey: entry?.api_key || '',
              customModel: modelId || 'qwen2.5:1.5b',
              baseUrl: entry?.base_url || '',
            };
          }
        } catch (err) { console.warn('[get-api-config] Brain request failed:', err); }
      }

      // Fallback: read from YAML.
      const content = this.readSovereignConfig();
      if (!content) return { provider: 'ollama', apiKey: '', customModel: 'qwen2.5:1.5b', baseUrl: '' };

      const defaultMatch = content.match(/default:\s*"([^"]+)"/);
      if (!defaultMatch) return { provider: 'ollama', apiKey: '', customModel: 'qwen2.5:1.5b', baseUrl: '' };

      const modelRef = defaultMatch[1];
      const colonIdx = modelRef.indexOf(':');
      const providerName = colonIdx >= 0 ? modelRef.slice(0, colonIdx) : modelRef;
      const modelId = colonIdx >= 0 ? modelRef.slice(colonIdx + 1) : '';

      let provider = 'ollama';
      let apiKey = '';
      let customModel = modelId || 'qwen2.5:1.5b';
      let baseUrl = '';

      const providers = ['anthropic', 'gemini', 'openai', 'openrouter', 'groq', 'nvidia', 'local'];
      if (providers.includes(providerName)) provider = providerName;

      if (provider !== 'ollama' && provider !== 'local') {
        const keyMatch = content.match(/api_key:\s*"([^"]+)"/);
        if (keyMatch) apiKey = keyMatch[1];
      } else if (provider === 'ollama') {
        const urlMatch = content.match(/base_url:\s*"([^"]+)"/);
        if (urlMatch) baseUrl = urlMatch[1];
      }

      return { provider, apiKey, customModel, baseUrl };
    });

    ipcMain.handle('start-paf-watchdog', () => {
      this.startPafWatchdog();
      return { success: true };
    });

    ipcMain.handle('check-paf-status', async () => {
      try {
        const resp = await fetch('http://127.0.0.1:3199/health', { signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined });
        if (resp.ok) { const data = await resp.json(); return { running: true, ...data }; }
      } catch {}
      return { running: false };
    });

    ipcMain.handle('trigger-paf-scan', async () => {
      try {
        await fetch('http://127.0.0.1:3199/trigger', { method: 'POST', signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined });
        return { triggered: true };
      } catch { return { triggered: false, error: 'Watchdog not reachable' }; }
    });

    ipcMain.handle('get-system-specs', () => {
      const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
      const freeRamGb = Math.round(os.freemem() / (1024 ** 3));
      const cpuCores = os.cpus().length;
      const cpuModel = os.cpus()[0]?.model || 'Unknown CPU';
      const isLowSpec = totalRamGb < 8 || cpuCores < 4;
      let recommendedModel = 'qwen2.5:0.5b';
      let recommendation = '0.5B model (works on any system)';
      if (totalRamGb >= 16 && cpuCores >= 4) {
        recommendedModel = 'qwen2.5-coder:3b';
        recommendation = '3B model (16GB+ RAM)';
      } else if (totalRamGb >= 8) {
        recommendedModel = 'qwen2.5:1.5b';
        recommendation = '1.5B model (8GB+ RAM)';
      }
      return { totalRamGb, freeRamGb, cpuModel, cpuCores, isLowSpec, recommendedModel, recommendation };
    });

    ipcMain.handle('get-compatible-models', async (event, ramGb, vramGb) => {
      try {
        const response = await safeFetch(
          `http://127.0.0.1:${BRAIN_PORT}/api/models/compatible?ram=${ramGb || 8}&vram=${vramGb || 0}`,
          { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
        );
        if (!response.ok) return { success: false, models: [] };
        const data = await response.json();
        return { success: true, models: data };
      } catch (err) {
        return { success: false, models: [], error: err.message };
      }
    });

    ipcMain.handle('refresh-model-pool', async () => {
      try {
        const response = await safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/models/refresh`, {
          method: 'POST',
          signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
        });
        if (!response.ok) return { success: false };
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('start-watchdog', () => {
      return this.startWatchdog();
    });

    ipcMain.handle('stop-watchdog', () => {
      return this.stopWatchdog();
    });

    ipcMain.handle('check-watchdog-status', () => {
      return this.threadSafe.state.watchdogProcess !== null;
    });

    ipcMain.handle('health-check', async () => {
      const isRunning = await this.checkDaemonPort();
      return {
        status: isRunning ? 'running' : 'stopped',
        port:   3142,
        ts:     Date.now(),
      };
    });

    async function runFocusScript(psScript, logPrefix) {
      let stdout = '';
      const proc = spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-Command', psScript
      ], { windowsHide: true, timeout: 10000 });
      const timer = setTimeout(() => { proc.kill(); }, 10000);
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      return new Promise((resolve) => {
        proc.on('close', () => {
          clearTimeout(timer);
          const count = parseInt(stdout.trim(), 10) || 0;
          resolve(count);
        });
        proc.on('error', () => { clearTimeout(timer); resolve(0); });
      });
    }

    ipcMain.handle('start-focus-mode', async () => {
      this.sendLog('daemon', '[SYSTEM] Focus Mode ON — lowering priority of background processes...\n');
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

      const loweredCount = await runFocusScript(ps, 'start-focus');
      this.sendLog('daemon', `[FOCUS] Lowered priority of ${loweredCount} background processes.\n`);
      return { success: true, loweredCount };
    });

    ipcMain.handle('stop-focus-mode', async () => {
      this.sendLog('daemon', '[SYSTEM] Focus Mode OFF — restoring background process priorities...\n');
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

      const restoredCount = await runFocusScript(ps, 'stop-focus');
      this.sendLog('daemon', `[FOCUS] Restored priority of ${restoredCount} background processes.\n`);
      return { success: true, restoredCount };
    });

    // ── Brain IPC Handlers ──────────────────────────────────────────────
    ipcMain.handle('brain-status', async () => {
      try {
        if (this.brain.isReady()) return { running: true };
        const portActive = await this.checkDaemonPort();
        if (portActive) {
          this.brain.ready = true;
          this.brain.started = true;
          return { running: true };
        }
      } catch (err) { console.warn('[brain-status] check failed:', err); }
      return { running: false };
    });

    ipcMain.handle('brain-request', async (event, { method, params, timeout }) => {
      if (!this.brain.isReady()) {
        return { error: 'Brain is not ready' };
      }
      try {
        const result = await this.brain.request(method, params, timeout || 30000);
        return { result };
      } catch (err) {
        return { error: err.message };
      }
    });

    ipcMain.handle('brain-health', async () => {
      if (!this.brain.isReady()) {
        return { status: 'offline' };
      }
      try {
        const health = await this.brain.request('brain.health', {});
        return health;
      } catch (err) {
        return { status: 'error', error: err.message };
      }
    });

    ipcMain.handle('chat-send', async (event, { message, history, stream }) => {
      if (!this.brain.isReady()) {
        return { error: 'Brain is not ready' };
      }
      try {
        const method = stream ? 'llm.stream' : 'llm.chat';
        // Use a 120s timeout so the UI doesn't freeze indefinitely if the brain hangs
        const result = await this.brain.request(method, { message, history }, 120000);
        return { result };
      } catch (err) {
        return { error: err.message };
      }
    });

    // ── Verify & Download Services ──────────────────────────────────────
    // ── Verify & Download Services ──────────────────────────────────────
    // ── Settings: STT/TTS/Voice via brain HTTP API (authoritative source, same as SPA) ──
    // Fallback defaults used when brain is not reachable
    const STT_DEFAULTS = { provider: 'xenova' };
    const TTS_DEFAULTS = { provider: 'kokoro', voice: 'af_heart', enabled: true };

    ipcMain.handle('get-voice-config', async () => {
      const [stt, tts] = await Promise.all([
        safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/stt`, { signal: AbortSignal.timeout(1500) })
          .then(r => r.ok ? r.json() : null).catch(() => null),
        safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/tts`, { signal: AbortSignal.timeout(1500) })
          .then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      return {
        stt: stt ? { provider: stt.provider } : STT_DEFAULTS,
        tts: tts ? { provider: tts.provider, voice: tts.voice, enabled: tts.enabled !== false } : TTS_DEFAULTS,
      };
    });

    ipcMain.handle('get-stt-config', async () => {
      try {
        const res = await safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/stt`, { signal: AbortSignal.timeout(1500) });
        return res.ok ? await res.json() : STT_DEFAULTS;
      } catch { return STT_DEFAULTS; }
    });

    ipcMain.handle('save-stt-config', async (event, data) => {
      try {
        const res = await safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/stt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(3000),
        });
        const result = res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
        if (result.success) this.notifyWebviewRefresh();
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('get-tts-config', async () => {
      try {
        const res = await safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/tts`, { signal: AbortSignal.timeout(1500) });
        return res.ok ? await res.json() : TTS_DEFAULTS;
      } catch { return TTS_DEFAULTS; }
    });

    ipcMain.handle('save-tts-config', async (event, data) => {
      try {
        const res = await safeFetch(`http://127.0.0.1:${BRAIN_PORT}/api/config/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(3000),
        });
        const result = res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
        if (result.success) this.notifyWebviewRefresh();
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('download-bun', async () => {
      const installed = await this.downloadBun();
      return { success: installed };
    });

    ipcMain.handle('verify-and-download', async () => {
      const log = (msg) => {
        this.sendLog('brain', msg);
        const win = this.threadSafe.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('verify-status-update', msg);
        }
      };

      const results = [];

      // 1. Check Bun
      log('[VERIFY] Checking Bun runtime...\n');
      const bunPath = config.bunPath || 'bun';
      const bunVer = await this.execCommand(bunPath + ' --version');
      if (bunVer) {
        log(`[VERIFY] ✓ Bun found: ${bunVer.trim()}\n`);
        results.push({ service: 'Bun', status: 'ok', detail: bunVer.trim() });
      } else {
        log('[VERIFY] ✗ Bun not found — attempting to install...\n');
        try {
          const installed = await this.downloadBun();
          if (installed) {
            log('[VERIFY] ✓ Bun installed successfully\n');
            results.push({ service: 'Bun', status: 'installed' });
          } else {
            log('[VERIFY] ✗ Bun install failed. Install manually from https://bun.sh\n');
            results.push({ service: 'Bun', status: 'failed', detail: 'Install failed' });
          }
        } catch (e) {
          log(`[VERIFY] ✗ Bun install error: ${e.message}\n`);
          results.push({ service: 'Bun', status: 'error', detail: e.message });
        }
      }

      // 2. Check Node.js / sovereign-core dependencies
      log('[VERIFY] Checking sovereign-core dependencies...\n');
      const depsOk = await this.checkDeps();
      if (depsOk) {
        log('[VERIFY] ✓ Dependencies installed\n');
        results.push({ service: 'Core Dependencies', status: 'ok' });
      } else {
        log('[VERIFY] Installing dependencies via bun install...\n');
        try {
          await this.installDeps();
          log('[VERIFY] ✓ Dependencies installed\n');
          results.push({ service: 'Core Dependencies', status: 'installed' });
        } catch (e) {
          log(`[VERIFY] ✗ Dependency install error: ${e.message}\n`);
          results.push({ service: 'Core Dependencies', status: 'error', detail: e.message });
        }
      }

      // 3. Check database
      log('[VERIFY] Checking database...\n');
      if (!fs.existsSync(sovereignDataDir)) {
        fs.mkdirSync(sovereignDataDir, { recursive: true });
      }
      const dbPath = path.join(sovereignDataDir, 'sovereign.db');
      const dbOk = fs.existsSync(dbPath);
      if (dbOk) {
        const size = fs.statSync(dbPath).size;
        log(`[VERIFY] ✓ Database found (${(size / 1024).toFixed(0)} KB)\n`);
        results.push({ service: 'Database', status: 'ok', detail: `${(size / 1024).toFixed(0)} KB` });
      } else {
        log('[VERIFY] ~ Database not yet created (starts when brain launches)\n');
        results.push({ service: 'Database', status: 'pending' });
      }

      // 4. Check config.yaml
      log('[VERIFY] Checking configuration...\n');
      if (fs.existsSync(sovereignConfigYaml)) {
        log('[VERIFY] ✓ Config found\n');
        results.push({ service: 'Configuration', status: 'ok' });
      } else {
        log('[VERIFY] ~ Config not yet created (auto-generated at first boot)\n');
        results.push({ service: 'Configuration', status: 'pending' });
      }

      // 5. Check Ollama (optional)
      log('[VERIFY] Checking Ollama...\n');
      const ollamaVer = await this.execCommand('ollama --version');
      if (ollamaVer) {
        log(`[VERIFY] ✓ Ollama found: ${ollamaVer.trim()}\n`);
        results.push({ service: 'Ollama', status: 'ok', detail: ollamaVer.trim() });
      } else {
        log('[VERIFY] ~ Ollama not found (optional — for local models)\n');
        log('[VERIFY]   Download from: https://ollama.com/download\n');
        results.push({ service: 'Ollama', status: 'missing', detail: 'Download manually from ollama.com' });
      }

      // 6. Check Electron dependencies
      log('[VERIFY] Checking Desktop dependencies...\n');
      const desktopDeps = await this.checkDeps(false);
      if (desktopDeps) {
        log('[VERIFY] ✓ Desktop dependencies installed\n');
        results.push({ service: 'Desktop Dependencies', status: 'ok' });
      } else {
        log('[VERIFY] Installing Desktop dependencies via npm install...\n');
        try {
          await this.installDeps(false);
          log('[VERIFY] ✓ Desktop dependencies installed\n');
          results.push({ service: 'Desktop Dependencies', status: 'installed' });
        } catch (e) {
          log(`[VERIFY] ✗ Desktop dependency install error: ${e.message}\n`);
          results.push({ service: 'Desktop Dependencies', status: 'error', detail: e.message });
        }
      }

      log('[VERIFY] ✓ Verification complete\n');
      return { success: true, results };
    });
  }

  // ── Verify service helpers ───────────────────────────────────────────
  execCommand(cmd) {
    return new Promise((resolve) => {
      let stdout = '';
      const proc = spawn(cmd, [], { windowsHide: true, timeout: 5000, shell: true });
      const timer = setTimeout(() => { proc.kill(); resolve(''); }, 5000);
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.on('close', () => { clearTimeout(timer); resolve(stdout.trim()); });
      proc.on('error', () => { clearTimeout(timer); resolve(''); });
    });
  }

  async downloadBun() {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const installed = await new Promise((resolve) => {
        const timer = setTimeout(() => { ps.kill(); resolve(false); }, 120000);
        const ps = spawn('powershell', [
          '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
          '-Command', 'powershell -c "irm bun.sh/install.ps1 | iex"'
        ], { windowsHide: true });
        ps.stdout.on('data', (d) => this.sendLog('brain', d));
        ps.stderr.on('data', (d) => this.sendLog('brain', d));
        ps.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
        ps.on('error', () => { clearTimeout(timer); resolve(false); });
      });
      if (installed) {
        // Resolve new Bun path
        const bunPath = path.join(os.homedir(), '.bun', 'bin', 'bun.exe');
        if (fs.existsSync(bunPath)) {
          config.bunPath = bunPath;
          this.saveConfig();
        }
        return true;
      }
      if (attempt < MAX_RETRIES) {
        this.sendLog('brain', `[DOWNLOAD] Bun install attempt ${attempt} failed, retrying...\n`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    return false;
  }

  checkDeps(isCore = true) {
    const dir = isCore ? coreDir : __dirname;
    return new Promise((resolve) => {
      fs.access(path.join(dir, 'node_modules'), fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }

  installDeps(isCore = true) {
    const dir = isCore ? coreDir : __dirname;
    const useBun = isCore;
    return new Promise((resolve, reject) => {
      const cmd = useBun ? (config.bunPath || 'bun') : 'npm';
      const args = useBun ? ['install'] : ['install', '--no-optional'];
      const proc = spawn(cmd, args, { cwd: dir, windowsHide: true });
      const installTimeout = setTimeout(() => { proc.kill(); reject(new Error(`${cmd} install timed out after 120s`)); }, 120000);
      proc.stdout.on('data', (d) => this.sendLog('brain', d));
      proc.stderr.on('data', (d) => this.sendLog('brain', d));
      proc.on('close', (code) => {
        clearTimeout(installTimeout);
        if (code === 0) resolve();
        else reject(new Error(`${cmd} install exited with code ${code}`));
      });
      proc.on('error', (e) => { clearTimeout(installTimeout); reject(e); });
    });
  }

  setupCleanupHandlers() {
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    app.on('before-quit', () => this.handleAppQuit());
  }

  handleShutdown(signal) {
    console.log(`Received ${signal}, shutting down...`);
    this.threadSafe.setShuttingDown(true);
    this.memoryProtector.cleanupAll();
    process.exit(0);
  }

  handleAppQuit() {
    this.threadSafe.setShuttingDown(true);
    this.memoryProtector.cleanupAll();
  }
}

function safeFetch(url, options = {}) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }
  
  const http = require('http');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const reqOptions = {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.signal?.timeout || 10000
      };
      
      const req = http.request(url, reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => JSON.parse(data),
            text: async () => data
          });
        });
      });
      
      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}


// App instance creation and lifecycle
const sovereignApp = new SovereignDesktopApp();
sovereignApp.initialize().catch(console.error);

app.whenReady().then(() => {
  sovereignApp.createWindow();

  // Brain auto-start: the BrainBridge (started in initialize() via startBrain())
  // already booted the brain process. This duplicate check is removed to prevent
  // spawning TWO brain processes (brain takes ~19s to boot, port check at 3s would
  // spuriously trigger a second spawn, causing CPU thrash and port conflicts).

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) sovereignApp.createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  sovereignApp.cleanupProcesses();
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      event.preventDefault();
      callback(true);
      return;
    }
  } catch {}
  callback(false);
});
