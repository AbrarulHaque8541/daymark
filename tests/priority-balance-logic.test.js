const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizePriorities } = require('../priority-balance-logic.js');

test('summarizePriorities counts open tasks by priority', () => {
  const tasks = [
    { priority: 'high', completed: false },
    { priority: 'high', completed: true },
    { priority: 'medium', completed: false },
    { priority: 'low' },
    { completed: false },
    null
  ];
  const result = summarizePriorities(tasks);
  assert.equal(result.high, 1);
  assert.equal(result.medium, 1);
  assert.equal(result.low, 1);
  assert.equal(result.none, 1);
  assert.equal(result.total, 4);
});

test('summarizePriorities returns zeros for empty or invalid input', () => {
  assert.deepEqual(summarizePriorities([]), { high: 0, medium: 0, low: 0, none: 0, total: 0 });
  assert.deepEqual(summarizePriorities(null), { high: 0, medium: 0, low: 0, none: 0, total: 0 });
  assert.deepEqual(summarizePriorities(undefined), { high: 0, medium: 0, low: 0, none: 0, total: 0 });
});
