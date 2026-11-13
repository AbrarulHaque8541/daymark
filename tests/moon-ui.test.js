'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const moonUi = require('../moon-ui.js');
const moon = require('../moon-logic.js');

function makeDoc() {
  const nodes = new Map();
  const bodyChildren = [];
  const body = {
    appendChild(node) {
      bodyChildren.push(node);
      if (node && node.id) nodes.set(node.id, node);
      return node;
    }
  };
  const doc = {
    body,
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        type: '',
        disabled: false,
        children: [],
        classList: {
          _set: new Set(),
          toggle(name, force) {
            if (force === true) this._set.add(name);
            else if (force === false) this._set.delete(name);
            else if (this._set.has(name)) this._set.delete(name);
            else this._set.add(name);
          },
          contains(name) { return this._set.has(name); }
        },
        attributes: {},
        parentNode: null,
        nextSibling: null,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        removeAttribute(name) { delete this.attributes[name]; },
        getAttribute(name) { return this.attributes[name]; },
        addEventListener(type, fn) {
          this._listeners = this._listeners || {};
          this._listeners[type] = this._listeners[type] || [];
          this._listeners[type].push(fn);
        },
        appendChild(child) {
          this.children.push(child);
          child.parentNode = this;
          if (child.id) nodes.set(child.id, child);
          return child;
        },
        click() {
          const list = (this._listeners && this._listeners.click) || [];
          for (const fn of list) fn({ preventDefault() {} });
        },
        submit() {
          const list = (this._listeners && this._listeners.submit) || [];
          for (const fn of list) fn({ preventDefault() {} });
        }
      };
      return el;
    },
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };
  return { doc, nodes, bodyChildren };
}

test('ensureCard injects a single moon card with required controls', () => {
  const { doc, nodes } = makeDoc();
  const card = moonUi.ensureCard(doc);
  assert.equal(card.id, 'moon-card');
  assert.ok(nodes.get('moon-heading'));
  assert.ok(nodes.get('moon-refresh'));
  assert.ok(nodes.get('moon-clear'));
  assert.ok(nodes.get('moon-status'));
  assert.ok(nodes.get('moon-result'));
  assert.equal(nodes.get('moon-status').getAttribute('role'), 'status');
  const again = moonUi.ensureCard(doc);
  assert.equal(again, card);
});

test('attachMoonUi Check fills result with offline phase line', () => {
  const { doc, nodes } = makeDoc();
  const fixed = new Date('2026-11-13T12:00:00Z');
  const api = moonUi.attachMoonUi({
    document: doc,
    moonApi: moon,
    now: () => fixed
  });
  api.check();
  const result = nodes.get('moon-result').textContent;
  assert.ok(result.length > 0, 'result should be non-empty');
  assert.ok(result.indexOf('%') !== -1 || result.indexOf('Moon') !== -1);
  const status = nodes.get('moon-status').textContent;
  assert.ok(status.indexOf('offline') !== -1 || status.indexOf('Approximate') !== -1
    || status.indexOf('Computed') !== -1);
  assert.equal(api.isBusy(), false);
});

test('attachMoonUi Clear empties the result and does not store', () => {
  const { doc, nodes } = makeDoc();
  const api = moonUi.attachMoonUi({
    document: doc,
    moonApi: moon,
    now: () => new Date('2026-11-13T12:00:00Z')
  });
  api.check();
  assert.ok(nodes.get('moon-result').textContent.length > 0);
  api.clear();
  assert.equal(nodes.get('moon-result').textContent, '');
  assert.ok(nodes.get('moon-status').textContent.indexOf('Cleared') !== -1);
});

test('missing moon API reports honest unavailability', () => {
  const { doc, nodes } = makeDoc();
  const api = moonUi.attachMoonUi({
    document: doc,
    moonApi: {},
    now: () => new Date()
  });
  api.check();
  assert.equal(nodes.get('moon-status').textContent, 'Moon phase is unavailable.');
});

test('button click path matches programmatic check', () => {
  const { doc, nodes } = makeDoc();
  moonUi.attachMoonUi({
    document: doc,
    moonApi: moon,
    now: () => new Date('2000-01-06T18:14:00Z')
  });
  nodes.get('moon-refresh').click();
  const result = nodes.get('moon-result').textContent;
  assert.ok(result.indexOf('New Moon') !== -1 || result.indexOf('illuminated') !== -1);
});

test('form submit path computes phase', () => {
  const { doc, nodes } = makeDoc();
  moonUi.attachMoonUi({
    document: doc,
    moonApi: moon,
    now: () => new Date('2000-01-06T18:14:00Z')
  });
  nodes.get('moon-form').submit();
  assert.ok(nodes.get('moon-result').textContent.length > 0);
});

test('CARD_ID is stable', () => {
  assert.equal(moonUi.CARD_ID, 'moon-card');
});
