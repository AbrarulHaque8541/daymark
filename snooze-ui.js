/*
 * Daymark snooze-pages card UI for the web prototype.
 *
 * A self-injecting opt-in card (auto-archive pattern). Everything the card
 * knows arrives through env: no module globals, no network, no timers. A
 * saved snooze renders as a link a person taps; nothing ever opens by
 * itself and nothing is fetched. Due items are found on interaction only,
 * and the card says exactly that in its explanatory line.
 */
((root) => {
  'use strict';

  const CARD_ID = 'snooze-card';
  const STATUS_ID = 'snooze-status';
  const LIST_ID = 'snooze-list';
  const URL_ID = 'snooze-url';
  const WAKE_ID = 'snooze-wake';
  const NOTE_ID = 'snooze-note';
  const SAVE_ID = 'snooze-save';
  const REFRESH_ID = 'snooze-refresh';
  const CLEAR_ID = 'snooze-clear';
  const OFF_TEXT = 'Snooze pages is switched off in Feature settings. Turn it on there first.';
  const NO_STORAGE_TEXT = 'Browser storage is unavailable, so snoozes cannot be saved on this device.';

  function resolveStorage(rootRef, preferred) {
    if (typeof preferred !== 'undefined') return preferred;
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }

  function attachSnoozeUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return null;
    const flagsApi = env.flags;
    const logic = env.logic;
    if (!flagsApi || typeof flagsApi.readFlags !== 'function') return null;
    if (!logic || typeof logic.readSnoozes !== 'function' || typeof logic.createSnooze !== 'function') return null;
    if (doc.getElementById(CARD_ID)) return null;
    const nowMs = typeof env.nowMs === 'function' ? env.nowMs : () => Date.now();
    const storage = resolveStorage(root, env.storage);
    const bodyEl = doc.body || null;
    if (!bodyEl || typeof bodyEl.appendChild !== 'function') return null;

    const card = doc.createElement('aside');
    card.className = 'suggestion-card';
    card.setAttribute('id', CARD_ID);
    const title = doc.createElement('h2');
    title.className = 'suggestion-title';
    title.textContent = 'Snooze pages';
    card.appendChild(title);
    const intro = doc.createElement('p');
    intro.className = 'suggestion-description';
    intro.textContent = 'Park a page with a wake time, and the card lists what is due when you look at it. Due items are found on interaction only; there is no background refresh. Opt in with the Snooze pages switch in Feature settings.';
    card.appendChild(intro);

    const urlLabel = doc.createElement('label');
    urlLabel.setAttribute('class', 'field-label');
    urlLabel.setAttribute('for', URL_ID);
    urlLabel.textContent = 'Page address';
    card.appendChild(urlLabel);
    const urlInput = doc.createElement('input');
    urlInput.setAttribute('id', URL_ID);
    urlInput.setAttribute('type', 'url');
    urlInput.setAttribute('maxlength', String(logic.URL_MAX));
    urlInput.setAttribute('placeholder', 'https://example.com/article');
    urlInput.setAttribute('autocomplete', 'off');
    urlInput.setAttribute('spellcheck', 'false');
    card.appendChild(urlInput);

    const wakeLabel = doc.createElement('label');
    wakeLabel.setAttribute('class', 'field-label');
    wakeLabel.setAttribute('for', WAKE_ID);
    wakeLabel.textContent = 'Wake me on';
    card.appendChild(wakeLabel);
    const wakeInput = doc.createElement('input');
    wakeInput.setAttribute('id', WAKE_ID);
    wakeInput.setAttribute('type', 'datetime-local');
    wakeInput.setAttribute('aria-label', 'Wake time for the snoozed page');
    card.appendChild(wakeInput);

    const noteLabel = doc.createElement('label');
    noteLabel.setAttribute('class', 'field-label');
    noteLabel.setAttribute('for', NOTE_ID);
    noteLabel.textContent = 'Optional note (up to ' + String(logic.NOTE_MAX) + ' characters)';
    card.appendChild(noteLabel);
    const noteInput = doc.createElement('input');
    noteInput.setAttribute('id', NOTE_ID);
    noteInput.setAttribute('type', 'text');
    noteInput.setAttribute('maxlength', String(logic.NOTE_MAX));
    noteInput.setAttribute('placeholder', 'Why this page is waiting');
    noteInput.setAttribute('autocomplete', 'off');
    card.appendChild(noteInput);

    const saveButton = doc.createElement('button');
    saveButton.className = 'button button-primary';
    saveButton.setAttribute('id', SAVE_ID);
    saveButton.setAttribute('type', 'button');
    saveButton.textContent = 'Snooze this page';
    card.appendChild(saveButton);

    const refreshButton = doc.createElement('button');
    refreshButton.className = 'button button-quiet';
    refreshButton.setAttribute('id', REFRESH_ID);
    refreshButton.setAttribute('type', 'button');
    refreshButton.textContent = 'Check dues';
    card.appendChild(refreshButton);

    const clearButton = doc.createElement('button');
    clearButton.className = 'button button-quiet';
    clearButton.setAttribute('id', CLEAR_ID);
    clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear all snoozes';
    card.appendChild(clearButton);

    const statusEl = doc.createElement('p');
    statusEl.setAttribute('id', STATUS_ID);
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.setAttribute('aria-atomic', 'true');
    statusEl.textContent = '';
    card.appendChild(statusEl);

    const listEl = doc.createElement('div');
    listEl.setAttribute('id', LIST_ID);
    listEl.setAttribute('aria-live', 'polite');
    card.appendChild(listEl);

    function setStatus(message) { statusEl.textContent = message; }
    function clearList() {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    }

    function flagOn() {
      try {
        const read = flagsApi.readFlags(storage);
        return read && read.ok === true && read.flags['snooze-pages'] === true;
      } catch (error) { return false; }
    }

    function makeRemoveButton(id) {
      const button = doc.createElement('button');
      button.className = 'button button-quiet';
      button.setAttribute('type', 'button');
      button.setAttribute('aria-label', 'Remove the snoozed page ' + id);
      button.setAttribute('data-remove-id', id);
      button.textContent = 'Remove';
      return button;
    }

    function renderList() {
      clearList();
      if (!storage) { setStatus(NO_STORAGE_TEXT); return null; }
      const read = logic.readSnoozes(storage);
      if (!read.ok) {
        clearList();
        setStatus(logic.describeError(read.reason));
        return null;
      }
      let stamp = null;
      try {
        stamp = nowMs();
      } catch (error) { stamp = null; }
      if (typeof stamp !== 'number' || !isFinite(stamp)) {
        clearList();
        setStatus(logic.describeError('storage-unavailable'));
        return null;
      }
      const due = logic.dueSnoozes(read.snoozes, stamp);
      const pending = logic.pendingSnoozes(read.snoozes, stamp);
      if (read.snoozes.length === 0) {
        setStatus('Nothing is parked yet. Save a page above and it will wait here.');
        return null;
      }
      for (const entry of due) {
        const row = doc.createElement('div');
        const link = doc.createElement('a');
        link.setAttribute('href', entry.url);
        link.setAttribute('rel', 'noopener noreferrer');
        link.textContent = entry.url;
        row.appendChild(link);
        const when = logic.describeWakeTime(entry.wakeAtMs);
        if (when) {
          const mark = doc.createElement('span');
          mark.textContent = ' · due since ' + when;
          row.appendChild(mark);
        }
        if (entry.note) {
          const note = doc.createElement('span');
          note.textContent = ' · ' + entry.note;
          row.appendChild(note);
        }
        row.appendChild(makeRemoveButton(entry.id));
        listEl.appendChild(row);
      }
      for (const entry of pending) {
        const row = doc.createElement('div');
        const name = doc.createElement('span');
        name.textContent = entry.url + ' waits until ' + logic.describeWakeTime(entry.wakeAtMs) + (entry.note ? ' · ' + entry.note : '');
        row.appendChild(name);
        row.appendChild(makeRemoveButton(entry.id));
        listEl.appendChild(row);
      }
      setStatus('Due now: ' + String(due.length) + '. Waiting: ' + String(pending.length) + '.');
      return {
        dueIds: due.map((entry) => entry.id),
        pendingIds: pending.map((entry) => entry.id),
        read: read
      };
    }

    function save() {
      if (!flagOn()) { setStatus(OFF_TEXT); return false; }
      if (!storage) { setStatus(NO_STORAGE_TEXT); return false; }
      const read = logic.readSnoozes(storage);
      if (!read.ok) {
        clearList();
        setStatus(logic.describeError(read.reason));
        return false;
      }
      let stamp = null;
      try { stamp = nowMs(); } catch (error) { stamp = null; }
      if (typeof stamp !== 'number' || !isFinite(stamp)) {
        setStatus(logic.describeError('storage-unavailable'));
        return false;
      }
      const made = logic.createSnooze(urlInput.value, wakeInput.value, noteInput.value, stamp, read.snoozes);
      if (!made.ok) {
        setStatus(logic.describeError(made.reason));
        return false;
      }
      const written = logic.writeSnoozes(storage, made.snoozes);
      if (!written.ok) {
        setStatus(logic.describeError(written.reason));
        return false;
      }
      urlInput.value = '';
      wakeInput.value = '';
      noteInput.value = '';
      renderList();
      setStatus('Saved on this device. It waits until ' + logic.describeWakeTime(made.snooze.wakeAtMs) + '.');
      return true;
    }

    function clearAllTaps() {
      if (!storage) { setStatus(NO_STORAGE_TEXT); return false; }
      const cleared = logic.clearSnoozes(storage);
      if (!cleared.ok) {
        setStatus(logic.describeError(cleared.reason));
        return false;
      }
      clearList();
      setStatus(cleared.clearedCount === 0
        ? 'Nothing was parked, so nothing was cleared.'
        : 'Cleared ' + String(cleared.clearedCount) + ' parked page(s) from this device.');
      return true;
    }

    function onSaveTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return save();
    }
    function onRefreshTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (!flagOn()) { setStatus(OFF_TEXT); return null; }
      return renderList();
    }
    function onClearTap(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return clearAllTaps();
    }
    function onListTap(event) {
      const target = event && event.target;
      if (!target || typeof target.getAttribute !== 'function') return null;
      const id = target.getAttribute('data-remove-id');
      if (typeof id !== 'string' || id.length === 0) return null;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (!storage) { setStatus(NO_STORAGE_TEXT); return false; }
      const removed = logic.removeSnooze(storage, id);
      if (!removed.ok) {
        setStatus(logic.describeError(removed.reason));
        return false;
      }
      renderList();
      setStatus('Removed 1 snooze. The page is no longer parked.');
      return true;
    }

    saveButton.addEventListener('click', onSaveTap);
    refreshButton.addEventListener('click', onRefreshTap);
    clearButton.addEventListener('click', onClearTap);
    listEl.addEventListener('click', onListTap);

    let placed = false;
    const anchor = doc.getElementById('storage-card');
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(card, anchor);
      placed = true;
    } else if (typeof bodyEl.appendChild === 'function') {
      bodyEl.appendChild(card);
      placed = true;
    }
    if (!placed) return null;

    if (!storage) setStatus(NO_STORAGE_TEXT);
    else if (!flagOn()) setStatus(OFF_TEXT);

    return {
      card: card,
      statusEl: statusEl,
      listEl: listEl,
      urlInput: urlInput,
      wakeInput: wakeInput,
      noteInput: noteInput,
      save: save,
      refresh: onRefreshTap,
      clearAll: clearAllTaps,
      onListTap: onListTap,
      renderList: renderList
    };
  }

  const api = { attachSnoozeUi: attachSnoozeUi, CARD_ID: CARD_ID, STATUS_ID: STATUS_ID, LIST_ID: LIST_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkSnoozeUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachSnoozeUi({
      document: document,
      window: window,
      flags: root.DaymarkFeatureFlags,
      logic: root.DaymarkSnooze
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
