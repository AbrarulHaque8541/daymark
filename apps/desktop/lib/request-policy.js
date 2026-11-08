'use strict';

const { isAllowedInsecure, isTrackerUrl } = require('./rules');

function isMainFrame(details) {
  return !details || !details.resourceType || details.resourceType === 'mainFrame';
}

function isAllowedRequest(details, allowedAppFiles, appUiEntry) {
  if (!details || typeof details.url !== 'string') return false;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return false;
  }

  const mainFrame = isMainFrame(details);
  switch (url.protocol) {
    case 'https:':
      return true;
    case 'wss:':
      return details.resourceType === 'webSocket';
    case 'http:':
      return isAllowedInsecure(url.hostname);
    case 'ws:':
      return details.resourceType === 'webSocket' && isAllowedInsecure(url.hostname);
    case 'file:':
      if (!allowedAppFiles || typeof allowedAppFiles.has !== 'function'
        || !allowedAppFiles.has(url.href)) return false;
      return mainFrame ? url.href === appUiEntry : url.href !== appUiEntry;
    case 'data:':
    case 'blob:':
      return !mainFrame;
    case 'about:':
      return !mainFrame && (url.href === 'about:blank' || url.href === 'about:srcdoc');
    default:
      return false;
  }
}

function isTrackerRequest(details) {
  if (!details || details.resourceType === 'mainFrame') return false;
  return isTrackerUrl(details.url);
}

module.exports = { isAllowedRequest, isTrackerRequest };
