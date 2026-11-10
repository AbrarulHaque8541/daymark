'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

try {
  require.resolve('acorn', { paths: [repositoryRoot] });
  process.stdout.write('Node test parser is already installed.\n');
  process.exit(0);
} catch {
  // Legacy/manual workflows may invoke npm test without an explicit install.
  // Bootstrap only the lockfile-pinned development dependencies in that case;
  // normal CI jobs install them explicitly with npm ci.
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  process.stderr.write('Missing Acorn test parser. Run npm ci before npm test.\n');
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  npmCli,
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--include=dev'
], {
  cwd: repositoryRoot,
  stdio: 'inherit'
});

if (result.error) {
  process.stderr.write('Unable to install locked Node test dependencies: ' + result.error.message + '\n');
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);

try {
  require.resolve('acorn', { paths: [repositoryRoot] });
} catch {
  process.stderr.write('npm ci completed but the pinned Acorn parser is still unavailable.\n');
  process.exit(1);
}
