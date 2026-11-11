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

test('web metadata and task controls accurately disclose unencrypted browser storage', () => {
  const description = markup.match(/<meta\s+name="description"\s+content="([^"]*)">/i);
  assert.ok(description, 'the web prototype must keep its page description');
  assert.doesNotMatch(description[1], /encrypted on-device storage/i);

  const taskToolsStart = markup.indexOf('<div class="task-tools">');
  const taskListStart = markup.indexOf('<div class="task-list"', taskToolsStart);
  assert.ok(taskToolsStart >= 0 && taskListStart > taskToolsStart, 'task-data controls must remain in the task panel');
  const taskControls = markup.slice(taskToolsStart, taskListStart);
  const disclosure = taskControls.match(/<p\b[^>]*id="browser-storage-disclosure"[^>]*>([^<]+)<\/p>/);
  assert.ok(disclosure, 'a visible browser-storage disclosure must sit by task-data controls');
  assert.match(disclosure[1], /stored in this browser's localStorage/i);
  assert.match(disclosure[1], /not encrypted by the prototype/i);

  for (const id of ['export-tasks', 'import-tasks']) {
    const button = taskControls.match(new RegExp('<button\\b[^>]*id="' + id + '"[^>]*>'));
    assert.ok(button, id + ' control must be present');
    assert.match(button[0], /aria-describedby="browser-storage-disclosure"/,
      id + ' must expose the disclosure to assistive technology');
  }
});

test('index.html keeps the de-cluttered chrome lean (owner decision 2026-11-05)', () => {
  assert.doesNotMatch(markup, /class="rail-label"/, 'the upside-down rail label must stay removed');
  assert.doesNotMatch(markup, /demo-label/, 'redundant card topline labels must stay removed');
  assert.doesNotMatch(markup, /A little more/, 'the decorative hero heading must stay replaced');
  assert.doesNotMatch(markup, /This prototype stores tasks/, 'the duplicated storage note must stay removed');
  assert.match(markup, /id="page-title">Your day, <em>at a glance\.<\/em><\/h1>/, 'the hero heading stays clear and functional');
});
