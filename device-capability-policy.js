'use strict';

const SURFACES = Object.freeze(['phone', 'tablet', 'desktop', 'watch', 'ring', 'displayless', 'car', 'eink', 'smart-display']);
const DISPLAYS = Object.freeze(['none', 'glance', 'compact', 'full']);
const INPUTS = Object.freeze(['touch', 'keyboard', 'pointer', 'voice', 'button']);
const FEATURES = Object.freeze(['task-capture', 'task-edit', 'task-review', 'focus-timer', 'reminder-actions', 'browser', 'voice-capture']);

function normalizeSet(values, allowed, label) {
  if (!Array.isArray(values)) throw new TypeError(label + ' must be an array.');
  const result = new Set();
  for (const value of values) {
    if (!allowed.includes(value)) throw new TypeError('Unsupported ' + label + ' value: ' + String(value));
    result.add(value);
  }
  return result;
}

/**
 * Pure capability-to-action policy for desktop/web shells and contract testing.
 * Platform adapters must supply verified capabilities; this module never probes or guesses hardware.
 */
function createDeviceCapabilityProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('A capability profile object is required.');
  }
  const { surface, display } = input;
  if (!SURFACES.includes(surface)) throw new TypeError('Unsupported device surface.');
  if (!DISPLAYS.includes(display)) throw new TypeError('Unsupported display class.');
  if ((surface === 'ring' || surface === 'displayless') && !['none', 'glance'].includes(display)) {
    throw new TypeError('A ring or display-less surface cannot declare a rich display.');
  }
  const inputs = normalizeSet(input.inputs, INPUTS, 'input');
  const features = normalizeSet(input.features, FEATURES, 'feature');
  const richInput = ['touch', 'keyboard', 'pointer'].some((item) => inputs.has(item));
  const simpleInput = richInput || inputs.has('voice') || inputs.has('button');
  const visible = display !== 'none';
  const actions = new Set();

  if (surface !== 'car' && features.has('task-capture') && simpleInput) actions.add('capture-task');
  if (surface !== 'car' && features.has('task-edit') && display === 'full' && richInput) actions.add('edit-task');
  if (surface !== 'car' && features.has('task-review') && visible && (richInput || inputs.has('voice'))) {
    actions.add('review-tasks');
  }
  if (features.has('reminder-actions') && ['button', 'voice', 'touch'].some((item) => inputs.has(item))) {
    actions.add('acknowledge-reminder');
    actions.add('snooze-reminder');
  }
  if (surface !== 'car' && features.has('focus-timer') && simpleInput) {
    actions.add('start-focus');
    actions.add('pause-focus');
    actions.add('finish-focus');
  }
  if (surface !== 'car' && features.has('browser') && display === 'full' && richInput) actions.add('open-browser');
  if (surface !== 'car' && features.has('voice-capture') && inputs.has('voice')) actions.add('voice-capture');

  return Object.freeze({
    surface,
    display,
    inputs: Object.freeze([...inputs]),
    features: Object.freeze([...features]),
    actions: Object.freeze([...actions].sort())
  });
}

const api = Object.freeze({ SURFACES, DISPLAYS, INPUTS, FEATURES, createDeviceCapabilityProfile });
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.DaymarkDeviceCapabilityPolicy = api;
