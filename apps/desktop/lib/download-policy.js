'use strict';

const path = require('node:path');

const MAX_FILENAME_BYTES = 180;
const MAX_NAME_ATTEMPTS = 10000;
const RESERVED_WINDOWS_BASE = /^(?:CON|PRN|AUX|NUL|CONIN\\$|CONOUT\\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

function utf8Length(value) {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value, maxBytes) {
  const limit = Math.max(0, Math.floor(maxBytes));
  let output = '';
  let bytes = 0;
  for (const character of value) {
    const size = utf8Length(character);
    if (bytes + size > limit) break;
    output += character;
    bytes += size;
  }
  return output;
}

function isUnsafeControl(codePoint) {
  if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) return true;
  return codePoint === 0x061C || codePoint === 0x200E || codePoint === 0x200F
    || (codePoint >= 0x202A && codePoint <= 0x202E)
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
    || codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0xFEFF;
}

function trimUnsafeEdges(value) {
  let result = value.trim();
  while (result.endsWith('.') || result.endsWith(' ')) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Convert a remote Content-Disposition/URL filename into a safe single path
 * component. This function never returns a directory component.
 */
function sanitizeDownloadFilename(suggested) {
  const input = String(suggested == null ? '' : suggested).normalize('NFC');
  let safe = '';

  for (const character of input) {
    const codePoint = character.codePointAt(0);
    // Do not preserve lone UTF-16 surrogates from malformed header values.
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) continue;
    if (isUnsafeControl(codePoint)) continue;
    if ('/\\:*?"<>|'.includes(character)) {
      safe += '_';
      continue;
    }
    if (safe.length === 0 && character === '.') continue;
    safe += character;
  }

  safe = trimUnsafeEdges(safe.replace(/\.\./g, '_'));
  if (!safe) safe = 'download';
  safe = trimUnsafeEdges(truncateUtf8(safe, MAX_FILENAME_BYTES));
  if (!safe) safe = 'download';

  const firstDot = safe.indexOf('.');
  const base = firstDot < 0 ? safe : safe.slice(0, firstDot);
  const reservedBase = base.replace(/[ .]+$/g, '');
  if (RESERVED_WINDOWS_BASE.test(reservedBase)) safe = '_' + safe;

  safe = trimUnsafeEdges(truncateUtf8(safe, MAX_FILENAME_BYTES));
  return safe || 'download';
}

function reservationKey(filePath) {
  const normalized = path.resolve(filePath).normalize('NFC');
  // Be conservative on the two common case-insensitive desktop filesystems.
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLowerCase()
    : normalized;
}

function withCollisionSuffix(stem, extension, number) {
  const suffix = ' (' + number + ')';
  const extensionBudget = Math.max(0, MAX_FILENAME_BYTES - utf8Length(suffix) - 1);
  let safeExtension = truncateUtf8(extension, extensionBudget);
  while (safeExtension.endsWith('.') || safeExtension.endsWith(' ')) {
    safeExtension = safeExtension.slice(0, -1);
  }
  const stemBudget = MAX_FILENAME_BYTES - utf8Length(suffix) - utf8Length(safeExtension);
  const safeStem = trimUnsafeEdges(truncateUtf8(stem, stemBudget)) || 'download';
  return sanitizeDownloadFilename(safeStem + suffix + safeExtension);
}

/**
 * Allocate a unique absolute file path directly inside downloadDirectory.
 *
 * exists must treat every filesystem entry (including symlinks) as occupied.
 * reservedPaths is shared by the main process to prevent simultaneous
 * will-download events from selecting the same not-yet-created path.
 */
function createDownloadPath(downloadDirectory, suggested, exists, reservedPaths) {
  if (typeof downloadDirectory !== 'string' || !downloadDirectory.trim()) {
    throw new TypeError('download-directory-required');
  }
  if (typeof exists !== 'function') throw new TypeError('download-exists-check-required');
  if (!(reservedPaths instanceof Set)) throw new TypeError('download-reservations-required');

  const directory = path.resolve(downloadDirectory);
  const filename = sanitizeDownloadFilename(suggested);
  const extension = path.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;

  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
    const candidateName = attempt === 0
      ? filename
      : withCollisionSuffix(stem, extension, attempt);
    const candidate = path.resolve(directory, candidateName);
    if (path.dirname(candidate) !== directory || path.basename(candidate) !== candidateName) {
      throw new Error('unsafe-download-path');
    }

    const key = reservationKey(candidate);
    if (reservedPaths.has(key) || exists(candidate)) continue;
    reservedPaths.add(key);
    return candidate;
  }

  throw new Error('download-name-space-exhausted');
}

module.exports = {
  MAX_FILENAME_BYTES,
  sanitizeDownloadFilename,
  reservationKey,
  createDownloadPath,
};
