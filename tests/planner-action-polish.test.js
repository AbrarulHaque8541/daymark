'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const ACTIONS = [
  ['browser-download-check', 'Plan a sample download safety check', 'Plan'],
  ['browser-download-clear', 'Clear the download safety plan', 'Clear'],
  ['browser-proxy-plan', 'Plan a proxy address validation', 'Plan'],
  ['browser-proxy-clear', 'Clear the proxy check', 'Clear'],
  ['permission-lifecycle-explain', 'Explain the selected permission lifecycle', 'Explain'],
  ['permission-lifecycle-clear', 'Clear the permission explanation', 'Clear'],
  ['url-insights-explain', 'Explain the address bar input', 'Explain'],
  ['url-insights-clear', 'Clear the address explanation', 'Clear plan'],
  ['capability-registry-describe', 'Describe the selected capability', 'Describe'],
  ['capability-registry-clear', 'Clear the capability description', 'Clear'],
  ['storage-check', 'Check local browser storage health', 'Check'],
  ['storage-clear', 'Clear the storage status', 'Clear status']
];

function buttonForId(id) {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
    .filter(([, attributes]) => new RegExp(`\\bid="${id}"(?:\\s|$)`).test(attributes));
  assert.equal(buttons.length, 1, `expected exactly one button with id ${id}`);
  return buttons[0];
}

function ruleBodyContaining(source, selector, startAt = 0) {
  const selectorAt = source.indexOf(selector, startAt);
  assert.notEqual(selectorAt, -1, `expected CSS selector ${selector}`);
  const openAt = source.indexOf('{', selectorAt);
  const closeAt = source.indexOf('}', openAt);
  assert.ok(openAt > selectorAt && closeAt > openAt, `expected a CSS rule for ${selector}`);
  return source.slice(openAt + 1, closeAt);
}

test('planner actions add contextual titles without replacing their visible labels', () => {
  for (const [id, expectedTitle, expectedLabel] of ACTIONS) {
    const [, attributes, innerHtml] = buttonForId(id);
    const title = attributes.match(/\btitle="([^"]*)"/);
    assert.ok(title, `${id} must have a descriptive title`);
    assert.equal(title[1], expectedTitle, `${id} title should explain its action in context`);
    const visibleLabel = innerHtml.replace(/<[^>]*>/g, '').trim();
    assert.equal(visibleLabel, expectedLabel, `${id} must retain its visible button name`);
  }
});

test('planner action press feedback is limited to the intended buttons', () => {
  const pressRuleStart = css.indexOf('#browser-download-check:active');
  assert.notEqual(pressRuleStart, -1, 'planner press-feedback rule must exist');
  const pressRuleBody = ruleBodyContaining(css, '#browser-download-check:active', pressRuleStart);
  assert.match(pressRuleBody, /transform\s*:\s*scale\(0\.96\)/);
  assert.match(pressRuleBody, /background\s*:\s*rgba\(22,\s*112,\s*95,\s*0\.12\)/);

  for (const [id] of ACTIONS) {
    const activeSelector = `#${id}:active`;
    assert.ok(css.includes(activeSelector), `${id} must receive pressed feedback`);
    const ruleStart = css.lastIndexOf('\n#browser-download-check:active', pressRuleStart);
    const groupedRuleEnd = css.indexOf('}', pressRuleStart);
    assert.ok(css.slice(ruleStart, groupedRuleEnd).includes(activeSelector),
      `${id} must be included in the shared planner press rule`);
  }
});

test('reduced motion removes planner press transforms while leaving button interaction enabled', () => {
  const reducedMotionStart = css.indexOf('/* Cycle B: suppress glass press scale when the user prefers reduced motion.');
  assert.notEqual(reducedMotionStart, -1, 'shared reduced-motion press override must exist');
  const mediaStart = css.indexOf('@media (prefers-reduced-motion: reduce)', reducedMotionStart);
  const mediaOpen = css.indexOf('{', mediaStart);
  const ruleOpen = css.indexOf('{', mediaOpen + 1);
  const ruleClose = css.indexOf('}', ruleOpen);
  assert.ok(mediaStart > reducedMotionStart && ruleOpen > mediaOpen && ruleClose > ruleOpen,
    'reduced-motion override must contain a button rule');
  const selectors = css.slice(mediaOpen + 1, ruleOpen);
  const declarations = css.slice(ruleOpen + 1, ruleClose);
  assert.match(declarations, /transform\s*:\s*none\s*;/);

  for (const [id] of ACTIONS) {
    assert.ok(selectors.includes(`#${id}:active`), `${id} must be exempted from scale under reduced motion`);
  }
});
