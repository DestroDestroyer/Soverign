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
