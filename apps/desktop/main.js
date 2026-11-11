'use strict';

const { app, session, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { handleWillDownload } = require('./lib/download-handler');
const { createStagingPath, publishStagedFile, cleanupStaging } = require('./lib/download-publish');
const { pathToFileURL } = require('url');
const { isAllowedUrl } = require('./lib/rules');
const { isAllowedRequest, isTrackerRequest } = require('./lib/request-policy');
const { installWebviewPopupPolicy } = require('./lib/webview-popup-policy');

let mainWindow = null;
const reservedDownloadPaths = new Set();
const rendererDir = path.join(__dirname, 'renderer');
const appUiFiles = new Set(['index.html', 'app.js', 'style.css'].map((name) =>
  pathToFileURL(path.join(rendererDir, name)).href,
));
const appUiEntry = pathToFileURL(path.join(rendererDir, 'index.html')).href;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Daymark Browser',
    webPreferences: {
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  const guardShellNavigation = (event, url) => {
    if (url !== appUiEntry) event.preventDefault();
  };
  mainWindow.webContents.on('will-navigate', guardShellNavigation);
  mainWindow.webContents.on('will-redirect', guardShellNavigation);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installWebviewPopupPolicy(mainWindow.webContents, (url) => {
    if (mainWindow) mainWindow.webContents.send('open-tab-request', url);
  }, isAllowedUrl);
  mainWindow.loadFile(path.join(rendererDir, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // The local shell may load only its packaged renderer entry and assets.
  // Remote pages get HTTPS/WSS plus the explicit localhost development
  // exception; data/blob/about:blank are child-resource-only.
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!isAllowedRequest(details, appUiFiles, appUiEntry) || isTrackerRequest(details)) {
      return callback({ cancel: true });
    }
    callback({ cancel: false });
  });

  // Privacy headers on every request.
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['DNT'] = '1';
    details.requestHeaders['Sec-GPC'] = '1';
    callback({ requestHeaders: details.requestHeaders });
  });

  // Remote filenames are untrusted. The injectable handler owns safe path
  // allocation, cancellation fallback and reservation cleanup.
  ses.on('will-download', (event, item) => {
    const result = handleWillDownload({
      event,
      item,
      downloadDirectory: () => fs.realpathSync(app.getPath('downloads')),
      createStagingPath: (finalPath, directory) => createStagingPath(directory, finalPath, fs),
      publishFile: (stagingPath, finalPath, directory) => publishStagedFile(directory, stagingPath, finalPath, fs),
      cleanupStaging: (stagingPath, directory) => cleanupStaging(directory, stagingPath, fs),
      onProgress: (filename, percent) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', { filename, percent });
        }
      },
      onFailed: (filename, details) => {
        const preflight = Boolean(details && details.preflight === true);
        const cancellationConfirmed = preflight && typeof details.cancellationConfirmed === 'boolean'
          ? details.cancellationConfirmed : null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-failed', {
            filename,
            preflight,
            cancellationConfirmed,
          });
        }
        if (preflight && cancellationConfirmed === false) {
          console.error('Daymark could not confirm cancellation of an unsafe preflight download.');
        } else {
          console.error('Daymark download did not complete or could not be safely published.');
        }
      },
      onCompleted: (filename) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-completed', filename);
        }
      },
      onCancelled: (filename) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-cancelled', filename);
        }
      },
      onCleanupError: () => console.error('Daymark could not clean a private download staging directory.'),
      exists: (candidate) => {
        try {
          fs.lstatSync(candidate); // lstat also treats dangling symlinks as occupied.
          return true;
        } catch (error) {
          if (error && error.code === 'ENOENT') return false;
          throw error;
        }
      },
      reservedPaths: reservedDownloadPaths,
      onStarted: (filename) => {
        if (mainWindow) mainWindow.webContents.send('download-started', filename);
      },
    });
    if (!result.ok && !result.cancelled) {
      console.error('Daymark could not cancel an unsafe download destination.');
    }
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
