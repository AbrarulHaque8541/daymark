const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptSources = Array.from(
  indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  (match) => match[1].trim()
);
const SOURCE_BASE = 'https://daymark.invalid/';

function canonicalSource(source) {
  const url = new URL(source, SOURCE_BASE);
  url.hash = '';
  return url.href;
}

function duplicateSources(sources) {
  const seen = new Set();
  const duplicates = new Set();
  for (const source of sources) {
    const canonical = canonicalSource(source);
    if (seen.has(canonical)) duplicates.add(canonical);
    seen.add(canonical);
  }
  return Array.from(duplicates).sort();
}

test('index.html loads each external script URL only once after normalization', () => {
  assert.ok(scriptSources.length > 0, 'index.html should load its application scripts');
  assert.deepEqual(duplicateSources(scriptSources), [], 'duplicate script loads waste startup work');
});

test('duplicate relative script paths are detected after URL normalization', () => {
  assert.deepEqual(
    duplicateSources(['task-mutation-logic.js', './task-mutation-logic.js']),
    ['https://daymark.invalid/task-mutation-logic.js']
  );
});

test('task mutation API loads once before the app bootstrap', () => {
  const taskMutation = '<script src="task-mutation-logic.js" defer></script>';
  const appBootstrap = '<script src="app.js" defer></script>';
  const occurrences = indexHtml.split(taskMutation).length - 1;

  assert.equal(occurrences, 1, 'task mutation API should be loaded exactly once');
  assert.ok(indexHtml.indexOf(taskMutation) < indexHtml.indexOf(appBootstrap),
    'task mutation API must be available before app.js runs');
});
