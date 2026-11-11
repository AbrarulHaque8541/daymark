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

test('desktop browser shell exposes accessible controls and compact styling', () => {
  const rendererDir = path.join(__dirname, '..', 'renderer');
  const markup = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(rendererDir, 'style.css'), 'utf8');

  assert.match(markup, /id="tabs" role="toolbar" aria-label="Open tabs"/);
  assert.match(markup, /id="toolbar" role="toolbar" aria-label="Browser navigation"/);
  assert.match(markup, /id="urlbar"[^>]*aria-label="Search or enter address"/);
  for (const id of ['btn-back', 'btn-fwd', 'btn-reload', 'btn-home', 'btn-find', 'find-prev', 'find-next', 'find-close']) {
    assert.match(markup, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`));
  }
  assert.match(markup, /id="find-count" role="status" aria-live="polite"/);
  assert.match(markup, /id="toast" role="status" aria-live="polite"/);
  assert.match(rendererSource, /class="tab-select" type="button"/);
  assert.match(rendererSource, /class="tab-close" type="button"/);
  assert.match(rendererSource, /newTabBtn\.setAttribute\('aria-label', 'New tab'\)/);
  assert.match(rendererSource, /'Switch to ' \+ title/);
  assert.match(rendererSource, /'Close ' \+ title/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(markup, /<(?:link|script)[^>]+(?:href|src)=["']https?:\/\//i);
});
