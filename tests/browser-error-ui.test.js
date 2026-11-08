'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'browser-error-ui.js'), 'utf8');

function createElement() {
  const children = [];
  return {
    children,
    listeners: Object.create(null),
    className: '',
    textContent: '',
    value: 'offline',
    get firstChild() { return children[0] || null; },
    appendChild(child) { children.push(child); return child; },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      return child;
    },
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
}

function bootWithBlockedStorage(readyState) {
  let localStorageReads = 0;
  const window = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      localStorageReads += 1;
      throw new Error('localStorage access is blocked by browser policy');
    }
  });
  const elements = {
    'browser-error-scenario': createElement(),
    'browser-error-status': createElement(),
    'browser-error-result': createElement(),
    'browser-error-form': createElement(),
    'browser-error-clear': createElement()
  };
  const documentListeners = Object.create(null);
  const document = {
    readyState,
    getElementById(id) { return elements[id] || null; },
    createElement() { return createElement(); },
    addEventListener(name, listener) { documentListeners[name] = listener; }
  };
  const engine = {
    explainError(scenario) {
      assert.equal(scenario, 'offline');
      return {
        label: 'Offline',
        title: 'You are offline',
        summary: 'The browser cannot reach the network.',
        recoveries: ['Check your connection.'],
        retryable: true
      };
    }
  };
  const context = { window, document, DaymarkBrowserError: engine, module: { exports: {} } };
  vm.runInNewContext(source, context, { filename: 'browser-error-ui.js' });
  return { localStorageReads, elements, documentListeners };
}

test('browser error card boots and renders when the localStorage getter throws', () => {
  const result = bootWithBlockedStorage('complete');
  assert.equal(result.localStorageReads, 0, 'stateless card boot never reads localStorage');
  assert.equal(result.elements['browser-error-status'].textContent,
    'Explained · Offline · you can retry');
  assert.equal(result.elements['browser-error-result'].children.length, 2,
    'the explanation title/summary and recovery step render');
});

test('DOMContentLoaded boot also avoids a throwing localStorage getter', () => {
  const result = bootWithBlockedStorage('loading');
  assert.equal(result.localStorageReads, 0, 'registering the boot callback does not read storage');
  assert.equal(typeof result.documentListeners.DOMContentLoaded, 'function');
  assert.doesNotThrow(() => result.documentListeners.DOMContentLoaded());
  assert.equal(result.localStorageReads, 0, 'DOMContentLoaded rendering remains storage-independent');
  assert.equal(result.elements['browser-error-status'].textContent,
    'Explained · Offline · you can retry');
});
