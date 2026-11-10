'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bootstrap = fs.readFileSync(
  path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'assets', 'daymark-extension-spa.js'),
  'utf8'
);
const injectorSource = fs.readFileSync(
  path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'java', 'com', 'abrar', 'daymark', 'ExtensionInjector.java'),
  'utf8'
);
const runtimeSource = fs.readFileSync(
  path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'java', 'com', 'abrar', 'daymark', 'ExtensionRuntime.java'),
  'utf8'
);
const webViewSource = fs.readFileSync(
  path.join(__dirname, '..', 'android-app', 'app', 'src', 'main', 'java', 'com', 'abrar', 'daymark', 'DaymarkWebView.java'),
  'utf8'
);
const execute = new Function('window', 'document', 'config', 'return (' + bootstrap + ')(config);');

function makeHarness(initialUrl) {
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
    querySelectorAll(selector) {
      assert.equal(selector, 'style[data-daymark-managed="true"]');
      return root.children.filter((element) =>
        element.tagName === 'STYLE' && element.getAttribute('data-daymark-managed') === 'true');
    },
    createElement(tagName) {
      const attributes = Object.create(null);
      return {
        tagName: String(tagName).toUpperCase(),
        parentNode: null,
        textContent: '',
        setAttribute(name, value) { attributes[name] = String(value); },
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
        }
      };
    }
  };
  const window = { location: { href: initialUrl } };

  function reconcile(url, packs) {
    window.location.href = url;
    const config = { expectedUrl: url, packs };
    execute(window, document, config);
    return JSON.stringify(config);
  }

  return {
    window,
    document,
    reconcile,
    styles() { return document.querySelectorAll('style[data-daymark-managed="true"]'); },
    addUserStyle(packId, css) {
      const element = document.createElement('style');
      element.setAttribute('data-daymark-managed', 'true');
      element.setAttribute('data-daymark-pack-id', packId);
      element.setAttribute('data-daymark-pack-css', 'false');
      element.textContent = css;
      root.appendChild(element);
      return element;
    }
  };
}

function pack(id, css) {
  return { id, css };
}

test('a matching page receives only its current pack CSS', () => {
  const h = makeHarness('https://example.com/private/home');
  const serialized = h.reconcile('https://example.com/private/home', [
    pack('private-pack', 'body{color:red}')
  ]);

  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0].getAttribute('data-daymark-pack-id'), 'private-pack');
  assert.equal(h.styles()[0].textContent, 'body{color:red}');
  assert.match(serialized, /private-pack/);
  assert.doesNotMatch(serialized, /other-site|disabledSites|matches|excludes/);
});

test('a nonmatching page receives an empty config and no other pack metadata', () => {
  const h = makeHarness('https://news.example.net/');
  const serialized = h.reconcile('https://news.example.net/', []);

  assert.equal(h.styles().length, 0);
  assert.equal(serialized, '{"expectedUrl":"https://news.example.net/","packs":[]}');
  assert.deepEqual(Object.keys(h.window), ['location']);
});

test('a transition to a nonmatching route removes previously owned styles', () => {
  const h = makeHarness('https://example.com/private/home');
  h.reconcile('https://example.com/private/home', [
    pack('private-pack', 'body{color:red}')
  ]);
  assert.equal(h.styles().length, 1);

  h.reconcile('https://example.com/public/home', []);

  assert.equal(h.styles().length, 0);
});

test('a transition from a nonmatching route can activate only newly matching packs', () => {
  const h = makeHarness('https://example.com/public/home');
  h.reconcile('https://example.com/public/home', []);
  assert.equal(h.styles().length, 0);

  const serialized = h.reconcile('https://example.com/private/home', [
    pack('private-pack', 'body{color:red}')
  ]);

  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0].getAttribute('data-daymark-pack-id'), 'private-pack');
  assert.match(serialized, /private-pack/);
});

test('multiple current packs remain while a no-longer-matching pack is removed', () => {
  const h = makeHarness('https://example.com/private/home');
  h.reconcile('https://example.com/private/home', [
    pack('private', 'body{color:red}'),
    pack('general', 'body{background:black}')
  ]);
  assert.deepEqual(h.styles().map((element) =>
    element.getAttribute('data-daymark-pack-id')).sort(), ['general', 'private']);

  h.reconcile('https://example.com/public/home', [
    pack('general', 'body{background:black}')
  ]);

  assert.deepEqual(h.styles().map((element) =>
    element.getAttribute('data-daymark-pack-id')), ['general']);
  assert.equal(h.styles()[0].textContent, 'body{background:black}');
});

test('userscript-created styles survive only while their owning pack still matches', () => {
  const h = makeHarness('https://example.com/private/home');
  h.reconcile('https://example.com/private/home', [
    pack('script-pack', '')
  ]);
  const userStyle = h.addUserStyle('script-pack', 'body{color:purple}');
  assert.equal(h.styles().length, 1);

  h.reconcile('https://example.com/public/home', []);

  assert.equal(h.styles().length, 0);
  assert.equal(userStyle.parentNode, null);
});

test('empty CSS removes only the pack CSS and preserves matching userscript styles', () => {
  const h = makeHarness('https://example.com/private/home');
  h.reconcile('https://example.com/private/home', [
    pack('script-pack', 'body{color:red}')
  ]);
  const userStyle = h.addUserStyle('script-pack', 'body{color:purple}');

  h.reconcile('https://example.com/private/home', [
    pack('script-pack', '')
  ]);

  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0], userStyle);
});

test('stale page-bound config cannot mutate the current document', () => {
  const h = makeHarness('https://example.com/current');
  h.reconcile('https://example.com/current', [
    pack('current', 'body{color:red}')
  ]);
  const before = h.styles()[0];

  execute(h.window, h.document, {
    expectedUrl: 'https://example.com/old',
    packs: [pack('stale', 'body{display:none}')]
  });

  assert.equal(h.styles().length, 1);
  assert.equal(h.styles()[0], before);
});

test('bootstrap does not install page-readable config, state, or SPA hooks', () => {
  assert.doesNotMatch(bootstrap, /window\.__daymarkSpaConfig/);
  assert.doesNotMatch(bootstrap, /window\.__daymarkSpaState/);
  assert.doesNotMatch(bootstrap, /window\.__daymarkAddStyle/);
  assert.doesNotMatch(bootstrap, /history\.(pushState|replaceState)/);
  assert.doesNotMatch(bootstrap, /MutationObserver|popstate|hashchange/);
  assert.match(bootstrap, /^\(function \(config\)/);
});

test('native same-document history updates run only after initial document injection', () => {
  const historyStart = webViewSource.indexOf('public void doUpdateVisitedHistory');
  const historyEnd = webViewSource.indexOf('public void onPageFinished', historyStart);
  const historyCallback = webViewSource.slice(historyStart, historyEnd);
  assert.match(historyCallback, /extensionRuntime\.onSameDocumentNavigation\(view, url\)/);
  assert.doesNotMatch(historyCallback, /getProgress\(\)\s*<\s*100/);

  const runtimeStart = runtimeSource.indexOf('void onSameDocumentNavigation');
  const runtimeEnd = runtimeSource.indexOf('private List<BrowserExtension> matchingPacks', runtimeStart);
  const runtimeCallback = runtimeSource.slice(runtimeStart, runtimeEnd);
  assert.match(runtimeCallback, /userscriptsAppliedForCurrentDocument/);
  assert.match(runtimeCallback, /BrowserAddress\.isAllowedWebUrl\(url\)/);
  assert.match(runtimeCallback, /url\.equals\(lastAppliedUrl\)/);
  assert.match(runtimeSource, /if \(ExtensionInjector\.apply\(webView, url, matching\)\) \{\s*userscriptsAppliedForCurrentDocument = true;/);
});

test('userscript duplicate suppression stays native and exposes no page-global pack registry', () => {
  assert.doesNotMatch(injectorSource, /window\.__daymarkRan/);
  assert.match(runtimeSource, /userscriptsAppliedForCurrentDocument/);
  assert.match(runtimeSource, /userscriptsAppliedForCurrentDocument\s*=\s*false/);
  assert.match(runtimeSource, /if\s*\(userscriptsAppliedForCurrentDocument\)/);
  assert.match(runtimeSource, /ExtensionInjector\.applyStyles\(webView, url, matching\)/);
});
