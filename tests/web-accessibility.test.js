const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  assert.fail('unbalanced CSS block');
}

function splitSelectors(prelude) {
  const selectors = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < prelude.length; index += 1) {
    const character = prelude[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '[' || character === '(') depth += 1;
    else if (character === ']' || character === ')') depth -= 1;
    else if (character === ',' && depth === 0) {
      selectors.push(prelude.slice(start, index).trim());
      start = index + 1;
    }
  }
  selectors.push(prelude.slice(start).trim());
  return selectors.filter(Boolean);
}

function declarationsFrom(block) {
  const declarations = new Map();
  for (const entry of block.split(';')) {
    const colon = entry.indexOf(':');
    if (colon < 0) continue;
    const property = entry.slice(0, colon).trim().toLowerCase();
    const value = entry.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
    if (property) declarations.set(property, value);
  }
  return declarations;
}

function parseRules(source, dark = false, rules = []) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf('{', cursor);
    if (open < 0) break;
    const prelude = clean.slice(cursor, open).trim();
    const close = matchingBrace(clean, open);
    const body = clean.slice(open + 1, close);
    cursor = close + 1;

    if (!prelude) continue;
    if (prelude.startsWith('@media')) {
      const darkMedia = /prefers-color-scheme\s*:\s*dark/i.test(prelude);
      parseRules(body, dark || darkMedia, rules);
    } else if (!prelude.startsWith('@')) {
      for (const selector of splitSelectors(prelude)) {
        rules.push({ selector, declarations: declarationsFrom(body), dark, order: rules.length });
      }
    }
  }
  return rules;
}

const rules = parseRules(css);

function effectiveDeclaration(selector, property, dark) {
  const matches = rules.filter((rule) => rule.selector === selector && (!rule.dark || dark));
  const declaration = matches
    .filter((rule) => rule.declarations.has(property))
    .sort((first, second) => first.order - second.order)
    .at(-1);
  assert.ok(declaration, `expected an effective ${property} declaration for ${selector} in ${dark ? 'dark' : 'light'} mode`);
  return declaration.declarations.get(property);
}

function rootProperty(name, dark) {
  const matches = rules.filter((rule) => rule.selector === ':root' && (!rule.dark || dark));
  const declaration = matches
    .filter((rule) => rule.declarations.has(name))
    .sort((first, second) => first.order - second.order)
    .at(-1);
  assert.ok(declaration, `expected ${name} in the effective ${dark ? 'dark' : 'light'} root palette`);
  return declaration.declarations.get(name).toLowerCase();
}

function resolveColor(value, dark) {
  const variable = value.match(/^var\((--[\w-]+)\)$/);
  if (variable) return rootProperty(variable[1], dark);
  assert.match(value, /^#[0-9a-f]{6}$/i, `expected a resolvable six-digit color, got ${value}`);
  return value.toLowerCase();
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const mutedSmallTextSelectors = [
  '.rail-label',
  '.topbar',
  '.eyebrow',
  '.stat-label',
  '.composer-intro p',
  '.composer-hint',
  '.add-form input::placeholder',
  '.task-tools input::placeholder',
  '.task-chip',
  '.task-row.is-complete .task-title',
  '.empty-state p',
  '.suggestion-empty',
  '.subtask-row.is-done .subtask-title',
  '.subtask-remove',
  '.subtask-empty',
  '.stat-cell-label',
  '.briefing-description',
  '.feed-form input::placeholder',
  '.feed-status',
  '.feed-item-date',
  '.feed-item-summary',
  '.feed-empty'
];

const briefingSmallTextSelectors = [
  '.feed-item-link',
  '.feed-item-title'
];

const lightSurfaces = ['#ffffff', '#f2f5f7', '#e2f0eb'];
const darkSurfaces = ['#0e1216', '#12171c', '#161c22', '#1a2128', '#1a3a32'];

test('muted small-copy colors meet WCAG AA in the effective light and dark cascades', () => {
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';
    const surfaces = dark ? darkSurfaces : lightSurfaces;
    const expectedToken = 'var(--muted-text)';
    const tokenColor = rootProperty('--muted-text', dark);
    assert.match(tokenColor, /^#[0-9a-f]{6}$/i, `${theme} muted-text token must resolve to a six-digit color`);

    for (const selector of mutedSmallTextSelectors) {
      const declaredColor = effectiveDeclaration(selector, 'color', dark);
      assert.equal(declaredColor, expectedToken,
        `${selector} must use the theme-aware muted-text token in the effective ${theme} cascade`);
      const foreground = resolveColor(declaredColor, dark);
      for (const background of surfaces) {
        assert.ok(contrastRatio(foreground, background) >= 4.5,
          `${selector} must reach 4.5:1 in ${theme} mode on ${background}`);
      }
    }

    for (const selector of briefingSmallTextSelectors) {
      const foreground = resolveColor(effectiveDeclaration(selector, 'color', dark), dark);
      for (const background of surfaces) {
        assert.ok(contrastRatio(foreground, background) >= 4.5,
          `${selector} must reach 4.5:1 in ${theme} mode on ${background}`);
      }
    }
  }
});

test('the dark subtask regression clears the 4.48:1 #77848e on #161c22 edge case', () => {
  const knownFailingRatio = contrastRatio('#77848e', '#161c22');
  assert.equal(Number(knownFailingRatio.toFixed(2)), 4.48);
  assert.ok(knownFailingRatio < 4.5, 'the old gray must remain documented as below WCAG AA');

  for (const selector of ['.subtask-remove', '.subtask-empty']) {
    const foreground = resolveColor(effectiveDeclaration(selector, 'color', true), true);
    assert.ok(contrastRatio(foreground, '#161c22') >= 4.5,
      `${selector} must pass on the dark subtask surface, not use the old #77848e color`);
  }
});
