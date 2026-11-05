const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const rootReadme = readRepoFile('README.md');
const androidReadme = readRepoFile('android-app/README.md');
const acceptance = readRepoFile('android-app/V1_ACCEPTANCE.md')
  .split('## Historical weekly review evidence (2026-10-12)')[0];
const design = readRepoFile('android-app/ANDROID_DESIGN.md');
const plan = readRepoFile('PROJECT_PLAN.md')
  .split('## Browser, models, providers, and terms')[1]
  .split('\n## ')[0];
const parity = readRepoFile('docs/PLATFORM_PARITY_CONTRACT.md');
const adr = readRepoFile('docs/adr/0001-cross-platform-shell-and-browser-engine.md');

test('current browser documentation describes Online-by-default tap-to-connect behavior', () => {
  assert.match(rootReadme, /networking defaults to Online/);
  assert.match(androidReadme, /Browser networking starts Online by default/);
  assert.match(acceptance, /Fresh installs default Online/);
  assert.match(design, /Browser networking starts Online by default/);
  assert.match(plan, /Fresh installs now start Online by default/);

  const currentDocs = [rootReadme, androidReadme, acceptance, design, plan, parity, adr].join('\n');
  assert.doesNotMatch(currentDocs,
    /(?:browser networking starts Offline|fresh install is Offline|offline-by-default plus explicit consent|HTTPS-only navigation and that HTTP links)/i);
});

test('current browser documentation keeps the HTTP cleartext mismatch explicit and unverified', () => {
  assert.match(rootReadme, /app-wide cleartext setting remains disabled/);
  assert.match(androidReadme, /usesCleartextTraffic="false"/);
  assert.match(acceptance, /usesCleartextTraffic=false/);
  assert.match(design, /HTTP WebView loading and a visible .*? label remain unresolved/);
  assert.match(plan, /treat HTTP runtime support as unverified/);
  assert.match(parity, /HTTP runtime support is not accepted until device tests pass/);
});
