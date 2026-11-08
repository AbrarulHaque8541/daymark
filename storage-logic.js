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
      id: 'weather',
      label: 'Weather cache',
      description: 'The last weather result for the place you last checked.',
      keys: ['daymark.weather.v1']
    },
    {
      id: 'holidays',
      label: 'Holiday cache',
      description: 'The last public-holidays list for the country you last checked.',
      keys: ['daymark.holidays.v1']
    },
    {
      id: 'currency',
      label: 'Currency cache',
      description: 'The last exchange-rate pair you looked up.',
      keys: ['daymark.currency.v1']
    },
    {
      id: 'zones',
      label: 'World clock zones',
      description: 'The time zones you saved on the world-clock card.',
      keys: ['daymark.zones.v1']
    },
    {
      id: 'countdowns',
      label: 'Countdown dates',
      description: 'Named future dates you are tracking on the countdown card.',
      keys: ['daymark.countdowns.v1']
    },
    {
      id: 'webhook',
      label: 'Webhook settings',
      description: 'The https:// endpoint you saved for task-completion events.',
      keys: ['daymark.webhook.v1']
    },
    {
      id: 'webhook-queue',
      label: 'Queued webhook events',
      description: 'Completed-task events waiting on this device for an explicit retry.',
      keys: ['daymark.webhook.queue.v1']
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

  // Every daymark.* storage key must belong to exactly one category, so the card
  // can honestly claim it covers everything the prototype stores.
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
      for (const key of category.keys) {
        let raw = null;
        try {
          raw = storage.getItem(key);
        } catch (error) {
          raw = null;
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
        present
      };
    });
    const presentCount = categories.filter((category) => category.present).length;
    return {
      categories,
      presentCount,
      totalBytes: categories.reduce((sum, category) => sum + category.bytes, 0)
    };
  }

  // clearCategory removes exactly the keys the category declares and reports
  // per-key outcomes honestly. A key that fails to be removed is never reported
  // as cleared.
  function clearCategory(storage, categoryId) {
    requireUsableStorage(storage);
    const keys = planClear(categoryId);
    const removed = [];
    const failed = [];
    for (const key of keys) {
      try {
        const existed = storage.getItem(key) !== null;
        storage.removeItem(key);
        if (existed) removed.push(key);
      } catch (error) {
        failed.push(key);
      }
    }
    return { id: categoryId, removed, failed };
  }

  function clearAll(storage) {
    requireUsableStorage(storage);
    const results = CATEGORIES.map((category) => clearCategory(storage, category.id));
    return {
      results,
      removedKeys: results.reduce((all, result) => all.concat(result.removed), []),
      failedKeys: results.reduce((all, result) => all.concat(result.failed), [])
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
