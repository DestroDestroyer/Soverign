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
    <button class="toast-close">×</button>
  `;
  container.appendChild(toast);
  
  const delay = type === 'error' || type === 'warn' ? 5000 : 3000;
  const timeoutId = setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, delay);

  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      clearTimeout(timeoutId);
      toast.remove();
    });
  }
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

const soverignWebview = document.getElementById('soverign-webview');

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
  if (bunPathInput) bunPathInput.value    = appConfig.bunPath || 'bun';
  if (chkAutoDaemon) chkAutoDaemon.checked = appConfig.autoStartDaemon !== false;

  // Populate API configuration
  const apiConfig = await window.api.getApiConfig();
  if (selModelProvider) selModelProvider.value = apiConfig.provider;
  if (apiKeyInput) apiKeyInput.value      = apiConfig.apiKey;
  if (customModelInput) customModelInput.value = apiConfig.customModel;
  updateProviderFields();

  setupEventListeners();

  // Register log listener
  window.api.onLog(({ source, text }) => {
    appendLog(source, text);
  });

  // Initial status checks
  await checkSystemStatus();
  await checkServiceStatus();

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
  if (btnStartDaemon) btnStartDaemon.addEventListener('click', bootDaemon);
  if (btnBootSystem) btnBootSystem.addEventListener('click', bootDaemon);
  if (btnStopDaemon) btnStopDaemon.addEventListener('click', stopDaemon);

  // API Config
  if (selModelProvider) selModelProvider.addEventListener('change', updateProviderFields);
  if (btnSaveApiConfig) btnSaveApiConfig.addEventListener('click', saveApiConfig);
  if (btnToggleKeyVisibility) btnToggleKeyVisibility.addEventListener('click', toggleKeyVisibility);

  // Model Manager
  if (btnPullModel) btnPullModel.addEventListener('click', pullModel);
  if (btnRefreshLocalModels) btnRefreshLocalModels.addEventListener('click', refreshLocalModels);

  // Claude Code
  if (btnLaunchClaudeWin) btnLaunchClaudeWin.addEventListener('click', () => window.api.launchClaudeWin());

  // Hardware scan
  const btnScanHardware = document.getElementById('btn-scan-hardware');
  if (btnScanHardware) btnScanHardware.addEventListener('click', scanHardware);

  // Layout
  if (btnStartAll) btnStartAll.addEventListener('click', startAllServices);
  if (btnReloadWebview) {
    btnReloadWebview.addEventListener('click', () => {
      if (daemonRunning && soverignWebview) {
        appendLog('daemon', '[SYSTEM] Reloading Soverign Interface...\n');
        soverignWebview.reload();
      }
    });
  }
  if (btnToggleLogs) btnToggleLogs.addEventListener('click', toggleLogsDrawer);
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      const container = document.querySelector('.app-container');
      if (container) container.classList.toggle('sidebar-collapsed');
    });
  }
  if (btnCloseLogs && logsDrawer) btnCloseLogs.addEventListener('click', () => logsDrawer.classList.add('collapsed'));
  if (btnClearLogs) btnClearLogs.addEventListener('click', clearActiveTerminal);

  // Drawer tab switching
  drawerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      drawerTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      const targetContent = document.getElementById(activeTab);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Settings modal
  if (btnSettings) {
    btnSettings.addEventListener('click', async () => {
      if (settingsView) settingsView.classList.remove('hidden');
      await checkServiceStatus();
    });
  }
  if (btnCloseSettings && settingsView) btnCloseSettings.addEventListener('click', () => settingsView.classList.add('hidden'));
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', saveSettings);
  if (settingsView) {
    settingsView.addEventListener('click', (e) => {
      if (e.target === settingsView) settingsView.classList.add('hidden');
    });
  }

  // Service installer
  if (btnInstallService)   btnInstallService.addEventListener('click', installService);
  if (btnUninstallService) btnUninstallService.addEventListener('click', uninstallService);

  // Focus Mode
  if (btnStartFocus) btnStartFocus.addEventListener('click', startFocusMode);
  if (btnStopFocus)  btnStopFocus.addEventListener('click', stopFocusMode);
}

// ── Provider field visibility ─────────────────────────────────────────────────
function updateProviderFields() {
  if (!selModelProvider) return;
  const provider = selModelProvider.value;
  const cfg = PROVIDER_DEFAULTS[provider] || { needsKey: true, placeholder: '' };

  if (apiKeyContainer) {
    if (cfg.needsKey) {
      apiKeyContainer.classList.remove('hidden');
    } else {
      apiKeyContainer.classList.add('hidden');
    }
  }
  if (customModelContainer) customModelContainer.classList.remove('hidden');
  if (customModelInput) customModelInput.placeholder = cfg.placeholder;
}

// ── API Key visibility toggle ─────────────────────────────────────────────────
function toggleKeyVisibility() {
  if (!apiKeyInput || !btnToggleKeyVisibility) return;
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
  if (!selModelProvider || !apiKeyInput || !customModelInput || !btnSaveApiConfig) return;
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
  if (!txtPullModel || !btnPullModel || !logsDrawer) return;
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
      if (selModelProvider) selModelProvider.value = 'ollama-local';
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

// ── Update Daemon UI elements safely ──────────────────────────────────────────
function updateDaemonUI(isRunning) {
  daemonRunning = isRunning;
  document.body.classList.toggle('soverign-activated', isRunning);

  if (isRunning) {
    if (daemonStatusDot) daemonStatusDot.className = 'status-indicator running';
    if (daemonStatusText) daemonStatusText.textContent = 'Online (Port 3142)';
    if (btnStartDaemon) btnStartDaemon.disabled = true;
    if (btnStopDaemon) btnStopDaemon.disabled  = false;

    if (splashView) splashView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.remove('hidden');

    if (!webviewLoaded && soverignWebview) {
      appendLog('daemon', '[SYSTEM] Directing interface view to http://localhost:3142\n');
      soverignWebview.src = 'http://localhost:3142';
      webviewLoaded = true;
    }
  } else {
    if (daemonStatusDot) daemonStatusDot.className = 'status-indicator stopped';
    if (daemonStatusText) daemonStatusText.textContent = 'Offline';
    if (btnStartDaemon) btnStartDaemon.disabled = false;
    if (btnStopDaemon) btnStopDaemon.disabled  = true;

    if (splashView) splashView.classList.remove('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');

    if (webviewLoaded && soverignWebview) {
      soverignWebview.src = 'about:blank';
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
  if (daemonStatusDot) daemonStatusDot.className = 'status-indicator pending';
  if (daemonStatusText) daemonStatusText.textContent = 'Booting...';
  if (btnStartDaemon) btnStartDaemon.disabled = true;
  if (btnBootSystem) btnBootSystem.disabled  = true;

  if (bootLoadingContainer) bootLoadingContainer.classList.remove('hidden');
  if (logsDrawer) logsDrawer.classList.remove('collapsed');

  const options = {
    useQwen:     chkUseQwen ? chkUseQwen.checked : true,
    autoCorrect: chkAutoCorrect ? chkAutoCorrect.checked : true
  };

  let progress      = 0;
  let remainingTime = 10;
  if (bootProgressBar) bootProgressBar.style.width = '0%';
  if (bootTimer) bootTimer.textContent = '10s';

  const statuses = [
    { threshold: 8, text: 'Initializing Soverign environment...'    },
    { threshold: 6, text: 'Booting Soverign Brain...'               },
    { threshold: 4, text: 'Loading local model configuration...'    },
    { threshold: 2, text: 'Starting channels & websocket server...' },
    { threshold: 0, text: 'Connecting to system interface...'       },
  ];

  const bootInterval = setInterval(() => {
    progress      += 10;
    remainingTime -= 1;
    if (bootProgressBar) bootProgressBar.style.width = `${progress}%`;
    if (bootTimer) bootTimer.textContent = `${remainingTime}s`;

    const status = statuses.find(s => remainingTime >= s.threshold);
    if (status && bootStatusText) bootStatusText.textContent = status.text;

    if (remainingTime <= 0) clearInterval(bootInterval);
  }, 1000);

  const result = await window.api.startDaemon(options);

  clearInterval(bootInterval);
  if (bootProgressBar) bootProgressBar.style.width = '100%';
  if (bootTimer) bootTimer.textContent = '0s';
  if (bootStatusText) bootStatusText.textContent = 'Soverign is Ready!';

  setTimeout(async () => {
    if (bootLoadingContainer) bootLoadingContainer.classList.add('hidden');
    await checkSystemStatus();
    if (btnBootSystem) btnBootSystem.disabled  = false;
    if (btnStartDaemon) btnStartDaemon.disabled = false;

    if (result && !result.success) {
      showToast(`Daemon failed to start: ${result.error || 'Unknown error'}`, 'error');
      if (logsDrawer) logsDrawer.classList.remove('collapsed');
    }
  }, 800);
}

async function stopDaemon() {
  if (confirm('Are you sure you want to shut down the Soverign daemon?')) {
    if (daemonStatusDot) daemonStatusDot.className = 'status-indicator pending';
    if (daemonStatusText) daemonStatusText.textContent = 'Stopping...';
    if (btnStopDaemon) btnStopDaemon.disabled = true;

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
  if (!bunPathInput || !chkAutoDaemon || !settingsView) return;
  const bunPath        = bunPathInput.value.trim();
  const autoStartDaemon = chkAutoDaemon.checked;

  if (!bunPath) {
    showToast('Bun path cannot be empty!', 'warn');
    return;
  }

  if (appConfig) {
    appConfig.bunPath        = bunPath;
    appConfig.autoStartDaemon = autoStartDaemon;
  }

  await window.api.saveConfig({ bunPath, autoStartDaemon });
  appendLog('daemon', `[SYSTEM] Saved settings. Bun Path: ${bunPath}\n`);
  showToast('Settings saved!', 'success');
  settingsView.classList.add('hidden');
}

// ── Log management ────────────────────────────────────────────────────────────
function toggleLogsDrawer() {
  if (logsDrawer) logsDrawer.classList.toggle('collapsed');
}

function clearActiveTerminal() {
  if (activeTab === 'daemon-logs' && daemonTerminal) daemonTerminal.textContent = '';
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
  if (container) container.scrollTop = container.scrollHeight;
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
    recognition.lang           = localStorage.getItem('soverign_voice_lang') || 'en-US';

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
  if (localStorage.getItem('soverign_tts') !== 'true') return;
  window.speechSynthesis.cancel();
  const utter     = new SpeechSynthesisUtterance(text);
  const voiceName = localStorage.getItem('soverign_tts_voice');
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
window.downloadModel = async function(name, downloadCommand) {
  const modelToPull = downloadCommand && downloadCommand.startsWith('ollama run ')
    ? downloadCommand.replace('ollama run ', '')
    : name;

  showToast(`Starting download: ${modelToPull}`, 'info');
  try {
    const result = await window.api.pullModel(modelToPull);
    if (result.success) {
      showToast(`Download complete: ${modelToPull}`, 'success');
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
    if (selModelProvider) selModelProvider.value = providerKey;
    if (customModelInput) customModelInput.value = name;
    updateProviderFields();
    showToast(`Now using: ${name}`, 'success');
  } catch (e) {
    showToast('Failed to activate model', 'error');
  }
};

// ── Global Error Handling ─────────────────────────────────────────────────────
window.addEventListener('error', (event) => {
  console.error('Uncaught UI error:', event.error);
  showToast(`Uncaught Error: ${event.message}`, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showToast(`Unhandled Rejection: ${event.reason?.message || event.reason}`, 'error');
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Init model pool after daemon has time to start
  setTimeout(initModelPool, 2000);
});
