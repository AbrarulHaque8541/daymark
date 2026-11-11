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
 * Save each Electron download into a private per-download directory first.
 * Only a completed file is published to the user-visible destination. The
 * publisher must use an atomic no-replace primitive; it must never overwrite.
 */
function handleWillDownload(options) {
  const opts = options || {};
  const item = opts.item;
  let directory = null;
  let finalPath = null;
  let stagingPath = null;
  let doneListener = null;
  let progressListener = null;
  let lastProgressPercent = -1;

  try {
    if (!item || typeof item.getFilename !== 'function'
      || typeof item.once !== 'function' || typeof item.setSavePath !== 'function') {
      throw new TypeError('electron-download-item-required');
    }
    if (typeof opts.createStagingPath !== 'function'
      || typeof opts.publishFile !== 'function'
      || typeof opts.cleanupStaging !== 'function') {
      throw new TypeError('download-staging-contract-required');
    }

    directory = typeof opts.downloadDirectory === 'function'
      ? opts.downloadDirectory() : opts.downloadDirectory;
    finalPath = createDownloadPath(directory, item.getFilename(), opts.exists, opts.reservedPaths);
    stagingPath = opts.createStagingPath(finalPath, directory);
    if (typeof stagingPath !== 'string' || !path.isAbsolute(stagingPath)
      || path.resolve(stagingPath) === path.resolve(finalPath)) {
      throw new TypeError('private-download-staging-path-required');
    }

    const reservation = reservationKey(finalPath);
    const filename = path.basename(finalPath);
    if (typeof opts.onProgress === 'function' && typeof item.on === 'function'
      && typeof item.removeListener === 'function'
      && typeof item.getReceivedBytes === 'function'
      && typeof item.getTotalBytes === 'function') {
      progressListener = () => {
        try {
          const receivedBytes = Number(item.getReceivedBytes());
          const totalBytes = Number(item.getTotalBytes());
          if (!Number.isFinite(receivedBytes) || receivedBytes < 0
            || !Number.isFinite(totalBytes) || totalBytes <= 0) return;
          const percent = Math.max(0, Math.min(100, Math.floor((receivedBytes / totalBytes) * 100)));
          if (percent === lastProgressPercent) return;
          lastProgressPercent = percent;
          opts.onProgress(filename, percent);
        } catch {
          // Progress is optional; a renderer/IPC failure must not interrupt the download.
        }
      };
    }
    doneListener = (_event, state) => {
      const finalize = async () => {
        let outcome = state === 'cancelled' ? 'cancelled' : 'failed';
        try {
          if (state === 'completed') {
            await opts.publishFile(stagingPath, finalPath, directory);
            outcome = 'completed';
          }
        } catch {
          outcome = 'failed';
        } finally {
          if (progressListener && typeof item.removeListener === 'function') {
            try { item.removeListener('updated', progressListener); } catch { /* Best effort. */ }
          }
          try {
            await opts.cleanupStaging(stagingPath, directory);
          } catch {
            if (typeof opts.onCleanupError === 'function') {
              try { opts.onCleanupError(); } catch { /* Best-effort cleanup reporting. */ }
            }
          }
          opts.reservedPaths.delete(reservation);
        }

        const notify = outcome === 'completed' ? opts.onCompleted
          : outcome === 'cancelled' ? opts.onCancelled
          : opts.onFailed;
        if (typeof notify === 'function') {
          try { notify(filename); } catch { /* Renderer notification must not change the download outcome. */ }
        }
      };
      void finalize();
    };

    item.once('done', doneListener);
    if (progressListener) item.on('updated', progressListener);
    item.setSavePath(stagingPath);
    if (typeof opts.onStarted === 'function') {
      try { opts.onStarted(path.basename(finalPath)); } catch {
        // A renderer notification failure must not cancel an already-safe download.
      }
    }

    return { ok: true, path: finalPath, stagingPath, filename: path.basename(finalPath) };
  } catch {
    if (doneListener && item && typeof item.removeListener === 'function') {
      try { item.removeListener('done', doneListener); } catch { /* Best effort. */ }
    }
    if (progressListener && item && typeof item.removeListener === 'function') {
      try { item.removeListener('updated', progressListener); } catch { /* Best effort. */ }
    }
    if (stagingPath && typeof opts.cleanupStaging === 'function') {
      try { opts.cleanupStaging(stagingPath, directory); } catch { /* Best effort. */ }
    }
    if (finalPath && opts.reservedPaths instanceof Set) {
      opts.reservedPaths.delete(reservationKey(finalPath));
    }
    return {
      ok: false,
      reason: 'unsafe-download-destination',
      cancelled: cancelUnsafeDownload(opts.event, item),
    };
  }
}

module.exports = { handleWillDownload, cancelUnsafeDownload };
