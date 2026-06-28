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
  checkOllamaServer: () => ipcRenderer.invoke('check-ollama-server'),
  
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
  },

  // ── Brain API ──────────────────────────────────────────────────────
  brainStatus: () => ipcRenderer.invoke('brain-status'),
  brainHealth: () => ipcRenderer.invoke('brain-health'),
  brainRequest: (method, params, timeout) =>
    ipcRenderer.invoke('brain-request', { method, params, timeout }),
  chatSend: (message, history, stream) =>
    ipcRenderer.invoke('chat-send', { message, history, stream }),

  onBrainEvent: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('brain-event', sub);
    return () => ipcRenderer.removeListener('brain-event', sub);
  },
  onBrainStatus: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('brain-status', sub);
    return () => ipcRenderer.removeListener('brain-status', sub);
  },

  // ── STT/TTS/Voice Config (synced with brain HTTP API) ────────────────
  getVoiceConfig: () => ipcRenderer.invoke('get-voice-config'),
  getSttConfig: () => ipcRenderer.invoke('get-stt-config'),
  saveSttConfig: (data) => ipcRenderer.invoke('save-stt-config', data),
  getTtsConfig: () => ipcRenderer.invoke('get-tts-config'),
  saveTtsConfig: (data) => ipcRenderer.invoke('save-tts-config', data),
  onRefreshWebview: (callback) => {
    const sub = () => callback();
    ipcRenderer.on('refresh-webview', sub);
    return () => ipcRenderer.removeListener('refresh-webview', sub);
  },

  // ── Verify & Download ─────────────────────────────────────────────────
  verifyAndDownload: () => ipcRenderer.invoke('verify-and-download'),
  onVerifyStatus: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('verify-status-update', sub);
    return () => ipcRenderer.removeListener('verify-status-update', sub);
  }
});
