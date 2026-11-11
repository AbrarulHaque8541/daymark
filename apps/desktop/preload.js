'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daymark', {
  onOpenTabRequest: (cb) =>
    ipcRenderer.on('open-tab-request', (_e, url) => cb(url)),
  onDownloadStarted: (cb) =>
    ipcRenderer.on('download-started', (_e, filename) => cb(filename)),
  onDownloadProgress: (cb) => {
    const listener = (_e, progress) => {
      if (!progress || typeof progress.filename !== 'string' || !progress.filename
        || !Number.isInteger(progress.percent) || progress.percent < 0 || progress.percent > 100) return;
      cb(progress.filename, progress.percent);
    };
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onDownloadFailed: (cb) => {
    const listener = (_e, failure) => {
      if (!failure || typeof failure !== 'object'
        || typeof failure.filename !== 'string' || !failure.filename
        || typeof failure.preflight !== 'boolean'
        || (failure.preflight
          ? typeof failure.cancellationConfirmed !== 'boolean'
          : failure.cancellationConfirmed !== null)) return;
      // Rebuild the payload instead of forwarding arbitrary IPC properties.
      cb({
        filename: failure.filename,
        preflight: failure.preflight,
        cancellationConfirmed: failure.cancellationConfirmed,
      });
    };
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
