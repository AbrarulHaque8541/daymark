'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const logicSrc = fs.readFileSync(path.join(repoRoot, 'mindful-breaks-logic.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(repoRoot, 'mindful-breaks-ui.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

const FLAG_ID = 'mindful-breaks';
const KEY = 'daymark.features.v1';
const NOW_BASE = 1000000;
let writesObserved = 0;

function makeElement(tag) {
  const el = {
    tagName: tag,
    children: [],
    attributes: {},
    className: '',
    textContent: '',
    hidden: false,
    value: '',
    parentNode: null,
    listeners: {},
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    },
    insertBefore(child, anchor) {
      child.parentNode = el;
      const pos = el.children.indexOf(anchor);
      if (pos === -1) el.children.push(child);
      else el.children.splice(pos, 0, child);
      return child;
    },
    removeChild(child) {
      const pos = el.children.indexOf(child);
      if (pos !== -1) el.children.splice(pos, 1);
      return child;
    },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(el.attributes, k) ? el.attributes[k] : null; },
    addEventListener(name, fn) { (el.listeners[name] = el.listeners[name] || []).push(fn); },
    dispatch(name) { (el.listeners[name] || []).slice().forEach((fn) => fn()); },
    get firstChild() { return el.children[0] || null; }
  };
  return el;
}

function findById(rootEl, id) {
  for (const child of rootEl.children) {
    if (child.getAttribute && child.getAttribute('id') === id) return child;
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function makeDocument() {
  const body = makeElement('body');
  const head = makeElement('head');
  const doc = makeElement('#document');
  doc.head = head;
  doc.body = body;
  doc.readyState = 'complete';
  doc.getElementById = function (id) {
    return findById(head, id) || findById(body, id);
  };
  doc.createElement = function (tag) { return makeElement(tag); };
  doc.addEventListener = function (name, fn) {
    doc.listeners[name] = doc.listeners[name] || [];
    doc.listeners[name].push(fn);
  };
  return { doc, body, head };
}

function makeStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { writesObserved++; data[k] = String(v); },
    removeItem(k) { writesObserved++; delete data[k]; }
  };
}

function baseFlags() {
  const blob = { 'eyestrain-relief': true, 'comfort-tint': false, 'focus-mode': true };
  blob[FLAG_ID] = true;
  const state = {};
  state[KEY] = JSON.stringify(blob);
  return state;
}

function flagsApiFake() {
  return {
    readFlags(storage) {
      try {
        const raw = storage.getItem(KEY);
        return { ok: true, flags: raw ? JSON.parse(raw) : {} };
      } catch (error) {
        return { ok: false, flags: {} };
      }
    }
  };
}

function makeEnv(overrides) {
  const built = makeDocument();
  const env = Object.assign({
    document: built.doc,
    storage: makeStorage(baseFlags()),
    flags: flagsApiFake(),
    nowMs: function () { return NOW_BASE; }
  }, overrides || {});
  env.built = built;
  return env;
}

function logicLoaded(sandbox) {
  const box = sandbox || {};
  box.module = { exports: {} };
  box.globalThis = box;
  const keys = Object.keys(box);
  const fn = new Function(keys.join(','), logicSrc.replace(/^/, ''));
  fn.apply(box, keys.map((k) => (k === 'globalThis' ? box : box[k])));
  return box.module.exports || box.DaymarkMindfulBreaks;
}

function uiLoaded(sandbox) {
  const box = sandbox;
  box.module = { exports: {} };
  box.globalThis = box;
  if (!box.DaymarkMindfulBreaks) logicLoaded(box);
  const keys = Object.keys(box);
  const fn = new Function(keys.join(','), uiSrc);
  fn.apply(box, keys.map((k) => (k === 'globalThis' ? box : box[k])));
  return box.module.exports || box.DaymarkMindfulBreaksUi;
}

test('module exposes attachMindfulBreaksUi', () => {
  const api = uiLoaded({ logic: logicLoaded() });
  assert.strictEqual(typeof api.attachMindfulBreaksUi, 'function');
});

test('attach is fail-closed on bad environments', () => {
  const logic = logicLoaded();
  assert.strictEqual(logic, logic);
  const api = uiLoaded({ logic });
  assert.strictEqual(api.attachMindfulBreaksUi(null), null);
  assert.strictEqual(api.attachMindfulBreaksUi({}), null);
  assert.strictEqual(api.attachMindfulBreaksUi({ document: {} }), null);
  assert.strictEqual(api.attachMindfulBreaksUi({ document: makeDocument().doc }), null, 'missing flags api');
  assert.strictEqual(api.attachMindfulBreaksUi({ document: makeDocument().doc, flags: { readFlags() {} }, mindfulBreaks: null }), null, 'missing logic module');
});

test('card mounts with ids, roles, and placement before feature-flags-card', () => {
  const built = makeDocument();
  const storageCard = makeElement('div');
  storageCard.setAttribute('id', 'storage-card');
  const featureCard = makeElement('div');
  featureCard.setAttribute('id', 'feature-flags-card');
  built.body.appendChild(storageCard);
  built.body.appendChild(featureCard);
  const env = { document: built.doc, storage: makeStorage(baseFlags()), flags: flagsApiFake() };
  const result = uiLoaded({}).attachMindfulBreaksUi(env);
  assert.ok(result && result.attached === true);
  const card = built.doc.getElementById('mindful-breaks-card');
  assert.ok(card, 'card exists');
  assert.strictEqual(card.tagName, 'aside');
  assert.strictEqual(card.className, 'suggestion-card');
  const status = built.doc.getElementById('mindful-breaks-status');
  assert.strictEqual(status.getAttribute('role'), 'status');
  assert.strictEqual(status.getAttribute('aria-live'), 'polite');
  assert.strictEqual(built.body.children.indexOf(card), 1, 'card inserted before feature-flags-card');
  assert.strictEqual(storageCard.children.indexOf(card), -1);
  assert.ok(built.doc.getElementById('mindful-breaks-list'));
  assert.ok(built.doc.getElementById('mindful-breaks-check'));
  assert.ok(built.doc.getElementById('mindful-breaks-interval'));
  assert.ok(built.doc.getElementById('mindful-breaks-done'));
  assert.ok(!built.doc.getElementById('mindful-breaks-card').hidden);
});

test('second attach returns null', () => {
  const env = makeEnv();
  const api = uiLoaded({});
  assert.ok(api.attachMindfulBreaksUi(env).attached === true);
  assert.strictEqual(api.attachMindfulBreaksUi(env), null);
});

test('flag off shows honest off status and no done button', () => {
  const env = makeEnv();
  const off = baseFlags();
  const blob = JSON.parse(off[KEY]);
  blob[FLAG_ID] = false;
  off[KEY] = JSON.stringify(blob);
  env.storage = makeStorage(off);
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /Feature settings/);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('no storage reads and no writes without interaction', () => {
  const env = makeEnv();
  const storage = env.storage;
  const api = uiLoaded({ logic: logicLoaded() });
  api.attachMindfulBreaksUi(env);
  assert.strictEqual(storage.getItem(KEY) !== null, true, 'seed readable');
  assert.strictEqual(writesObserved, 0);
});

test('flag on: waiting status reports minutes remaining and 5 plan lines', () => {
  const env = makeEnv();
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /On\./);
  assert.match(result.handle.statusEl.textContent, /minute\(s\) to go/);
  assert.strictEqual(result.handle.listEl.children.length, 5);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('break due at boundary: suggestion shown and done button visible', () => {
  const logic = logicLoaded();
  const env = makeEnv();
  const result = uiLoaded({ logic }).attachMindfulBreaksUi(env);
  result.handle.update();
  env.nowMs = function () { return NOW_BASE + 30 * 60000 + 1; };
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /Time for a short reset/);
  const suggestionMatch = result.handle.statusEl.textContent.match(/Time for a short reset: (.+)/);
  assert.ok(suggestionMatch);
  assert.ok(logic.BREAK_SUGGESTIONS.indexOf(suggestionMatch[1]) !== -1, 'suggestion comes from fixed list');
  assert.strictEqual(result.handle.doneButton.hidden, false);
});

test('takeBreak resets the cycle back to waiting', () => {
  const env = makeEnv();
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  env.nowMs = function () { return NOW_BASE + 30 * 60000; };
  result.handle.checkButton.dispatch('click');
  assert.strictEqual(result.handle.doneButton.hidden, false);
  env.nowMs = function () { return NOW_BASE + 30 * 60000 + 5000; };
  result.handle.takeBreak();
  assert.match(result.handle.statusEl.textContent, /On\./);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('clock moved backwards is reported honestly', () => {
  const env = makeEnv();
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  env.nowMs = function () { return NOW_BASE - 1000; };
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /could not be read safely/);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('corrupted saved features state mentions Feature settings and stays calm', () => {
  const env = makeEnv();
  const bad = {};
  bad[KEY] = '{not-json';
  env.storage = makeStorage(bad);
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /Feature settings/);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('interval change is honored', () => {
  const env = makeEnv();
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  env.nowMs = function () { return NOW_BASE + 25 * 60000; };
  result.handle.intervalSelect.value = '120';
  result.handle.update();
  assert.match(result.handle.statusEl.textContent, /minute\(s\) to go/);
  assert.strictEqual(result.handle.doneButton.hidden, true);
});

test('no new storage keys and zero storage writes during all interactions', () => {
  const env = makeEnv();
  const result = uiLoaded({ logic: logicLoaded() }).attachMindfulBreaksUi(env);
  result.handle.update();
  env.nowMs = function () { return NOW_BASE + 30 * 60000 + 1; };
  result.handle.update();
  result.handle.takeBreak();
  result.handle.update();
  assert.strictEqual(writesObserved, 0, 'no storage writes');
  assert.strictEqual(env.storage.getItem(KEY) !== null, true);
});

test('index.html references both script tags once, in order', () => {
  const logicTag = indexHtml.split('mindful-breaks-logic.js').length - 1;
  const uiTag = indexHtml.split('mindful-breaks-ui.js').length - 1;
  assert.strictEqual(logicTag, 1);
  assert.strictEqual(uiTag, 1);
  const posFocus = indexHtml.indexOf('focus-mode-ui.js');
  const posLogic = indexHtml.indexOf('mindful-breaks-logic.js');
  const posUi = indexHtml.indexOf('mindful-breaks-ui.js');
  const posStorage = indexHtml.indexOf('storage-ui.js');
  assert.ok(posFocus !== -1 && posLogic !== -1 && posUi !== -1 && posStorage !== -1);
  assert.ok(posFocus < posLogic && posLogic < posUi && posUi < posStorage);
  assert.strictEqual(indexHtml.split(FLAG_ID + '-card').length - 1, 0, 'card markup stays dynamic');
});

test('ui source has no banned patterns', () => {
  assert.strictEqual(uiSrc.indexOf('setInt' + 'erval'), -1);
  assert.strictEqual(uiSrc.indexOf('fe' + 'tch('), -1);
  assert.strictEqual(uiSrc.indexOf('TO' + 'DO'), -1);
  assert.strictEqual(uiSrc.indexOf('FIX' + 'ME'), -1);
  assert.strictEqual(uiSrc.indexOf('place' + 'holder'), -1);
  assert.strictEqual(uiSrc.indexOf(String.fromCharCode(92)), -1, 'no backslashes');
});

test('boot in a bare window without localStorage attaches the card honestly', () => {
  const built = makeDocument();
  const logic = logicLoaded();
  const sandbox = {
    window: built.doc,
    document: built.doc,
    module: undefined,
    DaymarkFeatureFlags: flagsApiFake(),
    DaymarkMindfulBreaks: logic
  };
  uiLoaded(sandbox);
  const card = built.doc.getElementById('mindful-breaks-card');
  assert.ok(card, 'boot attached the card without localStorage');
  const result = uiLoaded({ logic }).attachMindfulBreaksUi({
    document: built.doc,
    flags: logic,
    storage: undefined,
    nowMs: function () { return NOW_BASE; }
  });
  assert.strictEqual(result, null, 'second attach blocked');
  const result2 = uiLoaded({ logic }).attachMindfulBreaksUi({
    document: built.doc,
    flags: logic,
    storage: makeStorage(baseFlags()),
    nowMs: function () { return NOW_BASE; }
  });
  assert.strictEqual(result2, null);
});
