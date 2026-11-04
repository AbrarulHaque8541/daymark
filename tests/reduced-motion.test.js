const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../motion-policy.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'motion-accessibility.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('reduced-motion stylesheet is loaded after the app presentation styles', () => {
  const baseStyles = html.indexOf('href="styles.css"');
  const efficiencyStyles = html.indexOf('href="styles-motion-efficiency.css"');
  const accessibilityStyles = html.indexOf('href="motion-accessibility.css"');
  assert.ok(baseStyles >= 0 && efficiencyStyles > baseStyles && accessibilityStyles > efficiencyStyles,
    'motion accessibility stylesheet must load after the existing app styles');
});

test('motion policy helper loads before the app script', () => {
  const policyScript = html.indexOf('src="motion-policy.js"');
  const appScript = html.indexOf('src="app.js"');
  assert.ok(policyScript >= 0 && appScript > policyScript,
    'motion policy helper must be available before task action handlers are initialized');
});

test('reduced-motion preference disables CSS animations, transitions, and smooth scrolling', () => {
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(stylesheet, /(?:^|\n)\s*\*(?:,|\s*\{)/,
    'preference rule must cover all elements, not only selected card components');
  assert.match(stylesheet, /animation\s*:\s*none\s*!important/i);
  assert.match(stylesheet, /transition\s*:\s*none\s*!important/i);
  assert.match(stylesheet, /scroll-behavior\s*:\s*auto\s*!important/i);
});

test('focus scrolling is smooth only when the user has not requested reduced motion', () => {
  const queried = [];
  assert.equal(policy.focusScrollBehavior((query) => {
    queried.push(query);
    return { matches: false };
  }), 'smooth');
  assert.equal(policy.focusScrollBehavior(() => ({ matches: true })), 'auto');
  assert.deepEqual(queried, ['(prefers-reduced-motion: reduce)']);
});

test('focus scrolling safely avoids animation when the preference API is unavailable or fails', () => {
  assert.equal(policy.focusScrollBehavior(undefined), 'auto');
  assert.equal(policy.focusScrollBehavior(() => { throw new Error('media query unavailable'); }), 'auto');
});

test('task focus action uses the shared reduced-motion policy', () => {
  assert.match(app, /DaymarkMotionPolicy\.focusScrollBehavior\(\)/);
});
