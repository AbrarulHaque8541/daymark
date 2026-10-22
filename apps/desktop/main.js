'use strict';

const { app, session, BrowserWindow } = require('electron');
const path = require('path');
const { isAllowedInsecure, isTrackerUrl } = require('./lib/rules');

let mainWindow = null;

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
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // HTTPS-only browsing: cancel plain-HTTP requests except localhost.
  // Internal schemes (file/, data/, chrome:) stay usable for the UI itself.
  ses.webRequest.onBeforeRequest((details, callback) => {
    let url;
    try {
      url = new URL(details.url);
    } catch {
      return callback({ cancel: true });
    }
    const protocol = url.protocol.replace(':', '');
    const internal = ['file', 'data', 'chrome', 'devtools', 'blob'].includes(protocol);
    const localHttpOk = protocol === 'http' && isAllowedInsecure(url.hostname);
    if (!(protocol === 'https' || internal || localHttpOk)) {
      return callback({ cancel: true });
    }
    if (details.resourceType !== 'mainFrame' && isTrackerUrl(details.url)) {
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

  // Downloads land in the OS downloads folder.
  ses.on('will-download', (event, item) => {
    try {
      item.setSavePath(path.join(app.getPath('downloads'), item.getFilename()));
      if (mainWindow) {
        mainWindow.webContents.send('download-started', item.getFilename());
      }
    } catch {
      // fall back to Electron's default download behaviour
    }
  });

  createMainWindow();

  // Target=_blank / window.open inside a tab opens as a new browser tab.
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-attach-webview', (_e, webContents) => {
      webContents.setWindowOpenHandler(({ url }) => {
        if (mainWindow) mainWindow.webContents.send('open-tab-request', url);
        return { action: 'deny' };
      });
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
