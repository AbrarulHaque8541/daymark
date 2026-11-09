'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bootstrap = fs.readFileSync(
  path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'assets', 'daymark-extension-spa.js'),
  'utf8'
);

function pack(id, matches, css, options) {
  const extra = options || {};
  return {
    id,
    matches,
    excludes: extra.excludes || [],
    disabledSites: extra.disabledSites || [],
    css: css || ''
  };
}

function makeHarness(initialUrl, packs, options) {
  const opts = options || {};
  const root = {
    children: [],
    appendChild(element) {
      element.parentNode = this;
      this.children.push(element);
      return element;
    },
    removeChild(element) {
      const index = this.children.indexOf(element);
      if (index >= 0) this.children.splice(index, 1);
      element.parentNode = null;
      return element;
    }
  };
  const document = {
    head: root,
    documentElement: root,
    createElement(tagName) {
      const attributes = Object.create(null);
      return {
        tagName: String(tagName).toUpperCase(),
        parentNode: null,
        textContent: '',
        setAttribute(name, value) { attributes[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; }
      };
    }
  };
  const listeners = Object.create(null);
  const location = { href: initialUrl };
  const history = {
    pushState(_state, _title, nextUrl) {
      location.href = new URL(nextUrl, location.href).href;
      return 'push-result';
    },
    replaceState(_state, _title, nextUrl) {
      location.href = new URL(nextUrl, location.href).href;
      return 'replace-result';
    }
  };
  const observers = [];
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { }
    disconnect() { }
    trigger() { this.callback(); }
  }
  const window = {
    location,
    history,
    MutationObserver,
    addEventListener(type, callback) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(callback);
    }
  };
  window.__daymarkSpaConfig = {
    expectedUrl: opts.expectedUrl || initialUrl,
    maxEnabled: opts.maxEnabled || 8,
    packs
  };

  function executeBootstrap() {
    vm.runInNewContext(bootstrap, { window, document, URL, console });
  }
  executeBootstrap();

  return {
    window,
    location,
    history,
    refreshConfig(config) {
      window.__daymarkSpaConfig = config;
      executeBootstrap();
    },
    styles() {
      return root.children.filter((element) =>
        element.tagName === 'STYLE' && element.getAttribute('data-daymark-managed') === 'true');
    },
    trigger(type) {
      for (const callback of listeners[type] || []) callback();
    },
    triggerMutations() {
      for (const observer of observers) observer.trigger();
    }
  };
}

test('matching-to-nonmatching pushState removes only the pack-owned CSS', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ]);
  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0].getAttribute('data-daymark-pack-id'), 'private');

  h.history.pushState({}, '', '/public');

  assert.equal(h.styles().length, 0);
});

test('nonmatching-to-matching pushState activates a future-route pack', () => {
  const h = makeHarness('https://example.com/public', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ]);
  assert.equal(h.styles().length, 0);

  h.history.pushState({}, '', '/private/home');

  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0].textContent, 'body{color:red}');
});

test('exclude transitions remove and later restore a broad matching pack', () => {
  const h = makeHarness('https://example.com/private', [
    pack('broad', ['https://example.com/*'], 'body{color:blue}', {
      excludes: ['https://example.com/admin/*']
    })
  ]);
  assert.equal(h.styles().length, 1);

  h.history.pushState({}, '', '/admin/settings');
  assert.equal(h.styles().length, 0);

  h.history.pushState({}, '', '/public');
  assert.equal(h.styles().length, 1);
});

test('multiple packs keep matching CSS and remove only scopes that no longer match', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}'),
    pack('general', ['https://example.com/*'], 'body{background:black}')
  ]);
  assert.deepEqual(h.styles().map((element) => element.getAttribute('data-daymark-pack-id')).sort(),
    ['general', 'private']);

  h.history.pushState({}, '', '/public');

  assert.deepEqual(h.styles().map((element) => element.getAttribute('data-daymark-pack-id')),
    ['general']);
  assert.equal(h.styles()[0].textContent, 'body{background:black}');
});

test('per-site pause applies to the host and its subdomains', () => {
  const pausedPack = pack('paused', ['*://*/*'], 'body{display:none}', {
    disabledSites: ['example.com']
  });
  const apex = makeHarness('https://example.com/private', [pausedPack]);
  const subdomain = makeHarness('https://news.example.com/private', [pausedPack]);
  const other = makeHarness('https://other.example.net/private', [pausedPack]);

  assert.equal(apex.styles().length, 0);
  assert.equal(subdomain.styles().length, 0);
  assert.equal(other.styles().length, 1);
});

test('hash-only navigation does not change path-scoped matching', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ]);
  h.location.href = 'https://example.com/private/home#public';
  h.trigger('hashchange');
  assert.equal(h.styles().length, 1);
});

test('replaceState, popstate and mutation fallback re-evaluate the current URL', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ]);
  h.history.replaceState({}, '', '/public');
  assert.equal(h.styles().length, 0);

  h.location.href = 'https://example.com/private/again';
  h.trigger('popstate');
  assert.equal(h.styles().length, 1);

  h.location.href = 'https://example.com/public-again';
  h.triggerMutations();
  assert.equal(h.styles().length, 0);
});

test('userscript-created GM_addStyle nodes are removed with their owning pack', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('script-only', ['https://example.com/private/*'], '')
  ]);
  const style = h.window.__daymarkAddStyle('script-only', 'body{color:purple}');
  assert.ok(style);
  assert.equal(h.styles().length, 1);

  h.history.pushState({}, '', '/public');

  assert.equal(h.styles().length, 0);
});

test('a later empty configuration removes styles from packs that were disabled or removed', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ]);
  assert.equal(h.styles().length, 1);

  h.refreshConfig({
    expectedUrl: h.location.href,
    maxEnabled: 8,
    packs: []
  });

  assert.equal(h.styles().length, 0);
});

test('a stale page-bound bootstrap cannot install or mutate extension state', () => {
  const h = makeHarness('https://example.com/private/home', [
    pack('private', ['https://example.com/private/*'], 'body{color:red}')
  ], { expectedUrl: 'https://example.com/other' });
  assert.equal(h.window.__daymarkSpaState, undefined);
  assert.equal(h.styles().length, 0);
});

test('only the first eight matching packs own styles on a page', () => {
  const packs = [];
  for (let i = 0; i < 10; i++) {
    packs.push(pack('pack-' + i, ['https://example.com/*'], 'body{--pack:' + i + '}'));
  }
  const h = makeHarness('https://example.com/home', packs);
  assert.equal(h.styles().length, 8);
  assert.equal(h.styles().some((element) => element.getAttribute('data-daymark-pack-id') === 'pack-8'), false);
  assert.equal(h.styles().some((element) => element.getAttribute('data-daymark-pack-id') === 'pack-9'), false);
});
