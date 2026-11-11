'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('the installed Electron binary starts and reports the exact supported stable version', () => {
  const electronBinary = require('electron');
  assert.equal(typeof electronBinary, 'string', 'Node must resolve the installed Electron executable path');
  assert.ok(path.isAbsolute(electronBinary), 'Electron executable path must be absolute');

  const result = spawnSync(electronBinary, ['--version'], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'Electron must exit normally');
  assert.equal(result.status, 0, 'Electron --version must exit successfully: ' + (result.stderr || ''));
  assert.match(String(result.stdout || '').trim(), /^v?45\\.3\\.0$/,
    'the launched Electron runtime must be exactly 45.3.0');
});
