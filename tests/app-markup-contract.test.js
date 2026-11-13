'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function idsIn(source) {
  return [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
}

function elementById(source, id) {
  return source.match(new RegExp('<([a-z][a-z0-9-]*)\\b[^>]*\\bid="' + id + '"[^>]*>', 'i'));
}

function editDialogMarkup() {
  const start = html.indexOf('<dialog id="edit-dialog"');
  assert.notEqual(start, -1, 'the edit dialog must exist');
  const end = html.indexOf('</dialog>', start);
  assert.notEqual(end, -1, 'the edit dialog must close');
  return html.slice(start, end + '</dialog>'.length);
}

test('every literal app.js ID lookup resolves to one unique element in index.html', () => {
  const htmlIds = idsIn(html);
  const counts = new Map();
  for (const id of htmlIds) counts.set(id, (counts.get(id) || 0) + 1);

  const duplicateIds = [...counts].filter(([, count]) => count !== 1).map(([id]) => id);
  assert.deepEqual(duplicateIds, [], 'static HTML IDs must be unique');

  const selectors = [...new Set(
    [...app.matchAll(/\$\(['"]#([A-Za-z][A-Za-z0-9_-]*)['"]\)/g)].map((match) => match[1])
  )];
  const missing = selectors.filter((id) => counts.get(id) !== 1);
  assert.deepEqual(missing, [], 'every static ID selector used by app.js must resolve exactly once');
});

test('toast host exposes the live region and action elements used by app.js', () => {
  const stack = elementById(html, 'toast-stack');
  const toast = elementById(html, 'toast');
  const action = elementById(html, 'toast-action');

  assert.ok(stack, 'toast-stack must exist');
  assert.match(stack[0], /\brole=["']status["']/i);
  assert.match(stack[0], /\baria-live=["']polite["']/i);
  assert.ok(toast, 'toast message element must exist');
  assert.ok(action, 'toast action element must exist');
  assert.equal(action[1].toLowerCase(), 'button');
  assert.match(action[0], /\btype=["']button["']/i);
  assert.match(action[0], /\bhidden(?:\s|>)/i);
});

test('edit dialog preserves all fields and controls consumed by the task editor', () => {
  const dialog = editDialogMarkup();
  const required = [
    'edit-id',
    'edit-title',
    'edit-due-date',
    'edit-due-time',
    'edit-reminder',
    'edit-repeat',
    'edit-priority',
    'edit-tags',
    'edit-notes',
    'edit-date-only-reminder-hint',
    'subtask-list',
    'new-subtask',
    'add-subtask',
    'edit-error'
  ];

  for (const id of required) {
    assert.ok(elementById(dialog, id), 'edit dialog must contain #' + id);
  }

  assert.match(elementById(dialog, 'edit-id')[0], /\btype=["']hidden["']/i);
  assert.match(elementById(dialog, 'edit-title')[0], /\brequired(?:\s|>)/i);
  assert.match(elementById(dialog, 'edit-notes')[0], /^<textarea\b/i);
  assert.match(elementById(dialog, 'subtask-list')[0], /\baria-live=["']polite["']/i);
  assert.match(elementById(dialog, 'add-subtask')[0], /\btype=["']button["']/i);
  assert.match(elementById(dialog, 'edit-error')[0], /\brole=["']alert["']/i);

  for (const id of ['edit-title', 'edit-due-date', 'edit-due-time', 'edit-reminder',
    'edit-repeat', 'edit-priority', 'edit-tags', 'edit-notes', 'new-subtask']) {
    assert.match(dialog, new RegExp('<label\\b[^>]*\\bfor="' + id + '"[^>]*>', 'i'),
      'the editor field #' + id + ' must have an associated label');
  }
});

test('skip-to-content link is present for keyboard users', () => {
  assert.match(html, /<a\s+class="skip-link"\s+href="#main">Skip to main content<\/a>/,
    'index.html must contain a skip-to-content link targeting #main');
});
