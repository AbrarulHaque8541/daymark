(function exposeDesignTokens(root) {
  'use strict';

  var THEMES = Object.freeze(['light', 'dark']);
  var STYLE_ID = 'daymark-design-tokens';

  // Semantic design tokens for the Daymark web prototype. Color values mirror
  // the visual language already shipped in the prototype (accent #16705f, calm
  // light surface #f2f5f7 and dark surface #0e1216 from the theme-color meta
  // tags). Adoption is incremental: existing styles keep working unchanged
  // until a component switches to the matching token, so this foundation never
  // alters the current look on its own.
  var TOKENS = [
    { category: 'color', name: 'accent', cssVar: '--daymark-color-accent', light: '#16705f', dark: '#16705f', description: 'Brand accent for primary actions, links and focus rings.' },
    { category: 'color', name: 'accent-soft', cssVar: '--daymark-color-accent-soft', light: '#e2efec', dark: '#123a33', description: 'Quiet tint of the accent for chips and selected rows.' },
    { category: 'color', name: 'surface', cssVar: '--daymark-color-surface', light: '#f2f5f7', dark: '#0e1216', description: 'Page background.' },
    { category: 'color', name: 'surface-raised', cssVar: '--daymark-color-surface-raised', light: '#ffffff', dark: '#171d24', description: 'Cards, dialogs and menus above the page background.' },
    { category: 'color', name: 'text', cssVar: '--daymark-color-text', light: '#1d2733', dark: '#e8edf2', description: 'Primary text.' },
    { category: 'color', name: 'text-muted', cssVar: '--daymark-color-text-muted', light: '#5b6875', dark: '#9aa7b4', description: 'Secondary text, hints and captions.' },
    { category: 'color', name: 'border', cssVar: '--daymark-color-border', light: '#d7dee5', dark: '#2a333d', description: 'Hairline borders and separators.' },
    { category: 'color', name: 'danger', cssVar: '--daymark-color-danger', light: '#a13232', dark: '#e08585', description: 'Destructive actions and error text.' },
    { category: 'color', name: 'success', cssVar: '--daymark-color-success', light: '#16705f', dark: '#4fae9c', description: 'Completion and confirmation states.' },
    { category: 'typography', name: 'font-family-base', cssVar: '--daymark-font-family-base', value: 'system-ui, -apple-system, "Segoe UI", sans-serif', description: 'Base interface font stack.' },
    { category: 'typography', name: 'font-size-base', cssVar: '--daymark-font-size-base', value: '16px', description: 'Base body size; other type sizes derive from it.' },
    { category: 'typography', name: 'font-size-small', cssVar: '--daymark-font-size-small', value: '13px', description: 'Captions and meta text.' },
    { category: 'typography', name: 'font-size-heading', cssVar: '--daymark-font-size-heading', value: '20px', description: 'Card and section headings.' },
    { category: 'typography', name: 'font-weight-strong', cssVar: '--daymark-font-weight-strong', value: '600', description: 'Emphasised labels and headings.' },
    { category: 'typography', name: 'line-height-base', cssVar: '--daymark-line-height-base', value: '1.5', description: 'Base line height for comfortable reading.' },
    { category: 'spacing', name: 'space-1', cssVar: '--daymark-space-1', value: '4px', description: 'Tightest spacing step.' },
    { category: 'spacing', name: 'space-2', cssVar: '--daymark-space-2', value: '8px', description: 'Spacing inside a control.' },
    { category: 'spacing', name: 'space-3', cssVar: '--daymark-space-3', value: '12px', description: 'Spacing between related controls.' },
    { category: 'spacing', name: 'space-4', cssVar: '--daymark-space-4', value: '16px', description: 'Card padding step.' },
    { category: 'spacing', name: 'space-5', cssVar: '--daymark-space-5', value: '24px', description: 'Spacing between cards.' },
    { category: 'spacing', name: 'space-6', cssVar: '--daymark-space-6', value: '32px', description: 'Large section separation.' },
    { category: 'sizing', name: 'control-height', cssVar: '--daymark-control-height', value: '40px', description: 'Standard height for buttons and inputs.' },
    { category: 'sizing', name: 'icon-size', cssVar: '--daymark-icon-size', value: '20px', description: 'Standard inline icon size.' },
    { category: 'sizing', name: 'container-max', cssVar: '--daymark-container-max', value: '1200px', description: 'Maximum content width on large screens.' },
    { category: 'radius', name: 'radius-small', cssVar: '--daymark-radius-small', value: '6px', description: 'Inputs and small chips.' },
    { category: 'radius', name: 'radius-medium', cssVar: '--daymark-radius-medium', value: '10px', description: 'Cards and dialogs.' },
    { category: 'radius', name: 'radius-pill', cssVar: '--daymark-radius-pill', value: '999px', description: 'Pill-shaped buttons and badges.' },
    { category: 'elevation', name: 'elevation-1', cssVar: '--daymark-elevation-1', value: '0 1px 2px rgba(15, 23, 32, 0.08)', description: 'Resting cards.' },
    { category: 'elevation', name: 'elevation-2', cssVar: '--daymark-elevation-2', value: '0 4px 12px rgba(15, 23, 32, 0.12)', description: 'Menus, dialogs and floating panels.' },
    { category: 'border', name: 'border-width-hairline', cssVar: '--daymark-border-width-hairline', value: '1px', description: 'Default hairline border width.' },
    { category: 'border', name: 'border-width-thick', cssVar: '--daymark-border-width-thick', value: '2px', description: 'Focus rings and emphasised borders.' },
    { category: 'motion', name: 'motion-duration-fast', cssVar: '--daymark-motion-duration-fast', value: '120ms', description: 'Press and hover feedback.' },
    { category: 'motion', name: 'motion-duration-base', cssVar: '--daymark-motion-duration-base', value: '180ms', description: 'Small transitions such as reveals.' },
    { category: 'motion', name: 'motion-easing-standard', cssVar: '--daymark-motion-easing-standard', value: 'cubic-bezier(0.2, 0, 0, 1)', description: 'Standard easing for short transitions.' },
    { category: 'motion', name: 'motion-easing-reduced', cssVar: '--daymark-motion-easing-reduced', value: 'linear', description: 'Easing used when reduced motion is requested; see motion-policy.js.' },
    { category: 'touch', name: 'touch-target-min', cssVar: '--daymark-touch-target-min', value: '44px', description: 'Minimum interactive target size for accessibility.' }
  ];

  function normalizeTheme(theme) {
    return theme === undefined ? 'light' : theme;
  }

  function isTheme(theme) {
    return theme === 'light' || theme === 'dark';
  }

  function listTokens() {
    return TOKENS.slice();
  }

  function listCategories() {
    var seen = [];
    for (var i = 0; i < TOKENS.length; i++) {
      if (seen.indexOf(TOKENS[i].category) === -1) seen.push(TOKENS[i].category);
    }
    return seen;
  }

  function getToken(name, theme) {
    var wanted = normalizeTheme(theme);
    if (typeof name !== 'string' || !isTheme(wanted)) return null;
    for (var i = 0; i < TOKENS.length; i++) {
      var t = TOKENS[i];
      if (t.name === name) {
        var value = t.hasOwnProperty('value') ? t.value : t[wanted];
        return { category: t.category, name: t.name, cssVar: t.cssVar, value: value, description: t.description };
      }
    }
    return null;
  }

  function cssVariableLines(theme) {
    var wanted = normalizeTheme(theme);
    if (!isTheme(wanted)) return null;
    return TOKENS.map(function (t) {
      var value = t.hasOwnProperty('value') ? t.value : t[wanted];
      return t.cssVar + ': ' + value + ';';
    });
  }

  function buildStylesheet(theme) {
    var lines = cssVariableLines(theme);
    if (lines === null) return null;
    return ':root {\n  ' + lines.join('\n  ') + '\n}\n';
  }

  function applyTokens(doc, theme) {
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return null;
    var css = buildStylesheet(normalizeTheme(theme));
    if (css === null) return null;
    var existing = doc.getElementById(STYLE_ID);
    if (existing && existing.tagName && String(existing.tagName).toLowerCase() === 'style') {
      existing.textContent = css;
      return existing;
    }
    var el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    if (doc.head) doc.head.appendChild(el);
    else doc.appendChild(el);
    return el;
  }

  function resolveTheme(matchMedia) {
    if (typeof matchMedia !== 'function') return 'light';
    try {
      return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  var api = Object.freeze({
    THEMES: THEMES,
    STYLE_ID: STYLE_ID,
    listTokens: listTokens,
    listCategories: listCategories,
    getToken: getToken,
    cssVariableLines: cssVariableLines,
    buildStylesheet: buildStylesheet,
    applyTokens: applyTokens,
    resolveTheme: resolveTheme
  });

  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.DaymarkDesignTokens = api;

  // Auto-apply tokens in the browser so semantic variables are available for incremental adoption.
  // Fail-closed: any error leaves the page unchanged. No storage, network or timers.
  if (typeof document !== 'undefined' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      var theme = resolveTheme(function (q) { return window.matchMedia(q); });
      applyTokens(document, theme);
    } catch (applyError) {
      // Tokens stay unavailable; existing hard-coded styles continue to work.
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
