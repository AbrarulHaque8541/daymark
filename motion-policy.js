(function exposeMotionPolicy(root) {
  'use strict';

  function focusScrollBehavior(matchMedia = root && typeof root.matchMedia === 'function'
    ? root.matchMedia.bind(root)
    : null) {
    if (typeof matchMedia !== 'function') return 'auto';
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    } catch (_) {
      return 'auto';
    }
  }

  const policy = Object.freeze({ focusScrollBehavior });
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else if (root) root.DaymarkMotionPolicy = policy;
})(typeof window !== 'undefined' ? window : globalThis);
