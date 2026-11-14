'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wikiApi = require('../wiki-logic.js');
const ui = require('../wiki-ui.js');
const { createLockManager, deferred, clearKeys, taskMutation } = require('./task-clear-race-helpers.js');

const SEARCH_BODY = JSON.stringify({
  query: {
    search: [
      {
        title: 'Kanyakumari',
        snippet: '<span class="searchmatch">Kanyakumari</span> is a coastal town in Tamil Nadu.',
        pageid: 2285632
      }
    ]
  }
});

function fakeElement(tag) {
  const listeners = [];
  const children = [];
  const attributes = {};
  return {
    tagName: tag,
    id: '',
    className: '',
    href: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners,
    children,
    attributes,
    firstChild: null,
    addEventListener(type, handler) { listeners.push({ type, handler }); },
    appendChild(child) { children.push(child); this.firstChild = children[0]; return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      this.firstChild = children[0] || null;
      return child;
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    removeAttribute(name) { delete attributes[name]; }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'wiki-query': Object.assign(fakeElement('input'), { id: 'wiki-query', value: opts.query || '' }),
    'wiki-search': Object.assign(fakeElement('button'), { id: 'wiki-search' }),
    'wiki-clear': Object.assign(fakeElement('button'), { id: 'wiki-clear' }),
    'wiki-status': Object.assign(fakeElement('p'), { id: 'wiki-status' }),
    'wiki-list': Object.assign(fakeElement('div'), { id: 'wiki-list' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.STORAGE_KEY] = opts.stored;
  const storage = Object.prototype.hasOwnProperty.call(opts, 'storage') ? opts.storage : {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const lockManager = createLockManager();
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      createElement(tag) { return fakeElement(tag); }
    },
    window: opts.window || {},
    localStorage: storage,
    wikiApi: opts.wikiApi || wikiApi,
    taskMutationApi: taskMutation,
    lockManager,
    fetch: opts.fetch,
    now: () => '2026-11-05T12:00:00.000Z'
  };
  return { env, elements, storageData, storage, lockManager };
}

function streamResponse(body) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const chunk = bytes.slice(offset, offset + 1024);
      offset += chunk.length;
      return { done: false, value: chunk };
    },
    cancel() { return Promise.resolve(); },
    releaseLock() {}
  };
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    body: { getReader() { return reader; }, cancel() { return reader.cancel(); } },
    text() { throw new Error('bounded response reader must not call response.text()'); }
  };
}

function okFetch(body) {
  const seen = [];
  const impl = (url, init) => {
    seen.push(url);
    assert.ok(!init || typeof init === 'object', 'fetch init must be an options object when provided');
    return Promise.resolve(streamResponse(body));
  };
  impl.seen = seen;
  return impl;
}

test('attach renders a cached search with a cached note', () => {
  const stored = JSON.stringify({
    version: 1,
    query: 'kanyakumari',
    results: [{
      title: 'Kanyakumari',
      snippet: 'A coastal town in Tamil Nadu.',
      pageId: 2285632,
      url: 'https://en.wikipedia.org/?curid=2285632'
    }],
    fetchedAt: '2026-11-04T09:30:00.000Z'
  });
  const { env, elements } = fakeEnv({ stored });
  ui.attachWikiUi(env);
  assert.equal(elements['wiki-list'].children.length, 1);
  const item = elements['wiki-list'].children[0];
  assert.equal(item.children.length, 2);
  assert.equal(item.children[0].tagName, 'a');
  assert.equal(item.children[0].textContent, 'Kanyakumari');
  assert.equal(item.children[0].attributes['href'], 'https://en.wikipedia.org/?curid=2285632');
  assert.equal(item.children[0].attributes['rel'], 'noopener noreferrer');
  assert.equal(item.children[1].tagName, 'p');
  assert.equal(item.children[1].textContent, 'A coastal town in Tamil Nadu.');
  assert.ok(elements['wiki-status'].textContent.startsWith('Cached · updated 2026-11-04 09:30 UTC'));
});

test('search fetches, renders, persists, and reports the update', async () => {
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements, storageData } = fakeEnv({ query: ' kanyakumari ', fetch: fetchImpl });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.ok(fetchImpl.seen[0].includes('srsearch=kanyakumari'));
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.equal(elements['wiki-list'].children[0].children[0].textContent, 'Kanyakumari');
  assert.equal(elements['wiki-status'].textContent, 'Updated · 2026-11-05 12:00 UTC');
  const saved = JSON.parse(storageData[ui.STORAGE_KEY]);
  assert.equal(saved.version, 1);
  assert.equal(saved.query, 'kanyakumari');
  assert.equal(saved.results.length, 1);
  assert.equal(JSON.parse(storageData[ui.PREFS_KEY]).query, 'kanyakumari');
});

test('a deferred Wikipedia response cannot recreate its absent cache or preference after Clear All', async () => {
  const waiting = deferred();
  const started = deferred();
  const result = {
    version: 1, query: 'kanyakumari',
    results: [{ title: 'Kanyakumari', snippet: 'A coastal town in Tamil Nadu.', pageId: 2285632, url: 'https://en.wikipedia.org/?curid=2285632' }],
    fetchedAt: '2026-11-05T12:00:00.000Z'
  };
  const delayedApi = Object.assign({}, wikiApi, {
    searchWikipedia() { started.resolve(); return waiting.promise; }
  });
  const { env, storage, storageData, lockManager } = fakeEnv({ query: 'kanyakumari', wikiApi: delayedApi, fetch: () => Promise.resolve({}) });
  const handle = ui.attachWikiUi(env);
  assert.equal(storage.getItem(ui.STORAGE_KEY), null, 'the cache is absent before search begins');
  const searching = handle.onSearch();
  await started.promise;
  await clearKeys(storage, [ui.STORAGE_KEY, ui.PREFS_KEY], lockManager);
  waiting.resolve(result);
  await searching;
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
});

test('search failure keeps the cached results visible', async () => {
  const stored = JSON.stringify({
    version: 1,
    query: 'kanyakumari',
    results: [{
      title: 'Kanyakumari',
      snippet: 'A coastal town in Tamil Nadu.',
      pageId: 2285632,
      url: 'https://en.wikipedia.org/?curid=2285632'
    }],
    fetchedAt: '2026-11-04T09:30:00.000Z'
  });
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ query: 'kanyakumari', stored, fetch: failing });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-status'].textContent, 'Could not search: offline — showing cached results.');
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.equal(elements['wiki-search'].disabled, false);
});

test('search failure with no cache reports the error plainly', async () => {
  const failing = () => Promise.reject(new Error('offline'));
  const { env, elements } = fakeEnv({ query: 'kanyakumari', fetch: failing });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-status'].textContent, 'Could not search: offline');
  assert.equal(elements['wiki-list'].children.length, 0);
});

test('missing fetch support is reported instead of throwing', async () => {
  const { env, elements } = fakeEnv({ query: 'kanyakumari' });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.ok(elements['wiki-status'].textContent.includes('fetch is unavailable'));
});

test('empty query asks for a search term without touching the network', async () => {
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements } = fakeEnv({ fetch: fetchImpl });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-status'].textContent, 'Type a search term first.');
  assert.equal(fetchImpl.seen.length, 0);
});

test('a corrupt cache is preserved and reported instead of treated as absent', () => {
  const { env, elements, storageData } = fakeEnv({ stored: '{not json' });
  ui.attachWikiUi(env);
  assert.equal(elements['wiki-list'].children.length, 0);
  assert.equal(storageData[ui.STORAGE_KEY], '{not json');
  assert.ok(elements['wiki-status'].textContent.includes('Saved Wikipedia cache is invalid and was left untouched.'));
  assert.ok(elements['wiki-status'].textContent.endsWith('Type a topic and tap Search.'));
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachWikiUi, 'function');
  assert.equal(ui.STORAGE_KEY, 'daymark.wiki.v1');
  assert.equal(ui.PREFS_KEY, 'daymark.wiki.prefs.v1');
  assert.equal(typeof globalThis.DaymarkWikiUi, 'object');
});

test('a saved search term from a previous visit is restored on attach', () => {
  const { env, elements, storageData } = fakeEnv({});
  storageData[ui.PREFS_KEY] = JSON.stringify({ query: 'Kanyakumari' });
  ui.attachWikiUi(env);
  assert.equal(elements['wiki-query'].value, 'Kanyakumari');
  assert.equal(elements['wiki-status'].textContent, 'Last search restored. Tap Search to look it up again.');
});

test('typing a search term persists it for the next visit', async () => {
  const { env, elements, storageData } = fakeEnv({});
  ui.attachWikiUi(env);
  const input = elements['wiki-query'];
  input.value = 'solar power';
  const inputListener = input.listeners.find((l) => l.type === 'input');
  assert.ok(inputListener, 'input listener registered');
  await inputListener.handler();
  assert.equal(JSON.parse(storageData[ui.PREFS_KEY]).query, 'solar power');
});

test('Enter in the query field triggers a search', async () => {
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements } = fakeEnv({ query: 'kanyakumari', fetch: fetchImpl });
  ui.attachWikiUi(env);
  const keydown = elements['wiki-query'].listeners.find((l) => l.type === 'keydown');
  assert.ok(keydown, 'keydown listener registered');
  let prevented = false;
  await keydown.handler({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(elements['wiki-status'].textContent, 'Updated · 2026-11-05 12:00 UTC');
});

test('Clear button empties the query, list, cache and prefs', () => {
  const stored = JSON.stringify({
    version: 1,
    query: 'kanyakumari',
    results: [{
      title: 'Kanyakumari',
      snippet: 'A coastal town in Tamil Nadu.',
      pageId: 2285632,
      url: 'https://en.wikipedia.org/?curid=2285632'
    }],
    fetchedAt: '2026-11-04T09:30:00.000Z'
  });
  const { env, elements, storageData } = fakeEnv({ stored, query: 'kanyakumari' });
  storageData[ui.PREFS_KEY] = JSON.stringify({ query: 'kanyakumari' });
  const handle = ui.attachWikiUi(env);
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.equal(elements['wiki-query'].value, 'kanyakumari');
  handle.onClear();
  assert.equal(elements['wiki-query'].value, '');
  assert.equal(elements['wiki-list'].children.length, 0);
  assert.equal(elements['wiki-status'].textContent, 'Cleared. Type a topic and tap Search.');
  assert.equal(storageData[ui.STORAGE_KEY], undefined);
  assert.equal(storageData[ui.PREFS_KEY], undefined);
});

test('Clear button click listener is wired', () => {
  const { env, elements } = fakeEnv({ query: 'something' });
  ui.attachWikiUi(env);
  const clearBtn = elements['wiki-clear'];
  const listener = clearBtn.listeners.find((l) => l.type === 'click');
  assert.ok(listener, 'clear click listener registered');
  listener.handler();
  assert.equal(elements['wiki-query'].value, '');
  assert.equal(elements['wiki-status'].textContent, 'Cleared. Type a topic and tap Search.');
});


test('a throwing window storage getter does not prevent searching', async () => {
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements } = fakeEnv({ query: 'kanyakumari', fetch: fetchImpl });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.ok(elements['wiki-status'].textContent.startsWith('Updated ·'));
  assert.ok(elements['wiki-status'].textContent.includes('local storage is unavailable'));
});

test('storage read failures are reported and never overwritten', async () => {
  let writes = 0;
  const storage = { getItem() { throw new Error('storage denied'); }, setItem() { writes++; }, removeItem() { throw new Error('storage denied'); } };
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements } = fakeEnv({ query: 'kanyakumari', fetch: fetchImpl, storage });
  const handle = ui.attachWikiUi(env);
  assert.ok(elements['wiki-status'].textContent.includes('could not be read and was left untouched'));
  await handle.onSearch();
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.equal(writes, 0);
  assert.ok(elements['wiki-status'].textContent.includes('could not be verified and was left untouched'));
});

test('a successful search remains visible when cache writes fail', async () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error('quota exceeded'); }, removeItem() {} };
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements } = fakeEnv({ query: 'kanyakumari', fetch: fetchImpl, storage });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.ok(elements['wiki-status'].textContent.startsWith('Updated ·'));
  assert.ok(elements['wiki-status'].textContent.includes('Saved Wikipedia cache could not be saved'));
  assert.equal(elements['wiki-search'].disabled, false);
});

test('a corrupt cache is not overwritten by a later successful search', async () => {
  const fetchImpl = okFetch(SEARCH_BODY);
  const { env, elements, storageData } = fakeEnv({ query: 'kanyakumari', stored: '{not json', fetch: fetchImpl });
  const handle = ui.attachWikiUi(env);
  await handle.onSearch();
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.equal(storageData[ui.STORAGE_KEY], '{not json');
  assert.ok(elements['wiki-status'].textContent.includes('Saved Wikipedia cache is invalid and was left untouched'));
});

test('failed Clear preserves visible and persisted Wikipedia data', () => {
  const stored = JSON.stringify({ version: 1, query: 'kanyakumari',
    results: [{ title: 'Kanyakumari', snippet: 'A coastal town in Tamil Nadu.', pageId: 2285632, url: 'https://en.wikipedia.org/?curid=2285632' }],
    fetchedAt: '2026-11-04T09:30:00.000Z' });
  const storage = { getItem(key) { return key === ui.STORAGE_KEY ? stored : JSON.stringify({ query: 'kanyakumari' }); }, setItem() {}, removeItem() { throw new Error('storage denied'); } };
  const { env, elements } = fakeEnv({ query: 'kanyakumari', storage });
  const handle = ui.attachWikiUi(env);
  const beforeCount = elements['wiki-list'].children.length;
  const beforeQuery = elements['wiki-query'].value;
  assert.equal(handle.onClear(), false);
  assert.equal(elements['wiki-list'].children.length, beforeCount);
  assert.equal(elements['wiki-query'].value, beforeQuery);
  assert.ok(elements['wiki-status'].textContent.startsWith('Could not clear saved Wikipedia data'));
});

test('a partial Clear failure restores the first saved value', () => {
  const cache = JSON.stringify({ version: 1, query: 'kanyakumari',
    results: [{ title: 'Kanyakumari', snippet: 'A coastal town in Tamil Nadu.', pageId: 2285632, url: 'https://en.wikipedia.org/?curid=2285632' }],
    fetchedAt: '2026-11-04T09:30:00.000Z' });
  const prefs = JSON.stringify({ query: 'kanyakumari' });
  const data = { [ui.STORAGE_KEY]: cache, [ui.PREFS_KEY]: prefs };
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { if (key === ui.STORAGE_KEY) { delete data[key]; return; } throw new Error('preference removal denied'); }
  };
  const { env, elements } = fakeEnv({ query: 'kanyakumari', storage });
  const handle = ui.attachWikiUi(env);
  assert.equal(handle.onClear(), false);
  assert.equal(data[ui.STORAGE_KEY], cache);
  assert.equal(data[ui.PREFS_KEY], prefs);
  assert.equal(elements['wiki-list'].children.length, 1);
  assert.ok(elements['wiki-status'].textContent.startsWith('Could not clear saved Wikipedia data'));
});

test('typing does not throw when preference persistence fails', async () => {
  const storage = { getItem() { return null; }, setItem() { throw new Error('quota exceeded'); }, removeItem() {} };
  const { env, elements } = fakeEnv({ storage });
  ui.attachWikiUi(env);
  const input = elements['wiki-query'];
  input.value = 'solar power';
  const listener = input.listeners.find((entry) => entry.type === 'input');
  assert.ok(listener);
  await assert.doesNotReject(() => listener.handler());
  assert.ok(elements['wiki-status'].textContent.includes('Search preference could not be saved'));
});

test('browser auto-boot does not eagerly read window.localStorage', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'wiki-ui.js'), 'utf8');
  assert.ok(source.includes('const boot = () => attachWikiUi({ document, window });'));
  assert.ok(!source.includes('localStorage: window.localStorage'));
});
