/**
 * GitHub Trend Tracker — Electron Preload
 * 安全地暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  platform: process.platform,
});
