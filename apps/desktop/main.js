'use strict';

const { app, session, BrowserWindow } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { isAllowedUrl } = require('./lib/rules');
const { isAllowedRequest, isTrackerRequest } = require('./lib/request-policy');
const { installWebviewPopupPolicy } = require('./lib/webview-popup-policy');

let mainWindow = null;
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
