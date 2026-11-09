'use strict';

const { isAllowedInsecure, isTrackerUrl } = require('./rules');

const DOCUMENT_RESOURCE_TYPES = new Set(['mainFrame', 'subFrame']);
const SUBRESOURCE_TYPES = new Set([
  'stylesheet',
  'script',
  'image',
  'font',
  'xhr',
  'ping',
  'cspReport',
  'media',
  'other',
]);

function isMainFrame(details) {
  return !!details && details.resourceType === 'mainFrame';
}

function isAllowedRequest(details, allowedAppFiles, appUiEntry) {
  if (!details || typeof details.url !== 'string') return false;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return false;
  }

  // URL userinfo can expose credentials through browser history, logs, or
  // downstream request handling. It is outside Daymark's navigation policy.
  if (url.username || url.password) return false;

  switch (url.protocol) {
    case 'https:':
      return true;
    case 'wss:':
      return details.resourceType === 'webSocket';
    case 'http:':
      return isAllowedInsecure(url.hostname);
    case 'ws:':
      return details.resourceType === 'webSocket' && isAllowedInsecure(url.hostname);
    case 'file:': {
      if (!allowedAppFiles || typeof allowedAppFiles.has !== 'function'
        || !allowedAppFiles.has(url.href)) return false;

      if (url.href === appUiEntry) {
        return details.resourceType === 'mainFrame';
      }

      if (url.pathname.endsWith('/app.js')) {
        return details.resourceType === 'script';
      }

      if (url.pathname.endsWith('/style.css')) {
        return details.resourceType === 'stylesheet';
      }

      return false;
    }
    case 'data:':
    case 'blob:':
      return SUBRESOURCE_TYPES.has(details.resourceType)
        && !DOCUMENT_RESOURCE_TYPES.has(details.resourceType);
    case 'about:':
      return details.resourceType === 'subFrame'
        && (url.href === 'about:blank' || url.href === 'about:srcdoc');
    default:
      return false;
  }
}

function isTrackerRequest(details) {
  if (!details || isMainFrame(details)) return false;
  return isTrackerUrl(details.url);
}

module.exports = { isAllowedRequest, isTrackerRequest };
