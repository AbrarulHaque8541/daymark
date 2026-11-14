'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../browser-data-logic.js');

test('catalog ids are stable and in card order', () => {
  assert.deepEqual(engine.CLEAR_ACTION_IDS, [
    'clear-completed',
    'clear-search',
    'webhook-clear-queue',
    'storage-clear-status',
    'storage-clear-all',
    'import-merge',
    'export-backup'
  ]);
});

test('every catalog entry is well formed and honest', () => {
  for (const id of engine.CLEAR_ACTION_IDS) {
    const entry = engine.explainClearAction(id);
    for (const field of ['label', 'title', 'summary', 'recovery', 'scope', 'network']) {
      assert.equal(typeof entry[field], 'string', id + ' must have a non-empty ' + field);
      assert.ok(entry[field].length > 0, id + ' ' + field + ' must not be empty');
    }
    assert.ok(Array.isArray(entry.removes), id + ' removes must be an array');
    for (const line of entry.removes) assert.equal(typeof line, 'string', id + ' removes must be strings');
    assert.ok(Array.isArray(entry.keeps) && entry.keeps.length > 0, id + ' must keep at least one thing');
    for (const line of entry.keeps) assert.ok(typeof line === 'string' && line.length > 0, id + ' keeps must be non-empty strings');
    assert.equal(typeof entry.recoverable, 'boolean', id + ' recoverable must be a boolean');
    assert.equal(Number.isSafeInteger(entry.undoWindowSeconds) && entry.undoWindowSeconds >= 0, true,
      id + ' undoWindowSeconds must be a non-negative integer');
    assert.equal(typeof entry.available, 'boolean', id + ' available must be a boolean');
    assert.equal(typeof entry.deletesData, 'boolean', id + ' deletesData must be a boolean');
    assert.equal(typeof entry.exportable, 'boolean', id + ' exportable must be a boolean');
  }
});

test('an unknown action id fails closed to the honest unknown entry', () => {
  const result = engine.explainClearAction('definitely-not-an-action');
  assert.equal(result.id, 'unknown');
  assert.match(result.summary, /no honest description/);
  assert.ok(result.keeps.includes('Everything, out of caution'));
  assert.equal(result.deletesData, false);
  assert.equal(result.exportable, false);
});

test('explainClearAction returns defensive copies', () => {
  const first = engine.explainClearAction('clear-completed');
  first.removes.push('tampered');
  first.keeps.push('tampered');
  const second = engine.explainClearAction('clear-completed');
  assert.ok(!second.removes.includes('tampered'), 'removes must be a copy');
  assert.ok(!second.keeps.includes('tampered'), 'keeps must be a copy');
});

test('isKnownClearActionId accepts only catalog ids', () => {
  for (const id of engine.CLEAR_ACTION_IDS) assert.equal(engine.isKnownClearActionId(id), true, id);
  assert.equal(engine.isKnownClearActionId('nope'), false);
  assert.equal(engine.isKnownClearActionId(42), false);
  assert.equal(engine.isKnownClearActionId(null), false);
});

test('listClearActions exposes honest delete flags', () => {
  const actions = engine.listClearActions();
  assert.equal(actions.length, engine.CLEAR_ACTION_IDS.length);
  const clearCompleted = actions.find((action) => action.id === 'clear-completed');
  assert.ok(clearCompleted, 'clear-completed must be listed');
  assert.equal(clearCompleted.deletesData, true);
  assert.equal(clearCompleted.available, true);
  assert.equal(clearCompleted.undoWindowSeconds, 7);
  assert.equal(clearCompleted.exportable, true);
  assert.equal(actions.find((action) => action.id === 'webhook-clear-queue').exportable, false);
  assert.equal(actions.find((action) => action.id === 'storage-clear-status').available, true);
  const clearAllAction = actions.find((action) => action.id === 'storage-clear-all');
  assert.ok(clearAllAction, 'storage-clear-all must be listed');
  assert.equal(clearAllAction.deletesData, true);
  assert.equal(clearAllAction.available, true);
  assert.equal(clearAllAction.undoWindowSeconds, 0);
  assert.equal(clearAllAction.exportable, false);
  assert.equal(actions.find((action) => action.id === 'clear-search').deletesData, false);
});

test('planClearSequence warns that a preceding Export is not a verified complete backup', () => {
  const plan = engine.planClearSequence(['export-backup', 'clear-completed']);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.ids, ['export-backup', 'clear-completed']);
  assert.equal(plan.steps.length, 2);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /planned Export step is not proof that a complete backup was created/);
  assert.match(plan.warnings[0], /verify the file is present and contains the intended data/);
  assert.match(plan.warnings[0], /If recovery is pending, use Export recovery/);
  assert.match(plan.warnings[0], /Undo lasts only 7 seconds/);
  assert.match(plan.note, /does not inspect storage\/recovery state or verify an export/);
});

test('planClearSequence warns when data is deleted with no export first', () => {
  const plan = engine.planClearSequence(['clear-completed']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /No Export step is planned before this deletion/);
  assert.match(plan.warnings[0], /Undo lasts only 7 seconds/);
});

test('planClearSequence does not count an Export step that occurs after deletion', () => {
  const plan = engine.planClearSequence(['clear-completed', 'export-backup']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /No Export step is planned before this deletion/);
});

test('task export cannot be treated as a recovery path for webhook queue deletion', () => {
  const plan = engine.planClearSequence(['export-backup', 'webhook-clear-queue']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /not included in task exports or Export recovery/);
  assert.doesNotMatch(plan.warnings[0], /verify the file is present/);
});

test('planClearSequence does not demand an export for delete-free actions', () => {
  const plan = engine.planClearSequence(['clear-search']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 0);
});

test('planClearSequence rejects plans containing unknown actions', () => {
  const plan = engine.planClearSequence(['export-backup', 'nope']);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /Unknown clear action/);
  assert.equal(plan.steps.length, 0);
  assert.ok(!plan.ids.includes('nope'));
});

test('planClearSequence deduplicates while preserving order', () => {
  const plan = engine.planClearSequence(['clear-search', 'clear-search', 'export-backup']);
  assert.deepEqual(plan.ids, ['clear-search', 'export-backup']);
  assert.equal(plan.steps.length, 2);
});

test('planClearSequence fails closed on non-array input', () => {
  const plan = engine.planClearSequence('clear-completed');
  assert.equal(plan.ok, false);
  assert.match(plan.error, /needs a list of action ids/);
});

test('planClearSequence fails closed on an empty list', () => {
  const plan = engine.planClearSequence([]);
  assert.equal(plan.ok, false);
  assert.match(plan.error, /at least one known action/);
});


test('clear-completed explanation matches the real temporary Undo and save behavior', () => {
  const entry = engine.explainClearAction('clear-completed');
  assert.equal(entry.recoverable, true);
  assert.equal(entry.undoWindowSeconds, 7);
  assert.match(entry.recovery, /Undo is available.*7 seconds/);
  assert.match(entry.recovery, /After it expires, there is no built-in undo/);
  assert.ok(entry.removes.some((line) => /fully valid stale task recovery backup may also be cleared/.test(line)));
  assert.match(entry.summary, /If saving fails, the removal is only for this session/);
});

test('storage status controls are wired, read-only, and clear-all is destructive', () => {
  const statusEntry = engine.explainClearAction('storage-clear-status');
  assert.equal(statusEntry.available, true);
  assert.equal(statusEntry.deletesData, false);
  assert.match(statusEntry.summary, /Check re-runs the local storage scan/);
  assert.match(statusEntry.summary, /empties only the status message/);
  assert.equal(engine.planClearSequence(['storage-clear-status']).ok, true);

  const clearAllEntry = engine.explainClearAction('storage-clear-all');
  assert.equal(clearAllEntry.available, true);
  assert.equal(clearAllEntry.deletesData, true);
  assert.equal(clearAllEntry.recoverable, false);
  assert.match(clearAllEntry.summary, /explicit, confirmed action/);
  assert.match(clearAllEntry.summary, /recovery backups/);
  assert.match(clearAllEntry.summary, /never touched/);
  assert.ok(clearAllEntry.keeps.some((line) => /does not manage/.test(line)));
  const plan = engine.planClearSequence(['export-backup', 'storage-clear-all']);
  assert.equal(plan.ok, true);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /not included in task exports or Export recovery/);
});

test('export explanation distinguishes in-memory JSON, saved-store open formats and plaintext privacy', () => {
  const entry = engine.explainClearAction('export-backup');
  assert.match(entry.summary, /in-memory task list/);
  assert.match(entry.summary, /CSV, Markdown and iCalendar exports read the saved task store and validate parsed tasks/);
  assert.match(entry.recovery, /plaintext export/);
  assert.match(entry.recovery, /not a raw recovery export or encrypted backup/);
  assert.match(entry.recovery, /use Export recovery instead/);
});

const fs = require('node:fs');
const path = require('node:path');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const exportUiSource = fs.readFileSync(path.join(__dirname, '..', 'export-ui.js'), 'utf8');

function sourceSection(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, 'source section must exist: ' + start);
  return source.slice(first, last);
}

test('clear-action catalog stays aligned with real Undo expiry and backup cleanup', () => {
  const clearCompleted = sourceSection(appSource, 'function clearCompleted() {', 'function exportTasks() {');
  const showToast = sourceSection(appSource, 'function showToast(message, action = null) {', 'function readRecoveryExportPayload() {');
  assert.match(clearCompleted, /label: 'Undo'/);
  assert.match(showToast, /action \? 7000 : 2600/);
  const persistStart = appSource.indexOf('function persistTasks(options) {');
  const persistEnd = appSource.indexOf('function showSaveResult(', persistStart);
  const backupStart = appSource.indexOf('function clearRecoveryBackup() {');
  assert.ok(persistStart >= 0 && persistEnd > persistStart && backupStart >= 0,
    'persistence and backup cleanup functions must exist');
  const persistence = appSource.slice(persistStart, persistEnd);
  const backupCleanup = appSource.slice(backupStart, appSource.indexOf('\n  }', backupStart) + 4);
  assert.match(persistence, /clearRecoveryBackup\(\)/);
  assert.match(backupCleanup, /localStorage\.removeItem\(BACKUP_KEY\)/);
});

test('export catalog stays aligned with JSON memory export and saved-store open-format export', () => {
  const jsonExport = sourceSection(appSource, 'function exportTasks() {', 'function readTaskRecoveryPayloads(raw) {');
  assert.match(jsonExport, /JSON\.stringify\(state\.tasks/);
  assert.doesNotMatch(jsonExport, /localStorage\.getItem/);
  assert.match(exportUiSource, /storage\.getItem\(STORAGE_KEY\)/);
});

test('export catalog discloses when the current exporter treats empty storage as absent', () => {
  const entry = engine.explainClearAction('export-backup');
  const treatsEmptyAsMissing = /const parsed = raw \? JSON\.parse\(raw\) : \[\]/.test(exportUiSource);
  if (treatsEmptyAsMissing) {
    assert.match(entry.summary, /present empty-string value is treated like a missing key and can yield an empty export/);
    assert.match(entry.summary, /successful empty export does not prove storage is healthy/);
  } else {
    assert.doesNotMatch(entry.summary, /present empty-string value is treated like a missing key/);
    assert.match(entry.summary, /read the saved task store and validate parsed tasks/);
  }
});
