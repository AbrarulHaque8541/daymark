'use strict';

/**
 * Browser-only capability adapter. It deliberately reports interaction surfaces,
 * not OS/device identity: browsers cannot reliably identify a ring, watch, car,
 * or native host. The caller injects measurements to keep this module testable.
 */
function detectWebSurfaceProfile(policy, environment) {
  if (!policy || typeof policy.createDeviceCapabilityProfile !== 'function') {
    throw new TypeError('The shared device capability policy is required.');
  }
  if (!environment || typeof environment !== 'object') {
    throw new TypeError('Browser capability measurements are required.');
  }
  const width = Number(environment.viewportWidth);
  if (!Number.isFinite(width) || width < 1) throw new TypeError('A positive viewport width is required.');
  const finePointer = environment.finePointer === true;
  const coarsePointer = environment.coarsePointer === true;
  const hover = environment.hover === true;
  const touchPoints = Number(environment.maxTouchPoints || 0);
  if (!Number.isInteger(touchPoints) || touchPoints < 0 || touchPoints > 128) {
    throw new TypeError('Touch point count is outside the supported range.');
  }

  const surface = finePointer && hover ? 'desktop' : width >= 600 ? 'tablet' : 'phone';
  const display = width >= 900 ? 'full' : width >= 600 ? 'compact' : 'glance';
  // HTML text controls support keyboard and IME input even when browsers cannot report
  // whether a physical keyboard is attached. This is an input channel, not a hardware claim.
  const inputs = ['keyboard'];
  if (finePointer) inputs.push('pointer');
  if (coarsePointer || touchPoints > 0) inputs.push('touch');
  const profile = policy.createDeviceCapabilityProfile({
    surface, display, inputs, features: ['task-capture', 'task-review']
  });
  return Object.freeze({
    surface,
    display,
    inputs: Object.freeze(inputs.slice()),
    actions: profile.actions,
    canCapture: profile.actions.includes('capture-task'),
    canReview: profile.actions.includes('review-tasks')
  });
}

const api = Object.freeze({ detectWebSurfaceProfile });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.DaymarkWebSurfaceAdapter = api;
