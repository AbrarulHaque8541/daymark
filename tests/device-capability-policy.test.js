const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDeviceCapabilityProfile } = require('../device-capability-policy.js');

function profile(surface, display, inputs, features) {
  return createDeviceCapabilityProfile({ surface, display, inputs, features });
}

test('phone receives only explicitly declared full-surface capabilities', () => {
  const p = profile('phone', 'full', ['touch', 'keyboard'],
    ['task-capture', 'task-edit', 'task-review', 'focus-timer', 'browser']);
  assert.deepEqual(new Set(p.actions), new Set([
    'capture-task', 'edit-task', 'review-tasks', 'start-focus', 'pause-focus', 'finish-focus', 'open-browser'
  ]));
});

test('displayless ring and button companion cannot expose rich editing or browser', () => {
  const p = profile('ring', 'none', ['button'],
    ['task-capture', 'task-edit', 'task-review', 'focus-timer', 'reminder-actions', 'browser']);
  assert.deepEqual(new Set(p.actions), new Set([
    'capture-task', 'start-focus', 'pause-focus', 'finish-focus', 'acknowledge-reminder', 'snooze-reminder'
  ]));
});

test('watch glance surface permits review and short actions but not full editing', () => {
  const p = profile('watch', 'glance', ['touch', 'voice'],
    ['task-review', 'task-edit', 'focus-timer', 'reminder-actions']);
  assert.ok(p.actions.includes('review-tasks'));
  assert.ok(p.actions.includes('start-focus'));
  assert.ok(!p.actions.includes('edit-task'));
});

test('car surface fails closed to brief reminder actions', () => {
  const p = profile('car', 'compact', ['touch', 'voice'],
    ['task-capture', 'task-edit', 'task-review', 'focus-timer', 'reminder-actions', 'browser', 'voice-capture']);
  assert.deepEqual(new Set(p.actions), new Set(['acknowledge-reminder', 'snooze-reminder']));
});

test('desktop and e-ink profiles obey their declared display and input capabilities', () => {
  const desktop = profile('desktop', 'full', ['keyboard', 'pointer'], ['task-capture', 'task-edit']);
  assert.ok(desktop.actions.includes('edit-task'));
  const eink = profile('eink', 'full', ['pointer'], ['task-review']);
  assert.deepEqual(eink.actions, ['review-tasks']);
});

test('invalid and overclaimed device profiles are rejected', () => {
  assert.throws(() => profile('unknown', 'full', ['touch'], []), TypeError);
  assert.throws(() => profile('ring', 'full', ['touch'], []), TypeError);
  assert.throws(() => profile('phone', 'full', ['telepathy'], []), TypeError);
  assert.throws(() => profile('phone', 'full', ['touch'], ['run-shell']), TypeError);
  assert.throws(() => createDeviceCapabilityProfile(null), TypeError);
});

test('returned profile arrays are immutable snapshots', () => {
  const p = profile('displayless', 'none', ['button'], ['focus-timer']);
  assert.throws(() => p.actions.push('open-browser'), TypeError);
  assert.throws(() => p.inputs.push('keyboard'), TypeError);
  assert.ok(!p.actions.includes('open-browser'));
});

test('Java and JavaScript device policies share one cross-platform fixture contract', () => {
  const fixture = path.join(__dirname, '..', 'contracts', 'device-capability-policy.tsv');
  const lines = fs.readFileSync(fixture, 'utf8').split(/\r?\n/);
  let cases = 0;
  for (const [index, line] of lines.entries()) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('|');
    assert.equal(columns.length, 5, `fixture line ${index + 1} must have five columns`);
    const [surface, display, inputList, featureList, expectedList] = columns;
    const split = (value) => value && value !== '-' ? value.split(',') : [];
    const actual = createDeviceCapabilityProfile({
      surface, display, inputs: split(inputList), features: split(featureList)
    });
    assert.deepEqual(new Set(actual.actions), new Set(split(expectedList)),
      `JavaScript policy must match shared fixture line ${index + 1}`);
    cases += 1;
  }
  assert.ok(cases >= 7, 'shared fixture must cover at least seven device classes');
});
