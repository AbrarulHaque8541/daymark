'use strict';

// Install this on each host BrowserWindow before loading its UI so the first
// and every later <webview> can route window.open into the browser's tab bar.
function installWebviewPopupPolicy(hostWebContents, requestTab) {
  hostWebContents.on('did-attach-webview', (_event, webviewContents) => {
    webviewContents.setWindowOpenHandler(({ url }) => {
      requestTab(url);
      return { action: 'deny' };
    });
  });
}

module.exports = { installWebviewPopupPolicy };
