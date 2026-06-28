import { showToast } from './components/toast.js';

// ── DOM elements ───────────────────────────────────────────
// Header
const hdrBrainDot = document.getElementById('brain-status-dot-hdr');
const hdrBrainText = document.getElementById('brain-status-text-hdr');
const btnStartBrain = document.getElementById('btn-start-brain');
const btnStopBrain = document.getElementById('btn-stop-brain');
const btnReload = document.getElementById('btn-reload-webview');
const btnToggleLogs = document.getElementById('btn-toggle-logs');
const btnSettingsGear = document.getElementById('btn-settings-gear');

// Dashboard / splash
const splashView = document.getElementById('splash-view');
const dashboardView = document.getElementById('dashboard-view');
const btnBootSystem = document.getElementById('btn-boot-system');
const sovereignWebview = document.getElementById('sovereign-webview');

// Boot progress
const bootLoadingContainer = document.getElementById('boot-loading-container');
const bootStatusText = document.getElementById('boot-status-text');
const bootTimer = document.getElementById('boot-timer');
const bootProgressBar = document.getElementById('boot-progress-bar');

// Brain chat (fallback)
const brainChatInput = document.getElementById('brain-chat-input');
const brainChatSend = document.getElementById('brain-chat-send');
const brainChatMsg = document.getElementById('brain-chat-messages');

// Logs
const logsDrawer = document.getElementById('logs-drawer');
const daemonTerminal = document.getElementById('daemon-terminal');
const btnCloseLogs = document.getElementById('btn-close-logs');
const btnClearLogs = document.getElementById('btn-clear-logs');

// Settings
const settingsPanel = document.getElementById('settings-panel');
const btnCloseSettings = document.getElementById('btn-close-settings');

// Settings - General
const bunPathInput = document.getElementById('bun-path-input');
const chkAutoDaemon = document.getElementById('chk-auto-daemon');
const btnScanHw = document.getElementById('btn-scan-hw');
const hwInfoSettings = document.getElementById('hw-info-settings');
const spBrainDot = document.getElementById('sp-brain-dot');
const spBrainText = document.getElementById('sp-brain-text');
const spHealthDot = document.getElementById('sp-health-dot');
const spHealthText = document.getElementById('sp-health-text');
const spServiceDot = document.getElementById('sp-service-dot');
const spServiceText = document.getElementById('sp-service-text');

// Settings - Models
const selLlmProvider = document.getElementById('sel-llm-provider');
const fieldApiKey = document.getElementById('field-api-key');
const apiKeyInput = document.getElementById('api-key-input');
const btnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
const customModelInput = document.getElementById('custom-model-input');
const btnSaveApiConfig = document.getElementById('btn-save-api-config');
const fieldLocalGguf = document.getElementById('field-local-gguf');
const txtPullModel = document.getElementById('txt-pull-model');
const btnPullModel = document.getElementById('btn-pull-model');
const btnRefreshOllama = document.getElementById('btn-refresh-ollama');
const ollamaModelsList = document.getElementById('ollama-models-list');
const selOllamaModel = document.getElementById('sel-ollama-model');
const btnSetOllamaDefault = document.getElementById('btn-set-ollama-default');
const ollamaCurrentDefault = document.getElementById('ollama-current-default');
const btnLaunchClaude = document.getElementById('btn-launch-claude');
const ollamaServerStatus = document.getElementById('ollama-server-status');
const localModelsListSettings = document.getElementById('local-models-list-settings');

// Settings - STT
const selSttProvider = document.getElementById('sel-stt-provider');
const sttApiKeyContainer = document.getElementById('stt-api-key-container');
const sttEndpointContainer = document.getElementById('stt-endpoint-container');
const sttApiKey = document.getElementById('stt-api-key');
const sttEndpoint = document.getElementById('stt-endpoint');
const sttModel = document.getElementById('stt-model');
const sttStatus = document.getElementById('stt-status');
const btnSaveStt = document.getElementById('btn-save-stt');

// Settings - TTS
const chkTtsEnabled = document.getElementById('chk-tts-enabled');
const selTtsProvider = document.getElementById('sel-tts-provider');
const selTtsVoice = document.getElementById('sel-tts-voice');
const ttsEndpoint = document.getElementById('tts-endpoint');
const ttsApiKey = document.getElementById('tts-api-key');
const ttsVoiceModel = document.getElementById('tts-voice-model');
const ttsStatus = document.getElementById('tts-status');
const btnSaveTts = document.getElementById('btn-save-tts');

// Settings - Service
const btnInstallService = document.getElementById('btn-install-service');
const btnUninstallService = document.getElementById('btn-uninstall-service');
const serviceStatusText = document.getElementById('service-status');
const btnVerifyDownload = document.getElementById('btn-verify-download');
const verifyStatus = document.getElementById('verify-status');

// Settings - Advanced
const sysInfoText = document.getElementById('sys-info-text');
const btnStartFocus = document.getElementById('btn-start-focus');
const btnStopFocus = document.getElementById('btn-stop-focus');
const chkUseQwen = document.getElementById('chk-use-qwen');
const chkAutoCorrect = document.getElementById('chk-auto-correct');

// ── App state ──────────────────────────────────────────────
const appStartTime = Date.now();
let appConfig = null;
let daemonRunning = false;
let brainRunning = false;
let brainStarting = false;
let statusCheckInProgress = false;
let webviewLoaded = false;

// ── Init ───────────────────────────────────────────────────
async function init() {
  const { getConfig } = await import('./components/api.js');
  appConfig = await getConfig();

  if (bunPathInput) bunPathInput.value = appConfig.bunPath || 'bun';
  if (chkAutoDaemon) chkAutoDaemon.checked = appConfig.autoStartDaemon !== false;

  // Populate API config
  const apiConfig = await window.api.getApiConfig();
  if (selLlmProvider) selLlmProvider.value = (apiConfig && apiConfig.provider) ? apiConfig.provider : 'ollama';
  if (apiKeyInput) apiKeyInput.value = (apiConfig && apiConfig.apiKey) || '';
  if (customModelInput) customModelInput.value = (apiConfig && apiConfig.customModel) || '';
  if (apiConfig && apiConfig.customModel) updateOllamaDefaultDisplay(apiConfig.customModel);

  // Load provider-specific model list
  if (selLlmProvider) updateProviderModelList(selLlmProvider.value);

  // Load STT & TTS config from brain API (fire-and-forget — don't block init)
  window.api.getSttConfig().then(sttCfg => {
    if (!sttCfg) return;
    if (selSttProvider) selSttProvider.value = sttCfg.provider || 'xenova';
    if (sttApiKey) sttApiKey.value = sttCfg.openai?.api_key || sttCfg.groq?.api_key || sttCfg.sarvam?.api_key || '';
    if (sttEndpoint) sttEndpoint.value = sttCfg.local?.endpoint || sttCfg.openai_compatible?.endpoint || '';
    if (sttModel) sttModel.value = sttCfg.local?.model || sttCfg.openai_compatible?.model || '';
    toggleSttFields();
  }).catch(() => {});
  window.api.getTtsConfig().then(ttsCfg => {
    if (!ttsCfg) return;
    if (chkTtsEnabled) chkTtsEnabled.checked = ttsCfg.enabled !== false;
    if (selTtsProvider) selTtsProvider.value = ttsCfg.provider || 'kokoro';
    if (selTtsVoice) selTtsVoice.value = ttsCfg.voice || 'en-US-AriaNeural';
    if (ttsEndpoint) ttsEndpoint.value = ttsCfg.openai_compatible?.endpoint || '';
    if (ttsApiKey) ttsApiKey.value = ttsCfg.openai_compatible?.api_key || '';
    if (ttsVoiceModel) ttsVoiceModel.value = ttsCfg.openai_compatible?.model || '';
    updateTtsStatus();
  }).catch(() => {});

  // Apply correct field visibility for initial provider selection
  toggleLlmFields();
  toggleSttFields();
  updateTtsStatus();

  setupEventListeners();

  window.api.onLog(({ source, text }) => appendLog(source, text));

  window.api.onBrainStatus(({ running, error, starting }) => {
    brainRunning = running;
    if (running) brainStarting = false;
    if (running && !webviewLoaded) loadWebview();
    updateBrainUI(running, error, starting || brainStarting);
  });

  window.api.onBrainEvent(({ event, data }) => {
    if (event === 'log') appendLog('brain', data.message + '\n');
  });

  window.api.onRefreshWebview(() => {
    if (sovereignWebview && webviewLoaded) {
      sovereignWebview.reload();
    }
  });

  window.api.onVerifyStatus((msg) => {
    if (verifyStatus) verifyStatus.textContent += msg;
  });

  await checkSystemStatus();
  await checkServiceStatus();

  // Periodic check every 8s (was 3s — reduced for CPU)
  const statusIntervalId = setInterval(checkSystemStatus, 8000);
  window.__statusIntervalId = statusIntervalId;
}

// ── Event Listeners ────────────────────────────────────────
function setupEventListeners() {
  // Header controls
  if (btnStartBrain) btnStartBrain.addEventListener('click', bootDaemon);
  if (btnBootSystem) btnBootSystem.addEventListener('click', bootDaemon);
  if (btnStopBrain) btnStopBrain.addEventListener('click', stopDaemon);
  if (btnReload) btnReload.addEventListener('click', () => {
    if (sovereignWebview) {
      appendLog('daemon', '[SYSTEM] Reloading interface...\n');
      webviewLoaded = false;
      sovereignWebview.reload();
      webviewLoaded = true;
    }
  });
  if (btnToggleLogs) btnToggleLogs.addEventListener('click', () => logsDrawer?.classList.toggle('collapsed'));
  if (btnCloseLogs && logsDrawer) btnCloseLogs.addEventListener('click', () => logsDrawer.classList.add('collapsed'));
  if (btnClearLogs) btnClearLogs.addEventListener('click', () => { if (daemonTerminal) daemonTerminal.textContent = ''; });

  // Settings panel
  if (btnSettingsGear) btnSettingsGear.addEventListener('click', toggleSettings);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', toggleSettings);

  // Settings nav
  const settingsNavItems = document.querySelectorAll('.settings-nav-item');
  const settingsSections = document.querySelectorAll('.settings-section');
  settingsNavItems.forEach(item => {
    item.addEventListener('click', () => {
      settingsNavItems.forEach(n => n.classList.remove('active'));
      settingsSections.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      const section = document.getElementById('section-' + item.dataset.section);
      if (section) section.classList.add('active');
    });
  });

  // Brain chat
  if (brainChatSend) brainChatSend.addEventListener('click', sendBrainChat);
  if (brainChatInput) brainChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBrainChat(); });

  // Settings - General
  if (btnScanHw) btnScanHw.addEventListener('click', scanHardwareSettings);

  // Settings - Models
  if (selLlmProvider) selLlmProvider.addEventListener('change', toggleLlmFields);
  if (btnSaveApiConfig) btnSaveApiConfig.addEventListener('click', saveApiConfig);
  if (btnToggleKeyVis) btnToggleKeyVis.addEventListener('click', toggleKeyVisibility);
  if (btnPullModel) btnPullModel.addEventListener('click', pullModel);
  if (btnRefreshOllama) btnRefreshOllama.addEventListener('click', refreshOllamaModels);
  if (btnLaunchClaude) btnLaunchClaude.addEventListener('click', () => window.api.launchClaudeWin());
  if (txtPullModel) txtPullModel.addEventListener('keydown', (e) => { if (e.key === 'Enter') pullModel(); });
  if (btnSetOllamaDefault) btnSetOllamaDefault.addEventListener('click', setOllamaDefaultModel);

  // Settings - STT
  if (selSttProvider) selSttProvider.addEventListener('change', toggleSttFields);
  if (btnSaveStt) btnSaveStt.addEventListener('click', saveSttConfig);

  // Settings - TTS
  if (selTtsProvider) selTtsProvider.addEventListener('change', updateTtsStatus);
  if (btnSaveTts) btnSaveTts.addEventListener('click', saveTtsConfig);

  // Settings - Service
  if (btnInstallService) btnInstallService.addEventListener('click', installService);
  if (btnUninstallService) btnUninstallService.addEventListener('click', uninstallService);
  if (btnVerifyDownload) btnVerifyDownload.addEventListener('click', verifyAndDownload);

  // Settings - Advanced
  if (btnStartFocus) btnStartFocus.addEventListener('click', startFocusMode);
  if (btnStopFocus) btnStopFocus.addEventListener('click', stopFocusMode);

  // Webview reconnect
  const reconnectBtn = document.getElementById('btn-reconnect');
  if (reconnectBtn) reconnectBtn.addEventListener('click', () => {
    document.getElementById('reconnect-overlay')?.classList.add('hidden');
    if (sovereignWebview) {
      webviewLoaded = false;
      sovereignWebview.reload();
      webviewLoaded = true;
    }
  });

  // Webview listeners
  if (sovereignWebview) {
    sovereignWebview.addEventListener('did-finish-load', () => {
      document.getElementById('reconnect-overlay')?.classList.add('hidden');
    });
    sovereignWebview.addEventListener('did-fail-load', () => {
      webviewLoaded = false;
      document.getElementById('reconnect-overlay')?.classList.remove('hidden');
    });
  }
}

// ── Settings toggle ────────────────────────────────────────
function toggleSettings() {
  if (!settingsPanel) return;
  const isOpen = settingsPanel.classList.toggle('open');
  settingsPanel.classList.remove('hidden');
  dashboardView?.classList.toggle('settings-open', isOpen);
  if (isOpen) checkServiceStatus();
}

// ── LLM field visibility & provider-specific model listing ─
function toggleLlmFields() {
  if (!selLlmProvider) return;
  const val = selLlmProvider.value;
  const needsKey = !['ollama', 'local'].includes(val);
  if (fieldApiKey) fieldApiKey.style.display = needsKey ? 'block' : 'none';
  if (fieldLocalGguf) fieldLocalGguf.style.display = val === 'local' ? 'block' : 'none';
  updateProviderModelList(val);
}

const PROVIDER_MODEL_HINTS = {
  local: 'Place .gguf files in C:\\Users\\Akash\\.sovereign\\models\\ for local inference.',
  anthropic: 'Supported models: claude-sonnet-4-6, claude-3-5-haiku-latest, claude-3-opus-latest',
  openai: 'Supported models: gpt-4o-mini, gpt-4o, gpt-4.1, o3, o4-mini',
  gemini: 'Supported models: gemini-2.5-flash, gemini-2.5-pro, gemini-1.5-flash',
  openrouter: 'Browse models at https://openrouter.ai/models',
  groq: 'Supported models: llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768',
  nvidia: 'Supported models: meta/llama-3.1-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct',
};
const PROVIDER_DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  openrouter: 'qwen/qwen-2.5-coder-1.5b-instruct:free',
  groq: 'llama-3.3-70b-versatile',
  nvidia: 'meta/llama-3.1-70b-instruct',
};

async function updateProviderModelList(provider) {
  const containerId = 'provider-models-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.className = 'provider-models-box';
    const fieldContainer = document.getElementById('field-custom-model') || customModelInput?.parentElement;
    if (fieldContainer) fieldContainer.after(container);
    else if (customModelInput) customModelInput.after(container);
  }
  const msgEl = document.createElement('em');
  container.textContent = '';
  msgEl.textContent = 'Loading...';
  container.appendChild(msgEl);
  try {
    if (provider === 'ollama') {
      const status = await window.api.checkOllamaServer();
      container.textContent = '';
      if (status.running) {
        const result = await window.api.listLocalModels();
        const models = result.success ? result.models : [];
        if (models.length) {
          for (const m of models) {
            const div = document.createElement('div');
            div.style.cssText = 'cursor:pointer;padding:2px 0';
            div.textContent = `• ${m}`;
            div.addEventListener('click', () => { if (customModelInput) customModelInput.value = m; });
            container.appendChild(div);
          }
        } else {
          msgEl.textContent = 'No models installed. Use the Download field above.';
          container.appendChild(msgEl);
        }
      } else {
        msgEl.textContent = 'Ollama server not running. Start Ollama to see models.';
        container.appendChild(msgEl);
      }
      return;
    }
    const hint = PROVIDER_MODEL_HINTS[provider];
    const defaultModel = PROVIDER_DEFAULT_MODELS[provider];
    container.textContent = '';
    if (hint) {
      msgEl.textContent = hint;
      container.appendChild(msgEl);
    }
    if (defaultModel && customModelInput && !customModelInput.value) {
      customModelInput.value = defaultModel;
    }
  } catch {
    container.textContent = '';
    msgEl.textContent = 'Could not load model list.';
    container.appendChild(msgEl);
  }
}

async function checkOllamaServer() {
  if (!ollamaServerStatus) return;
  try {
    const status = await window.api.checkOllamaServer();
    if (status.running) {
      ollamaServerStatus.innerHTML = '<span style="color:#00e676;">●</span> Ollama running on localhost:11434';
      refreshOllamaModels();
    } else {
      ollamaServerStatus.innerHTML = '<span style="color:#ff5252;">●</span> Ollama not detected on localhost:11434';
    }
  } catch {
    ollamaServerStatus.textContent = 'Could not check Ollama server.';
  }
}

function toggleKeyVisibility() {
  if (!apiKeyInput || !btnToggleKeyVis) return;
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    btnToggleKeyVis.textContent = '🔒';
  } else {
    apiKeyInput.type = 'password';
    btnToggleKeyVis.textContent = '👁️';
  }
}

// ── STT field visibility ──────────────────────────────────
function toggleSttFields() {
  if (!selSttProvider) return;
  const val = selSttProvider.value;
  const needsKey = val === 'openai' || val === 'groq' || val === 'sarvam';
  const needsEndpoint = val === 'local' || val === 'openai_compatible';
  if (sttApiKeyContainer) sttApiKeyContainer.classList.toggle('hidden', !needsKey);
  if (sttEndpointContainer) sttEndpointContainer.classList.toggle('hidden', !needsEndpoint);
  const sttModelContainer = document.getElementById('stt-model-container');
  if (sttModelContainer) sttModelContainer.classList.toggle('hidden', !needsEndpoint);
  if (sttStatus) sttStatus.textContent = `Status: ${selSttProvider.options[selSttProvider.selectedIndex].text}`;
}

function updateTtsStatus() {
  if (!selTtsProvider || !ttsStatus) return;
  const val = selTtsProvider.value;
  const ttsEndpointContainer = document.getElementById('tts-endpoint-container');
  const ttsApiKeyContainer = document.getElementById('tts-api-key-container');
  const ttsVoiceModelContainer = document.getElementById('tts-voice-model-container');
  const isCustom = val === 'openai_compatible';
  if (ttsEndpointContainer) ttsEndpointContainer.classList.toggle('hidden', !isCustom);
  if (ttsApiKeyContainer) ttsApiKeyContainer.classList.toggle('hidden', !isCustom);
  if (ttsVoiceModelContainer) ttsVoiceModelContainer.classList.toggle('hidden', !isCustom);
  ttsStatus.textContent = `Status: ${selTtsProvider.options[selTtsProvider.selectedIndex].text}`;
}

// ── Save API config ────────────────────────────────────────
async function saveApiConfig() {
  if (!selLlmProvider || !apiKeyInput || !customModelInput || !btnSaveApiConfig) return;
  const provider = selLlmProvider.value;
  const apiKey = apiKeyInput.value.trim();
  const customModel = customModelInput.value.trim();
  const needsKey = !['ollama', 'local'].includes(provider);
  if (needsKey && !apiKey) { showToast('Please enter an API Key!', 'warn'); return; }
  const result = await window.api.saveApiConfig({ provider, apiKey, customModel });
  if (result.success) {
    if (provider === 'ollama') updateOllamaDefaultDisplay(customModel);
    if (selOllamaModel && customModel) {
      const opt = Array.from(selOllamaModel.options).find(o => o.value === customModel);
      if (opt) selOllamaModel.value = customModel;
    }
    if (ollamaCurrentDefault) ollamaCurrentDefault.textContent = customModel || 'none';
    showToast(`Now using: ${provider}:${customModel}`, 'success');
  } else {
    showToast(`Failed: ${result.error}`, 'error');
  }
}

async function saveSttConfig() {
  if (!selSttProvider || !btnSaveStt) return;
  const provider = selSttProvider.value;
  const payload = { provider };
  if (provider === 'openai') payload.openai = { api_key: sttApiKey?.value?.trim() || '' };
  if (provider === 'groq') payload.groq = { api_key: sttApiKey?.value?.trim() || '' };
  if (provider === 'sarvam') payload.sarvam = { api_key: sttApiKey?.value?.trim() || '' };
  if (provider === 'local') payload.local = { endpoint: sttEndpoint?.value?.trim() || 'http://localhost:8189', model: sttModel?.value?.trim() || '', server_type: 'whisper_cpp' };
  if (provider === 'openai_compatible') payload.openai_compatible = { endpoint: sttEndpoint?.value?.trim() || '', api_key: sttApiKey?.value?.trim() || '', model: sttModel?.value?.trim() || '' };
  btnSaveStt.disabled = true;
  btnSaveStt.textContent = 'Saving...';
  const result = await window.api.saveSttConfig(payload);
  btnSaveStt.disabled = false;
  btnSaveStt.textContent = 'Save';
  showToast(result.success ? 'STT config saved!' : `Failed: ${result.error}`, result.success ? 'success' : 'error');
}

async function saveTtsConfig() {
  if (!selTtsProvider || !btnSaveTts) return;
  const provider = selTtsProvider.value;
  const payload = { provider, enabled: chkTtsEnabled?.checked !== false, voice: selTtsVoice?.value || 'af_heart' };
  if (provider === 'openai_compatible') {
    payload.openai_compatible = { endpoint: ttsEndpoint?.value?.trim() || '', api_key: ttsApiKey?.value?.trim() || '', model: ttsVoiceModel?.value?.trim() || '' };
  }
  btnSaveTts.disabled = true;
  btnSaveTts.textContent = 'Saving...';
  const result = await window.api.saveTtsConfig(payload);
  btnSaveTts.disabled = false;
  btnSaveTts.textContent = 'Save';
  showToast(result.success ? 'TTS config saved!' : `Failed: ${result.error}`, result.success ? 'success' : 'error');
}

// ── Pull model ─────────────────────────────────────────────
async function pullModel() {
  if (!txtPullModel || !btnPullModel) return;
  const modelName = txtPullModel.value.trim();
  if (!modelName) { showToast('Enter a model name.', 'warn'); return; }
  btnPullModel.disabled = true;
  btnPullModel.textContent = '📥 Downloading...';
  logsDrawer?.classList.remove('collapsed');
  const result = await window.api.pullModel(modelName);
  btnPullModel.disabled = false;
  btnPullModel.textContent = 'Download';
  if (result.success) { showToast(`"${modelName}" downloaded!`, 'success'); txtPullModel.value = ''; refreshOllamaModels(); }
  else { showToast(`Failed: ${result.error}`, 'error'); }
}

async function refreshOllamaModels() {
  if (!ollamaModelsList) return;
  ollamaModelsList.textContent = 'Refreshing...';
  try {
    const result = await window.api.listLocalModels();
    const models = result.success ? result.models : [];
    ollamaModelsList.textContent = '';
    if (models.length) {
      for (const m of models) {
        const div = document.createElement('div');
        div.textContent = `• ${m}`;
        ollamaModelsList.appendChild(div);
      }
    } else {
      ollamaModelsList.textContent = 'No Ollama models installed.';
    }
    if (selOllamaModel) {
      const currentVal = selOllamaModel.value;
      selOllamaModel.textContent = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- Select model --';
      selOllamaModel.appendChild(opt);
      for (const m of models) {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = m;
        selOllamaModel.appendChild(o);
      }
      if (currentVal && models.includes(currentVal)) selOllamaModel.value = currentVal;
    }
  } catch { ollamaModelsList.textContent = 'Error checking Ollama.'; }
}

async function setOllamaDefaultModel() {
  if (!selOllamaModel || !customModelInput || !ollamaCurrentDefault) return;
  const model = selOllamaModel.value;
  if (!model) { showToast('Select a model first.', 'warn'); return; }
  customModelInput.value = model;
  ollamaCurrentDefault.textContent = model;
  await saveApiConfig();
}

function updateOllamaDefaultDisplay(model) {
  if (ollamaCurrentDefault) ollamaCurrentDefault.textContent = model || 'none';
}

// ── Hardware scan ──────────────────────────────────────────
async function scanHardwareSettings() {
  if (!hwInfoSettings || !btnScanHw) return;
  btnScanHw.disabled = true;
  hwInfoSettings.textContent = 'Scanning...';
  try {
    const info = await window.api.scanHardware();
    hwInfoSettings.innerHTML = '';
    hwInfoSettings.appendChild(document.createTextNode(`CPU: ${info.cpuModel} (${info.cpuCores} cores)`));
    hwInfoSettings.appendChild(document.createElement('br'));
    hwInfoSettings.appendChild(document.createTextNode(`RAM: ${info.totalRamGb}GB (${info.freeRamGb}GB free)`));
    hwInfoSettings.appendChild(document.createElement('br'));
    hwInfoSettings.appendChild(document.createTextNode(`GPU: ${info.gpuName || 'None'} (${info.gpuVramGb || 0}GB VRAM)`));
    hwInfoSettings.appendChild(document.createElement('br'));
    hwInfoSettings.appendChild(document.createTextNode(`Recommended: ${info.recommended}`));
    if (sysInfoText) {
      sysInfoText.innerHTML = '';
      sysInfoText.appendChild(document.createTextNode(`CPU: ${info.cpuModel}`));
      sysInfoText.appendChild(document.createElement('br'));
      sysInfoText.appendChild(document.createTextNode(`RAM: ${info.totalRamGb}GB`));
      sysInfoText.appendChild(document.createElement('br'));
      sysInfoText.appendChild(document.createTextNode(`GPU: ${info.gpuName || 'Unknown'}`));
      sysInfoText.appendChild(document.createElement('br'));
      sysInfoText.appendChild(document.createTextNode(`OS: ${info.platform}`));
    }
    if (customModelInput) customModelInput.value = info.recommended;
    if (selLlmProvider) selLlmProvider.value = 'ollama';
  } catch { hwInfoSettings.textContent = 'Scan failed.'; }
  btnScanHw.disabled = false;
}

// ── Show the webview (dashboard SPA) ───────────────────────
function loadWebview() {
  if (!sovereignWebview || webviewLoaded) return;
  webviewLoaded = true;
  if (splashView) splashView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');
  sovereignWebview.classList.remove('hidden');
  sovereignWebview.src = 'http://localhost:3142';
  const bcc = document.getElementById('brain-chat-container');
  if (bcc) bcc.classList.add('hidden');
}

// ── Status checks ──────────────────────────────────────────
async function checkSystemStatus() {
  if (statusCheckInProgress) return;
  statusCheckInProgress = true;
  try {
    const daemonStatus = await window.api.checkDaemonStatus();
    const brainStatus = await window.api.brainStatus();
    daemonRunning = daemonStatus;
    brainRunning = brainStatus.running;

    const elapsed = Date.now() - appStartTime;
    brainStarting = !brainRunning && !brainStatus.error && elapsed < 35000;

    updateBrainUI(brainStatus.running, brainStatus.error, brainStarting);

    const health = daemonStatus ? await window.api.healthCheck() : null;

    // Mirror status to settings panel
    if (spBrainDot && spBrainText) {
      if (brainRunning) { spBrainDot.className = 'status-dot-sm running'; spBrainText.textContent = 'Online'; }
      else if (brainStarting) { spBrainDot.className = 'status-dot-sm pending'; spBrainText.textContent = 'Starting...'; }
      else { spBrainDot.className = 'status-dot-sm stopped'; spBrainText.textContent = 'Offline'; }
    }
    if (spHealthDot && spHealthText) {
      if (health && health.status === 'running') { spHealthDot.className = 'status-dot-sm running'; spHealthText.textContent = 'Port ' + health.port + ' active'; }
      else { spHealthDot.className = 'status-dot-sm stopped'; spHealthText.textContent = 'Not responding'; }
    }
    if (spServiceDot && spServiceText) {
      try {
        const s = await window.api.checkServiceInstalled();
        if (s?.daemon || s === true) { spServiceDot.className = 'status-dot-sm running'; spServiceText.textContent = 'Installed'; }
        else { spServiceDot.className = 'status-dot-sm stopped'; spServiceText.textContent = 'Not installed'; }
      } catch { spServiceDot.className = 'status-dot-sm stopped'; spServiceText.textContent = 'Unknown'; }
    }

    if (brainRunning && !webviewLoaded) {
      loadWebview();
    } else if (!brainRunning) {
      if (splashView) splashView.classList.remove('hidden');
      if (dashboardView) dashboardView.classList.add('hidden');
    }
  } finally { statusCheckInProgress = false; }
}

function updateBrainUI(isRunning, error, starting) {
  const els = [
    { dot: hdrBrainDot, text: hdrBrainText },
  ];
  for (const el of els) {
    if (!el.dot && !el.text) continue;
    if (isRunning) {
      if (el.dot) el.dot.className = 'status-dot-sm running';
      if (el.text) el.text.textContent = 'Online';
    } else if (starting) {
      if (el.dot) el.dot.className = 'status-dot-sm pending';
      if (el.text) el.text.textContent = 'Starting...';
    } else if (error) {
      if (el.dot) el.dot.className = 'status-dot-sm error';
      if (el.text) el.text.textContent = 'Error';
    } else {
      if (el.dot) el.dot.className = 'status-dot-sm stopped';
      if (el.text) el.text.textContent = 'Offline';
    }
  }
  if (btnStartBrain) btnStartBrain.disabled = isRunning || starting;
  if (btnStopBrain) btnStopBrain.disabled = !isRunning;
}

// ── Boot daemon ────────────────────────────────────────────
async function bootDaemon() {
  if (btnStartBrain) btnStartBrain.disabled = true;
  if (btnBootSystem) btnBootSystem.disabled = true;

  if (bootLoadingContainer) bootLoadingContainer.classList.remove('hidden');

  let progress = 0;
  let remainingTime = 10;
  if (bootProgressBar) bootProgressBar.style.width = '0%';
  if (bootTimer) bootTimer.textContent = '10s';

  const statuses = [
    { threshold: 8, text: 'Initializing Sovereign environment...' },
    { threshold: 6, text: 'Booting Sovereign Brain...' },
    { threshold: 4, text: 'Loading local model configuration...' },
    { threshold: 2, text: 'Starting channels & websocket server...' },
    { threshold: 0, text: 'Connecting to system interface...' },
  ];

  const bootInterval = setInterval(() => {
    progress += 10;
    remainingTime -= 1;
    if (bootProgressBar) bootProgressBar.style.width = `${progress}%`;
    if (bootTimer) bootTimer.textContent = `${remainingTime}s`;
    const status = statuses.find(s => remainingTime >= s.threshold);
    if (status && bootStatusText) bootStatusText.textContent = status.text;
    if (remainingTime <= 0) clearInterval(bootInterval);
  }, 1000);

  const result = await window.api.startDaemon({
    useQwen: chkUseQwen ? chkUseQwen.checked : true,
    autoCorrect: chkAutoCorrect ? chkAutoCorrect.checked : true,
  });

  clearInterval(bootInterval);
  if (bootProgressBar) bootProgressBar.style.width = '100%';
  if (bootTimer) bootTimer.textContent = '0s';
  if (bootStatusText) bootStatusText.textContent = 'Ready!';

  setTimeout(async () => {
    if (bootLoadingContainer) bootLoadingContainer.classList.add('hidden');
    await checkSystemStatus();
    if (btnBootSystem) btnBootSystem.disabled = false;
    if (btnStartBrain) btnStartBrain.disabled = false;
    if (result && !result.success) showToast(`Failed: ${result.error}`, 'error');
  }, 800);
}

async function stopDaemon() {
  if (!confirm('Shut down the Sovereign brain?')) return;
  if (btnStopBrain) btnStopBrain.disabled = true;
  await window.api.stopDaemon();
  await checkSystemStatus();
}

// ── Service management ─────────────────────────────────────
async function installService() {
  if (!btnInstallService || !serviceStatusText) return;
  btnInstallService.disabled = true;
  serviceStatusText.textContent = 'Installing...';
  try {
    const result = await window.api.installWindowsService();
    showToast(result.success ? 'Service installed!' : `Failed: ${result.error}`, result.success ? 'success' : 'error');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
  finally { await checkServiceStatus(); btnInstallService.disabled = false; }
}

async function uninstallService() {
  if (!btnUninstallService || !serviceStatusText) return;
  btnUninstallService.disabled = true;
  serviceStatusText.textContent = 'Uninstalling...';
  try {
    const result = await window.api.uninstallWindowsService();
    showToast(result.success ? 'Service removed' : `Failed: ${result.error}`, result.success ? 'success' : 'error');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
  finally { await checkServiceStatus(); btnUninstallService.disabled = false; }
}

async function checkServiceStatus() {
  if (!serviceStatusText) return;
  try {
    const status = await window.api.checkServiceInstalled();
    const ok = status?.daemon ?? status === true;
    if (ok) {
      serviceStatusText.textContent = '✅ Service installed & running 24/7';
      serviceStatusText.style.color = '#00e676';
      if (btnInstallService) btnInstallService.style.display = 'none';
      if (btnUninstallService) btnUninstallService.style.display = 'block';
    } else {
      serviceStatusText.textContent = '❌ Service not installed';
      serviceStatusText.style.color = 'var(--text-muted)';
      if (btnInstallService) { btnInstallService.style.display = 'block'; btnInstallService.textContent = '⚡ Install 24/7 Service'; }
      if (btnUninstallService) btnUninstallService.style.display = 'none';
    }
  } catch { serviceStatusText.textContent = 'Status: Unknown'; }
}

// ── Verify & Download ──────────────────────────────────────
async function verifyAndDownload() {
  if (!btnVerifyDownload || !verifyStatus) return;
  btnVerifyDownload.disabled = true;
  btnVerifyDownload.textContent = '⏳ Verifying...';
  verifyStatus.textContent = '';
  try {
    const result = await window.api.verifyAndDownload();
    const failed = result.results?.filter(r => r.status === 'failed' || r.status === 'error') || [];
    verifyStatus.textContent = failed.length === 0 ? '✅ All services verified!' : '⚠️ Some services have issues.';
    showToast(failed.length === 0 ? 'All verified!' : `${failed.length} service(s) failed`, failed.length === 0 ? 'success' : 'warn');
  } catch (e) { verifyStatus.textContent = `❌ Error: ${e.message}`; showToast('Verification error', 'error'); }
  btnVerifyDownload.disabled = false;
  btnVerifyDownload.textContent = '🔄 Verify & Download Missing Services';
}

// ── Focus Mode ─────────────────────────────────────────────
async function startFocusMode() {
  if (!btnStartFocus) return;
  btnStartFocus.disabled = true;
  try {
    const result = await window.api.startFocusMode();
    if (result.success) {
      showToast(`Focus Mode enabled. ${result.loweredCount} processes lowered.`, 'success');
      btnStartFocus.style.display = 'none';
      if (btnStopFocus) btnStopFocus.style.display = 'block';
    } else showToast(`Failed: ${result.error}`, 'error');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
  finally { btnStartFocus.disabled = false; }
}

async function stopFocusMode() {
  if (!btnStopFocus) return;
  btnStopFocus.disabled = true;
  try {
    const result = await window.api.stopFocusMode();
    if (result.success) {
      showToast(`Focus Mode disabled. ${result.restoredCount} processes restored.`, 'success');
      if (btnStartFocus) btnStartFocus.style.display = 'block';
      btnStopFocus.style.display = 'none';
    } else showToast(`Failed: ${result.error}`, 'error');
  } catch (e) { showToast(`Error: ${e.message}`, 'error'); }
  finally { btnStopFocus.disabled = false; }
}

// ── Native Brain Chat ──────────────────────────────────────
async function sendBrainChat() {
  const input = brainChatInput;
  const sendBtn = brainChatSend;
  const messagesEl = brainChatMsg;
  if (!input || !sendBtn || !messagesEl) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendBtn.disabled = true;

  const userMsg = document.createElement('div');
  userMsg.style = 'align-self:flex-end; background:linear-gradient(135deg,#3a3a8a,#2a2a6a); padding:8px 12px; border-radius:10px; border-bottom-right-radius:4px; max-width:80%; font-size:13px; line-height:1.5; word-wrap:break-word;';
  userMsg.textContent = text;
  messagesEl.appendChild(userMsg);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const asstMsg = document.createElement('div');
  asstMsg.style = 'align-self:flex-start; background:rgba(30,30,70,0.6); border:1px solid #2a2a5a; padding:8px 12px; border-radius:10px; border-bottom-left-radius:4px; max-width:80%; font-size:13px; line-height:1.5; word-wrap:break-word; color:#8888cc;';
  asstMsg.id = 'brain-chat-pending';
  asstMsg.innerHTML = '<span class="chat-thinking-dot"></span><span class="chat-thinking-dot"></span><span class="chat-thinking-dot"></span> <span style="color:#6666aa;font-size:11px">thinking</span>';
  messagesEl.appendChild(asstMsg);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const result = await window.api.chatSend(text, [], false);
    const pending = document.getElementById('brain-chat-pending');
    if (pending) {
      if (result.result) {
        pending.textContent = result.result.content || result.result.text || JSON.stringify(result.result);
        pending.style.color = '#e0e0ff';
      } else {
        pending.textContent = 'Error: ' + (result.error || 'Unknown') + '\n\n💡 Configure an LLM provider in Settings > Models.';
        pending.style.color = '#ff5252';
      }
      pending.id = '';
    }
  } catch (e) {
    const pending = document.getElementById('brain-chat-pending');
    if (pending) { pending.textContent = 'Error: ' + e.message; pending.style.color = '#ff5252'; pending.id = ''; }
  }
  sendBtn.disabled = false;
  input.focus();
}

const ANSI_CLEAN_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const MAX_LOG_LINES = 5000;
let logLineCount = 0;

// ── Log management ─────────────────────────────────────────
function appendLog(source, text) {
  if (!daemonTerminal) return;
  const clean = text.replace(ANSI_CLEAN_RE, '');
  daemonTerminal.appendChild(document.createTextNode(clean));
  logLineCount += clean.split('\n').length - 1;
  if (logLineCount > MAX_LOG_LINES) {
    const allText = daemonTerminal.textContent;
    const lines = allText.split('\n');
    if (lines.length > MAX_LOG_LINES) {
      daemonTerminal.textContent = lines.slice(lines.length - MAX_LOG_LINES).join('\n');
      logLineCount = MAX_LOG_LINES;
    }
  }
  const container = daemonTerminal.parentElement;
  if (container) container.scrollTop = container.scrollHeight;
}

// ── Global handlers ────────────────────────────────────────
window.addEventListener('error', (event) => {
  console.error('Uncaught UI error:', event.error);
  showToast(`Error: ${event.message}`, 'error');
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled rejection:', event.reason);
  showToast(`Rejection: ${event.reason?.message || event.reason}`, 'error');
});

// ── Bootstrap ──────────────────────────────────────────────
init();
