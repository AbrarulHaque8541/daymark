'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasRegisteredTestCase } = require('./helpers/node-test-registration-guard');

test('rejects regex-literal text after a completed function declaration', () => {
  const source = [
    "const test = require('node:test');",
    'function helper() {}',
    "/test('fake', () => assert.ok(true))/.test('x');"
  ].join('\n');
  assert.equal(hasRegisteredTestCase(source), false);
});

test('rejects logical and destructuring reassignment of imported test bindings', () => {
  const cases = [
    ["let test = require('node:test'); test ||= () => {}; test('fake', () => assert.ok(true));", 'logical OR assignment'],
    ["let test = require('node:test'); test &&= () => {}; test('fake', () => assert.ok(true));", 'logical AND assignment'],
    ["let test = require('node:test'); test ??= () => {}; test('fake', () => assert.ok(true));", 'nullish assignment'],
    ["let test = require('node:test'); ({ test } = { test: () => {} }); test('fake', () => assert.ok(true));", 'destructuring assignment'],
    ["let { test: register } = require('node:test'); register = () => {}; register('fake', () => assert.ok(true));", 'aliased reassignment'],
    ["let test = require('node:test'); test++; test('fake', () => assert.ok(true));", 'update expression']
  ];
  for (const [source, label] of cases) assert.equal(hasRegisteredTestCase(source), false, label);
});

test('recognizes CommonJS and ESM aliases of node:test', () => {
  const cases = [
    ["const test = require('node:test'); test('real', () => assert.ok(true));", 'CommonJS default require'],
    ["const nodeTest = require('node:test'); nodeTest.test('real', () => assert.ok(true));", 'CommonJS default module property'],
    ["const { test: register } = require('node:test'); register('real', () => assert.ok(true));", 'CommonJS named alias'],
    ["import { test as register } from 'node:test'; register('real', () => assert.ok(true));", 'ESM named alias'],
    ["import test from 'node:test'; test('real', () => assert.ok(true));", 'ESM default import'],
    ["const nodeTest = require('node:test'); nodeTest.test('real', () => assert.ok(true));", 'CommonJS namespace'],
    ["import * as nodeTest from 'node:test'; nodeTest.it('real', () => assert.ok(true));", 'ESM namespace'],
    ["const { it: spec } = require('node:test'); spec('real', () => assert.ok(true));", 'CommonJS it alias']
  ];
  for (const [source, label] of cases) assert.equal(hasRegisteredTestCase(source), true, label);
});

test('resolves nested lexical scopes without poisoning an outer registration', () => {
  const parameterShadow = [
    "const { test } = require('node:test');",
    "function helper(test) { test('not registered', () => assert.ok(true)); }",
    "test('real', () => assert.ok(true));"
  ].join('\n');
  const localShadow = [
    "const { test } = require('node:test');",
    'function helper() {',
    '  const test = () => {};',
    "  test('not registered', () => assert.ok(true));",
    '}',
    "test('real', () => assert.ok(true));"
  ].join('\n');
  const onlyShadowedCalls = [
    "const { test } = require('node:test');",
    "function helper(test) { test('not registered', () => assert.ok(true)); }"
  ].join('\n');

  assert.equal(hasRegisteredTestCase(parameterShadow), true);
  assert.equal(hasRegisteredTestCase(localShadow), true);
  assert.equal(hasRegisteredTestCase(onlyShadowedCalls), false);
});

test('rejects focused, skipped, todo-only, and skipped-suite registrations', () => {
  const cases = [
    ["const { test } = require('node:test'); test.only('focused', () => assert.ok(true));", 'focused test'],
    ["const { test, describe } = require('node:test'); describe.only('focused', () => { test('nested', () => assert.ok(true)); });", 'focused suite'],
    ["const { test } = require('node:test'); test.skip('skipped', () => assert.ok(true));", 'skipped test'],
    ["const { test } = require('node:test'); test.todo('todo');", 'todo test'],
    ["const { test, describe } = require('node:test'); describe.skip('skipped', () => { test('nested', () => assert.ok(true)); });", 'skipped suite'],
    ["const { test, describe } = require('node:test'); describe('skipped', { skip: true }, () => { test('nested', () => assert.ok(true)); });", 'skip suite option'],
    ["const { test } = require('node:test'); test('skipped', { skip: true }, () => assert.ok(true));", 'skip option'],
    ["const { test } = require('node:test'); test('todo', { todo: 'not implemented' }, () => assert.ok(true));", 'todo option']
  ];
  for (const [source, label] of cases) assert.equal(hasRegisteredTestCase(source), false, label);
});

test('requires a non-empty inline callback and fails closed on invalid syntax', () => {
  const cases = [
    ["const { test } = require('node:test'); test('empty', () => {});", false, 'empty arrow'],
    ["const { test } = require('node:test'); test('empty', function () {});", false, 'empty function'],
    ["const { test } = require('node:test'); test('empty', () => { return undefined; });", false, 'return undefined'],
    ["const { test } = require('node:test'); test('empty', () => undefined);", false, 'undefined expression'],
    ["const { test } = require('node:test'); test('real', async () => { await Promise.resolve(); assert.ok(true); });", true, 'async callback'],
    ["const { test } = require('node:test'); test('real', () => assert.ok(true));", true, 'expression callback'],
    ["const { test } = require('node:test'); test('real', function () { assert.ok(true); });", true, 'function callback'],
    ["const { test = } = require('node:test');", false, 'invalid syntax']
  ];
  for (const [source, expected, label] of cases) assert.equal(hasRegisteredTestCase(source), expected, label);
});
