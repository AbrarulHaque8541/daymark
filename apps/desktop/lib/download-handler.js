'use strict';

const path = require('node:path');
const { createDownloadPath, reservationKey, sanitizeDownloadFilename } = require('./download-policy');

function cancelUnsafeDownload(event, item) {
  try {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
      // Electron documents preventDefault() in will-download as an immediate
      // cancellation: the DownloadItem is unavailable on the next tick.
      return { requested: true, confirmed: true };
    }
  } catch {
    // Electron may have invalidated the will-download event; try the item API.
  }
  try {
    if (item && typeof item.cancel === 'function') {
      item.cancel();
      // cancel() requests cancellation; only the terminal done event confirms it.
      return { requested: true, confirmed: false };
    }
  } catch {
    // The caller receives an unconfirmed result and must not assume the download stopped.
  }
  return { requested: false, confirmed: false };
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
  let filename = 'download';
  let doneListener = null;
  let progressListener = null;
  let lastProgressPercent = null;

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

    try {
      filename = sanitizeDownloadFilename(item.getFilename());
    } catch {
      filename = 'download';
    }
    directory = typeof opts.downloadDirectory === 'function'
      ? opts.downloadDirectory() : opts.downloadDirectory;
    finalPath = createDownloadPath(directory, filename, opts.exists, opts.reservedPaths);
    filename = path.basename(finalPath);
    stagingPath = opts.createStagingPath(finalPath, directory);
    if (typeof stagingPath !== 'string' || !path.isAbsolute(stagingPath)
      || path.resolve(stagingPath) === path.resolve(finalPath)) {
      throw new TypeError('private-download-staging-path-required');
    }

    const reservation = reservationKey(finalPath);
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
          if (lastProgressPercent !== null && percent > lastProgressPercent
            && percent - lastProgressPercent < 10 && percent < 100) return;
          lastProgressPercent = percent;
          opts.onProgress(filename, percent);
        } catch {
          // Progress is optional; a renderer/IPC failure must not interrupt the download.
        }
      };
    }
    doneListener = (_event, state) => {
      const finalize = async () => {
        if (progressListener && typeof item.removeListener === 'function') {
          try { item.removeListener('updated', progressListener); } catch { /* Best effort. */ }
        }
        let outcome = state === 'cancelled' ? 'cancelled' : 'failed';
        try {
          if (state === 'completed') {
            await opts.publishFile(stagingPath, finalPath, directory);
            outcome = 'completed';
          }
        } catch {
          outcome = 'failed';
        } finally {
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
    // Retire normal publication listeners before asking Electron to cancel. A
    // synchronous/late done event after a failed preflight must never enter the
    // normal staged-file publication path.
    if (doneListener && item && typeof item.removeListener === 'function') {
      try { item.removeListener('done', doneListener); } catch { /* Best effort. */ }
    }
    if (progressListener && item && typeof item.removeListener === 'function') {
      try { item.removeListener('updated', progressListener); } catch { /* Best effort. */ }
    }
    const cancellation = cancelUnsafeDownload(opts.event, item);
    if (stagingPath && typeof opts.cleanupStaging === 'function') {
      try {
        opts.cleanupStaging(stagingPath, directory);
      } catch {
        if (typeof opts.onCleanupError === 'function') {
          try { opts.onCleanupError(); } catch { /* Best-effort cleanup reporting. */ }
        }
      }
    }
    if (finalPath && opts.reservedPaths instanceof Set) {
      opts.reservedPaths.delete(reservationKey(finalPath));
    }
    if (typeof opts.onFailed === 'function') {
      try {
        opts.onFailed(filename, {
          preflight: true,
          cancellationConfirmed: cancellation.confirmed,
        });
      } catch { /* Renderer notification must not change the download outcome. */ }
    }
    return {
      ok: false,
      reason: 'unsafe-download-destination',
      cancelled: cancellation.confirmed,
      cancellationRequested: cancellation.requested,
      filename,
    };
  }
}

module.exports = { handleWillDownload, cancelUnsafeDownload };
