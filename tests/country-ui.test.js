'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../country-ui.js');

function makeMockDoc() {
  const elements = {};
  function createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      id: '',
      className: '',
      textContent: '',
      value: '',
      type: '',
      placeholder: '',
      parentNode: null,
      nextSibling: null,
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name]; },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      insertBefore(newNode, ref) {
        newNode.parentNode = this;
        const idx = this.children.indexOf(ref);
        if (idx >= 0) this.children.splice(idx, 0, newNode);
        else this.children.push(newNode);
        return newNode;
      },
      querySelector(sel) {
        const id = sel.replace('#', '');
        return elements[id] || null;
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {}
    };
    return el;
  }
  const doc = {
    getElementById(id) { return elements[id] || null; },
    createElement,
    body: createElement('body')
  };
  // Pre-seed anchor
  const launch = createElement('aside');
  launch.id = 'launch-card';
  elements['launch-card'] = launch;
  doc.body.appendChild(launch);
  return { doc, elements, createElement };
}

test('attachCountryUi injects card after launch-card anchor', () => {
  const { doc, elements } = makeMockDoc();
  // Patch createElement to register by id
  const original = doc.createElement;
  doc.createElement = function (tag) {
    const el = original(tag);
    const origSet = el.setAttribute;
    el.setAttribute = function (name, value) {
      origSet.call(this, name, value);
      if (name === 'id' || this.id) elements[this.id || value] = this;
    };
    return el;
  };

  ui.attachCountryUi({ document: doc, fetch: async () => ({ ok: true, text: async () => '[]' }) });
  assert.ok(elements['country-card'], 'country card must be injected');
  assert.equal(elements['country-card'].parentNode, doc.body);
});
