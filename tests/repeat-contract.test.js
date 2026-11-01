const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repeat = require('../repeat-logic.js');

const fixturePath = path.join(__dirname, '..', 'contracts', 'task-recurrence.tsv');
const cases = fs.readFileSync(fixturePath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#'))
  .map((line, index) => {
    const fields = line.split('\t');
    assert.equal(fields.length, 4, `recurrence fixture line ${index + 2} must have four tab-separated fields`);
    const [dueDate, rule, anchorText, expected] = fields;
    return { dueDate, rule, anchorDay: anchorText === '-' ? undefined : Number(anchorText), expected };
  });

test('web recurrence matches the shared Android/web next-occurrence contract', () => {
  assert.equal(cases.length, 10, 'the shared contract includes leap-year, month-end, weekday, and year-boundary cases');
  for (const item of cases) {
    assert.equal(
      repeat.nextDueDate(item.dueDate, item.rule, item.dueDate, item.anchorDay),
      item.expected,
      `${item.rule} recurrence from ${item.dueDate} (anchor ${item.anchorDay ?? 'none'})`
    );
  }
});
