'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const desktopWorkspace = path.resolve(process.cwd()) === path.resolve(__dirname, '..');

test('the installed Electron binary starts and reports the exact supported stable version', () => {
  // The repository-wide suite does not install apps/desktop dependencies. The
  // same named test executes the real binary in desktop CI after its own npm ci.
  if (!desktopWorkspace) {
    assert.notEqual(path.resolve(process.cwd()), path.resolve(__dirname, '..'),
      'the root suite must not pretend it has installed the desktop runtime');
    return;
  }

  const electronBinary = require('electron');
  assert.equal(typeof electronBinary, 'string', 'Node must resolve the installed Electron executable path');
  assert.ok(path.isAbsolute(electronBinary), 'Electron executable path must be absolute');

  // Node mode exercises the actual Electron binary without requiring a GUI/display server.
  const result = spawnSync(electronBinary, ['-p', "process.versions.electron + '|' + process.versions.node"], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'Electron Node-mode process must exit normally: ' + (result.stderr || ''));
  assert.equal(result.status, 0, 'Electron Node-mode process must exit successfully: ' + (result.stderr || ''));
  assert.equal(String(result.stdout || '').trim(), '45.3.0|24.22.2',
    'the launched Electron binary must expose Electron 45.3.0 and its embedded Node 24.22.2 runtime');
});
