const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  checkDaemonStatus: () => ipcRenderer.invoke('check-daemon-status'),
  startDaemon: (options) => ipcRenderer.invoke('start-daemon', options),
  stopDaemon: () => ipcRenderer.invoke('stop-daemon'),
  startSidecar: (token) => ipcRenderer.invoke('start-sidecar', token),
  stopSidecar: () => ipcRenderer.invoke('stop-sidecar'),
  checkSidecarStatus: () => ipcRenderer.invoke('check-sidecar-status'),
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
  installWindowsService: (includeSidecar) => ipcRenderer.invoke('install-windows-service', includeSidecar),
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

  // Sidecar status event subscriptions
  onSidecarStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('sidecar-status-changed', subscription);
    return () => ipcRenderer.removeListener('sidecar-status-changed', subscription);
  }
});
