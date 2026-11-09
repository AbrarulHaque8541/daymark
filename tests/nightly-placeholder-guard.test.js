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



const NODE_TEST_FILE_RE = /^(?:test(?:-.*)?|.*-test|.*\.test)\.(?:js|mjs|cjs)$/i;
const GENERATED_TEST_SCAN_EXCLUSIONS = new Set([
  ".git", ".gradle", ".idea", ".cache", "node_modules",
  "build", "dist", "out", "coverage", "target"
]);

function collectNodeTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return GENERATED_TEST_SCAN_EXCLUSIONS.has(entry.name) ? [] : collectNodeTestFiles(fullPath);
    }
    return entry.isFile() && NODE_TEST_FILE_RE.test(entry.name) ? [fullPath] : [];
  }).sort();
}

function hasRegisteredTestCase(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .trim();
  const activeTest = /(?<![A-Za-z0-9_$.'"\x60])\b(?:test|it)\s*\(/.test(withoutComments);
  const focusedTest = /(?<![A-Za-z0-9_$.'"\x60])\b(?:test|it|describe)\.only\s*\(/.test(withoutComments);
  return withoutComments.length > 0 && activeTest && !focusedTest;
}

test('every repository Node test file registers at least one executable test case', () => {
  const repositoryRoot = path.resolve(__dirname, '..');
  const testFiles = collectNodeTestFiles(repositoryRoot);
  const actualInventory = testFiles
    .map((file) => path.relative(repositoryRoot, file).split(path.sep).join('/'))
    .sort();
  const expectedInventory = fs.readFileSync(path.join(__dirname, 'REQUIRED_NODE_TEST_FILES.txt'), 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();

  assert.equal(new Set(expectedInventory).size, expectedInventory.length,
    'the required Node test inventory must not contain duplicate paths');
  assert.deepEqual(actualInventory, expectedInventory,
    'Node test files were added, removed or renamed; review and update REQUIRED_NODE_TEST_FILES.txt explicitly');
  assert.ok(testFiles.length > 0, 'the repository must retain its Node regression suite');
  assert.equal(hasRegisteredTestCase('placeholder'), false, 'literal placeholder files must not count as tests');
  assert.equal(hasRegisteredTestCase('// placeholder\n/* no executable test */'), false,
    'comment-only test files must not count as tests');
  assert.equal(hasRegisteredTestCase("test('valid fixture', () => {});"), true,
    'an active named Node test registration must be accepted');
  assert.equal(hasRegisteredTestCase("test.skip('skipped fixture', () => {});"), false,
    'a skipped test must not make a file look like an executable regression suite');
  assert.equal(hasRegisteredTestCase("test.todo('todo fixture');"), false,
    'a todo-only file must not make a suite look executable');
  assert.equal(hasRegisteredTestCase("test.only('focused fixture', () => {});"), false,
    'committed focused-only test files must be rejected');
  assert.equal(hasRegisteredTestCase("describe.only('focused suite', () => { test('active', () => {}); });"), false,
    'focused-only describe suites must be rejected');
  assert.equal(hasRegisteredTestCase("const example = \"test('fake')\";"), false,
    'a test-like string literal must not count as a test registration');

  for (const file of testFiles) {
    const relative = path.relative(repositoryRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(hasRegisteredTestCase(source),
      relative + ' must register at least one named test(); a placeholder/helper-only file is not a regression suite');
  }
});
