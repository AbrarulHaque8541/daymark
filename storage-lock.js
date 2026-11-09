/*
 * Daymark origin-wide storage lock for cross-tab read-modify-write.
 *
 * Prefer navigator.locks when available. Fall back to a short-lived
 * localStorage ownership token (same pattern as the webhook queue lock).
 * Callers must re-read the latest stored value inside the critical section
 * and fail closed when the lock cannot be acquired.
 */
((root) => {
  'use strict';

  const DEFAULT_STALE_MS = 5000;
  const DEFAULT_ATTEMPTS = 8;

  function randomOwner() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') {
      return root.crypto.randomUUID().slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function withLocalStorageLock(storage, lockKey, work, options) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return { ok: false, reason: 'no-storage' };
    }
    const staleMs = options && Number.isFinite(options.staleMs) ? options.staleMs : DEFAULT_STALE_MS;
    const attempts = options && Number.isFinite(options.attempts) ? options.attempts : DEFAULT_ATTEMPTS;
    const nowFn = options && typeof options.nowMs === 'function' ? options.nowMs : () => Date.now();
    const owner = randomOwner();
    const nowMs = nowFn();
    let acquired = false;

    for (let attempt = 0; attempt < attempts && !acquired; attempt++) {
      let existing = null;
      try {
        existing = storage.getItem(lockKey);
      } catch (error) {
        return { ok: false, reason: 'no-storage' };
      }
      let stale = true;
      if (existing) {
        const parts = String(existing).split('|');
        const ts = Number(parts[0]);
        if (Number.isFinite(ts) && (nowFn() - ts) < staleMs) stale = false;
      }
      if (!existing || stale) {
        try {
          storage.setItem(lockKey, nowMs + '|' + owner);
          const check = storage.getItem(lockKey);
          if (check && check.endsWith('|' + owner)) acquired = true;
        } catch (error) {
          return { ok: false, reason: 'no-storage' };
        }
      }
    }

    if (!acquired) return { ok: false, reason: 'lock-busy' };

    try {
      const value = work();
      return { ok: true, value: value };
    } catch (error) {
      return { ok: false, reason: 'work-error', error: error };
    } finally {
      try {
        const held = storage.getItem(lockKey);
        if (held && held.endsWith('|' + owner) && typeof storage.removeItem === 'function') {
          storage.removeItem(lockKey);
        }
      } catch (error) {
        // best-effort release
      }
    }
  }

  function withWebLock(locks, name, work) {
    if (!locks || typeof locks.request !== 'function') {
      return null;
    }
    // Synchronous path only when request can run exclusive work immediately.
    // Most browsers return a Promise; callers that need sync behavior should
    // prefer the localStorage lock. This helper supports async when provided.
    return locks.request(name, { mode: 'exclusive', ifAvailable: false }, async () => work());
  }

  /**
   * Run work under an exclusive storage lock.
   * Always uses the localStorage token so unit tests and older WebViews share
   * one deterministic contract. navigator.locks can be layered by callers
   * that already operate in async flows.
   */
  function withStorageLock(env, lockKey, work, options) {
    const storage = (env && env.localStorage)
      || (root && root.localStorage)
      || null;
    return withLocalStorageLock(storage, lockKey, work, options || {});
  }

  const api = {
    withStorageLock: withStorageLock,
    withLocalStorageLock: withLocalStorageLock,
    withWebLock: withWebLock,
    LOCK_STALE_MS: DEFAULT_STALE_MS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DaymarkStorageLock = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
