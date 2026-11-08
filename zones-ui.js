/*
 * Daymark world-clock UI wiring for the web prototype.
 *
 * A fully offline card: the user saves time zones, the card shows each zone's
 * current clock from the platform Intl database, and a "best shared window"
 * row plans a waking-hours window that works across every saved zone. Nothing
 * is fetched, nothing refreshes on its own — no polling, no timers, no
 * network, no battery drain. The saved zone list stays in this browser's
 * localStorage under daymark.zones.v1 and clears on demand. Mirrors the
 * holidays-ui.js module style: attachZonesUi(env) is fully injectable for
 * unit tests.
 */
((root) => {
  'use strict';

  const STORAGE_KEY = 'daymark.zones.v1';
  const DEFAULT_ZONE = 'Asia/Kolkata';

  function attachZonesUi(env) {
    if (!env || !env.document) throw new Error('attachZonesUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const storage = env.localStorage || (win && win.localStorage) || null;
    const zonesApi = env.zonesApi !== undefined ? env.zonesApi : (root.DaymarkZones || null);
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const pickEl = element('zones-pick');
    const addEl = element('zones-add');
    const refreshEl = element('zones-refresh');
    const clearEl = element('zones-clear');
    const copyEl = element('zones-copy');
    const formEl = element('zones-form');
    const statusEl = element('zones-status');
    const listEl = element('zones-list');

    let zones = [];
    let updatedAt = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function zoneCount(count) {
      return count === 1 ? count + ' zone' : count + ' zones';
    }

    function makeRow(rowClass) {
      if (!doc || typeof doc.createElement !== 'function') return null;
      const row = doc.createElement('div');
      if (row && typeof row.setAttribute === 'function') row.setAttribute('class', rowClass);
      return row;
    }

    function appendText(parent, className, text) {
      if (!parent || typeof parent.appendChild !== 'function') return;
      const node = doc && typeof doc.createElement === 'function' ? doc.createElement(tagFor(className)) : null;
      if (!node) return;
      if (typeof node.setAttribute === 'function') node.setAttribute('class', className);
      node.textContent = text;
      parent.appendChild(node);
    }

    function tagFor(className) {
      return className === 'feed-item-summary' ? 'p' : 'span';
    }

    function clearList() {
      if (!listEl || typeof listEl.removeChild !== 'function') return;
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    }

    function persist() {
      if (!storage || typeof storage.setItem !== 'function') return;
      const cache = { version: 1, zones, updatedAt: updatedAt || now() };
      storage.setItem(STORAGE_KEY, JSON.stringify(cache));
    }

    function readCache() {
      if (!storage || typeof storage.getItem !== 'function') return null;
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (zonesApi && typeof zonesApi.validateZonesCache === 'function'
          && zonesApi.validateZonesCache(parsed)) return parsed;
      } catch (error) { /* a corrupt cache is treated as no cache */ }
      return null;
    }

    function stamp() {
      const iso = String(updatedAt || now());
      return iso.slice(0, 16).replace('T', ' ') + ' UTC';
    }

    function render() {
      if (!listEl) return;
      clearList();
      if (!zonesApi) return;
      const when = new Date(now());
      for (const zoneId of zones) {
        const row = makeRow('feed-item');
        if (!row) break;
        let clock = null;
        try {
          clock = zonesApi.formatZoneTime(zoneId, when);
        } catch (error) {
          clock = null;
        }
        if (!clock) continue;
        const label = zonesApi.zoneLabel(zoneId) || zoneId;
        appendText(row, 'feed-item-date', clock.offsetLabel + ' · ' + clock.dayLabel);
        appendText(row, 'feed-item-title', label + ' — ' + clock.time);
        const removeBtn = doc.createElement('button');
        if (removeBtn) {
          if (typeof removeBtn.setAttribute === 'function') {
            removeBtn.setAttribute('type', 'button');
            removeBtn.setAttribute('class', 'button button-quiet');
            removeBtn.setAttribute('aria-label', 'Remove ' + label);
          }
          removeBtn.textContent = 'Remove';
          if (typeof removeBtn.addEventListener === 'function') {
            removeBtn.addEventListener('click', () => { onRemove(zoneId); });
          }
          row.appendChild(removeBtn);
        }
        listEl.appendChild(row);
      }
      const overlapRow = makeRow('feed-item');
      if (overlapRow) {
        appendText(overlapRow, 'feed-item-date', 'Best shared window');
        let planned = false;
        try {
          const overlap = zonesApi.bestOverlap(zones, when);
          if (overlap && overlap.start !== null) {
            const baseLabel = zonesApi.zoneLabel(zones[0]) || zones[0];
            const startClock = zonesApi.formatZoneTime(zones[0], new Date(overlap.start));
            const endClock = zonesApi.formatZoneTime(zones[0], new Date(overlap.end));
            const who = overlap.allAwake
              ? 'All ' + zoneCount(overlap.totalZones) + ' awake'
              : zoneCount(overlap.awakeCount) + ' of ' + zoneCount(overlap.totalZones) + ' awake';
            appendText(overlapRow, 'feed-item-title',
              who + ' · ' + startClock.time + '–' + endClock.time + ' in ' + baseLabel);
            appendText(overlapRow, 'feed-item-summary',
              'Waking hours are 08:00–22:00 local in every zone. Computed offline from this device.');
            planned = true;
          }
        } catch (error) {
          planned = false;
        }
        if (!planned) {
          appendText(overlapRow, 'feed-item-title', 'Add a time zone to plan a shared window.');
          appendText(overlapRow, 'feed-item-summary',
            'Waking hours are 08:00–22:00 local in every zone. Computed offline from this device.');
        }
        listEl.appendChild(overlapRow);
      }
    }

    function onAdd() {
      if (!zonesApi) {
        status('World clock is unavailable.');
        return;
      }
      const picked = pickEl && typeof pickEl.value === 'string' ? pickEl.value.trim() : '';
      const id = zonesApi.normalizeZoneId(picked);
      if (!id) {
        status('Choose a supported time zone first.');
        return;
      }
      if (zones.indexOf(id) !== -1) {
        status('That time zone is already on the card.');
        return;
      }
      if (zones.length >= zonesApi.MAX_ZONES) {
        status('Up to ' + zonesApi.MAX_ZONES + ' zones fit on the card. Remove one first.');
        return;
      }
      zones.push(id);
      updatedAt = now();
      persist();
      render();
      status('Added ' + (zonesApi.zoneLabel(id) || id) + ' · ' + stamp());
    }

    function onRemove(zoneId) {
      if (!zonesApi) {
        status('World clock is unavailable.');
        return;
      }
      if (zones.length <= 1) {
        status('Keep at least one time zone on the card.');
        return;
      }
      const index = zones.indexOf(zoneId);
      if (index === -1) return;
      zones.splice(index, 1);
      updatedAt = now();
      persist();
      render();
      status('Removed ' + (zonesApi.zoneLabel(zoneId) || zoneId) + ' · ' + stamp());
    }

    function setAriaBusy(btn, busy) {
      if (!btn) return;
      if (busy) {
        btn.setAttribute('aria-busy', 'true');
        if (btn.classList && typeof btn.classList.add === 'function') btn.classList.add('is-busy');
      } else {
        btn.removeAttribute('aria-busy');
        if (btn.classList && typeof btn.classList.remove === 'function') btn.classList.remove('is-busy');
      }
    }

    function buildCopyText() {
      if (!zonesApi || !zones.length) return '';
      const when = new Date(now());
      const lines = ['Daymark world clock · ' + stamp()];
      for (const zoneId of zones) {
        try {
          const clock = zonesApi.formatZoneTime(zoneId, when);
          if (!clock) continue;
          const label = zonesApi.zoneLabel(zoneId) || zoneId;
          lines.push(label + ': ' + clock.time + ' (' + clock.offsetLabel + ')');
        } catch (error) { /* skip unreadable zone */ }
      }
      try {
        const overlap = zonesApi.bestOverlap(zones, when);
        if (overlap && overlap.start !== null) {
          const baseLabel = zonesApi.zoneLabel(zones[0]) || zones[0];
          const startClock = zonesApi.formatZoneTime(zones[0], new Date(overlap.start));
          const endClock = zonesApi.formatZoneTime(zones[0], new Date(overlap.end));
          const who = overlap.allAwake
            ? 'All ' + zoneCount(overlap.totalZones) + ' awake'
            : zoneCount(overlap.awakeCount) + ' of ' + zoneCount(overlap.totalZones) + ' awake';
          lines.push('');
          lines.push('Best shared window: ' + who + ' · ' + startClock.time + '–' + endClock.time + ' in ' + baseLabel);
          lines.push('Waking hours 08:00–22:00 local. Computed offline.');
        } else {
          lines.push('');
          lines.push('No shared waking window found in the next 24 hours.');
        }
      } catch (error) {
        lines.push('');
        lines.push('Overlap could not be computed.');
      }
      return lines.join('\n');
    }

    function onCopy() {
      const text = buildCopyText();
      if (!text) {
        status('Nothing to copy yet.');
        return;
      }
      const nav = env.navigator || (win && win.navigator) || null;
      setAriaBusy(copyEl, true);
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        nav.clipboard.writeText(text).then(() => {
          status('Copied world clock and overlap to clipboard.');
          setAriaBusy(copyEl, false);
        }).catch(() => {
          status('Could not copy the summary.');
          setAriaBusy(copyEl, false);
        });
      } else {
        status('Clipboard is unavailable.');
        setAriaBusy(copyEl, false);
      }
    }

    function onRefresh() {
      if (!zonesApi) {
        status('World clock is unavailable.');
        return;
      }
      updatedAt = now();
      persist();
      render();
      status('Updated · ' + stamp());
    }

    function onClear() {
      if (storage && typeof storage.removeItem === 'function') storage.removeItem(STORAGE_KEY);
      zones = [zonesApi ? zonesApi.DEFAULT_ZONE : DEFAULT_ZONE];
      updatedAt = null;
      if (pickEl && typeof pickEl.value === 'string') pickEl.value = zones[0];
      render();
      status('World clock cleared on this device.');
    }

    if (!zonesApi) {
      zones = [];
      status('World clock is unavailable.');
    } else {
      const cache = readCache();
      if (cache) {
        zones = cache.zones.slice();
        updatedAt = cache.updatedAt;
        render();
        status('Cached · updated ' + stamp());
      } else {
        zones = [zonesApi.DEFAULT_ZONE];
        render();
        status('Pick time zones to compare. Everything is computed offline.');
      }
    }

    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onAdd();
      });
    }
    if (addEl && typeof addEl.addEventListener === 'function') {
      addEl.addEventListener('click', () => { onAdd(); });
    }
    if (refreshEl && typeof refreshEl.addEventListener === 'function') {
      refreshEl.addEventListener('click', () => { onRefresh(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { onCopy(); });
    }

    return {
      onAdd,
      onRemove,
      onRefresh,
      onClear,
      onCopy,
      readCache,
      detach() {
        // No document-level listener is registered; the button references are
        // dropped when the returned handle goes out of scope.
        status('');
      }
    };
  }

  const api = { attachZonesUi, STORAGE_KEY, DEFAULT_ZONE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkZonesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachZonesUi({ document, window, localStorage: window.localStorage });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
