'use strict';

const path = require('node:path');
const { createDownloadPath, reservationKey } = require('./download-policy');

function cancelUnsafeDownload(event, item) {
  try {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
      return true;
    }
  } catch {
    // Electron may have invalidated the will-download event; try the item API.
  }

  try {
    if (item && typeof item.cancel === 'function') {
      item.cancel();
      return true;
    }
  } catch {
    // The caller receives cancelled=false and must not assume the download stopped.
  }
  return false;
}

/**
 * Apply the main-process destination policy to one Electron will-download event.
 * All dependencies are injected so failure/cancellation behavior is host-testable.
 */
function handleWillDownload(options) {
  const opts = options || {};
  const item = opts.item;
  let savePath = null;

  try {
    if (!item || typeof item.getFilename !== 'function'
      || typeof item.once !== 'function' || typeof item.setSavePath !== 'function') {
      throw new TypeError('electron-download-item-required');
    }

    const directory = typeof opts.downloadDirectory === 'function'
      ? opts.downloadDirectory() : opts.downloadDirectory;
    savePath = createDownloadPath(directory, item.getFilename(), opts.exists, opts.reservedPaths);

    item.once('done', () => opts.reservedPaths.delete(reservationKey(savePath)));
    item.setSavePath(savePath);

    if (typeof opts.onStarted === 'function') {
      try {
        opts.onStarted(path.basename(savePath));
      } catch {
        // A renderer notification failure must not cancel an already-safe download.
      }
    }

    return { ok: true, path: savePath, filename: path.basename(savePath) };
  } catch {
    if (savePath && opts.reservedPaths instanceof Set) {
      opts.reservedPaths.delete(reservationKey(savePath));
    }
    return {
      ok: false,
      reason: 'unsafe-download-destination',
      cancelled: cancelUnsafeDownload(opts.event, item),
    };
  }
}

module.exports = { handleWillDownload, cancelUnsafeDownload };
