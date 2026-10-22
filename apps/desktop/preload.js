'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  onOpenTabRequest: (cb) =>
    ipcRenderer.on('open-tab-request', (_e, url) => cb(url)),
  onDownloadStarted: (cb) =>
    ipcRenderer.on('download-started', (_e, filename) => cb(filename)),
});
