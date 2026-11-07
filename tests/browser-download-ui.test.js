'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../browser-download-ui.js');
const engine = require('../browser-download-logic.js');

function makeElement(tagName) {
  const el = {
    tagName,
    className: '',
    textContent: '',
    value: '',
    children: [],
    listeners: {},
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) {
      const index = el.children.indexOf(child);
      if (index !== -1) el.children.splice(index, 1);
      return child;
    },
    addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
    preventDefault() { el.prevented = true; }
  };
  Object.defineProperty(el, 'firstChild', {
    get() { return el.children.length ? el.children[0] : null; }
  });
  return el;
}

function makeDoc(ids) {
  const elements = {};
  for (const id of ids) elements[id] = makeElement(id.includes('form') ? 'form' : 'div');
  return {
    elements,
    getElementById(id) { return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null; },
    createElement(tagName) { return makeElement(tagName); }
  };
}

const ALL_IDS = ['browser-download-scenario', 'browser-download-status', 'browser-download-result',
  'browser-download-form', 'browser-download-clear'];

test('attachBrowserDownloadUi requires a document', () => {
  assert.throws(() => ui.attachBrowserDownloadUi(null), /requires a document/);
  assert.throws(() => ui.attachBrowserDownloadUi({}), /requires a document/);
});

test('the card plans the selected journey at boot', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const status = doc.elements['browser-download-status'].textContent;
  const result = doc.elements['browser-download-result'];
  assert.match(status, /Planned \u00b7 report\.pdf/);
  assert.match(status, /safe to retry/);
  // One head item plus one detail line per planned line.
  assert.equal(result.children[0].className, 'feed-item');
  assert.equal(result.children[0].children[0].className, 'feed-item-title');
  assert.equal(result.children[0].children[0].textContent, 'report.pdf');
  assert.equal(result.children[0].children[1].className, 'feed-item-summary');
  const expected = engine.planScenario('same-origin-redirects');
  assert.equal(result.children.length, 1 + expected.lines.length);
  for (let i = 1; i < result.children.length; i += 1) {
    assert.match(result.children[i].textContent, new RegExp('^' + i + '\\. '));
  }
  assert.equal(typeof handle.plan, 'function');
});

test('changing the journey re-plans, and non-retryable downloads say so', () => {
  const doc = makeDoc(ALL_IDS);
  const scenario = doc.elements['browser-download-scenario'];
  scenario.value = 'expired-link';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const change = scenario.listeners.change;
  assert.ok(change && change.length === 1, 'a change listener must be wired');
  change[0]();
  const status = doc.elements['browser-download-status'].textContent;
  assert.match(status, /do not just retry/);
  assert.doesNotMatch(status, /safe to retry/);
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'old.pdf');
});

test('an unknown journey value fails closed to not-checkable', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'definitely-not-a-journey';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  assert.match(doc.elements['browser-download-status'].textContent, /Not checkable/);
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'Not checkable');
  assert.equal(result.children.length, 1);
  assert.match(result.children[0].children[1].textContent, /not known/);
});

test('a suspicious filename discloses the sanitization honestly', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'spoofed-filename';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const result = doc.elements['browser-download-result'];
  assert.equal(result.children[0].children[0].textContent, 'evilexe.exe');
  assert.match(result.children[0].children[1].textContent, /unsafe characters; they were removed/);
});

test('form submit re-plans and the clear button empties the card', () => {
  const doc = makeDoc(ALL_IDS);
  const form = doc.elements['browser-download-form'];
  const clear = doc.elements['browser-download-clear'];
  doc.elements['browser-download-scenario'].value = 'cross-origin-redirect';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  const submit = form.listeners.submit;
  const click = clear.listeners.click;
  assert.ok(submit && submit.length === 1, 'a submit listener must be wired');
  assert.ok(click && click.length === 1, 'a click listener must be wired');
  const event = makeElement('event');
  submit[0](event);
  assert.equal(event.prevented, true, 'submit must not actually submit');
  assert.match(doc.elements['browser-download-result'].children[0].children[1].textContent,
    /arrives from https:\/\/files\.other\.net/);
  click[0]();
  assert.equal(doc.elements['browser-download-result'].children.length, 0);
  assert.match(doc.elements['browser-download-status'].textContent, /Cleared\./);
});

test('a missing engine degrades honestly instead of guessing', () => {
  const doc = makeDoc(ALL_IDS);
  doc.elements['browser-download-scenario'].value = 'same-origin-redirects';
  ui.attachBrowserDownloadUi({ document: doc, downloadApi: null });
  assert.equal(doc.elements['browser-download-status'].textContent,
    'Download planning is unavailable.');
  assert.equal(doc.elements['browser-download-result'].children.length, 0);
});

test('missing elements never throw; the card simply does less', () => {
  const doc = makeDoc(['browser-download-scenario']);
  const handle = ui.attachBrowserDownloadUi({ document: doc, downloadApi: engine });
  assert.equal(typeof handle.plan, 'function');
  handle.plan(); // no status/result elements: must be a no-op, not a crash
  handle.onClear();
  handle.detach();
});
