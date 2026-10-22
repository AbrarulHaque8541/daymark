'use strict';

// HTTPS-only URL policy shared by the Daymark desktop browser.
// Pure logic, no Electron imports, so it can be unit-tested on any OS.

const INSECURE_ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

// Suffixes of well-known ad/tracker delivery domains (starter list).
const TRACKER_DOMAIN_SUFFIXES = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'adnxs.com',
  'criteo.com',
  'criteo.net',
  'scorecardresearch.com',
  'taboola.com',
  'outbrain.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'adform.net',
  'casalemedia.com',
  'bidswitch.net',
  'sharethrough.com',
  'amazon-adsystem.com',
  'moatads.com',
  'zedo.com',
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isHttps(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedInsecure(hostname) {
  if (!hostname) return false;
  return INSECURE_ALLOWED_HOSTNAMES.has(hostname.toLowerCase());
}

function isAllowedUrl(url) {
  const hostname = hostnameOf(url);
  if (!hostname) return false;
  if (isHttps(url)) return true;
  return isAllowedInsecure(hostname);
}

// Upgrade typed addresses to https:// automatically. Plain http:// is
// allowed only for localhost. Throws for garbage input.
function httpsUpgradeUrl(input) {
  const trimmed = String(input == null ? '' : input).trim();
  if (!trimmed) return null;
  const withScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : 'https://' + trimmed;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    throw new Error('invalid-address');
  }
  if (u.protocol === 'http:' && !isAllowedInsecure(u.hostname)) {
    u.protocol = 'https:';
  }
  return u.toString();
}

function isTrackerUrl(url) {
  const hostname = hostnameOf(url);
  if (!hostname) return false;
  return TRACKER_DOMAIN_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith('.' + suffix),
  );
}

module.exports = {
  INSECURE_ALLOWED_HOSTNAMES,
  TRACKER_DOMAIN_SUFFIXES,
  isHttps,
  isAllowedInsecure,
  isAllowedUrl,
  httpsUpgradeUrl,
  isTrackerUrl,
};
