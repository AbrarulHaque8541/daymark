const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// These language-neutral cases are also consumed by BrowserNetworkPolicySmoke.java.
const fixturePath = path.join(__dirname, '..', 'contracts', 'browser-network-policy.tsv');
const lines = fs.readFileSync(fixturePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

function parseBoolean(value, field, lineNumber) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid boolean for ${field} at fixture line ${lineNumber}: ${value}`);
}

const cases = lines.map((line, index) => {
  const columns = line.split('\t');
  assert.equal(columns.length, 5, `fixture line ${index + 1} must have five tab-separated columns`);
  const names = ['savedOnlineChoice', 'savedExplicitConsent', 'expectedOnlineOptIn',
    'expectedRemoteLoads', 'expectedBlockWebViewLoads'];
  return Object.fromEntries(names.map((name, column) =>
    [name, parseBoolean(columns[column], name, index + 1)]));
});

test('shared browser network policy contract fixtures are valid and fail closed', () => {
  assert.equal(cases.length, 4, 'expected explicit-consent truth table to be complete');
  for (const item of cases) {
    const onlineOptIn = item.savedOnlineChoice && item.savedExplicitConsent;
    assert.equal(onlineOptIn, item.expectedOnlineOptIn);
    assert.equal(onlineOptIn, item.expectedRemoteLoads);
    assert.equal(!onlineOptIn, item.expectedBlockWebViewLoads);
  }
});
