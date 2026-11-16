const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const tokens = require('../design-tokens.js');

const moduleSource = fs.readFileSync(path.join(__dirname, '..', 'design-tokens.js'), 'utf8');

test('themes are exactly light and dark and frozen', () => {
  assert.deepStrictEqual([...tokens.THEMES], ['light', 'dark']);
  assert.throws(() => { 'use strict'; tokens.THEMES.push('retro'); });
});

test('token catalog is non-empty and well-formed', () => {
  const all = tokens.listTokens();
  assert.ok(all.length >= 30, 'expected a substantial catalog, got ' + all.length);
  const names = new Set();
  for (const t of all) {
    assert.strictEqual(typeof t.name, 'string');
    assert.ok(t.name.length > 0);
    assert.ok(!names.has(t.name), 'duplicate token name ' + t.name);
    names.add(t.name);
    assert.ok(t.cssVar.startsWith('--daymark-'), 'cssVar must be namespaced: ' + t.cssVar);
    assert.strictEqual(typeof t.description, 'string');
    assert.ok(t.description.length > 10, 'token ' + t.name + ' needs a real description');
    assert.strictEqual(typeof t.category, 'string');
  }
});

test('catalog covers the required semantic categories', () => {
  const cats = tokens.listCategories();
  for (const c of ['color', 'typography', 'spacing', 'sizing', 'radius', 'elevation', 'border', 'motion', 'touch']) {
    assert.ok(cats.includes(c), 'missing category ' + c);
  }
});

test('accent token keeps the brand accent; default theme is light', () => {
  assert.strictEqual(tokens.getToken('accent', 'light').value, '#16705f');
  assert.strictEqual(tokens.getToken('accent', 'dark').value, '#16705f');
  assert.strictEqual(tokens.getToken('accent').value, '#16705f');
});

test('color tokens resolve per theme and the two themes differ', () => {
  const light = tokens.getToken('surface', 'light');
  const dark = tokens.getToken('surface', 'dark');
  assert.strictEqual(light.value, '#f2f5f7');
  assert.strictEqual(dark.value, '#0e1216');
  assert.notStrictEqual(light.value, dark.value);
});

test('theme-independent tokens resolve to the same value in both themes', () => {
  for (const theme of ['light', 'dark']) {
    assert.strictEqual(tokens.getToken('space-4', theme).value, '16px');
    assert.strictEqual(tokens.getToken('touch-target-min', theme).value, '44px');
  }
});

test('getToken fails closed on unknown names and invalid themes', () => {
  assert.strictEqual(tokens.getToken('no-such-token', 'light'), null);
  assert.strictEqual(tokens.getToken('accent', 'retro'), null);
  assert.strictEqual(tokens.getToken(42, 'light'), null);
  assert.strictEqual(tokens.getToken('', 'light'), null);
});

test('every color value is a strict hex literal', () => {
  for (const t of tokens.listTokens()) {
    if (t.category !== 'color') continue;
    for (const key of ['light', 'dark']) {
      const raw = tokens.getToken(t.name, key).value;
      assert.match(raw, /^#[0-9a-f]{6}$/, t.name + '/' + key + ' value ' + raw);
    }
  }
});

test('cssVariableLines produces unique, well-formed declarations', () => {
  const lines = tokens.cssVariableLines('light');
  const darkLines = tokens.cssVariableLines('dark');
  assert.strictEqual(lines.length, tokens.listTokens().length);
  const seen = new Set();
  for (const line of lines) {
    assert.match(line, /^--[a-z0-9-]+: .+;$/, 'bad declaration: ' + line);
    const varName = line.slice(0, line.indexOf(':'));
    assert.ok(!seen.has(varName), 'duplicate var ' + varName);
    seen.add(varName);
  }
  assert.strictEqual(darkLines.length, lines.length);
});

test('cssVariableLines fails closed on an invalid theme', () => {
  assert.strictEqual(tokens.cssVariableLines('retro'), null);
});

test('buildStylesheet wraps declarations in a :root block', () => {
  const css = tokens.buildStylesheet('light');
  assert.ok(css.startsWith(':root {'));
  assert.ok(css.endsWith('}\n'));
  assert.ok(css.includes('--daymark-color-accent: #16705f;'));
  assert.strictEqual(tokens.buildStylesheet('nope'), null);
});

function makeFakeDoc() {
  const created = [];
  const headChildren = [];
  const byId = new Map();
  const head = {
    appendChild(el) { headChildren.push(el); }
  };
  return {
    created,
    headChildren,
    head,
    createElement(tag) {
      const el = { tagName: String(tag).toUpperCase(), textContent: '', _children: [], appendChild(c) { this._children.push(c); } };
      Object.defineProperty(el, 'id', {
        get() { return this._id || ''; },
        set(v) { this._id = v; if (v) byId.set(v, el); }
      });
      created.push(el);
      return el;
    },
    getElementById(id) { return byId.get(id) || null; },
    appendChild(el) { headChildren.push(el); }
  };
}

test('applyTokens injects one namespaced style element', () => {
  const doc = makeFakeDoc();
  const el = tokens.applyTokens(doc, 'light');
  assert.ok(el, 'expected a style element');
  assert.strictEqual(el.tagName, 'STYLE');
  assert.strictEqual(el.id, tokens.STYLE_ID);
  assert.strictEqual(doc.headChildren.length, 1);
  assert.ok(el.textContent.startsWith(':root {'));
});

test('applyTokens is idempotent and updates the existing element', () => {
  const doc = makeFakeDoc();
  const first = tokens.applyTokens(doc, 'light');
  const second = tokens.applyTokens(doc, 'dark');
  assert.strictEqual(first, second);
  assert.strictEqual(doc.created.length, 1, 'must not create a second style element');
  assert.strictEqual(doc.headChildren.length, 1);
  assert.ok(second.textContent.includes('--daymark-color-surface: #0e1216;'), 'dark values applied on update');
});

test('applyTokens fails closed without a usable document', () => {
  assert.strictEqual(tokens.applyTokens(null, 'light'), null);
  assert.strictEqual(tokens.applyTokens({}, 'light'), null);
  assert.strictEqual(tokens.applyTokens({ createElement() { return {}; } }, 'light'), null);
});

test('resolveTheme reads prefers-color-scheme and fails safe', () => {
  assert.strictEqual(tokens.resolveTheme(() => ({ matches: true })), 'dark');
  assert.strictEqual(tokens.resolveTheme(() => ({ matches: false })), 'light');
  assert.strictEqual(tokens.resolveTheme(null), 'light');
  assert.strictEqual(tokens.resolveTheme('not a function'), 'light');
  assert.strictEqual(tokens.resolveTheme(() => { throw new Error('boom'); }), 'light');
});

test('module stays offline-first: no network, storage or timers', () => {
  assert.ok(!moduleSource.includes('fetch('), 'no fetch allowed');
  assert.ok(!moduleSource.includes('XMLHttpRequest'), 'no XHR allowed');
  assert.ok(!moduleSource.includes('localStorage'), 'no storage reads or writes');
  assert.ok(!moduleSource.includes('sessionStorage'), 'no storage reads or writes');
  assert.ok(!moduleSource.includes('setTimeout'), 'no timers');
  assert.ok(!moduleSource.includes('http://'), 'no cleartext endpoints');
});
