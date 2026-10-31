'use strict';

// TEMPORARY CI DIAGNOSTIC (to be reverted): runs the real `node --test` suite
// with the spec reporter and mirrors failing tests as GitHub Actions `::error`
// annotations, so failures are readable via the check-runs API without job-log
// access. Also reports the runner environment.

const { spawnSync } = require('node:child_process');

const res = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout'],
  { encoding: 'utf8' }
);

const out = `${res.stdout || ''}\n${res.stderr || ''}`;
process.stdout.write(out);

const clean = (s) => s.replace(/[^\x20-\x7E]/g, '?').replace(/\s+/g, ' ').trim().slice(0, 280);

console.log(`::error title=CI diagnostic environment::platform=${process.platform} arch=${process.arch} node=${process.version} tz=${process.env.TZ || '(unset)'} utc=${new Date().toISOString()} exit=${res.status}`);

const rawLines = out.split(/\r?\n/);
let currentFile = '(unknown file)';
const failures = [];
for (const raw of rawLines) {
  const fileMatch = raw.match(/((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:test|spec)\.[cm]?js)/);
  if (fileMatch) currentFile = fileMatch[1];
  if (/✖|not ok/.test(raw)) failures.push(`[${currentFile}] ${clean(raw)}`);
}

if (failures.length === 0 && res.status !== 0) {
  // No parsed test failure: dump the tail so the load error is visible.
  for (const raw of rawLines.slice(-12)) failures.push(`[tail] ${clean(raw)}`);
}

for (const f of failures.slice(0, 8)) {
  console.log(`::error title=Failing test::${f}`);
}

process.exit(res.status == null ? 1 : res.status);
