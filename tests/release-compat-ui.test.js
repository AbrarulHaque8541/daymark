'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { attachReleaseCompatUi } = require('../js/release-compat-ui.js');
const logic = require('../js/release-compat-logic.js');

function makeElement(tag) {
  const cls = new Set();
  const listeners = {};
  const attrs = {};
  const children = [];
  const el = {
    tagName: tag,
    className: '',
    _text: '',
    value: '',
    listeners,
    attrs,
    children,
    get firstChild() { return children.length > 0 ? children[0] : null; },
    get textContent() {
      if (children.length > 0) return children.map((c) => c.textContent).join('');
      return this._text;
    },
    set textContent(v) { this._text = String(v); children.length = 0; },
    appendChild(c) { children.push(c); return c; },
    removeChild(c) { const i = children.indexOf(c); if (i !== -1) children.splice(i, 1); return c; },
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c)
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    emit(type, event) { (listeners[type] || []).forEach((fn) => fn(event)); }
  };
  return el;
}

function makeDoc(map) {
  const els = new Map(Object.keys(map || {}).map((k) => [k, map[k]]));
  return {
    readyState: 'complete',
    getElementById(id) { return els.get(id) || null; },
    createElement: (t) => makeElement(t),
    addEventListener() {}
  };
}

function makeCard() {
  const els = {
    'release-compat-topic': makeElement('select'),
    'release-compat-status': makeElement('p'),
    'release-compat-result': makeElement('div'),
    'release-compat-form': makeElement('form'),
    'release-compat-clear': makeElement('button')
  };
  els['release-compat-topic'].value = 'package-identity';
  const doc = makeDoc(els);
  return { doc, els };
}

test('ui module exports attachReleaseCompatUi', () => {
  assert.equal(typeof attachReleaseCompatUi, 'function');
});

test('boot explains the default topic without any call', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: logic });
  assert.equal(els['release-compat-status'].textContent, 'Explained · Package identity stays put · already pinned');
  const result = els['release-compat-result'];
  const explained = logic.explainTopic('package-identity');
  assert.equal(result.children.length, 1 + explained.keepsWorking.length + explained.breaksIfIgnored.length + 4);
  assert.equal(result.children[0].children[0].textContent, 'com.abrar.daymark is the app for life, not per version');
});

test('rendered explanation carries all six fixed line prefixes', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: logic });
  const text = els['release-compat-result'].textContent;
  for (const prefix of ['Stays true · ', 'Breaks if ignored · ', 'Action required · ', 'Recovery · ', 'Scope · ', 'Network · ']) {
    assert.ok(text.indexOf(prefix) !== -1, prefix);
  }
});

test('change event explains data migration with action-required status', () => {
  const { doc, els } = makeCard();
  const ui = attachReleaseCompatUi({ document: doc, dataApi: logic });
  els['release-compat-topic'].value = 'data-migration';
  els['release-compat-topic'].emit('change');
  assert.equal(els['release-compat-status'].textContent, 'Explained · Data survives the upgrade · action required');
  assert.ok(els['release-compat-result'].textContent.indexOf('Encrypted on-device data must survive every version step') !== -1);
  assert.equal(typeof ui.explain, 'function');
});

test('submit prevents default and explains updater security', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: logic });
  els['release-compat-topic'].value = 'updater-security';
  const ev = { prevented: false, preventDefault() { this.prevented = true; } };
  els['release-compat-form'].emit('submit', ev);
  assert.equal(ev.prevented, true);
  assert.equal(els['release-compat-status'].textContent, 'Explained · The updater stays HTTPS-only · already pinned');
  assert.ok(els['release-compat-result'].textContent.indexOf('Release downloads ride the strict path, never the browser one') !== -1);
});

test('unknown topic fails closed and runs nothing', () => {
  const { doc, els } = makeCard();
  const ui = attachReleaseCompatUi({ document: doc, dataApi: logic });
  els['release-compat-topic'].value = 'not-a-real-topic';
  ui.explain();
  assert.equal(els['release-compat-status'].textContent, 'Unavailable · Unknown release topic · no action was run');
  assert.equal(els['release-compat-result'].children[0].children[0].textContent, 'This topic is not known');
});

test('empty topic falls back to fail-closed explanation', () => {
  const { doc, els } = makeCard();
  const ui = attachReleaseCompatUi({ document: doc, dataApi: logic });
  els['release-compat-topic'].value = '';
  ui.explain();
  assert.equal(els['release-compat-status'].textContent, 'Unavailable · Unknown release topic · no action was run');
});

test('onClear empties the result and reports the honest status', () => {
  const { doc, els } = makeCard();
  const ui = attachReleaseCompatUi({ document: doc, dataApi: logic });
  ui.onClear();
  assert.equal(els['release-compat-result'].children.length, 0);
  assert.equal(els['release-compat-status'].textContent, 'Explanation cleared; no setting, build or release was changed.');
});

test('clear button carries label and honest aria-label', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: logic });
  assert.equal(els['release-compat-clear'].textContent, 'Clear explanation');
  assert.equal(els['release-compat-clear'].getAttribute('aria-label'), 'Clear explanation only; no setting, build or release is changed');
});

test('clear click empties the rendered explanation', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: logic });
  assert.ok(els['release-compat-result'].children.length > 0);
  els['release-compat-clear'].emit('click');
  assert.equal(els['release-compat-result'].children.length, 0);
});

test('missing engine degrades to an unavailable status', () => {
  const { doc, els } = makeCard();
  attachReleaseCompatUi({ document: doc, dataApi: {} });
  assert.equal(els['release-compat-status'].textContent, 'Release-compatibility explanations are unavailable.');
  assert.equal(els['release-compat-result'].children.length, 0);
});

test('attachReleaseCompatUi requires a document', () => {
  let message = '';
  try { attachReleaseCompatUi({}); } catch (e) { message = e.message; }
  assert.equal(message, 'attachReleaseCompatUi requires a document.');
});

test('missing elements are tolerated without throwing', () => {
  const handle = attachReleaseCompatUi({ document: makeDoc({}), dataApi: logic });
  handle.explain();
  handle.onClear();
  handle.detach();
  assert.ok(true);
});

test('boot works even when env storage access throws', () => {
  const { doc, els } = makeCard();
  const env = { document: doc, dataApi: logic };
  Object.defineProperty(env, 'localStorage', {
    get() { throw new Error('blocked storage'); },
    configurable: true
  });
  attachReleaseCompatUi(env);
  assert.ok(els['release-compat-result'].children.length > 0);
});

test('index.html wires the card, ids and both scripts', () => {
  const fx = (typeof globalThis.__DAYMARK_FIXTURES__ === 'object' && globalThis.__DAYMARK_FIXTURES__) || {};
  let index = null;
  let required = null;
  try { index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'); } catch (e) { index = fx.index || null; }
  try { required = fs.readFileSync(path.join(__dirname, '..', 'tests', 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8'); } catch (e) { required = fx.required || null; }
  assert.ok(index, 'index.html readable for the wiring pin');
  assert.ok(required, 'REQUIRED Node test list readable for the wiring pin');
  for (const id of ['release-compat-card', 'release-compat-heading', 'release-compat-form', 'release-compat-topic', 'release-compat-explain', 'release-compat-clear', 'release-compat-status', 'release-compat-result']) {
    assert.ok(index.indexOf('id="' + id + '"') !== -1, id);
  }
  assert.ok(index.indexOf('<script src="release-compat-logic.js" defer></script>') !== -1);
  assert.ok(index.indexOf('<script src="release-compat-ui.js" defer></script>') !== -1);
  assert.ok(index.indexOf('tests/release-compat-logic.test.js') === -1);
  assert.ok(required.indexOf('tests/release-compat-logic.test.js') !== -1);
  assert.ok(required.indexOf('tests/release-compat-ui.test.js') !== -1);
});
