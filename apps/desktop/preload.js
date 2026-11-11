'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  onOpenTabRequest: (cb) =>
    ipcRenderer.on('open-tab-request', (_e, url) => cb(url)),
  onDownloadStarted: (cb) =>
    ipcRenderer.on('download-started', (_e, filename) => cb(filename)),
  onDownloadFailed: (cb) => {
    const listener = (_e, filename) => cb(filename);
    ipcRenderer.on('download-failed', listener);
    return () => ipcRenderer.removeListener('download-failed', listener);
  },
  onDownloadCompleted: (cb) => {
    const listener = (_e, filename) => cb(filename);
    ipcRenderer.on('download-completed', listener);
    return () => ipcRenderer.removeListener('download-completed', listener);
  },
  onDownloadCancelled: (cb) => {
    const listener = (_e, filename) => cb(filename);
    ipcRenderer.on('download-cancelled', listener);
    return () => ipcRenderer.removeListener('download-cancelled', listener);
  },
});
