const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

test('professional glass design tokens are preserved', () => {
  assert.match(styles, /--accent:\s*#16705f/);
  assert.match(styles, /--glass-blur:\s*saturate\(160%\)\s*blur\(18px\)/);
  assert.match(styles, /backdrop-filter:\s*var\(--glass-blur\)/);
  assert.doesNotMatch(styles, /cartoon|comic|sketch/i);
});
