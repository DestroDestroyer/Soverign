const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const net = require('net');

let mainWindow;
let daemonProcess = null;
let sidecarProcess = null;
let logTailProcess = null;
const configPath = path.join(__dirname, 'config.json');

// Native Windows data directory (same as what the Bun daemon uses)
const soverignDataDir = path.join(os.homedir(), '.soverign');
const soverignLogFile = path.join(soverignDataDir, 'soverign.log');
const soverignConfigYaml = path.join(soverignDataDir, 'config.yaml');

// Core project root (parent of soverign-desktop)
const projectRoot = path.join(__dirname, '..');
const coreDir = path.join(projectRoot, 'soverign-core');

// Default config
let config = {
  token: '',
  autoStartDaemon: true,
  autoStartSidecar: false, // sidecar is optional
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
    title: 'Soverign Desktop Console',
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
  stopSidecar();
  stopLogTail();
  // We do NOT auto-stop the daemon on app close (it keeps running in background)
}

// Check if Soverign Daemon port (3142) is active
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
  if (!fs.existsSync(soverignDataDir)) {
    fs.mkdirSync(soverignDataDir, { recursive: true });
  }
  if (!fs.existsSync(soverignLogFile)) {
    fs.writeFileSync(soverignLogFile, '', 'utf8');
  }

  sendLog('daemon', '[SYSTEM] Starting native log stream...\n');

  // Use PowerShell Get-Content -Wait (Windows native tail)
  logTailProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Get-Content -Path "${soverignLogFile}" -Wait -Tail 100`
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
function readSoverignConfig() {
  try {
    if (fs.existsSync(soverignConfigYaml)) {
      return fs.readFileSync(soverignConfigYaml, 'utf8');
    }
  } catch (e) {
    console.error('Failed to read Soverign config:', e);
  }
  return null;
}

function writeSoverignConfig(content) {
  try {
    if (!fs.existsSync(soverignDataDir)) {
      fs.mkdirSync(soverignDataDir, { recursive: true });
    }
    fs.writeFileSync(soverignConfigYaml, content, 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write Soverign config:', e);
    return false;
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => {
  return config;
});

ipcMain.handle('save-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  return { success: true };
});

ipcMain.handle('check-daemon-status', async () => {
  const isRunning = await checkDaemonPort();
  return isRunning;
});

ipcMain.handle('start-daemon', async (event, options) => {
  const isRunning = await checkDaemonPort();
  if (isRunning) {
    startLogTail();
    return { success: true, alreadyRunning: true };
  }

  sendLog('daemon', '[SYSTEM] Starting Soverign Daemon (native Windows)...\n');
  sendLog('daemon', `[SYSTEM] Core directory: ${coreDir}\n`);

  // Check if bun is available
  const bunCmd = config.bunPath || 'bun';
  const daemonScript = path.join(coreDir, 'src', 'daemon', 'index.ts');

  if (!fs.existsSync(daemonScript)) {
    const msg = `[ERROR] Daemon script not found: ${daemonScript}\n`;
    sendLog('daemon', msg);
    return { success: false, error: msg };
  }

  // Build environment - model selection
  const env = { ...process.env };
  env.SOVERIGN_DATA_DIR = soverignDataDir;

  if (options && options.useQwen) {
    // Use 1.5B — small enough for most PCs
    env.SOVERIGN_DEFAULT_MODEL = 'ollama/qwen2.5:1.5b';
    sendLog('daemon', '[SYSTEM] Model config: qwen2.5:1.5b via local Ollama\n');
  }
  if (options && options.autoCorrect) {
    env.SOVERIGN_AUTO_CORRECT = 'true';
    sendLog('daemon', '[SYSTEM] Auto-correction enabled\n');
  }

  // Redirect stdout+stderr to log file
  const logFd = fs.openSync(soverignLogFile, 'a');

  daemonProcess = spawn(bunCmd, ['run', daemonScript], {
    cwd: coreDir,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true
  });
  // FIX: Close parent's copy of FD immediately to avoid handle leak
  fs.closeSync(logFd);
  // FIX: Attach error handler before unref
  daemonProcess.on('error', (err) => {
    sendLog('daemon', `[ERROR] Daemon process failed to start: ${err.message}\n`);
    daemonProcess = null;
  });
  daemonProcess.unref();

  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const running = await checkDaemonPort();
      if (running) {
        clearInterval(interval);
        sendLog('daemon', '[SYSTEM] Soverign Daemon is running on port 3142!\n');
        startLogTail();
        resolve({ success: true });
      } else if (attempts >= 15) {
        clearInterval(interval);
        sendLog('daemon', '[WARNING] Port 3142 check timed out. Daemon may still be loading.\n');
        startLogTail();
        resolve({ success: true, timeout: true });
      }
    }, 1000);
  });
});

ipcMain.handle('stop-daemon', () => {
  sendLog('daemon', '[SYSTEM] Stopping Soverign Daemon...\n');
  stopLogTail();

  return new Promise((resolve) => {
    // Kill by port — find and kill the process using port 3142
    exec('netstat -ano | findstr :3142', (err, stdout) => {
      if (!stdout) {
        sendLog('daemon', '[SYSTEM] No process found on port 3142.\n');
        return resolve({ success: true });
      }
      const lines = stdout.split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[4];
          if (pid && pid !== '0') pids.add(pid);
        }
      }
      let killed = 0;
      for (const pid of pids) {
        exec(`taskkill /pid ${pid} /T /F`, () => killed++);
      }
      setTimeout(() => {
        sendLog('daemon', `[SYSTEM] Killed ${pids.size} process(es) on port 3142.\n`);
        resolve({ success: true });
      }, 500);
    });
  });
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
  sendLog('sidecar', '[SYSTEM] Launching Claude Code (Windows)...\n');
  spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'claude'], { shell: true });
  return { success: true };
});



// Save API/LLM config to Windows-native config.yaml
ipcMain.handle('save-api-config', async (event, data) => {
  const { provider, apiKey, customModel } = data;
  sendLog('daemon', `[SYSTEM] Saving LLM config for provider: "${provider}"...\n`);

  const originalConfig = readSoverignConfig();
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
  }

  const newLlmBlock = `llm:\n  default: "${defaultModel}"\n  providers:\n${providerDetails}\n  tiers: {}\n`;

  let updatedYaml;
  if (/^([ \t]*)llm:/m.test(currentYaml)) {
    updatedYaml = currentYaml.replace(/^([ \t]*)llm:[\s\S]*?(?=^[ \t]*\w+:|$)/m, newLlmBlock);
  } else {
    // Append if no llm block
    updatedYaml = currentYaml.trim() + '\n\n' + newLlmBlock;
  }

  const ok = writeSoverignConfig(updatedYaml);
  if (ok) {
    sendLog('daemon', `[SYSTEM] Config updated! Soverign will use "${defaultModel}"\n`);
    return { success: true };
  }
  return { success: false, error: 'Failed to write config.yaml' };
});

ipcMain.handle('get-api-config', () => {
  const content = readSoverignConfig();
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

  if (providerName === 'anthropic') provider = 'anthropic-cloud';
  else if (providerName === 'gemini') provider = 'gemini-cloud';
  else if (providerName === 'openai') provider = 'openai-cloud';
  else if (providerName === 'openrouter') provider = 'openrouter-cloud';

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

// ─── Sidecar (native soverign-sidecar.cmd) ────────────────────────────────

function stopSidecar() {
  if (sidecarProcess) {
    sendLog('sidecar', '[SYSTEM] Stopping Soverign Sidecar...\n');
    try {
      exec(`taskkill /pid ${sidecarProcess.pid} /T /F`);
    } catch (e) {}
    sidecarProcess = null;
    return true;
  }
  return false;
}

ipcMain.handle('start-sidecar', (event, token) => {
  if (sidecarProcess) stopSidecar();

  const tokenToUse = token || config.token;
  sendLog('sidecar', '[SYSTEM] Launching Soverign Sidecar client...\n');

  const args = tokenToUse ? ['--token', tokenToUse] : [];

  // Try soverign-sidecar.cmd first, fall back to npx
  sidecarProcess = spawn('soverign-sidecar.cmd', args, {
    shell: true,
    windowsHide: true
  });

  sidecarProcess.stdout.on('data', (data) => sendLog('sidecar', data));
  sidecarProcess.stderr.on('data', (data) => sendLog('sidecar', data));
  sidecarProcess.on('error', (err) => {
    sendLog('sidecar', `[ERROR] Sidecar failed to start: ${err.message}\n`);
    sendLog('sidecar', '[HINT] The sidecar requires Soverign to be installed globally. Contact support.\n');
    sidecarProcess = null;
    if (mainWindow) mainWindow.webContents.send('sidecar-status-changed', false);
  });
  sidecarProcess.on('close', (code) => {
    sendLog('sidecar', `[SYSTEM] Sidecar exited (code ${code})\n`);
    sidecarProcess = null;
    if (mainWindow) mainWindow.webContents.send('sidecar-status-changed', false);
  });

  if (mainWindow) mainWindow.webContents.send('sidecar-status-changed', true);
  return { success: true };
});

ipcMain.handle('stop-sidecar', () => {
  const stopped = stopSidecar();
  if (mainWindow) mainWindow.webContents.send('sidecar-status-changed', false);
  return { success: stopped };
});

ipcMain.handle('check-sidecar-status', () => {
  return sidecarProcess !== null;
});

// ─── Watchdog ─────────────────────────────────────────────────────────────────

let watchdogProcess = null;

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
  return { status: isRunning ? 'running' : 'stopped', port: 3142 };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
