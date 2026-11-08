const test = require('node:test');
const assert = require('node:assert/strict');
const addressApi = require('../browser-address-logic.js');
const ui = require('../browser-address-ui.js');

function fakeElement(tag) {
  return {
    tagName: tag,
    id: '',
    disabled: false,
    value: '',
    textContent: '',
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    dispatchEvent(event) {
      for (const listener of this.listeners) {
        if (listener.type === event.type) listener.handler(event);
      }
      return !event.defaultPrevented;
    }
  };
}

function fakeEnv(options) {
  const opts = options || {};
  const elements = {
    'browser-address-input': Object.assign(fakeElement('input'), { id: 'browser-address-input', value: opts.value || '' }),
    'browser-address-provider': Object.assign(fakeElement('select'), { id: 'browser-address-provider', value: opts.provider || 'duckduckgo' }),
    'browser-address-form': Object.assign(fakeElement('form'), { id: 'browser-address-form' }),
    'browser-address-status': Object.assign(fakeElement('p'), { id: 'browser-address-status' }),
    'browser-address-result': Object.assign(fakeElement('div'), { id: 'browser-address-result' }),
    'browser-address-clear': Object.assign(fakeElement('button'), { id: 'browser-address-clear' })
  };
  const storageData = {};
  if (opts.stored !== undefined) storageData[ui.PREFS_KEY] = opts.stored;
  const storage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storageData, key) ? storageData[key] : null; },
    setItem(key, value) { storageData[key] = String(value); },
    removeItem(key) { delete storageData[key]; }
  };
  const env = {
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; }
    },
    window: {},
    localStorage: storage,
    addressApi
  };
  return { env, elements, storageData };
}

test('attach with an empty field prompts the user honestly', () => {
  const { env, elements } = fakeEnv({});
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-status'].textContent, 'Nothing typed yet.');
  assert.equal(elements['browser-address-result'].textContent,
    'Type a URL or search text to see how the browser will read it.');
});

test('typing a bare https host previews a navigation with an encrypted label', () => {
  const { env, elements } = fakeEnv({ value: 'example.com' });
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-status'].textContent, 'Opens a page · Encrypted (HTTPS)');
  assert.equal(elements['browser-address-result'].textContent, 'Navigate to https://example.com');
});

test('an explicit http URL is labeled Not encrypted, never rewritten', () => {
  const { env, elements } = fakeEnv({ value: 'http://example.com' });
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-status'].textContent, 'Opens a page · Not encrypted (HTTP)');
  assert.equal(elements['browser-address-result'].textContent, 'Navigate to http://example.com');
});

test('Unicode domains show the punycode host in the detail line', () => {
  const { env, elements } = fakeEnv({ value: 'münchen.de' });
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-result'].textContent,
    'Navigate to https://xn--mnchen-3ya.de (Unicode domain, punycode host xn--mnchen-3ya.de)');
});

test('free text previews a search with the selected provider', () => {
  const { env, elements } = fakeEnv({ value: 'daymark task manager', provider: 'google' });
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-status'].textContent, 'Runs a search with Google.');
  assert.equal(elements['browser-address-result'].textContent,
    'Search for "daymark task manager" · https://www.google.com/search?q=daymark%20task%20manager');
});

test('switching the provider re-runs the query without losing it', () => {
  const { env, elements } = fakeEnv({ value: 'daymark task manager' });
  ui.attachBrowserAddressUi(env);
  assert.equal(elements['browser-address-result'].textContent,
    'Search for "daymark task manager" · https://duckduckgo.com/?q=daymark%20task%20manager');

  const provider = elements['browser-address-provider'];
  provider.value = 'bing';
  const change = provider.listeners.find((listener) => listener.type === 'change');
  assert.ok(change, 'provider change listener registered');
  change.handler();

  assert.equal(elements['browser-address-result'].textContent,
    'Search for "daymark task manager" · https://www.bing.com/search?q=daymark%20task%20manager');
});

test('the provider preference is persisted and restored on the next visit', () => {
  const first = fakeEnv({ value: 'daymark' });
  const firstHandle = ui.attachBrowserAddressUi(first.env);
  firstHandle.currentProvider();
  first.elements['browser-address-provider'].value = 'wikipedia';
  const change = first.elements['browser-address-provider'].listeners
    .find((listener) => listener.type === 'change');
  change.handler();
  const saved = JSON.parse(first.storageData[ui.PREFS_KEY]);
  assert.equal(saved.provider, 'wikipedia');

  const second = fakeEnv({ stored: JSON.stringify({ provider: 'wikipedia' }) });
  const secondHandle = ui.attachBrowserAddressUi(second.env);
  assert.equal(second.elements['browser-address-provider'].value, 'wikipedia');
  assert.equal(secondHandle.currentProvider(), 'wikipedia');
});

test('a corrupt provider preference is preserved and never overwritten by a later choice', () => {
  const raw = '{not json';
  const { env, elements, storageData } = fakeEnv({ stored: raw, value: 'daymark tasks' });
  const handle = ui.attachBrowserAddressUi(env);
  assert.equal(handle.currentProvider(), 'duckduckgo');
  assert.match(elements['browser-address-status'].textContent, /provider preference not saved/);
  elements['browser-address-provider'].value = 'google';
  const change = elements['browser-address-provider'].listeners.find((listener) => listener.type === 'change');
  change.handler();
  assert.equal(storageData[ui.PREFS_KEY], raw, 'corrupt saved preference is not overwritten');
  assert.equal(handle.currentProvider(), 'google', 'the current page can still use an in-memory choice');
  assert.match(elements['browser-address-result'].textContent, /www\.google\.com/);
});

test('an empty provider preference is corruption, not an absent key', () => {
  const { env, elements, storageData } = fakeEnv({ stored: '', value: 'daymark tasks' });
  const handle = ui.attachBrowserAddressUi(env);
  assert.equal(handle.currentProvider(), 'duckduckgo');
  assert.match(elements['browser-address-status'].textContent, /provider preference not saved/);
  elements['browser-address-provider'].value = 'bing';
  const change = elements['browser-address-provider'].listeners.find((listener) => listener.type === 'change');
  change.handler();
  assert.equal(storageData[ui.PREFS_KEY], '', 'empty corrupt value remains untouched');
  assert.equal(handle.currentProvider(), 'bing');
});

test('external handoffs and blocked schemes are surfaced distinctly', () => {
  const mail = fakeEnv({ value: 'mailto:someone@example.com' });
  ui.attachBrowserAddressUi(mail.env);
  assert.equal(mail.elements['browser-address-status'].textContent, 'External handoff.');
  assert.equal(mail.elements['browser-address-result'].textContent,
    'mailto:someone@example.com — Daymark passes this to another app only on your explicit action.');

  const blocked = fakeEnv({ value: 'javascript:alert(1)' });
  ui.attachBrowserAddressUi(blocked.env);
  assert.equal(blocked.elements['browser-address-status'].textContent, 'Blocked.');
  assert.equal(blocked.elements['browser-address-result'].textContent,
    'the javascript: scheme is blocked in the address bar');
});

test('the input listener previews as the user types', () => {
  const { env, elements } = fakeEnv({});
  ui.attachBrowserAddressUi(env);
  const input = elements['browser-address-input'];
  const inputListener = input.listeners.find((listener) => listener.type === 'input');
  assert.ok(inputListener, 'input listener registered');

  input.value = 'example.com:8080';
  inputListener.handler();
  assert.equal(elements['browser-address-result'].textContent, 'Navigate to https://example.com:8080');

  input.value = 'cats & dogs';
  inputListener.handler();
  assert.equal(elements['browser-address-status'].textContent, 'Runs a search with DuckDuckGo.');
});

test('form submission prevents navigation and previews the typed value', () => {
  const { env, elements } = fakeEnv({ value: 'https://example.com/x' });
  ui.attachBrowserAddressUi(env);
  const submit = elements['browser-address-form'].listeners.find((listener) => listener.type === 'submit');
  assert.ok(submit, 'form submit listener registered');
  let prevented = false;
  submit.handler({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true, 'native form navigation should be prevented');
  assert.equal(elements['browser-address-status'].textContent, 'Opens a page · Encrypted (HTTPS)');
});

test('clear resets the input, status, and detail', () => {
  const { env, elements } = fakeEnv({ value: 'example.com' });
  const handle = ui.attachBrowserAddressUi(env);
  handle.onClear();
  assert.equal(elements['browser-address-input'].value, '');
  assert.equal(elements['browser-address-status'].textContent, 'Cleared. Type a URL or search text.');
  assert.equal(elements['browser-address-result'].textContent, '');

  const clearBtn = elements['browser-address-clear'];
  const click = clearBtn.listeners.find((listener) => listener.type === 'click');
  assert.ok(click, 'clear click listener registered');
  click.handler();
  assert.equal(elements['browser-address-status'].textContent, 'Cleared. Type a URL or search text.');
});

test('a missing address engine reports unavailability instead of throwing', () => {
  const env = {
    document: { readyState: 'complete', getElementById: () => null },
    window: {},
    addressApi: null
  };
  ui.attachBrowserAddressUi(env); // inert, no throw
  const basic = fakeEnv({});
  basic.env.addressApi = null;
  const handle = ui.attachBrowserAddressUi(basic.env);
  handle.classify();
  assert.equal(basic.elements['browser-address-status'].textContent, 'Address preview is unavailable.');
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof ui.attachBrowserAddressUi, 'function');
  assert.equal(ui.PREFS_KEY, 'daymark.browser-address.prefs.v1');
  assert.equal(typeof globalThis.DaymarkBrowserAddressUi, 'object');
});

test('a throwing window.localStorage getter does not prevent address preview boot', () => {
  const { env, elements } = fakeEnv({ value: 'example.com' });
  delete env.localStorage;
  Object.defineProperty(env.window, 'localStorage', {
    configurable: true,
    get() { throw new Error('storage is blocked by browser policy'); }
  });
  assert.doesNotThrow(() => ui.attachBrowserAddressUi(env));
  assert.equal(elements['browser-address-status'].textContent,
    'Opens a page · Encrypted (HTTPS) · provider preference not saved in this browser');
  assert.equal(elements['browser-address-result'].textContent, 'Navigate to https://example.com');
});

test('a failed preference read never gets overwritten by a provider change', () => {
  const { env, elements } = fakeEnv({ value: 'daymark task manager' });
  let writes = 0;
  env.localStorage = {
    getItem() { throw new Error('read blocked'); },
    setItem() { writes += 1; }
  };
  const handle = ui.attachBrowserAddressUi(env);
  elements['browser-address-provider'].value = 'google';
  const change = elements['browser-address-provider'].listeners.find((listener) => listener.type === 'change');
  change.handler();
  assert.equal(writes, 0, 'an unreadable saved preference is never overwritten');
  assert.equal(handle.currentProvider(), 'google', 'the current page can still use an in-memory choice');
  assert.match(elements['browser-address-status'].textContent, /provider preference not saved/);
  assert.match(elements['browser-address-result'].textContent, /www\.google\.com/);
});

test('a failed preference write does not break address classification', () => {
  const { env, elements } = fakeEnv({ value: 'daymark task manager' });
  env.localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('write blocked'); }
  };
  ui.attachBrowserAddressUi(env);
  elements['browser-address-provider'].value = 'bing';
  const change = elements['browser-address-provider'].listeners.find((listener) => listener.type === 'change');
  assert.doesNotThrow(() => change.handler());
  assert.match(elements['browser-address-status'].textContent, /provider preference not saved/);
  assert.match(elements['browser-address-result'].textContent, /www\.bing\.com/);
});

