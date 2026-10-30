const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../device-capability-policy.js');
const { detectWebSurfaceProfile } = require('../desktop-spike/device-adapter.js');

test('fine pointer and hover produce a full desktop interaction surface', () => {
  const result = detectWebSurfaceProfile(policy, {
    viewportWidth: 1440, finePointer: true, coarsePointer: false, hover: true, maxTouchPoints: 0
  });
  assert.equal(result.surface, 'desktop');
  assert.equal(result.display, 'full');
  assert.equal(result.canCapture, true);
  assert.equal(result.canReview, true);
});

test('touch-only wide viewport is a tablet compact surface', () => {
  const result = detectWebSurfaceProfile(policy, {
    viewportWidth: 800, finePointer: false, coarsePointer: true, hover: false, maxTouchPoints: 10
  });
  assert.equal(result.surface, 'tablet');
  assert.equal(result.display, 'compact');
  assert.ok(result.inputs.includes('touch'));
  assert.equal(result.canCapture, true);
});

test('small touch viewport is a phone glance surface', () => {
  const result = detectWebSurfaceProfile(policy, {
    viewportWidth: 390, finePointer: false, coarsePointer: true, hover: false, maxTouchPoints: 5
  });
  assert.equal(result.surface, 'phone');
  assert.equal(result.display, 'glance');
  assert.equal(result.canCapture, true);
});

test('no reported pointer/touch fails closed for task capture', () => {
  const result = detectWebSurfaceProfile(policy, {
    viewportWidth: 1200, finePointer: false, coarsePointer: false, hover: false, maxTouchPoints: 0
  });
  assert.equal(result.canCapture, false);
  assert.equal(result.canReview, true);
});

test('invalid browser measurements are rejected rather than guessed', () => {
  assert.throws(() => detectWebSurfaceProfile(policy, { viewportWidth: 0 }), TypeError);
  assert.throws(() => detectWebSurfaceProfile(policy, { viewportWidth: 800, maxTouchPoints: -1 }), TypeError);
  assert.throws(() => detectWebSurfaceProfile(null, { viewportWidth: 800 }), TypeError);
});
