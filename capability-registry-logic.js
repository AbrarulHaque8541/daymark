/*
 * Daymark capability registry for the web prototype.
 *
 * A small, honest metadata contract for what this web prototype can and
 * cannot do, one stable entry per capability: a stable feature id, a
 * plain-words title and summary, the destination (where the user reaches
 * it), the availability state, the network class, permission requirements,
 * the required backend capability and the rollout state. This implements
 * the "feature/capability registry or equivalent metadata contract" item
 * of the browser UX design-architecture checklist without any UI framework.
 *
 * Fail-closed policy: an unknown or malformed feature id describes as the
 * honest unknown entry instead of guessing, and checkRegistryInvariants()
 * records every malformed registry entry instead of skipping it. Everything
 * is local; no network access happens here, nothing is stored and no
 * Android or browser setting changes.
 */
((root) => {
  'use strict';

  const AVAILABILITY_STATES = ['available', 'prototype', 'planned', 'device-only'];
  const NETWORK_CLASSES = ['none', 'keyless-api', 'user-https'];
  const ROLLOUT_STATES = ['stable', 'prototype', 'proposal'];

  // Stable capability ids, in the order the card lists them.
  const CAPABILITY_IDS = [
    'task-list',
    'focus-timer',
    'backup-export-import',
    'planner-cards',
    'online-glance-cards',
    'telegram-digest',
    'webhook-events',
    'daymark-browser',
    'cross-platform-desktop'
  ];

  const REGISTRY = {
    'task-list': {
      label: 'Tasks, notes and tags',
      title: 'The core of Daymark, fully working here',
      summary: 'Adding, editing, filtering, searching, repeating and completing tasks, with tags, subtasks and notes, all stored locally in this browser on daymark.tasks.v1.',
      where: 'Home task list, top of the page',
      availability: 'available',
      availabilityNote: 'Works offline with no setup.',
      network: 'none',
      networkNote: 'No network use at all.',
      permissions: [],
      rollout: 'stable',
      backend: 'This browser and its localStorage only.',
      limitations: ['Web storage is not encrypted by this prototype; the Android build encrypts task data locally.']
    },
    'focus-timer': {
      label: 'Focus timer',
      title: 'One thing at a time, timed on this page',
      summary: 'A 25/5/15 minute timer that runs on this page, can be linked to an open task and records focused minutes locally.',
      where: 'Focus card, right column',
      availability: 'available',
      availabilityNote: 'Works offline; closing the tab ends the session.',
      network: 'none',
      networkNote: 'No network use at all.',
      permissions: [],
      rollout: 'stable',
      backend: 'This browser only; no notifications from the web prototype.',
      limitations: ['The web prototype does not raise Android notifications when a session ends.']
    },
    'backup-export-import': {
      label: 'Backups, export and import',
      title: 'Your tasks leave as files you own',
      summary: 'Export tasks as JSON, CSV, Markdown or iCalendar files and import them back, including recovery backups saved from the Android build.',
      where: 'Export and Import buttons above the task list',
      availability: 'available',
      availabilityNote: 'Exact-file export; import merges with existing tasks winning.',
      network: 'none',
      networkNote: 'No network use at all; files stay on this device.',
      permissions: [],
      rollout: 'stable',
      backend: 'Browser file download and file input only.',
      limitations: ['Only the formats the prototype writes are merged; unknown fields are dropped honestly.']
    },
    'planner-cards': {
      label: 'Offline planning cards',
      title: 'Plain-words explainers that fetch nothing',
      summary: 'Cards that explain browser errors, downloads, proxies, app links, address parsing, permissions, data clearing and TLS failures locally, before you touch any setting.',
      where: 'The explanation cards in the right column',
      availability: 'available',
      availabilityNote: 'Each card states exactly what it does and does not run.',
      network: 'none',
      networkNote: 'All planning happens locally on the page.',
      permissions: [],
      rollout: 'stable',
      backend: 'Card-specific checks, all local.',
      limitations: ['They plan and explain; they never change Android or browser settings.']
    },
    'online-glance-cards': {
      label: 'Online glance cards',
      title: 'Weather, holidays and friends, fetched on demand',
      summary: 'Weather, air quality, daylight, holidays, currency, world clock help, Wikipedia, GitHub releases, rocket launches, on-this-day history and country facts, fetched keyless when you press Refresh.',
      where: 'Glance cards in the right column',
      availability: 'available',
      availabilityNote: 'Free public APIs, no account, no API key, no maintainer-paid backend.',
      network: 'keyless-api',
      networkNote: 'Requests go directly from your browser to the public API; Daymark runs no server.',
      permissions: [],
      rollout: 'prototype',
      backend: 'Third-party public APIs; degrade honestly when offline.',
      limitations: ['A rate-limited or down API shows a plain-word error; nothing is invented.', 'Responses are capped in size and count; truncated data is labelled.']
    },
    'telegram-digest': {
      label: 'Telegram task digest',
      title: 'Completed tasks to your own bot, on your tap',
      summary: 'Sends a digest of completed tasks to a Telegram chat you choose, using your own bot token, which stays in this tab and is never saved.',
      where: 'Telegram digest card, right column',
      availability: 'prototype',
      availabilityNote: 'Available but session-only: the token is re-entered after reload.',
      network: 'user-https',
      networkNote: 'HTTPS to api.telegram.org with your token; nothing reaches a Daymark server because there is none.',
      permissions: [],
      rollout: 'prototype',
      backend: 'Telegram Bot API with a token only you hold.',
      limitations: ['Delivery depends on Telegram; failures are reported in plain words, never retried silently.']
    },
    'webhook-events': {
      label: 'Task completion webhook',
      title: 'Announce completions to an endpoint you choose',
      summary: 'Posts task completion events to an HTTPS endpoint you enter. The endpoint stays in this tab; the queue stores only a SHA-256 fingerprint of the destination.',
      where: 'Webhook card, right column',
      availability: 'prototype',
      availabilityNote: 'HTTPS endpoints only; undeliverable events wait in a local queue.',
      network: 'user-https',
      networkNote: 'HTTPS only, to the endpoint you type; no Daymark infrastructure involved.',
      permissions: [],
      rollout: 'prototype',
      backend: 'Your HTTPS endpoint and its bearer rules.',
      limitations: ['A legacy secret-bearing webhook value is never read or displayed; re-enter the endpoint after reload.']
    },
    'daymark-browser': {
      label: 'Daymark browser',
      title: 'The mini-browser lives in the Android build',
      summary: 'Tabbed browsing on Android System WebView, with downloads, history, bookmarks, extensions, Reader Mode and the Online consent gate. The web prototype has no browser surface; nothing on this page pretends to be one.',
      where: 'Android app only',
      availability: 'device-only',
      availabilityNote: 'Requires Android hardware; not present in this web prototype.',
      network: 'none',
      networkNote: 'No network use from this page; the Android build browses through System WebView.',
      permissions: ['Android INTERNET permission, already pinned in the Android build'],
      rollout: 'stable',
      backend: 'Android System WebView on the installed Android build.',
      limitations: ['System WebView is not a full Chrome or Firefox extension engine, and Daymark claims no such support.']
    },
    'cross-platform-desktop': {
      label: 'Cross-platform desktop',
      title: 'A spike, not a shipped product yet',
      summary: 'A small desktop and shared-core spike exists to explore Windows, Linux and beyond, but it is explicitly a spike: no desktop release, no sync claims, and no premature compatibility promises.',
      where: 'Repository spike, not in any interface',
      availability: 'planned',
      availabilityNote: 'Platform support is decided only after measured compatibility work.',
      network: 'none',
      networkNote: 'No cloud sync; task data never moves to a server to gain platforms.',
      permissions: [],
      rollout: 'proposal',
      backend: 'Local platform adapters, yet to be proved.',
      limitations: ['No Windows, Linux or HarmonyOS compatibility is claimed for any release.']
    }
  };

  // The honest fallback for anything the registry does not know.
  const UNKNOWN = {
    id: 'unknown',
    label: 'Unknown capability',
    title: 'This capability is not registered',
    summary: 'The prototype has no honest metadata for the requested feature id, so instead of guessing Daymark says so plainly. Nothing ran and nothing changed.',
    where: 'Nowhere ran',
    availability: 'planned',
    availabilityNote: 'Unknown capabilities are never rendered as available.',
    network: 'none',
    networkNote: 'No network use; nothing ran.',
    permissions: [],
    rollout: 'proposal',
    backend: 'Nothing ran, so no backend was touched.',
    limitations: ['Add the capability to the registry before rendering anything for it.'],
    available: false
  };

  function isKnownFeature(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY, id);
  }

  function describeFeature(id) {
    const known = isKnownFeature(id) ? id : 'unknown';
    const entry = known === 'unknown' ? UNKNOWN : REGISTRY[known];
    const availability = entry.availability;
    return {
      id: known,
      label: entry.label,
      title: entry.title,
      summary: entry.summary,
      where: entry.where,
      availability,
      availabilityNote: entry.availabilityNote,
      available: availability === 'available' || availability === 'prototype',
      network: entry.network,
      networkNote: entry.networkNote,
      permissions: entry.permissions.slice(),
      rollout: entry.rollout,
      backend: entry.backend,
      limitations: entry.limitations.slice()
    };
  }

  function listFeatures() {
    return CAPABILITY_IDS.map((id) => {
      const entry = REGISTRY[id];
      return {
        id,
        label: entry.label,
        availability: entry.availability,
        available: entry.availability === 'available' || entry.availability === 'prototype',
        network: entry.network,
        rollout: entry.rollout
      };
    });
  }

  // Registry self-check: every entry must be complete and enum-valid.
  // Fail-closed: each problem is reported, none is silently skipped.
  function checkRegistryInvariants() {
    const errors = [];
    const seen = Object.create(null);
    for (let i = 0; i < CAPABILITY_IDS.length; i += 1) {
      const id = CAPABILITY_IDS[i];
      if (seen[id]) errors.push('duplicate capability id: ' + id);
      seen[id] = true;
      if (!Object.prototype.hasOwnProperty.call(REGISTRY, id)) {
        errors.push('missing registry entry for id: ' + id);
        continue;
      }
      const entry = REGISTRY[id];
      const strings = ['label', 'title', 'summary', 'where', 'availabilityNote', 'networkNote', 'backend'];
      for (let j = 0; j < strings.length; j += 1) {
        const field = strings[j];
        if (typeof entry[field] !== 'string' || entry[field].length === 0) {
          errors.push(id + ' needs a non-empty ' + field);
        }
      }
      if (AVAILABILITY_STATES.indexOf(entry.availability) === -1) {
        errors.push(id + ' has an unknown availability: ' + String(entry.availability));
      }
      if (NETWORK_CLASSES.indexOf(entry.network) === -1) {
        errors.push(id + ' has an unknown network class: ' + String(entry.network));
      }
      if (ROLLOUT_STATES.indexOf(entry.rollout) === -1) {
        errors.push(id + ' has an unknown rollout state: ' + String(entry.rollout));
      }
      if (!Array.isArray(entry.permissions)) errors.push(id + ' permissions must be an array');
      if (!Array.isArray(entry.limitations) || entry.limitations.length === 0) {
        errors.push(id + ' must list at least one honest limitation');
      }
    }
    const extra = Object.keys(REGISTRY).filter((id) => !seen[id]);
    for (let k = 0; k < extra.length; k += 1) {
      errors.push('registry entry without stable id: ' + extra[k]);
    }
    return { ok: errors.length === 0, errors };
  }

  const api = {
    describeFeature,
    listFeatures,
    checkRegistryInvariants,
    isKnownFeature,
    CAPABILITY_IDS,
    REGISTRY,
    AVAILABILITY_STATES,
    NETWORK_CLASSES,
    ROLLOUT_STATES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCapabilityRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
