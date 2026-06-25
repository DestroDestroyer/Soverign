const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec, execSync } = require('child_process');
const net = require('net');

let mainWindow;
let logTailProcess = null;
let watchdogProcess = null;
const configPath = path.join(__dirname, 'config.json');

// Native Windows data directory (same as what the Bun daemon uses)
const soverignDataDir = path.join(os.homedir(), '.soverign');
const soverignLogFile = path.join(soverignDataDir, 'soverign.log');
const soverignConfigYaml = path.join(soverignDataDir, 'config.yaml');

// Core project root (parent of soverign-desktop)
const projectRoot = path.join(__dirname, '..');
const coreDir = path.join(projectRoot, 'soverign-core');
const daemonScript  = path.join(coreDir, 'src', 'daemon',  'index.ts');

// Windows Task Scheduler task name
const DAEMON_TASK = 'SoverignService';

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
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
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
  stopLogTail();
  
  // Kill direct daemon process if it was started locally
  if (daemonDirectProcess) {
    try {
      if (daemonDirectProcess.pid) {
        execSync(`taskkill /pid ${daemonDirectProcess.pid} /T /F`, { timeout: 1000 });
      }
    } catch (e) {
      console.warn('Failed to kill daemon process on cleanup:', e.message);
    }
    daemonDirectProcess = null;
  }

  // Kill watchdog if running
  if (watchdogProcess) {
    try {
      if (watchdogProcess.pid) {
        execSync(`taskkill /pid ${watchdogProcess.pid} /T /F`, { timeout: 1000 });
      }
    } catch (e) {}
    watchdogProcess = null;
  }
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
  if (mainWindow && !mainWindow.isDestroyed()) {
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
      if (logTailProcess.pid) {
        execSync(`taskkill /pid ${logTailProcess.pid} /T /F`, { timeout: 1000 });
      }
    } catch (e) {
      console.warn('Failed to kill log tail process:', e.message);
    }
    logTailProcess = null;
  }
}

// Read/write Soverign config.yaml
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

// Robust YAML updater for the llm: block (avoids fragile regex replacements)
function updateLlmInYaml(currentYaml, defaultModel, providerDetails) {
  const lines = currentYaml.split(/\r?\n/);
  const result = [];
  let inLlm = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('llm:')) {
      inLlm = true;
      continue;
    }
    
    if (inLlm) {
      // The llm block ends when we encounter a line that:
      // - Is not empty
      // - Does not start with space or tab
      if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
        inLlm = false;
      } else {
        continue;
      }
    }
    
    result.push(line);
  }
  
  // Format the new block
  const newLlmBlock = `llm:\n  default: "${defaultModel}"\n  providers:\n${providerDetails}\n  tiers: {}`;
  
  return result.join('\n').trim() + '\n\n' + newLlmBlock + '\n';
}

// Node version compatible fetch implementation
function safeFetch(url, options = {}) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }
  
  // Fallback using Node's native http module
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

// ─── Windows Task Scheduler helpers ────────────────────────────────────────

// Run a schtasks.exe command and capture output safely
function runSchtasks(args) {
  return new Promise((resolve) => {
    exec(`schtasks ${args}`, (err, stdout, stderr) => {
      resolve({ 
        ok: !err, 
        stdout: stdout || '', 
        stderr: stderr || '',
        success: err === null 
      });
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

// Launch a .ps1 script elevated (UAC prompt) safely
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

// ─── IPC Handlers: Daemon (now backed by the SoverignDaemon scheduled task)

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
    sendLog('daemon', '[SYSTEM] Starting Soverign Daemon (via Windows Task Scheduler)...\n');
    const startResult = await runSchtasks(`/run /tn "${DAEMON_TASK}"`);
    if (!startResult.ok) {
      sendLog('daemon', `[ERROR] Failed to start scheduled task: ${startResult.stderr}\n`);
      return { success: false, error: startResult.stderr };
    }
  } else {
    // ── Path B: Direct bun spawn (no task installed) ─────────────────────
    sendLog('daemon', '[SYSTEM] Task Scheduler service not installed — launching daemon directly...\n');
    sendLog('daemon', `[SYSTEM] Command: ${config.bunPath || 'bun'} run ${daemonScript}\n`);

    // Ensure log dir exists
    if (!fs.existsSync(soverignDataDir)) {
      fs.mkdirSync(soverignDataDir, { recursive: true });
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
        sendLog('daemon', '[SYSTEM] Soverign Daemon is running on port 3142!\n');
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
  sendLog('daemon', '[SYSTEM] Stopping Soverign Daemon...\n');
  stopLogTail();

  // Stop direct process if running
  if (daemonDirectProcess) {
    try {
      if (daemonDirectProcess.pid) {
        execSync(`taskkill /pid ${daemonDirectProcess.pid} /T /F`, { timeout: 1000 });
      }
    } catch (e) {}
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
      if (err) return resolve({ success: false, error: err.message, models: [] });
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

  const originalConfig = readSoverignConfig();
  let currentYaml = originalConfig || '';

  let defaultModel = '';
  let providerDetails = '';

  if (provider === 'ollama-local') {
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

  const updatedYaml = updateLlmInYaml(currentYaml, defaultModel, providerDetails);
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
    const response = await safeFetch(
      `http://127.0.0.1:3142/api/models/compatible?ram=${ramGb || 8}&vram=${vramGb || 0}`,
      { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined }
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
    const response = await safeFetch('http://127.0.0.1:3142/api/models/refresh', {
      method: 'POST',
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });
    if (!response.ok) return { success: false };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Watchdog ───────────────────────────────────────────────────────────────

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
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('watchdog-status-changed', false);
  });
  watchdogProcess.stdout?.on('data', (d) => sendLog('daemon', `[WATCHDOG] ${d}`));
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('watchdog-status-changed', true);
  sendLog('daemon', '[WATCHDOG] Watchdog started.\n');
  return { success: true };
});

ipcMain.handle('stop-watchdog', () => {
  if (!watchdogProcess) return { success: false };
  try {
    if (watchdogProcess.pid) {
      execSync(`taskkill /pid ${watchdogProcess.pid} /T /F`, { timeout: 1000 });
    }
  } catch (e) {}
  watchdogProcess = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('watchdog-status-changed', false);
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

const FOCUS_EXCLUDE = 'bun|soverign|ollama|electron|System|Idle|svchost|explorer|csrss|lsass|wininit|services|smss|winlogon|dwm|audiodg|fontdrvhost';

ipcMain.handle('start-focus-mode', () => {
  return new Promise((resolve) => {
    sendLog('daemon', '[SYSTEM] Focus Mode ON — lowering priority of background processes...\n');
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

// ─── Global Error Handling ──────────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in Main Process:', error);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in Main Process at:', promise, 'reason:', reason);
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

app.on('will-quit', () => {
  cleanupProcesses();
});
