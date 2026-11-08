'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zonesApi = require('../zones-logic.js');
const ui = require('../zones-ui.js');

const FROZEN_NOW = '2026-11-08T12:00:00.000Z';


function fakeElement(tag) {
  const el = {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    children: [],
    listeners: [],
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === true) this.classes.add(c);
        else if (force === false) this.classes.delete(c);
        else this.classes.has(c) ? this.classes.delete(c) : this.classes.add(c);
        return this.classes.has(c);
      },
      contains(c) { return this.classes.has(c); }
    },
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this, name) ? this[name] : undefined; },
    removeAttribute(name) { delete this[name]; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      return child;
    },
    get firstChild() { return this.children[0] || null; }
  };
  return el;
}


function makeCache(zones, updatedAt) {
  return { version: 1, zones, updatedAt: updatedAt || '2026-11-08T08:30:00.000Z' };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'zones-pick': Object.assign(fakeElement('select'), { id: 'zones-pick', value: opts.pick || 'Asia/Kolkata' }),
    'zones-add': Object.assign(fakeElement('button'), { id: 'zones-add', type: 'submit' }),
    'zones-refresh': Object.assign(fakeElement('button'), { id: 'zones-refresh', type: 'button' }),
    'zones-clear': Object.assign(fakeElement('button'), { id: 'zones-clear', type: 'button' }),
    'zones-copy': Object.assign(fakeElement('button'), { id: 'zones-copy', type: 'button' }),
    'zones-share': Object.assign(fakeElement('button'), { id: 'zones-share', type: 'button' }),
    'zones-save': Object.assign(fakeElement('button'), { id: 'zones-save', type: 'button' }),
    'zones-form': Object.assign(fakeElement('form'), { id: 'zones-form' }),
    'zones-status': Object.assign(fakeElement('p'), { id: 'zones-status' }),
    'zones-list': Object.assign(fakeElement('div'), { id: 'zones-list' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storageCalls = { reads: 0, writes: 0, removes: 0 };
  const storage = {
    getItem(key) {
      storageCalls.reads += 1;
      if (opts.readFailure) throw new Error('Read access failure');
      return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null;
    },
    setItem(key, value) {
      storageCalls.writes += 1;
      if (opts.writeFailure) throw new Error('Write access failure');
      storageData[key] = String(value);
    },
    removeItem(key) {
      storageCalls.removes += 1;
      if (opts.removeFailure) throw new Error('Remove access failure');
      delete storageData[key];
    }
  };
  if (opts.omitGetItem) delete storage.getItem;
  const window = {};
  if (opts.storageGetterThrows) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('Storage access denied'); }
    });
  }
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); },
      body: fakeElement('body')
    },
    window,
    zonesApi: opts.zonesApi,
    now: () => FROZEN_NOW
  };
  if (!opts.omitLocalStorage) env.localStorage = storage;
  return { env, elements, storageData, storageCalls, storage };
}

function rowTexts(listEl) {
  return listEl.children.map((row) => row.children.map((child) => child.textContent));
}

test('attach renders the default zone and an honest overlap row with no cache', () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][0], 'UTC+05:30 · Sun 08 Nov');
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(rows[0][2], 'Remove');
  assert.equal(rows[1][0], 'Best shared window');
  assert.ok(rows[1][1].length > 0, 'the overlap row always explains the best window');
  assert.equal(elements['zones-status'].textContent,
    'Pick time zones to compare. Everything is computed offline.');
  assert.equal(typeof handle.onRefresh, 'function');
});

test('attach restores a saved zone list with a cached note', () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements } = fakeEnv({ stored });
  ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'UK · London — 12:00');
  assert.ok(elements['zones-status'].textContent.startsWith('Cached · updated 2026-11-08 08:30 UTC'));
});

test('a corrupt cache is ignored instead of crashing', () => {
  const { env, elements } = fakeEnv({ stored: '{not json' });
  ui.attachZonesUi(env);
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(elements['zones-status'].textContent,
    'Pick time zones to compare. Everything is computed offline.');
});

test('a throwing localStorage getter does not crash and keeps writes fail-closed', async () => {
  const { env, elements, storageCalls } = fakeEnv({
    omitLocalStorage: true,
    storageGetterThrows: true,
    pick: 'Europe/London'
  });
  let handle = null;
  assert.doesNotThrow(() => { handle = ui.attachZonesUi(env); });
  assert.ok(handle);
  assert.equal(rowTexts(elements['zones-list'])[0][1], 'India · Kolkata — 17:30');
  assert.match(elements['zones-status'].textContent, /Browser storage is unavailable/);
  await handle.onAdd();
  assert.equal(storageCalls.writes, 0);
  assert.equal(rowTexts(elements['zones-list']).length, 2);
  assert.match(elements['zones-status'].textContent, /saved list was not changed/i);
});

test('a storage adapter without getItem cannot overwrite unreadable saved zones', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData, storageCalls } = fakeEnv({
    stored,
    omitGetItem: true,
    pick: 'Asia/Tokyo'
  });
  const handle = ui.attachZonesUi(env);
  assert.match(elements['zones-status'].textContent, /Browser storage is unavailable/);
  assert.equal(rowTexts(elements['zones-list']).length, 2);
  await handle.onAdd();
  assert.equal(storageCalls.writes, 0);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  assert.equal(rowTexts(elements['zones-list'])[0][1], 'India · Kolkata — 17:30');
  await handle.onClear();
  assert.equal(storageCalls.removes, 0);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  await handle.onRefresh();
  assert.equal(storageCalls.writes, 0);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  assert.match(elements['zones-status'].textContent, /refresh time was not saved/i);
});

test('a failed saved-zone read never overwrites or clears unknown stored data', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData, storageCalls } = fakeEnv({
    stored,
    readFailure: true,
    pick: 'Asia/Tokyo'
  });
  const handle = ui.attachZonesUi(env);
  assert.match(elements['zones-status'].textContent, /Saved time zones could not be read/);
  assert.equal(rowTexts(elements['zones-list']).length, 2);
  await handle.onAdd();
  assert.equal(storageCalls.writes, 0);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  await handle.onClear();
  assert.equal(storageCalls.removes, 0);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  assert.match(elements['zones-status'].textContent, /were not cleared/i);
});

test('a failed save does not change the displayed zone list', async () => {
  const { env, elements, storageData, storageCalls } = fakeEnv({
    writeFailure: true,
    pick: 'Europe/London'
  });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.equal(storageCalls.writes, 1);
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(rowTexts(elements['zones-list']).length, 2);
  assert.equal(rowTexts(elements['zones-list'])[0][1], 'India · Kolkata — 17:30');
  assert.match(elements['zones-status'].textContent, /could not be updated/i);
  assert.match(elements['zones-status'].textContent, /saved list was not changed/i);
});

test('a failed clear preserves the saved zone list and reports failure', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData, storageCalls } = fakeEnv({
    stored,
    removeFailure: true
  });
  const handle = ui.attachZonesUi(env);
  await handle.onClear();
  assert.equal(storageCalls.removes, 1);
  assert.equal(storageData[ui.STORAGE_KEY], stored);
  assert.equal(rowTexts(elements['zones-list']).length, 3);
  assert.equal(rowTexts(elements['zones-list'])[1][1], 'UK · London — 12:00');
  assert.match(elements['zones-status'].textContent, /Could not clear saved time zones/);
});

test('a failed refresh does not claim the refresh time was saved', async () => {
  const { env, elements, storageCalls } = fakeEnv({ writeFailure: true });
  const handle = ui.attachZonesUi(env);
  await handle.onRefresh();
  assert.equal(storageCalls.writes, 1);
  assert.match(elements['zones-status'].textContent, /refresh time was not saved/i);
});

test('add appends the picked zone, renders it, and persists the list', async () => {
  const { env, elements, storageData } = fakeEnv({ pick: 'Europe/London' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'UK · London — 12:00');
  assert.ok(elements['zones-status'].textContent.startsWith('Added UK · London'));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.ok(zonesApi.validateZonesCache(saved));
  assert.deepEqual(saved.zones, ['Asia/Kolkata', 'Europe/London']);
});

test('adding a zone that is already on the card is rejected honestly', async () => {
  const { env, elements, storageData } = fakeEnv({ pick: 'Asia/Kolkata' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent, 'That time zone is already on the card.');
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
});

test('the card caps how many zones it keeps', async () => {
  const stored = JSON.stringify(makeCache([
    'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
    'Europe/London', 'Europe/Berlin'
  ]));
  const { env, elements } = fakeEnv({ stored, pick: 'Pacific/Auckland' });
  const handle = ui.attachZonesUi(env);
  await handle.onAdd();
  assert.equal(elements['zones-status'].textContent,
    'Up to ' + zonesApi.MAX_ZONES + ' zones fit on the card. Remove one first.');
});

test('the last zone cannot be removed', async () => {
  const { env, elements } = fakeEnv({});
  const handle = ui.attachZonesUi(env);
  await handle.onRemove('Asia/Kolkata');
  assert.equal(elements['zones-status'].textContent, 'Keep at least one time zone on the card.');
  assert.equal(rowTexts(elements['zones-list']).length, 2);
});

test('remove drops a zone, persists the list, and rerenders', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onRemove('Europe/London');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.ok(elements['zones-status'].textContent.startsWith('Removed UK · London'));
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.deepEqual(saved.zones, ['Asia/Kolkata']);
});

test('the per-row remove button is wired', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements } = fakeEnv({ stored });
  ui.attachZonesUi(env);
  const firstRow = elements['zones-list'].children[0];
  const removeBtn = firstRow.children.find((child) => child.tagName === 'button');
  assert.ok(removeBtn, 'each zone row has a remove button');
  assert.equal(removeBtn.getAttribute('aria-label'), 'Remove India · Kolkata');
  await removeBtn.listeners[0].handler();
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'UK · London — 12:00');
});

test('refresh recomputes every clock from the current time', async () => {
  const stored = JSON.stringify(makeCache(['Asia/Kolkata', 'Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onRefresh();
  assert.equal(elements['zones-status'].textContent, 'Updated · 2026-11-08 12:00 UTC');
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.updatedAt, FROZEN_NOW);
  assert.equal(rowTexts(elements['zones-list']).length, 3);
});

test('clear removes the saved list and resets to the default zone', async () => {
  const stored = JSON.stringify(makeCache(['Europe/London']));
  const { env, elements, storageData } = fakeEnv({ stored });
  const handle = ui.attachZonesUi(env);
  await handle.onClear();
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(elements['zones-pick'].value, 'Asia/Kolkata');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], 'India · Kolkata — 17:30');
  assert.equal(elements['zones-status'].textContent, 'World clock cleared on this device.');
});

test('form submission is prevented and adds the picked zone', async () => {
  const { env, elements } = fakeEnv({ pick: 'Asia/Tokyo' });
  ui.attachZonesUi(env);
  const submit = elements['zones-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'the zones form handles native submit events');
  let prevented = false;
  await submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation is prevented');
  const rows = rowTexts(elements['zones-list']);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], 'Japan · Tokyo — 21:00');
});

test('the add button click listener is registered', async () => {
  const { env, elements } = fakeEnv({ pick: 'Asia/Tokyo' });
  ui.attachZonesUi(env);
  const click = elements['zones-add'].listeners.find((l) => l.type === 'click');
  assert.ok(click, 'the add button has a click listener');
  await click.handler();
  assert.equal(rowTexts(elements['zones-list']).length, 3);
});

test('a missing zones module is reported instead of crashing', () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  assert.equal(elements['zones-status'].textContent, 'World clock is unavailable.');
  assert.equal(elements['zones-list'].children.length, 0);
  handle.onAdd();
  handle.onRefresh();
  assert.equal(elements['zones-status'].textContent, 'World clock is unavailable.');
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachZonesUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.zones.v1');
  assert.equal(ui.DEFAULT_ZONE, 'Asia/Kolkata');
  assert.equal(typeof globalThis.DaymarkZonesUi, 'object');
});

test('copy overlap writes a multi-line summary to an injected clipboard and reports status', async () => {
  let written = null;
  const { env, elements } = fakeEnv({});
  env.navigator = {
    clipboard: {
      writeText(text) {
        written = text;
        return Promise.resolve();
      }
    }
  };
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-copy'].listeners.find((l) => l.type === 'click');
  assert.ok(click, 'the copy button has a click listener');
  await click.handler();
  assert.ok(written && written.includes('Daymark world clock'), 'clipboard received the summary');
  assert.ok(written.includes('India · Kolkata'), 'summary includes the zone');
  assert.ok(written.includes('Best shared window'), 'summary includes the overlap');
  assert.equal(elements['zones-status'].textContent, 'Copied world clock and overlap to clipboard.');
  assert.equal(elements['zones-copy'].getAttribute('aria-busy'), undefined, 'busy is cleared after success');
});

test('copy reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  handle.onCopy();
  assert.equal(elements['zones-status'].textContent, 'Nothing to copy yet.');
});

test('share overlap calls navigator.share with the summary and reports status', async () => {
  let shared = null;
  const { env, elements } = fakeEnv({});
  env.navigator = {
    share(data) {
      shared = data;
      return Promise.resolve();
    }
  };
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-share'].listeners.find((l) => l.type === 'click');
  assert.ok(click, 'the share button has a click listener');
  await click.handler();
  assert.ok(shared && shared.text && shared.text.includes('Daymark world clock'), 'share received the summary');
  assert.equal(shared.title, 'Daymark world clock and overlap');
  assert.equal(elements['zones-status'].textContent, 'Shared world clock and overlap.');
  assert.equal(elements['zones-share'].getAttribute('aria-busy'), undefined, 'busy is cleared after success');
});

test('share reports unavailable when navigator.share is missing', async () => {
  const { env, elements } = fakeEnv({});
  env.navigator = {};
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-share'].listeners.find((l) => l.type === 'click');
  assert.ok(click);
  await click.handler();
  assert.equal(elements['zones-status'].textContent, 'Sharing is not available in this environment.');
});

test('share reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  handle.onShare();
  assert.equal(elements['zones-status'].textContent, 'Nothing to share yet.');
});

test('save overlap downloads the offline summary, cleans up, and clears busy state', async () => {
  let savedBlob = null;
  let clicked = false;
  let revoked = null;
  let revokeDelay = null;
  let link = null;
  const { env, elements } = fakeEnv({});
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options && options.type;
    }
  }
  env.Blob = FakeBlob;
  env.URL = {
    createObjectURL(blob) {
      savedBlob = blob;
      return 'blob:fake';
    },
    revokeObjectURL(url) { revoked = url; }
  };
  env.setTimeout = (callback, delay) => {
    revokeDelay = delay;
    callback();
    return 1;
  };
  const createElement = env.document.createElement;
  env.document.createElement = (tag) => {
    const element = createElement(tag);
    if (tag === 'a') {
      link = element;
      element.click = () => { clicked = true; };
    }
    return element;
  };
  const handle = ui.attachZonesUi(env);
  const click = elements['zones-save'].listeners.find((listener) => listener.type === 'click');
  assert.ok(click, 'the Save as text button has a click listener');
  await click.handler();
  assert.ok(savedBlob, 'a Blob was created');
  assert.equal(savedBlob.type, 'text/plain;charset=utf-8');
  assert.ok(savedBlob.parts[0].includes('Daymark world clock'));
  assert.ok(savedBlob.parts[0].includes('India · Kolkata'));
  assert.ok(savedBlob.parts[0].includes('Best shared window'));
  assert.ok(link, 'a temporary anchor was created');
  assert.equal(link.href, 'blob:fake');
  assert.equal(link.download, 'daymark-world-clock.txt');
  assert.equal(clicked, true, 'the temporary link was activated');
  assert.equal(revoked, 'blob:fake', 'the temporary object URL was revoked');
  assert.equal(revokeDelay, 1000, 'the URL remains available briefly for the browser download handoff');
  assert.equal(elements['zones-status'].textContent,
    'Saved world clock and overlap as daymark-world-clock.txt.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined, 'busy is cleared after success');
});

test('save reports nothing when the zones module is missing', async () => {
  const { env, elements } = fakeEnv({ zonesApi: null });
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Nothing to save yet.');
});

test('save fails closed when Blob and object-URL support is unavailable', async () => {
  const { env, elements } = fakeEnv({});
  env.Blob = null;
  env.URL = null;
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Saving is not available in this environment.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});

test('save fails closed when the document body cannot host a download link', async () => {
  const { env, elements } = fakeEnv({});
  env.document.body = null;
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Saving is not available in this environment.');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});

test('save reports a download failure and revokes the object URL', async () => {
  let revoked = null;
  const { env, elements } = fakeEnv({});
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.type = options && options.type; }
  }
  env.Blob = FakeBlob;
  env.URL = {
    createObjectURL() { return 'blob:failed'; },
    revokeObjectURL(url) { revoked = url; }
  };
  env.setTimeout = (callback) => { callback(); };
  const createElement = env.document.createElement;
  env.document.createElement = (tag) => {
    if (tag === 'a') throw new Error('blocked');
    return createElement(tag);
  };
  const handle = ui.attachZonesUi(env);
  await handle.onSave();
  assert.equal(elements['zones-status'].textContent, 'Could not save the summary as a text file.');
  assert.equal(revoked, 'blob:failed');
  assert.equal(elements['zones-save'].getAttribute('aria-busy'), undefined);
});
