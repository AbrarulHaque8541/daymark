'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const workflowPath = '.github/workflows/platform-contract.yml';
const scriptPath = 'scripts/validate-workflows.sh';
const fixturePath = 'tests/fixtures/actionlint-invalid.yml';
const workflow = fs.readFileSync(path.join(root, workflowPath), 'utf8');
const script = fs.readFileSync(path.join(root, scriptPath), 'utf8');
const fixture = fs.readFileSync(path.join(root, fixturePath), 'utf8');

test('workflow lint uses a version-pinned actionlint release and verified Linux archive digest', () => {
  assert.match(script, /ACTIONLINT_VERSION='1\.7\.12'/);
  assert.match(script, /ACTIONLINT_ARCHIVE="actionlint_\$\{ACTIONLINT_VERSION\}_linux_amd64\.tar\.gz"/);
  assert.match(script, /ACTIONLINT_SHA256='8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'/);
  assert.match(script, /curl --proto '=https' --tlsv1\.2/);
  assert.match(script, /sha256sum --check --status/);
  assert.ok(script.indexOf('sha256sum --check --status') < script.indexOf('tar -xzf'),
    'the archive digest must be checked before extraction');
});

test('workflow lint scans every top-level yml and yaml workflow file, including tag-only workflows', () => {
  assert.match(script, /find "\$ROOT\/\.github\/workflows" -maxdepth 1 -type f/);
  assert.match(script, /-name '\*\.yml' -o -name '\*\.yaml'/);
  assert.match(script, /"\$actionlint" -shellcheck= -color -oneline "\$\{workflow_files\[@\]\}"/);
  assert.match(script, /No GitHub Actions workflow files were found/);
});

test('existing main-targeted contract workflow runs the linter on every pull request and main push', () => {
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  push:/m);
  assert.match(workflow, /branches: \["main"\]/);
  assert.match(workflow, /^  workflow-lint:/m);
  assert.match(workflow, /name: Validate all GitHub Actions workflows/);
  assert.match(workflow, /run: bash scripts\/validate-workflows\.sh/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write|id-token: write|attestations: write/);
});

test('workflow lint job uses an immutable checkout pin and bounded read-only runner', () => {
  const start = workflow.indexOf('  workflow-lint:');
  const end = workflow.indexOf('  shared-contracts:', start);
  assert.ok(start >= 0 && end > start, 'workflow-lint job must remain independent of shared contract jobs');
  const job = workflow.slice(start, end);
  assert.match(job, /uses: actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7\.0\.0/);
  assert.match(job, /runs-on: ubuntu-24\.04/);
  assert.match(job, /timeout-minutes: 10/);
  assert.match(job, /permissions:\n      contents: read/);
  assert.doesNotMatch(job, /contents: write|id-token: write|attestations: write/);
  assert.match(job, /run: bash scripts\/validate-workflows\.sh/);
});

test('negative fixture is valid YAML-shaped workflow content with a schema-invalid step', () => {
  assert.match(fixture, /^name:/m);
  assert.match(fixture, /^on: push$/m);
  assert.match(fixture, /^jobs:/m);
  assert.match(fixture, /^\s+uses: actions\/checkout@/m);
  assert.match(fixture, /^\s+run: echo /m);
  assert.ok(fixturePath.startsWith('tests/fixtures/'));
  assert.ok(!fixturePath.startsWith('.github/workflows/'),
    'the negative fixture must never be picked up as a real repository workflow');
  assert.match(script, /actionlint unexpectedly accepted the deliberately invalid fixture/);
});
