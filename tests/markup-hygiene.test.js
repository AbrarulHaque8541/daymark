'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const markup = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('index.html keeps every line free of trailing whitespace', () => {
  const offenders = markup.split('\n').filter((line) => /[ \t]+$/.test(line));
  assert.deepEqual(offenders, [], 'no line should carry trailing whitespace');
});

test('index.html keeps the repeat select as one unbroken tag', () => {
  assert.match(markup, /<select id="edit-repeat" name="repeat"[^>]*>/);
});

test('index.html aligns the export format select with its task-tools siblings', () => {
  assert.match(markup, /\n            <select id="export-format"/);
});

test('index.html keeps card chrome free of redundant demo labels and verbose copy', () => {
  assert.equal(markup.includes('demo-label'), false,
    'card toplines must not repeat a DEMO label the card heading already states');
  assert.equal(markup.includes('PERSONAL SPACE'), false,
    'the rail must not repeat the workspace identity already shown in the topbar');
  const descriptions = [...markup.matchAll(/<p class="(?:suggestion|focus|briefing|weather|currency|wiki)-description">([^<]*)<\/p>/g)]
    .map((match) => match[1]);
  assert.equal(descriptions.length, 9, 'each glance card keeps exactly one short description line');
  for (const text of descriptions) {
    assert.ok(text.length <= 140, 'card descriptions must stay short: ' + text);
  }
});
