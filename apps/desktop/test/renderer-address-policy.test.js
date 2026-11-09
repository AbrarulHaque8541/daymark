'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const start = rendererSource.indexOf('function isLocal(');
const end = rendererSource.indexOf('\n\nfunction activeTab()', start);
assert.notEqual(start, -1, 'renderer local-host policy should exist');
assert.notEqual(end, -1, 'renderer address helpers should end before activeTab');
const addressHelpers = rendererSource.slice(start, end);
const { isLocal, httpsUpgrade } = vm.runInNewContext(
  `(() => { ${addressHelpers}; return { isLocal, httpsUpgrade }; })()`,
  { URL },
);

test('renderer recognizes bracketed IPv6 loopback as local', () => {
  assert.equal(isLocal('[::1]'), true);
  assert.equal(httpsUpgrade('http://[::1]:3000/dev'), 'http://[::1]:3000/dev');
});

test('renderer preserves localhost exceptions and upgrades remote HTTP', () => {
  assert.equal(httpsUpgrade('http://localhost:3000/dev'), 'http://localhost:3000/dev');
  assert.equal(httpsUpgrade('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080/');
  assert.equal(httpsUpgrade('http://example.com/path'), 'https://example.com/path');
  assert.equal(httpsUpgrade('example.com'), 'https://example.com/');
});
