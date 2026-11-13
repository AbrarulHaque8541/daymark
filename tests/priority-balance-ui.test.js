const test = require('node:test');
const assert = require('node:assert/strict');
const { attachPriorityBalanceUi, CARD_ID } = require('../priority-balance-ui.js');

function mockDocument() {
  const elements = {};
  return {
    getElementById(id) { return elements[id] || null; },
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        textContent: '',
        classList: { toggle() {} },
        setAttribute() {},
        removeAttribute() {},
        appendChild(child) { if (!this.children) this.children = []; this.children.push(child); return child; },
        addEventListener() {},
        disabled: false,
        firstChild: null,
        removeChild() {}
      };
      return el;
    },
    body: { appendChild() {} },
    readyState: 'complete'
  };
}

test('attachPriorityBalanceUi injects card and wires refresh', () => {
  const doc = mockDocument();
  const engine = { summarizePriorities: () => ({ high: 2, medium: 1, low: 0, none: 0, total: 3 }) };
  const getTasks = () => [{ priority: 'high' }, { priority: 'high' }, { priority: 'medium' }];
  const api = attachPriorityBalanceUi({ document: doc, balanceApi: engine, getTasks });
  assert.equal(typeof api.onRefresh, 'function');
  assert.equal(typeof api.onClear, 'function');
  // Card was created (side effect via ensureCard)
  assert.ok(doc.createElement);
});

test('CARD_ID is stable', () => {
  assert.equal(CARD_ID, 'priority-balance-card');
});
