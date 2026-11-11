((root) => {
  'use strict';

  // Explainable local-data controls for the Daymark web prototype. The prototype
  // keeps every feature's state in this browser's localStorage under fixed
  // "daymark.*" keys. This module is the single source of truth for which keys
  // exist, what each key holds in plain language, and exactly which keys each
  // clear action removes. Pure functions + an injectable storage object: no DOM,
  // no network, no timers, so it can be unit-tested directly and loaded in the
  // browser as window.DaymarkStorage.

  const CATEGORIES = [
    {
      id: 'tasks',
      label: 'Tasks',
      description: 'Your full task list with notes, steps, tags, and reminders.',
      keys: ['daymark.tasks.v1']
    },
    {
      id: 'task-backup',
      label: 'Task recovery backup',
      description: 'A safety copy kept on this device when saved task data could not be read.',
      keys: ['daymark.tasks.v1.backup']
    },
    {
      id: 'focus',
      label: 'Focus timer',
      description: 'The current Focus session and its completed-session history log.',
      keys: ['daymark.focus.v1']
    },
    {
      id: 'focus-preset',
      label: 'Focus timer preset',
      description: 'The preset selected for a new Focus session. The active session and completed-session history are stored separately.',
      keys: ['daymark.focus.preset.v1']
    },
    {
      id: 'focus-backup',
      label: 'Focus recovery backup',
      description: 'A safety copy kept on this device when Focus data could not be read.',
      keys: ['daymark.focus.v1.backup']
    },
    {
      id: 'briefing',
      label: 'Briefing feed cache',
      description: 'The last fetched RSS/Atom items, cached here so they stay readable offline.',
      keys: ['daymark.feed.v1']
    },
    {
      id: 'wiki',
      label: 'Wikipedia cache',
      description: 'The last successful Wikipedia results, cached here so they stay readable offline.',
      keys: ['daymark.wiki.v1']
    },
    {
      id: 'wiki-preferences',
      label: 'Wikipedia search preference',
      description: 'The last search term remembered for the next Wikipedia visit.',
      keys: ['daymark.wiki.prefs.v1']
    },
    {
      id: 'weather',
      label: 'Weather cache',
      description: 'The last weather result for the place you last checked.',
      keys: ['daymark.weather.v1']
    },
    {
      id: 'weather-preferences',
      label: 'Weather place preference',
      description: 'The last place name entered for the weather card.',
      keys: ['daymark.weather.prefs.v1']
    },
    {
      id: 'holidays',
      label: 'Holiday cache',
      description: 'The last public-holidays list for the country you last checked.',
      keys: ['daymark.holidays.v1']
    },
    {
      id: 'holiday-preferences',
      label: 'Holiday country preference',
      description: 'The last country selected for the public-holidays card.',
      keys: ['daymark.holidays.prefs.v1']
    },
    {
      id: 'currency',
      label: 'Currency cache',
      description: 'The last exchange-rate pair you looked up.',
      keys: ['daymark.currency.v1']
    },
    {
      id: 'currency-preferences',
      label: 'Currency preferences',
      description: 'The last amount and currency pair selected for conversion.',
      keys: ['daymark.currency.prefs.v1']
    },
    {
      id: 'zones',
      label: 'World clock zones',
      description: 'The time zones you saved on the world-clock card.',
      keys: ['daymark.zones.v1']
    },
    {
      id: 'browser-proxy',
      label: 'Saved browser proxy profile',
      description: 'The last proxy address entered in the offline planner. Saving this plan does not route browser traffic.',
      keys: ['daymark.browser-proxy.last-profile']
    },
    {
      id: 'browser-address',
      label: 'Browser search provider preference',
      description: 'The search provider selected for the browser address bar.',
      keys: ['daymark.browser-address.prefs.v1']
    },
    {
      id: 'browser-download',
      label: 'Browser download journey preference',
      description: 'The last offline download scenario selected in the safety planner; no downloaded files or URLs are stored here.',
      keys: ['daymark.browser-download.last-scenario']
    },
    {
      id: 'webhook-queue',
      label: 'Queued webhook events',
      description: 'Completed-task events waiting on this device for an explicit retry.',
      keys: ['daymark.webhook.queue.v1']
    },
    {
      id: 'telegram-preference',
      label: 'Telegram chat preference',
      description: 'The last chat destination remembered for your Telegram digest. The bot token is session-only and is never stored.',
      keys: ['daymark.telegram.lastChat.v1']
    },
    {
      id: 'webhook-lock',
      label: 'Legacy webhook coordination lock',
      description: 'A short-lived localStorage marker from older webhook versions. Newer versions use browser Web Locks; any leftover marker is safe to clear.',
      keys: ['daymark.webhook.lock.v1']
    }
  ];

  const ALL_KEY_SET = new Set(CATEGORIES.reduce((all, category) => all.concat(category.keys), []));

  function categoryIds() {
    return CATEGORIES.map((category) => category.id);
  }

  function categoryById(id) {
    if (typeof id !== 'string') return null;
    return CATEGORIES.find((category) => category.id === id) || null;
  }

  // Every non-secret Daymark storage key managed by this card belongs to exactly
  // one category. The legacy secret-bearing webhook endpoint is deliberately
  // excluded: webhook privacy cleanup removes it without reading its value.
  function isManagedKey(key) {
    return ALL_KEY_SET.has(key);
  }

  function planClear(categoryId) {
    const category = categoryById(categoryId);
    if (!category) throw new Error('Unknown data category: ' + String(categoryId));
    return category.keys.slice();
  }

  function estimateBytes(value) {
    if (typeof value !== 'string') return 0;
    if (typeof root.TextEncoder === 'function') {
      try {
        return new root.TextEncoder().encode(value).length;
      } catch (error) { /* fall back to the character count below */ }
    }
    return value.length;
  }

  function requireUsableStorage(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.removeItem !== 'function') {
      throw new Error('Browser storage is unavailable.');
    }
    return storage;
  }

  function scanStorage(storage) {
    requireUsableStorage(storage);
    const categories = CATEGORIES.map((category) => {
      let bytes = 0;
      let present = false;
      const unreadableKeys = [];
      for (const key of category.keys) {
        let raw = null;
        try {
          raw = storage.getItem(key);
        } catch (error) {
          // A failed read is unknown, not evidence that the key is absent.
          unreadableKeys.push(key);
          continue;
        }
        if (raw !== null && raw !== undefined) {
          present = true;
          bytes += estimateBytes(String(raw));
        }
      }
      return {
        id: category.id,
        label: category.label,
        description: category.description,
        keys: category.keys.slice(),
        bytes,
        present,
        unreadableKeys,
        complete: unreadableKeys.length === 0
      };
    });
    const presentCount = categories.filter((category) => category.present).length;
    const unreadableCategories = categories.filter((category) => category.unreadableKeys.length > 0);
    const unreadableKeys = unreadableCategories.reduce(
      (all, category) => all.concat(category.unreadableKeys), []
    );
    return {
      categories,
      presentCount,
      unreadableCount: unreadableCategories.length,
      unreadableKeys,
      complete: unreadableCategories.length === 0,
      totalBytes: categories.reduce((sum, category) => sum + category.bytes, 0)
    };
  }

  // clearCategory removes exactly the keys the category declares and reports
  // per-key outcomes honestly. A key that fails to be removed is never reported
  // as cleared.
  function clearCategory(storage, categoryId) {
    requireUsableStorage(storage);
    const keys = planClear(categoryId);
    const existing = [];
    const failed = [];
    const unreadable = [];
    // Read every key before deleting any key. A read failure is unknown state,
    // not permission to partially clear a category.
    for (const key of keys) {
      try {
        if (storage.getItem(key) !== null) existing.push(key);
      } catch (error) {
        failed.push(key);
        unreadable.push(key);
      }
    }
    if (failed.length > 0) return { id: categoryId, removed: [], failed, unreadable };
    const removed = [];
    for (const key of existing) {
      try {
        storage.removeItem(key);
        removed.push(key);
      } catch (error) {
        failed.push(key);
      }
    }
    return { id: categoryId, removed, failed, unreadable };
  }

  function clearAll(storage) {
    requireUsableStorage(storage);
    const existing = new Set();
    const unreadable = new Set();
    // Preflight every managed key before removing anything. An unknown key
    // blocks the entire clear-all operation, avoiding partial deletion.
    for (const category of CATEGORIES) {
      for (const key of category.keys) {
        try {
          if (storage.getItem(key) !== null) existing.add(key);
        } catch (error) {
          unreadable.add(key);
        }
      }
    }
    if (unreadable.size > 0) {
      const failedKeys = Array.from(unreadable);
      const results = CATEGORIES.map((category) => ({
        id: category.id,
        removed: [],
        failed: category.keys.filter((key) => unreadable.has(key))
      }));
      return { results, removedKeys: [], failedKeys, unreadableKeys: failedKeys };
    }
    const results = CATEGORIES.map((category) => {
      const removed = [];
      const failed = [];
      for (const key of category.keys) {
        if (!existing.has(key)) continue;
        try {
          storage.removeItem(key);
          removed.push(key);
        } catch (error) {
          failed.push(key);
        }
      }
      return { id: category.id, removed, failed };
    });
    return {
      results,
      removedKeys: results.reduce((all, result) => all.concat(result.removed), []),
      failedKeys: results.reduce((all, result) => all.concat(result.failed), []),
      unreadableKeys: []
    };
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return Math.round(bytes) + ' B';
    return (Math.round(bytes / 102.4) / 10).toFixed(1) + ' KB';
  }

  const api = {
    CATEGORIES,
    categoryIds,
    categoryById,
    isManagedKey,
    planClear,
    estimateBytes,
    scanStorage,
    clearCategory,
    clearAll,
    formatBytes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkStorage = api;
})(globalThis);
