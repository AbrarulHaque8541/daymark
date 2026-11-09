'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'android-device-acceptance.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('device QA summary prints Markdown backticks literally without shell command substitution', () => {
  const start = workflow.indexOf('echo "### Non-production device-test APK"');
  const end = workflow.indexOf('} >> "$GITHUB_STEP_SUMMARY"', start);
  assert.notEqual(start, -1, 'summary block start exists');
  assert.notEqual(end, -1, 'summary block end exists');

  const summary = workflow.slice(start, end);
  const markdownEchoes = summary.split('\n')
    .filter((line) => /^\s*echo\s+"/.test(line) && line.includes('`'));
  assert.equal(markdownEchoes.length, 6, 'all six metadata lines retain Markdown code formatting');

  for (const line of markdownEchoes) {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== '`') continue;
      let precedingSlashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
        precedingSlashes += 1;
      }
      assert.equal(precedingSlashes % 2, 1,
        'every Markdown backtick inside a double-quoted echo must be escaped: ' + line);
    }
  }

  assert.ok(summary.includes('\\`$GITHUB_SHA\\`'), 'source SHA still expands');
  assert.ok(summary.includes('\\`${PR_HEAD_SHA:-not-applicable}\\`'), 'PR head SHA still expands');
  assert.ok(summary.includes('\\`$package_name\\`'), 'package identity still expands');
  assert.ok(summary.includes('\\`$sha256\\`'), 'APK digest still expands');
});
