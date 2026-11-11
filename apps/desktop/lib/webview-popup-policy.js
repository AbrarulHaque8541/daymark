'use strict';

function prevent(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

// Install before loading the trusted shell. Guest webviews cannot inject a
// preload, choose another session, or weaken Chromium renderer security.
function installWebviewPopupPolicy(hostWebContents, requestTab, isAllowedNavigation = () => true) {
  if (!hostWebContents || typeof hostWebContents.on !== 'function') {
    throw new TypeError('A host WebContents event target is required.');
  }
  if (typeof requestTab !== 'function' || typeof isAllowedNavigation !== 'function') {
    throw new TypeError('Popup routing and navigation policy must be functions.');
  }

  hostWebContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!webPreferences || typeof webPreferences !== 'object'
      || !params || typeof params !== 'object') {
      prevent(event);
      return;
    }

    const initialUrl = typeof params.src === 'string' ? params.src.trim() : '';
    if (!initialUrl || !isAllowedNavigation(initialUrl)) {
      prevent(event);
      return;
    }

    for (const key of [
      'preload', 'partition', 'webpreferences', 'nodeintegration',
      'nodeintegrationinsubframes', 'disablewebsecurity',
      'allowrunninginsecurecontent', 'plugins',
    ]) delete params[key];

    delete webPreferences.preload;
    delete webPreferences.partition;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.plugins = false;
    webPreferences.experimentalFeatures = false;
    webPreferences.webviewTag = false;
  });

  hostWebContents.on('did-attach-webview', (_event, webviewContents) => {
    const guardNavigation = (event, url) => {
      if (!isAllowedNavigation(url)) prevent(event);
    };
    if (webviewContents && typeof webviewContents.on === 'function') {
      webviewContents.on('will-navigate', guardNavigation);
      webviewContents.on('will-redirect', guardNavigation);
    }
    if (webviewContents && typeof webviewContents.setWindowOpenHandler === 'function') {
      webviewContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedNavigation(url)) requestTab(url);
        return { action: 'deny' };
      });
    }
  });
}

module.exports = { installWebviewPopupPolicy };
