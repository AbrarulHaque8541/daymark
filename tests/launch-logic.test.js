'use strict';

const test = require('node:test');
const assert = require('node:assert');

const logic = globalThis.DaymarkLaunch || require('../launch-logic.js');

test('normalizeCount accepts whole counts from 1 to 10', () => {
  assert.strictEqual(logic.normalizeCount(1), 1);
  assert.strictEqual(logic.normalizeCount(10), 10);
  assert.strictEqual(logic.normalizeCount('5'), 5);
  assert.strictEqual(logic.normalizeCount(' 7 '), 7);
});

test('normalizeCount rejects out-of-range, fractional and junk input', () => {
  assert.strictEqual(logic.normalizeCount(0), null);
  assert.strictEqual(logic.normalizeCount(11), null);
  assert.strictEqual(logic.normalizeCount(2.5), null);
  assert.strictEqual(logic.normalizeCount('soon'), null);
  assert.strictEqual(logic.normalizeCount(null), null);
  assert.strictEqual(logic.normalizeCount(''), null);
});

test('buildLaunchesUrl builds the exact keyless HTTPS endpoint', () => {
  assert.strictEqual(
    logic.buildLaunchesUrl(5),
    'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5'
  );
  assert.throws(() => logic.buildLaunchesUrl(99), /between 1 and 10/);
});

test('the launch endpoint is HTTPS-only on the public API host', () => {
  assert.ok(logic.LAUNCH_ENDPOINT.startsWith('https://ll.thespacedevs.com/'));
});

test('formatLaunchTime renders a readable UTC stamp and rejects junk', () => {
  assert.strictEqual(logic.formatLaunchTime('2026-11-17T09:30:00Z'), '2026-11-17 09:30 UTC');
  assert.strictEqual(logic.formatLaunchTime('not a date'), null);
  assert.strictEqual(logic.formatLaunchTime(''), null);
  assert.strictEqual(logic.formatLaunchTime(undefined), null);
});

test('describeStatus maps known abbreviations and never guesses unknown ones', () => {
  assert.strictEqual(logic.describeStatus('Go'), 'On schedule');
  assert.strictEqual(logic.describeStatus('TBC'), 'Date not final yet');
  assert.strictEqual(logic.describeStatus('TBD'), 'Date not final yet');
  assert.strictEqual(logic.describeStatus('Hold'), 'On hold');
  assert.strictEqual(logic.describeStatus('Hold '.trim()), 'On hold');
  assert.strictEqual(logic.describeStatus('Weird'), 'Reported as Weird');
  assert.strictEqual(logic.describeStatus(''), 'Status unknown');
  assert.strictEqual(logic.describeStatus(null), 'Status unknown');
});

test('capText truncates with an honest flag and refuses control characters', () => {
  const short = logic.capText('Falcon 9', 20);
  assert.strictEqual(short.text, 'Falcon 9');
  assert.strictEqual(short.truncated, false);
  const long = logic.capText('x'.repeat(300), 200);
  assert.strictEqual(long.text.length, 200);
  assert.strictEqual(long.truncated, true);
  assert.strictEqual(logic.capText('bad\u0007value', 20), null);
  assert.strictEqual(logic.capText(42, 20), null);
});

const sampleLaunch = (overrides) => Object.assign({
  name: 'Starlink Group 12-4',
  net: '2026-11-18T04:15:00Z',
  status: { abbrev: 'Go' },
  launch_service_provider: { name: 'SpaceX' },
  rocket: { configuration: { name: 'Falcon 9' } },
  pad: { location: { name: 'Cape Canaveral, FL, USA' } }
}, overrides || {});

const samplePayload = (results) => ({ count: results.length, results: results });

test('parseLaunches maps every readable field of a good payload', () => {
  const parsed = logic.parseLaunches(samplePayload([sampleLaunch()]), 5);
  assert.strictEqual(parsed.launches.length, 1);
  const launch = parsed.launches[0];
  assert.strictEqual(launch.name, 'Starlink Group 12-4');
  assert.strictEqual(launch.provider, 'SpaceX');
  assert.strictEqual(launch.rocket, 'Falcon 9');
  assert.strictEqual(launch.pad, 'Cape Canaveral, FL, USA');
  assert.strictEqual(launch.when, '2026-11-18 04:15 UTC');
  assert.strictEqual(launch.statusText, 'On schedule');
  assert.strictEqual(parsed.truncatedFields, 0);
});

test('parseLaunches caps the rendered list at eight launches', () => {
  const many = [];
  for (let i = 0; i < 20; i += 1) many.push(sampleLaunch({ name: 'Launch ' + i }));
  const parsed = logic.parseLaunches(samplePayload(many), 10);
  assert.strictEqual(parsed.launches.length, logic.MAX_LAUNCHES);
});

test('parseLaunches honors a smaller requested count', () => {
  const many = [];
  for (let i = 0; i < 8; i += 1) many.push(sampleLaunch({ name: 'Launch ' + i }));
  const parsed = logic.parseLaunches(samplePayload(many), 3);
  assert.strictEqual(parsed.launches.length, 3);
});

test('parseLaunches throws on malformed payloads', () => {
  assert.throws(() => logic.parseLaunches(null, 5), /malformed/);
  assert.throws(() => logic.parseLaunches({}, 5), /malformed/);
  assert.throws(() => logic.parseLaunches({ results: 'nope' }, 5), /malformed/);
});

test('parseLaunches throws when nothing readable remains', () => {
  assert.throws(
    () => logic.parseLaunches(samplePayload([{ name: '   ' }, { name: 'bad\u0007name' }]), 5),
    /No readable upcoming launches/
  );
});

test('parseLaunches truncates oversized names and says so', () => {
  const parsed = logic.parseLaunches(
    samplePayload([sampleLaunch({ name: 'y'.repeat(400) })]),
    5
  );
  assert.strictEqual(parsed.launches[0].name.length, logic.MAX_NAME_CHARS);
  assert.strictEqual(parsed.truncatedFields, 1);
});

test('parseLaunches tolerates missing provider, rocket, pad and time', () => {
  const parsed = logic.parseLaunches(
    samplePayload([sampleLaunch({
      launch_service_provider: undefined,
      rocket: undefined,
      pad: undefined,
      net: 'whenever'
    })]),
    5
  );
  assert.strictEqual(parsed.launches[0].provider, '');
  assert.strictEqual(parsed.launches[0].rocket, '');
  assert.strictEqual(parsed.launches[0].pad, '');
  assert.strictEqual(parsed.launches[0].when, null);
  assert.strictEqual(parsed.launches[0].whenText, 'No readable launch time');
});

test('classifyLaunchError explains rate limits, rejections, server faults and timeouts', () => {
  assert.ok(logic.classifyLaunchError(new Error('HTTP 429')).includes('limited this request'));
  assert.ok(logic.classifyLaunchError(new Error('HTTP 403')).includes('limited this request'));
  assert.ok(logic.classifyLaunchError(new Error('HTTP 404')).includes('rejected the request'));
  assert.ok(logic.classifyLaunchError(new Error('HTTP 503')).includes('server problem'));
  assert.ok(logic.classifyLaunchError(new Error('The launch request timed out.')).includes('timed out'));
  assert.ok(logic.classifyLaunchError(new Error('The launch response was too large to read safely.')).includes('too large'));
  assert.strictEqual(logic.classifyLaunchError(new Error('mystery')), null);
  assert.strictEqual(logic.classifyLaunchError(null), null);
});

test('fetchUpcomingLaunches returns a complete record on the happy path', async () => {
  let requested = null;
  let initSeen = null;
  const record = await logic.fetchUpcomingLaunches(3, async (url, init) => {
    requested = url;
    initSeen = init;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: new TextEncoder().encode(JSON.stringify(samplePayload([sampleLaunch()]))) };
            },
            cancel: async () => {},
            releaseLock: () => {}
          };
        }
      }
    };
  }, { now: () => '2026-11-17T10:00:00.000Z' });
  assert.strictEqual(requested, 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=3');
  assert.strictEqual(initSeen.credentials, 'omit');
  assert.strictEqual(initSeen.cache, 'no-store');
  assert.strictEqual(initSeen.redirect, 'error');
  assert.strictEqual(record.version, 1);
  assert.strictEqual(record.count, 3);
  assert.strictEqual(record.launches.length, 1);
  assert.strictEqual(record.fetchedAt, '2026-11-17T10:00:00.000Z');
});

test('fetchUpcomingLaunches rejects an invalid count before any network call', async () => {
  let called = 0;
  await assert.rejects(
    () => logic.fetchUpcomingLaunches(50, async () => { called += 1; return { ok: true }; }),
    /between 1 and 10/
  );
  assert.strictEqual(called, 0);
});

test('fetchUpcomingLaunches surfaces HTTP failures for the classifier', async () => {
  await assert.rejects(
    () => logic.fetchUpcomingLaunches(5, async () => ({ ok: false, status: 429 })),
    /HTTP 429/
  );
});

test('fetchUpcomingLaunches requires a fetch implementation', async () => {
  await assert.rejects(() => logic.fetchUpcomingLaunches(5, null), /fetch unavailable/);
});
