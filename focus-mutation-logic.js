/*
 * Origin-wide Focus storage transaction for Daymark's web app.
 *
 * Focus sessions, logs, presets and recovery backups share one Web Lock.
 * The monotonic generation is intentionally not part of user data: it remains
 * after Clear Focus/Clear All so a tab that began a write before the clear
 * cannot recreate the removed values after the lock is released.
 */
((root) => {
  'use strict';

  const FOCUS_MUTATION_LOCK = 'daymark.focus.mutation.v1';
  const FOCUS_GENERATION_KEY = 'daymark.focus.mutation.generation.v1';

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const result = {};
      Object.keys(value).sort().forEach((key) => { result[key] = canonical(value[key]); });
      return result;
    }
    return value;
  }

  function equal(left, right) {
    try { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
    catch (error) { return false; }
  }

  function readFocusGeneration(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    try {
      const raw = storage.getItem(FOCUS_GENERATION_KEY);
      if (raw === null) return { ok: true, value: 0 };
      if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw)) {
        return { ok: false, reason: 'generation-invalid' };
      }
      const value = Number(raw);
      return Number.isSafeInteger(value)
        ? { ok: true, value }
        : { ok: false, reason: 'generation-invalid' };
    } catch (error) {
      return { ok: false, reason: 'generation-unreadable' };
    }
  }

  // Call only while FOCUS_MUTATION_LOCK is held.
  function incrementFocusGeneration(storage) {
    if (!storage || typeof storage.setItem !== 'function') {
      return { ok: false, reason: 'storage-unavailable' };
    }
    const current = readFocusGeneration(storage);
    if (!current.ok) return current;
    if (current.value >= Number.MAX_SAFE_INTEGER) {
      return { ok: false, reason: 'generation-exhausted' };
    }
    const value = current.value + 1;
    try {
      storage.setItem(FOCUS_GENERATION_KEY, String(value));
      return { ok: true, value };
    } catch (error) {
      return { ok: false, reason: 'generation-write-failed' };
    }
  }

  async function withFocusMutationLock(lockManager, callback) {
    if (!lockManager || typeof lockManager.request !== 'function') {
      return { ok: false, reason: 'coordination-unavailable' };
    }
    if (typeof callback !== 'function') return { ok: false, reason: 'invalid-callback' };
    try {
      const value = await lockManager.request(
        FOCUS_MUTATION_LOCK,
        { mode: 'exclusive' },
        callback
      );
      return { ok: true, value };
    } catch (error) {
      return { ok: false, reason: 'lock-failed' };
    }
  }

  function parseSnapshot(raw) {
    if (raw === null) return { ok: true, value: { session: null, log: [] } };
    if (typeof raw !== 'string' || raw.length === 0) {
      return { ok: false, reason: 'invalid-current' };
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (error) { return { ok: false, reason: 'invalid-current' }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || (parsed.session !== null && parsed.session !== undefined
          && (typeof parsed.session !== 'object' || Array.isArray(parsed.session)))
        || !Array.isArray(parsed.log)) {
      return { ok: false, reason: 'invalid-current' };
    }
    const ids = new Set();
    for (const entry of parsed.log) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
          || typeof entry.id !== 'string' || entry.id.length === 0 || ids.has(entry.id)) {
        return { ok: false, reason: 'invalid-current' };
      }
      ids.add(entry.id);
    }
    return { ok: true, value: { session: parsed.session || null, log: parsed.log } };
  }

  function indexLog(log) {
    const result = new Map();
    for (const entry of log) result.set(entry.id, entry);
    return result;
  }

  function mergeFocusSnapshots(base, desired, current) {
    const baseParsed = parseSnapshot(JSON.stringify(base));
    const desiredParsed = parseSnapshot(JSON.stringify(desired));
    const currentParsed = parseSnapshot(JSON.stringify(current));
    if (!baseParsed.ok || !desiredParsed.ok || !currentParsed.ok) {
      return { ok: false, reason: 'invalid-snapshot', conflicts: [] };
    }
    const before = baseParsed.value;
    const local = desiredParsed.value;
    const remote = currentParsed.value;

    const localSessionChanged = !equal(local.session, before.session);
    const remoteSessionChanged = !equal(remote.session, before.session);
    if (localSessionChanged && remoteSessionChanged && !equal(local.session, remote.session)) {
      return { ok: false, reason: 'session-conflict', conflicts: ['session'] };
    }
    const session = localSessionChanged ? local.session : remote.session;

    const baseLog = indexLog(before.log);
    const localLog = indexLog(local.log);
    const remoteLog = indexLog(remote.log);
    const merged = new Map(remoteLog);

    for (const [id, baseEntry] of baseLog) {
      const localHas = localLog.has(id);
      const remoteHas = remoteLog.has(id);
      const localEntry = localLog.get(id);
      const remoteEntry = remoteLog.get(id);
      const localChanged = !localHas || !equal(localEntry, baseEntry);
      const remoteChanged = !remoteHas || !equal(remoteEntry, baseEntry);

      if (!localHas) {
        if (remoteHas && remoteChanged) {
          return { ok: false, reason: 'log-conflict', conflicts: [id] };
        }
        merged.delete(id);
      } else if (localChanged) {
        if (!remoteHas || (remoteChanged && !equal(localEntry, remoteEntry))) {
          return { ok: false, reason: 'log-conflict', conflicts: [id] };
        }
        merged.set(id, localEntry);
      } else if (!remoteHas) {
        merged.delete(id);
      }
    }

    for (const [id, localEntry] of localLog) {
      if (baseLog.has(id)) continue;
      if (remoteLog.has(id) && !equal(remoteLog.get(id), localEntry)) {
        return { ok: false, reason: 'log-conflict', conflicts: [id] };
      }
      if (!remoteLog.has(id)) merged.set(id, localEntry);
    }

    const order = remote.log.map((entry) => entry.id);
    local.log.forEach((entry) => { if (!order.includes(entry.id)) order.push(entry.id); });
    return {
      ok: true,
      reason: null,
      conflicts: [],
      snapshot: {
        session,
        log: order.filter((id) => merged.has(id)).map((id) => merged.get(id))
      }
    };
  }

  async function commitFocusSnapshot(options) {
    const opts = options || {};
    const storage = opts.storage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
        || typeof opts.key !== 'string' || typeof opts.baseRaw === 'undefined'
        || !Number.isSafeInteger(opts.expectedGeneration) || !opts.desiredSnapshot) {
      return { ok: false, reason: 'invalid-options', conflicts: [] };
    }
    let desiredParsed;
    try { desiredParsed = parseSnapshot(JSON.stringify(opts.desiredSnapshot)); }
    catch (error) { desiredParsed = { ok: false }; }
    let desiredValid = desiredParsed.ok;
    if (desiredValid && typeof opts.validateSnapshot === 'function') {
      try { desiredValid = opts.validateSnapshot(desiredParsed.value) === true; }
      catch (error) { desiredValid = false; }
    }
    if (!desiredValid) return { ok: false, reason: 'invalid-snapshot', conflicts: [] };
    const locked = await withFocusMutationLock(opts.lockManager, async () => {
      const generation = readFocusGeneration(storage);
      if (!generation.ok) return { ok: false, reason: generation.reason, conflicts: [] };
      if (generation.value !== opts.expectedGeneration) {
        return { ok: false, reason: 'stale-generation', conflicts: [] };
      }
      let currentRaw;
      try { currentRaw = storage.getItem(opts.key); }
      catch (error) { return { ok: false, reason: 'storage-read-failed', conflicts: [] }; }

      if (typeof opts.beforeWrite === 'function') {
        let prepared;
        try { prepared = await opts.beforeWrite({ currentRaw, generation: generation.value }); }
        catch (error) { prepared = false; }
        if (prepared === false || (prepared && prepared.ok === false)) {
          return {
            ok: false,
            reason: prepared && prepared.reason ? prepared.reason : 'prepare-failed',
            conflicts: []
          };
        }
      }

      let snapshot;
      if (currentRaw === opts.baseRaw) {
        const parsed = parseSnapshot(currentRaw);
        if (!parsed.ok && !(opts.allowOpaqueBase === true && typeof currentRaw === 'string')) {
          return { ok: false, reason: parsed.reason, conflicts: [] };
        }
        if (parsed.ok && typeof opts.validateSnapshot === 'function'
            && opts.validateSnapshot(parsed.value) !== true) {
          return { ok: false, reason: 'invalid-current', conflicts: [] };
        }
        snapshot = desiredParsed.value;
      } else {
        const base = parseSnapshot(opts.baseRaw);
        const current = parseSnapshot(currentRaw);
        if (!base.ok || !current.ok) {
          return { ok: false, reason: 'stale-or-invalid-source', conflicts: [] };
        }
        if (typeof opts.validateSnapshot === 'function'
            && (opts.validateSnapshot(base.value) !== true || opts.validateSnapshot(current.value) !== true)) {
          return { ok: false, reason: 'stale-or-invalid-source', conflicts: [] };
        }
        const merged = mergeFocusSnapshots(base.value, desiredParsed.value, current.value);
        if (!merged.ok) return merged;
        snapshot = merged.snapshot;
      }

      if (typeof opts.validateSnapshot === 'function' && opts.validateSnapshot(snapshot) !== true) {
        return { ok: false, reason: 'invalid-snapshot', conflicts: [] };
      }
      let payload;
      try {
        payload = JSON.stringify(snapshot);
        if (typeof payload !== 'string') throw new Error('serialization failed');
        storage.setItem(opts.key, payload);
      } catch (error) {
        return { ok: false, reason: 'storage-write-failed', conflicts: [] };
      }
      const committed = { ok: true, reason: null, payload, snapshot };
      // Reconcile the caller's in-memory state before releasing the same-origin
      // Focus lock. A clear in another tab cannot overtake durable commit + adoption.
      if (typeof opts.afterCommit === 'function') {
        try {
          opts.afterCommit(committed);
        } catch (error) {
          committed.warning = 'post-commit-action-failed';
        }
      }
      return committed;
    });
    if (!locked.ok) return locked;
    return locked.value;
  }

  async function commitFocusPreset(options) {
    const opts = options || {};
    const storage = opts.storage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function'
        || typeof opts.key !== 'string' || typeof opts.baseRaw === 'undefined'
        || typeof opts.desiredRaw !== 'string' || !Number.isSafeInteger(opts.expectedGeneration)) {
      return { ok: false, reason: 'invalid-options' };
    }
    const locked = await withFocusMutationLock(opts.lockManager, () => {
      const generation = readFocusGeneration(storage);
      if (!generation.ok) return { ok: false, reason: generation.reason };
      if (generation.value !== opts.expectedGeneration) return { ok: false, reason: 'stale-generation' };
      let currentRaw;
      try { currentRaw = storage.getItem(opts.key); }
      catch (error) { return { ok: false, reason: 'storage-read-failed' }; }
      if (currentRaw !== opts.baseRaw && currentRaw !== opts.desiredRaw) {
        return { ok: false, reason: 'preset-conflict' };
      }
      try { storage.setItem(opts.key, opts.desiredRaw); }
      catch (error) { return { ok: false, reason: 'storage-write-failed' }; }
      return { ok: true, raw: opts.desiredRaw };
    });
    if (!locked.ok) return locked;
    return locked.value;
  }

  const api = {
    FOCUS_MUTATION_LOCK,
    FOCUS_GENERATION_KEY,
    readFocusGeneration,
    incrementFocusGeneration,
    withFocusMutationLock,
    parseSnapshot,
    mergeFocusSnapshots,
    commitFocusSnapshot,
    commitFocusPreset
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFocusMutation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
