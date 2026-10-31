'use strict';

// TEMPORARY CI DIAGNOSTIC (to be reverted): runs the real `node --test` suite
// with the spec reporter and mirrors every failing test as a GitHub Actions
// `::error` annotation, so failures are readable via the check-runs API without
// needing job-log access. Also reports the runner environment.

const { spawnSync } = require('node:child_process');

const res = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout'],
  { encoding: 'utf8' }
);

const out = `${res.stdout || ''}\n${res.stderr || ''}`;
process.stdout.write(out);

console.log(`::error title=CI diagnostic environment::platform=${process.platform} arch=${process.arch} node=${process.version} tz=${process.env.TZ || '(unset)'} local=${new Date().toString()} utc=${new Date().toISOString()}`);

let currentFile = '(unknown file)';
for (const rawLine of out.split(/\r?\n/)) {
  const line = rawLine.replace(/[^\x20-\x7E]/g, '?');
  const fileMatch = line.match(/(?:^|\s)((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:test|spec)\.[cm]?js)\s*$/);
  if (fileMatch && !/^(✔|✖|▶|not ok|ok)/.test(line.trim())) {
    currentFile = fileMatch[1];
    continue;
  }
  if (/^\s*(✖|not ok)\b/.test(line)) {
    const clean = line.trim().slice(0, 300);
    console.log(`::error title=Failing test (${currentFile})::${clean}`);
  }
}

process.exit(res.status == null ? 1 : res.status);
