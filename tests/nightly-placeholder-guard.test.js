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



const { collectNodeTestFiles, hasRegisteredTestCase } = require('./helpers/node-test-registration-guard');

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
  assert.equal(hasRegisteredTestCase("test('placeholder', () => {});"), false,
    'an empty callback must not make a placeholder-only file look like a regression suite');
  assert.equal(hasRegisteredTestCase("test('comment-only', () => { /* no assertions or work */ });"), false,
    'a comment-only callback must not count as an executable test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test');\ntest('valid fixture', () => { assert.equal(1, 1); });"), true,
    'an active named registration with an executable callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test');\ntest(\n  'valid multiline fixture',\n  async () => {\n    assert.equal(await Promise.resolve(1), 1);\n  }\n);"), true,
    'a valid multiline registration must be accepted');
  assert.equal(hasRegisteredTestCase("function test() { assert.equal(1, 1); }"), false,
    'a function declaration named test must not count as a node:test registration');
  assert.equal(hasRegisteredTestCase("const suite = { test() { assert.equal(1, 1); } };"), false,
    'an object method named test must not count as a node:test registration');
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
  assert.equal(hasRegisteredTestCase("const example = 'test(placeholder)';"), false,
    'single-quoted fake registrations must be ignored');
  assert.equal(hasRegisteredTestCase("const example = " + String.fromCharCode(96) + "example test('fake')" + String.fromCharCode(96) + ";"), false,
    'template raw text must not count as an executable registration');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const example = " + String.fromCharCode(96) + "${test('real', () => assert.ok(true))}" + String.fromCharCode(96) + ";"), true,
    'an actual registration with an executable callback inside a template interpolation remains executable');
  assert.equal(hasRegisteredTestCase("const example = /test(foo)/;"), false,
    'regular-expression literals must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("// test('fake')\\n/* it('fake') */"), false,
    'line and block comments must not count as executable registrations');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const example = " + String.fromCharCode(96) + "test.only('fake')" + String.fromCharCode(96) + "; test('real', () => assert.ok(true));"), true,
    'focused-test text inside a template literal must not reject a real test');
  assert.equal(hasRegisteredTestCase("const note = \"not test('fake')\";"), false,
    'prose before a test-like phrase inside a quoted string must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = " + String.fromCharCode(96) + "example test('fake')" + String.fromCharCode(96) + ";"), false,
    'prose before a test-like phrase inside template raw text must not count as a registration');
  assert.equal(hasRegisteredTestCase("const note = \"// test('fake') /* it('fake') */\";"), false,
    'comment markers and test-like text inside strings must remain inert');

  assert.equal(hasRegisteredTestCase("if (enabled) /test('fake', () => assert.ok(true))/.test('x');"), false,
    'a regex literal after a control-flow parenthesis must not count as a registration');
  assert.equal(hasRegisteredTestCase("while (enabled) /it('fake', () => assert.ok(true))/.test('x');"), false,
    'a regex literal after a while condition must not count as a registration');
  assert.equal(hasRegisteredTestCase("test('fake', { setup: () => assert.ok(true) });"), false,
    'an arrow nested inside test options is not the test callback');
  assert.equal(hasRegisteredTestCase("test('fake', { setup: () => assert.ok(true) }, () => {});"), false,
    'an empty final callback must not be rescued by an arrow nested in options');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid async', async () => { await Promise.resolve(); assert.ok(true); });"), true,
    'an async inline callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid function', function () { assert.ok(true); });"), true,
    'a non-empty function-expression callback must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid parenthesized function', (function () { assert.ok(true); }));"), true,
    'a parenthesized function-expression callback must be accepted');
  assert.equal(hasRegisteredTestCase("test('empty function', function () { /* no executable body */ });"), false,
    'an empty function-expression callback must not count as an executable test');
  assert.equal(hasRegisteredTestCase("function test() {}\ntest('fake', () => assert.ok(true));"), false,
    'a locally defined no-op test function must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = () => {}; test('fake', () => assert.ok(true));"), false,
    'a locally assigned no-op test function must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("function it() {}\nit('fake', () => assert.ok(true));"), false,
    'a locally defined it() helper must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); const it = () => {}; it('fake', () => assert.ok(true));"), false,
    'an imported test binding must not authorize a locally defined it() helper');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); function helper(test) { test('fake', () => assert.ok(true)); }"), false,
    'a shadowed function parameter must not impersonate the imported node:test binding');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); function helper() { const test = () => {}; test('fake', () => assert.ok(true)); }"), false,
    'a shadowed local declaration must not impersonate the imported node:test binding');
  assert.equal(hasRegisteredTestCase("let { test } = require('node:test'); test = () => {}; test('fake', () => assert.ok(true));"), false,
    'reassigning an imported test binding must not count as a node:test registration');
  assert.equal(hasRegisteredTestCase("import { test } from 'node:test'; function helper(test) { test('fake', () => assert.ok(true)); }"), false,
    'ES module test imports must also reject shadowed registrations');
  assert.equal(hasRegisteredTestCase("const { it } = require('node:test'); it('valid', () => assert.ok(true));"), true,
    'a genuine CommonJS it binding must be accepted');
  assert.equal(hasRegisteredTestCase("const test = require('./fake-test'); test('fake', () => assert.ok(true));"), false,
    'a test helper from another module must not impersonate node:test');
  assert.equal(hasRegisteredTestCase("const test = require('node:test'); test('valid', () => assert.ok(true));"), true,
    'a CommonJS default node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("const { test } = require('node:test'); test('valid', () => assert.ok(true));"), true,
    'a CommonJS named node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("import test from 'node:test'; test('valid', () => assert.ok(true));"), true,
    'an ES module default node:test binding must be accepted');
  assert.equal(hasRegisteredTestCase("import { test } from 'node:test'; test('valid', () => assert.ok(true));"), true,
    'an ES module named node:test binding must be accepted');

  for (const file of testFiles) {
    const relative = path.relative(repositoryRoot, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(hasRegisteredTestCase(source),
      relative + ' must register at least one named test(); a placeholder/helper-only file is not a regression suite');
  }
});
