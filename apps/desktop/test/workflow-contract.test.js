'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'desktop-browser-ci.yml');

test('desktop CI pins Node 24 action runtimes and installs Electron dependencies before tests', () => {
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7\.0\.0/);
  assert.match(workflow, /uses: actions\/setup-node@2028fbc5c25fe9cf00d9f06a71cc4710d4507903 # v6\.0\.0/);
  assert.match(workflow, /node-version: '20'/,
    'Electron unit tests continue to use the supported Node 20 application runtime');
  assert.match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);

  const install = workflow.indexOf('npm install --no-audit --no-fund');
  const tests = workflow.indexOf('npm test');
  assert.ok(install >= 0 && tests > install,
    'desktop dependencies must be installed before the cross-platform unit suite');
});
