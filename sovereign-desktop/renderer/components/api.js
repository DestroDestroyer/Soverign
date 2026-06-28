/**
 * Centralized API wrapper for renderer process.
 * All IPC calls are funneled through this module, making it easy to mock
 * or replace in tests and providing a single point of maintenance.
 */

export async function getConfig() {
  return await window.api.getConfig();
}

export async function saveConfig(config) {
  return await window.api.saveConfig(config);
}

export async function getApiConfig() {
  return await window.api.getApiConfig();
}

export async function saveApiConfig(data) {
  return await window.api.saveApiConfig(data);
}

export async function startDaemon(options) {
  return await window.api.startDaemon(options);
}

export async function stopDaemon() {
  return await window.api.stopDaemon();
}

export async function checkDaemonStatus() {
  return await window.api.checkDaemonStatus();
}

export async function healthCheck() {
  return await window.api.healthCheck();
}

export async function pullModel(name) {
  return await window.api.pullModel(name);
}

export async function listLocalModels() {
  return await window.api.listLocalModels();
}

export async function scanHardware() {
  return await window.api.scanHardware();
}

export async function checkServiceInstalled() {
  return await window.api.checkServiceInstalled();
}

export async function installWindowsService() {
  return await window.api.installWindowsService();
}

export async function uninstallWindowsService() {
  return await window.api.uninstallWindowsService();
}

export async function launchClaudeWin() {
  return await window.api.launchClaudeWin();
}

export async function startFocusMode() {
  return await window.api.startFocusMode();
}

export async function stopFocusMode() {
  return await window.api.stopFocusMode();
}

export async function getCompatibleModels(ramGb, vramGb) {
  return await window.api.getCompatibleModels(ramGb, vramGb);
}

export async function refreshModelPool() {
  return await window.api.refreshModelPool();
}

export function onLog(callback) {
  return window.api.onLog(callback);
}
