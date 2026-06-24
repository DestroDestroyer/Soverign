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
  // Auto-dismiss
  const delay = type === 'error' || type === 'warn' ? 5000 : 3000;
  setTimeout(() => toast.remove(), delay);
}
window.showToast = showToast;

// DOM elements
const daemonStatusDot = document.getElementById('daemon-status-dot');
const daemonStatusText = document.getElementById('daemon-status-text');
const btnStartDaemon = document.getElementById('btn-start-daemon');
const btnStopDaemon = document.getElementById('btn-stop-daemon');


// New Model & API Elements
const selModelProvider = document.getElementById('sel-model-provider');
const apiKeyContainer = document.getElementById('api-key-container');
const apiKeyInput = document.getElementById('api-key-input');
const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
const customModelContainer = document.getElementById('custom-model-container');
const customModelInput = document.getElementById('custom-model-input');
const btnSaveApiConfig = document.getElementById('btn-save-api-config');

// New Model Downloader & Claude Code elements
const txtPullModel = document.getElementById('txt-pull-model');
const btnPullModel = document.getElementById('btn-pull-model');
const btnLaunchClaudeWin = document.getElementById('btn-launch-claude-win');

// Splash loading bar elements
const bootLoadingContainer = document.getElementById('boot-loading-container');
const bootStatusText = document.getElementById('boot-status-text');
const bootTimer = document.getElementById('boot-timer');
const bootProgressBar = document.getElementById('boot-progress-bar');

const btnStartAll = document.getElementById('btn-start-all');
const btnReloadWebview = document.getElementById('btn-reload-webview');
const btnToggleLogs = document.getElementById('btn-toggle-logs');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseLogs = document.getElementById('btn-close-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');

// Service management
const btnInstallService = document.getElementById('btn-install-service');
const btnUninstallService = document.getElementById('btn-uninstall-service');
const serviceStatusText = document.getElementById('service-status');

// Focus mode
const btnStartFocus = document.getElementById('btn-start-focus');
const btnStopFocus = document.getElementById('btn-stop-focus');

const chkUseQwen = document.getElementById('chk-use-qwen');
const chkAutoCorrect = document.getElementById('chk-auto-correct');

const splashView = document.getElementById('splash-view');
const dashboardView = document.getElementById('dashboard-view');
const settingsView = document.getElementById('settings-view');
const logsDrawer = document.getElementById('logs-drawer');
const btnBootSystem = document.getElementById('btn-boot-system');

const soverignWebview = document.getElementById('soverign-webview');

const bunPathInput = document.getElementById('bun-path-input');
const chkAutoDaemon = document.getElementById('chk-auto-daemon');

const daemonTerminal = document.getElementById('daemon-terminal');
const drawerTabs = document.querySelectorAll('.drawer-tab');
const tabContents = document.querySelectorAll('.tab-content');

// App state variables
let appConfig = null;
let daemonRunning = false;
let activeTab = 'daemon-logs';
let webviewLoaded = false;
let statusCheckInProgress = false; // prevent overlapping 3s polls

// Initialize app
async function init() {
  // Load settings
  appConfig = await window.api.getConfig();
  
  // Populate UI
  bunPathInput.value = appConfig.bunPath || 'bun';
  chkAutoDaemon.checked = appConfig.autoStartDaemon !== false;

  // Populate API configuration
  const apiConfig = await window.api.getApiConfig();
  selModelProvider.value = apiConfig.provider;
  apiKeyInput.value = apiConfig.apiKey;
  customModelInput.value = apiConfig.customModel;
  updateProviderFields();

  // Setup Event Listeners
  setupEventListeners();

  // Register Log Listener
  window.api.onLog(({ source, text }) => {
    appendLog(source, text);
  });


  // Initial status checks
  await checkSystemStatus();
  if (typeof checkServiceStatus === 'function') await checkServiceStatus();

  // Run periodic status checks
  setInterval(checkSystemStatus, 3000);

  // Auto-start actions if configured
  if (appConfig.autoStartDaemon !== false && !daemonRunning) {
    bootDaemon();
  }
}

function setupEventListeners() {
  // Daemon controls
  btnStartDaemon.addEventListener('click', bootDaemon);
  btnBootSystem.addEventListener('click', bootDaemon);
  btnStopDaemon.addEventListener('click', stopDaemon);


  // API Config settings
  selModelProvider.addEventListener('change', updateProviderFields);
  btnSaveApiConfig.addEventListener('click', saveApiConfig);
  btnToggleKeyVisibility.addEventListener('click', toggleKeyVisibility);

  // Model Manager
  btnPullModel.addEventListener('click', pullModel);

  // Claude Code Integration
  btnLaunchClaudeWin.addEventListener('click', () => window.api.launchClaudeWin());

  // Hardware Scan
  const btnScanHardware = document.getElementById('btn-scan-hardware');
  if (btnScanHardware) {
    btnScanHardware.addEventListener('click', scanHardware);
  }

  // Utility actions
  btnStartAll.addEventListener('click', startAllServices);

  btnReloadWebview.addEventListener('click', () => {
    if (daemonRunning) {
      appendLog('daemon', '[SYSTEM] Reloading Soverign Interface...\n');
      soverignWebview.reload();
    }
  });

  btnToggleLogs.addEventListener('click', toggleLogsDrawer);
  btnToggleSidebar.addEventListener('click', () => {
    document.querySelector('.app-container').classList.toggle('sidebar-collapsed');
  });
  btnCloseLogs.addEventListener('click', () => logsDrawer.classList.add('collapsed'));
  btnClearLogs.addEventListener('click', clearActiveTerminal);

  // Tab switching in logs drawer
  drawerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      drawerTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');
    });
  });

  // Settings modals
  btnSettings.addEventListener('click', async () => {
    settingsView.classList.remove('hidden');
    if (typeof checkServiceStatus === 'function') await checkServiceStatus();
  });
  btnCloseSettings.addEventListener('click', () => settingsView.classList.add('hidden'));
  btnSaveSettings.addEventListener('click', saveSettings);
  
  // Service Installer controls
  if (btnInstallService) btnInstallService.addEventListener('click', installService);
  if (btnUninstallService) btnUninstallService.addEventListener('click', uninstallService);

  // Focus Mode controls
  if (btnStartFocus) btnStartFocus.addEventListener('click', startFocusMode);
  if (btnStopFocus) btnStopFocus.addEventListener('click', stopFocusMode);

  // Close settings on background click
  settingsView.addEventListener('click', (e) => {
    if (e.target === settingsView) {
      settingsView.classList.add('hidden');
    }
  });
}

// Toggle fields depending on provider selection
function updateProviderFields() {
  const provider = selModelProvider.value;
  if (provider === 'ollama-local') {
    apiKeyContainer.classList.add('hidden');
    // Show custom model for ollama too (to type e.g. qwen2.5:1.5b manually)
    customModelContainer.classList.remove('hidden');
    customModelInput.placeholder = 'e.g. qwen2.5:1.5b, phi3:mini, mistral';
  } else {
    apiKeyContainer.classList.remove('hidden');
    customModelContainer.classList.remove('hidden');
    customModelInput.placeholder = 'e.g. claude-3-5-haiku-latest';
  }
}

// API Key visibility toggle
function toggleKeyVisibility() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    btnToggleKeyVisibility.textContent = '🔒';
  } else {
    apiKeyInput.type = 'password';
    btnToggleKeyVisibility.textContent = '👁️';
  }
}

// Save API configuration
async function saveApiConfig() {
  const provider = selModelProvider.value;
  const apiKey = apiKeyInput.value.trim();
  const customModel = customModelInput.value.trim();

  if (provider !== 'ollama-local' && !apiKey) {
    alert('Please enter an API Key for the selected provider!');
    return;
  }

  const result = await window.api.saveApiConfig({ provider, apiKey, customModel });
  if (result.success) {
    const originalText = btnSaveApiConfig.textContent;
    btnSaveApiConfig.textContent = '✓ Config Applied';
    btnSaveApiConfig.style.background = 'linear-gradient(135deg, #00e676, #00b0ff)';
    setTimeout(() => {
      btnSaveApiConfig.textContent = originalText;
      btnSaveApiConfig.style.background = '';
    }, 2000);
  } else {
    alert(`Failed to save config: ${result.error}`);
  }
}

// Pull local models
async function pullModel() {
  const modelName = txtPullModel.value.trim();
  if (!modelName) {
    alert('Please enter a valid model name (e.g. phi3, mistral).');
    return;
  }

  btnPullModel.disabled = true;
  btnPullModel.textContent = '📥 Downloading...';
  logsDrawer.classList.remove('collapsed');
  document.querySelector('[data-tab="daemon-logs"]').click();

  const result = await window.api.pullModel(modelName);
  btnPullModel.disabled = false;
  btnPullModel.textContent = '📥 Download Model';

  if (result.success) {
    alert(`Model "${modelName}" has been successfully downloaded!`);
    txtPullModel.value = '';
  } else {
    alert(`Failed to download model: ${result.error}`);
  }
}

// Hardware scan
async function scanHardware() {
  const hwInfo = document.getElementById('hw-info');
  const hwRecommendation = document.getElementById('hw-recommendation');
  const btnScan = document.getElementById('btn-scan-hardware');

  if (!hwInfo || !hwRecommendation || !btnScan) return;

  btnScan.disabled = true;
  btnScan.textContent = '🔍 Scanning...';
  hwInfo.textContent = 'Scanning...';

  try {
    const specs = await window.api.scanHardware();
    hwInfo.innerHTML = `
      <b>${specs.cpuModel.split(' ').slice(0,5).join(' ')}</b><br>
      🧠 RAM: ${specs.totalRamGb}GB total, ${specs.freeRamGb}GB free<br>
      ⚡ CPU Cores: ${specs.cpuCores}<br>
      🖥️ ${specs.platform} / ${specs.arch}
    `;
    hwRecommendation.classList.remove('hidden');
    hwRecommendation.innerHTML = `
      💡 <b>Recommended:</b> ${specs.recommended}<br>
      ${specs.recommendation}
    `;
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

// Check Daemon and Sidecar status
async function checkSystemStatus() {
  if (statusCheckInProgress) return; // skip if previous check is still running
  statusCheckInProgress = true;
  try {
    // 1. Daemon check
    const daemonStatus = await window.api.checkDaemonStatus();
    updateDaemonUI(daemonStatus);

  } finally {
    statusCheckInProgress = false;
  }
}

function updateDaemonUI(isRunning) {
  daemonRunning = isRunning;
  document.body.classList.toggle('soverign-activated', isRunning);
  if (isRunning) {
    daemonStatusDot.className = 'status-indicator running';
    daemonStatusText.textContent = 'Online (Port 3142)';
    btnStartDaemon.disabled = true;
    btnStopDaemon.disabled = false;
    
    // Switch views to show dashboard
    splashView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    
    // Load source in webview if not done yet
    if (!webviewLoaded) {
      appendLog('daemon', '[SYSTEM] Directing interface view to http://localhost:3142\n');
      soverignWebview.src = 'http://localhost:3142';
      webviewLoaded = true;
    }
  } else {
    daemonStatusDot.className = 'status-indicator stopped';
    daemonStatusText.textContent = 'Offline';
    btnStartDaemon.disabled = false;
    btnStopDaemon.disabled = true;
    
    // Switch views to show splash
    splashView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
    
    if (webviewLoaded) {
      soverignWebview.src = 'about:blank';
      webviewLoaded = false;
    }
  }
}

function updateSidecarUI(isRunning) {
  sidecarRunning = isRunning;
  if (isRunning) {
    sidecarStatusDot.className = 'status-indicator running';
    sidecarStatusText.textContent = 'Running';
    btnStartSidecar.disabled = true;


// Daemon Actions
async function bootDaemon() {
  daemonStatusDot.className = 'status-indicator pending';
  daemonStatusText.textContent = 'Booting...';
  btnStartDaemon.disabled = true;
  btnBootSystem.disabled = true;

  // Show loading container and logs
  bootLoadingContainer.classList.remove('hidden');
  logsDrawer.classList.remove('collapsed');

  const options = {
    useQwen: chkUseQwen.checked,
    autoCorrect: chkAutoCorrect.checked
  };

  // Start 10-second timer and progress bar simulation
  let progress = 0;
  let remainingTime = 10;
  bootProgressBar.style.width = '0%';
  bootTimer.textContent = '10s';

  const statuses = [
    { threshold: 8, text: 'Initializing Soverign environment...' },
    { threshold: 6, text: 'Booting Soverign Brain...' },
    { threshold: 4, text: 'Loading local model configuration...' },
    { threshold: 2, text: 'Starting channels & websocket server...' },
    { threshold: 0, text: 'Connecting to system interface...' }
  ];

  const bootInterval = setInterval(() => {
    progress += 10; // increase 10% every second
    remainingTime -= 1;
    bootProgressBar.style.width = `${progress}%`;
    bootTimer.textContent = `${remainingTime}s`;

    const status = statuses.find(s => remainingTime >= s.threshold);
    if (status) {
      bootStatusText.textContent = status.text;
    }

    if (remainingTime <= 0) {
      clearInterval(bootInterval);
    }
  }, 1000);

  // Trigger daemon launch in background
  const resultPromise = window.api.startDaemon(options);

  // Let the background start complete
  const result = await resultPromise;

  // Stop interval and fast-forward loading bar to 100% on success
  clearInterval(bootInterval);
  bootProgressBar.style.width = '100%';
  bootTimer.textContent = '0s';
  bootStatusText.textContent = 'Soverign is Ready!';

  setTimeout(async () => {
    bootLoadingContainer.classList.add('hidden');
    // Check status again immediately
    await checkSystemStatus();
    btnBootSystem.disabled = false;
    btnStartDaemon.disabled = false;

    if (result && !result.success) {
      showToast(`Daemon failed to start: ${result.error || 'Unknown error'}`, 'error');
      logsDrawer.classList.remove('collapsed');
    }
  }, 800);
}

async function stopDaemon() {
  if (confirm('Are you sure you want to shut down the Soverign daemon?')) {
    daemonStatusDot.className = 'status-indicator pending';
    daemonStatusText.textContent = 'Stopping...';
    btnStopDaemon.disabled = true;
    
    await window.api.stopDaemon();
    await checkSystemStatus();
  }
}



async function startAllServices() {
  if (!daemonRunning) {
    await bootDaemon();
  }
}

// --- Service Management Actions ---
async function installService() {
  if (!btnInstallService) return;
  btnInstallService.disabled = true;
  if (serviceStatusText) serviceStatusText.textContent = 'Installing services... (approve the UAC prompt)';
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
    const status = await window.api.checkServiceInstalled();
    const daemonOk  = status?.daemon  ?? status === true;

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

// --- Focus Mode Actions ---
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

// Config Saving Actions
async function saveToken() {
  // NOTE: The sidecar token input was consolidated into the Advanced Settings
  // modal (saved via saveSettings). This function is now a no-op shim kept
  // for backwards compatibility. Token is managed via appConfig.token.
  console.warn('[saveToken] Deprecated: token is now saved via Advanced Settings modal.');
}

async function saveSettings() {
  const bunPath = bunPathInput.value.trim();
  const autoStartDaemon = chkAutoDaemon.checked;

  if (!bunPath) {
    alert('Bun path cannot be empty!');
    return;
  }

  appConfig.bunPath = bunPath;
  appConfig.autoStartDaemon = autoStartDaemon;

  await window.api.saveConfig({
    bunPath,
    autoStartDaemon
  });

  appendLog('daemon', `[SYSTEM] Saved advanced configuration. Bun Path: ${bunPath}\n`);
  settingsView.classList.add('hidden');
}

// Log view management
function toggleLogsDrawer() {
  logsDrawer.classList.toggle('collapsed');
}

function clearActiveTerminal() {
  if (activeTab === 'daemon-logs') {
    daemonTerminal.textContent = '';
  }
}

function appendLog(source, text) {
  const terminal = daemonTerminal;
  if (!terminal) return;

  // Clean raw control chars if any
  const cleanedText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  
  terminal.textContent += cleanedText;
  
  // Cap at 5000 lines to avoid crashing memory
  const lines = terminal.textContent.split('\n');
  if (lines.length > 5000) {
    terminal.textContent = lines.slice(lines.length - 5000).join('\n');
  }

  // Auto scroll to bottom
  const tabContentContainer = terminal.parentElement;
  tabContentContainer.scrollTop = tabContentContainer.scrollHeight;
}

// ── Voice Recognition ────────────────────────────────────────────────────────
(function initVoice() {
  // Defer until DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceBtn = document.getElementById('voice-btn');
    const chatInput = document.getElementById('chat-input') || document.querySelector('textarea, input[type=text]');

    if (!SpeechRecognition || !voiceBtn) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = localStorage.getItem('soverign_voice_lang') || 'en-US';

    let listening = false;

    voiceBtn.addEventListener('click', () => {
      if (listening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });

    recognition.onstart = () => {
      listening = true;
      voiceBtn.classList.add('voice-listening');
      showToast('Listening...', 'info');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(r => r[0].transcript)
        .join('');
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
  const ttsEnabled = localStorage.getItem('soverign_tts') === 'true';
  if (!ttsEnabled) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voiceName = localStorage.getItem('soverign_tts_voice');
  if (voiceName) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) utter.voice = voice;
  }
  utter.rate = 1.0;
  utter.pitch = 1.0;
  window.speechSynthesis.speak(utter);
}
window.speakText = speakText;

// ── Model Pool & Hardware Recommender ─────────────────────────────────────────
async function initModelPool() {
  const hardwareInfo = document.getElementById('hardware-info');
  const modelList = document.getElementById('model-list');
  const searchInput = document.getElementById('model-search');
  const refreshBtn = document.getElementById('refresh-pool-btn');

  if (!hardwareInfo || !modelList) return;

  // Step 1: Scan hardware
  let specs = null;
  try {
    specs = await window.api.scanHardware();
    if (hardwareInfo) {
      hardwareInfo.textContent = `CPU: ${specs.cpuModel} (${specs.cpuCores} cores) | RAM: ${specs.totalRamGb}GB | GPU: ${specs.gpuName || 'None'} ${specs.gpuVramGb ? `(${specs.gpuVramGb}GB VRAM)` : ''}`;
    }
  } catch (e) {
    if (hardwareInfo) hardwareInfo.textContent = 'Hardware scan failed';
  }

  // Step 2: Load compatible models
  let allModels = [];
  async function loadModels() {
    if (!modelList) return;
    modelList.innerHTML = '<div class="model-loading">Loading...</div>';
    try {
      const result = await window.api.getCompatibleModels(
        specs?.totalRamGb || 8,
        specs?.gpuVramGb || 0
      );
      allModels = result.models || [];
      renderModels(allModels);
    } catch (e) {
      modelList.innerHTML = '<div class="model-error">Failed to load models. Is the daemon running?</div>';
    }
  }

  function renderModels(models) {
    if (!modelList) return;
    const query = (searchInput?.value || '').toLowerCase();
    const activeFilter = document.querySelector('.pill.active')?.dataset.filter || 'all';

    const filtered = models.filter(m => {
      const tags = (m.tags || '').toLowerCase();
      const name = (m.name || '').toLowerCase();
      const matchSearch = !query || name.includes(query) || tags.includes(query);
      const matchFilter = activeFilter === 'all' ||
        (activeFilter === 'local' && m.is_local) ||
        (activeFilter === 'cloud' && !m.is_local) ||
        (activeFilter === 'free' && tags.includes('free'));
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
          ${m.context_length ? `<span class="meta-pill">${(m.context_length/1000).toFixed(0)}K ctx</span>` : ''}
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

  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.textContent = '↻ Refreshing...';
      refreshBtn.disabled = true;
      try {
        await window.api.refreshModelPool();
        showToast('Model pool refreshed!', 'success');
        await loadModels();
      } catch (e) {
        showToast('Refresh failed: ' + e.message, 'error');
      } finally {
        refreshBtn.textContent = '↻ Refresh';
        refreshBtn.disabled = false;
      }
    });
  }

  // Search filter
  if (searchInput) {
    searchInput.addEventListener('input', () => renderModels(allModels));
  }

  // Category pills
  document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderModels(allModels);
    });
  });

  await loadModels();
}

window.downloadModel = async function(name, command) {
  showToast(`Starting download: ${name}`, 'info');
  try {
    const result = await window.api.pullModel(name);
    if (result.success) showToast(`Download complete: ${name}`, 'success');
    else showToast(`Download failed: ${result.error}`, 'error');
  } catch (e) {
    showToast(`Download error: ${e.message}`, 'error');
  }
};

window.activateModel = async function(name, provider) {
  showToast(`Activating ${name}...`, 'info');
  try {
    await window.api.saveApiConfig({ provider: `${provider}-${provider === 'ollama' ? 'local' : 'cloud'}`, customModel: name });
    showToast(`Now using: ${name}`, 'success');
  } catch (e) {
    showToast('Failed to activate model', 'error');
  }
};

// Start application
window.addEventListener('DOMContentLoaded', () => {
  init();
  // Init model pool after 2s for daemon to start
  setTimeout(initModelPool, 2000);
});
