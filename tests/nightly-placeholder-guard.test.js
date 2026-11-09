'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('nightly placeholder guard ignores RFC 5545 VTODO identifiers but detects standalone markers', () => {
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'nightly-main-audit.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const command = workflow.match(/! grep -rniwE "([^"]+)"([^\n]*)/);
  assert.ok(command, 'nightly audit must use GNU grep whole-word matching for placeholder markers');
  assert.equal(command[1], 'TODO|FIXME|lorem ipsum', 'the guard must keep its complete placeholder vocabulary');
  assert.match(command[2], /--exclude-dir=node_modules/);
  assert.match(command[2], /--exclude-dir=tests/);
  assert.equal(command[2].includes('|'), false, 'directory exclusion must not filter grep output lines');

  const marker = /\b(?:TODO|FIXME|lorem ipsum)\b/i;
  for (const source of ['VTODO', 'BEGIN:VTODO', 'The VTODO component contains a task']) {
    assert.equal(marker.test(source), false, source + ' is an RFC 5545 identifier, not a placeholder');
  }
  for (const source of ['TODO', '// TODO: replace this', 'FIXME', 'lorem ipsum', 'TODO-like placeholder']) {
    assert.equal(marker.test(source), true, source + ' must remain detectable');
  }
  assert.equal(marker.test('someTODOIdentifier'), false, 'embedded identifier fragments are not standalone markers');
});

test('the exact GNU grep guard excludes test/dependency directories without hiding source lines mentioning tests/', {
  skip: process.platform !== 'linux'
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-nightly-placeholder-'));
  try {
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules', 'fixture'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app.js'), [
      'const component = "VTODO";',
      'const marker = "TODO: real placeholder";',
      'const docs = "tests/README.md"; // TODO: this source marker must be caught'
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'tests', 'fixture.js'), '// TODO: test fixture is excluded\n');
    fs.writeFileSync(path.join(root, 'node_modules', 'fixture', 'dep.js'), '// FIXME: dependency is excluded\n');

    const result = spawnSync('grep', [
      '-rniwE',
      '--include=*.js',
      '--include=*.html',
      '--include=*.css',
      '--exclude-dir=node_modules',
      '--exclude-dir=tests',
      'TODO|FIXME|lorem ipsum',
      root
    ], { encoding: 'utf8' });

    assert.equal(result.error, undefined, 'GNU grep must be available on the Ubuntu runner');
    assert.equal(result.status, 0, 'the two real source placeholders must be detected');
    const matches = result.stdout.trimEnd().split(/\r?\n/);
    assert.equal(matches.length, 2, 'VTODO and excluded directories must not be reported');
    assert.match(matches[0], /app\.js:2:const marker = "TODO: real placeholder"/);
    assert.match(matches[1], /app\.js:3:const docs = "tests\/README\.md"; \/\/ TODO: this source marker must be caught/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('every Node test file registers at least one executable test case', () => {
  const testDirectory = path.join(__dirname);
  const testFiles = fs.readdirSync(testDirectory)
    .filter((name) => name.endsWith('.test.js'))
    .sort();
  const registration = /\b(?:test|it)(?:\.(?:skip|todo|only))?\s*\(\s*['"\x60]/;

  assert.ok(testFiles.length > 0, 'the repository must retain its Node regression suite');

  for (const name of testFiles) {
    const source = fs.readFileSync(path.join(testDirectory, name), 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .trim();
    assert.ok(withoutComments.length > 0, name + ' must not be empty or comment-only');
    assert.match(withoutComments, registration,
      name + ' must register at least one named Node test; a placeholder/helper-only file is not a regression suite');
  }
});
