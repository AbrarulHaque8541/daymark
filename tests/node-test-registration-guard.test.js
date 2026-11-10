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

test('fails closed when test options can dynamically enable skip or todo', () => {
  const cases = [
    [`const { test } = require('node:test'); test('computed skip', { ['skip']: true }, () => assert.ok(true));`, false, 'computed literal skip key'],
    [`const { test } = require('node:test'); test('dynamic skip', { skip: process.env.CI }, () => assert.ok(true));`, false, 'dynamic skip value'],
    [`const { test } = require('node:test'); test('dynamic todo', { todo: shouldBeTodo }, () => assert.ok(true));`, false, 'dynamic todo value'],
    [`const { test } = require('node:test'); test('spread options', { ...sharedOptions }, () => assert.ok(true));`, false, 'spread options'],
    [`const { test } = require('node:test'); test('computed key', { [optionName]: true }, () => assert.ok(true));`, false, 'dynamic computed key'],
    [`const { test } = require('node:test'); const options = { skip: true }; test('opaque options', options, () => assert.ok(true));`, false, 'opaque options binding'],
    [`const { test } = require('node:test'); test('literal false flags', { skip: false, todo: false, timeout: 100 }, () => assert.ok(true));`, true, 'literal false flags'],
    [`const { test } = require('node:test'); test('ordinary computed option', { ['timeout']: 100 }, () => assert.ok(true));`, true, 'unrelated static computed key'],
    [`const { test } = require('node:test'); test('empty reason', { skip: '', todo: null }, () => assert.ok(true));`, true, 'empty literal flags'],
    [`const { test, describe } = require('node:test'); describe('dynamic suite', { ['todo']: shouldBeTodo }, () => { test('nested', () => assert.ok(true)); });`, false, 'dynamic skipped suite']
  ];
  for (const [source, expected, label] of cases) {
    assert.equal(hasRegisteredTestCase(source), expected, label);
  }
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

test('fails closed when a with statement can intercept imported test identifiers', () => {
  const intercepted = [
    "const { test } = require('node:test');",
    "with ({ test: () => {} }) { test('fake', () => assert.ok(true)); }"
  ].join('\n');
  const unrelatedWith = [
    "const { test } = require('node:test');",
    "test('otherwise valid', () => assert.ok(true));",
    "with ({ value: 1 }) { void value; }"
  ].join('\n');

  assert.equal(hasRegisteredTestCase(intercepted), false);
  assert.equal(hasRegisteredTestCase(unrelatedWith), false,
    'the scanner must reject any file containing an unmodelled dynamic object environment');
});

test('rejects computed writes to a CommonJS node:test module object', () => {
  const source = [
    "const nodeTest = require('node:test');",
    "nodeTest['te' + 'st'] = () => {};",
    "nodeTest.test('fake', () => assert.ok(true));"
  ].join('\n');
  assert.equal(hasRegisteredTestCase(source), false,
    'a dynamic computed write must invalidate the imported module binding');
});

test('recognizes CommonJS member imports and awaited dynamic ESM imports', () => {
  const cases = [
    ["const test = require('node:test').test; test('real', () => assert.ok(true));", true, 'CommonJS test member'],
    ["const register = require('node:test').it; register('real', () => assert.ok(true));", true, 'CommonJS it member alias'],
    ["const { test: register } = await import('node:test'); register('real', () => assert.ok(true));", true, 'dynamic ESM named alias'],
    ["const nodeTest = await import('node:test'); nodeTest.test('real', () => assert.ok(true));", true, 'dynamic ESM namespace'],
    ["const register = (await import('node:test')).test; register('real', () => assert.ok(true));", true, 'dynamic ESM member alias'],
    ["const { default: register } = await import('node:test'); register('real', () => assert.ok(true));", true, 'dynamic ESM default alias'],
    ["const { test } = await import('node:assert'); test('fake', () => assert.ok(true));", false, 'unrelated dynamic import'],
    ["function require() { return { test() {} }; } const register = require('node:test').test; register('fake', () => assert.ok(true));", false, 'shadowed CommonJS require']
  ];
  for (const [source, expected, label] of cases) {
    assert.equal(hasRegisteredTestCase(source), expected, label);
  }
});
