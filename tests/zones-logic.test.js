'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zones = require('../zones-logic.js');

const FROZEN = new Date('2026-11-08T12:00:00.000Z');

test('zone ids are normalized against the supported catalog', () => {
  assert.equal(zones.normalizeZoneId(' Asia/Kolkata '), 'Asia/Kolkata');
  assert.equal(zones.normalizeZoneId('Europe/London'), 'Europe/London');
  assert.equal(zones.normalizeZoneId('Mars/Olympus'), null);
  assert.equal(zones.normalizeZoneId(''), null);
  assert.equal(zones.normalizeZoneId(42), null);
  assert.equal(zones.normalizeZoneId(null), null);
});

test('listZones returns a catalog copy and labels resolve or fail closed', () => {
  const list = zones.listZones();
  assert.ok(Array.isArray(list) && list.length >= 10);
  assert.ok(list.every((zone) => typeof zone.id === 'string' && typeof zone.label === 'string'));
  list[0].id = 'tampered';
  assert.equal(zones.listZones()[0].id !== 'tampered', true);
  assert.equal(zones.zoneLabel('Asia/Kolkata'), 'India · Kolkata');
  assert.equal(zones.zoneLabel('Mars/Olympus'), '');
});

test('zone offsets are computed from the platform time-zone database', () => {
  assert.equal(zones.zoneOffsetMinutes('Asia/Kolkata', FROZEN), 330);
  assert.equal(zones.zoneOffsetMinutes('Europe/London', FROZEN), 0);
  assert.equal(zones.zoneOffsetMinutes('America/Los_Angeles', FROZEN), -480);
  assert.equal(zones.zoneOffsetMinutes('Asia/Tokyo', FROZEN), 540);
  assert.throws(() => zones.zoneOffsetMinutes('Mars/Olympus', FROZEN), /supported time zone/);
  assert.throws(() => zones.zoneOffsetMinutes('Asia/Kolkata', null), /valid date/);
  assert.throws(() => zones.zoneOffsetMinutes('Asia/Kolkata', new Date('nope')), /valid date/);
});

test('waking-hour checks use 08:00–22:00 local time', () => {
  assert.equal(zones.localMinuteOfDay(330, FROZEN), 17 * 60 + 30);
  assert.equal(zones.isAwake(330, FROZEN), true);
  assert.equal(zones.isAwake(330, new Date('2026-11-08T18:00:00.000Z')), false);
  assert.equal(zones.isAwake(-480, new Date('2026-11-08T15:30:00.000Z')), false);
  assert.equal(zones.isAwake(-480, new Date('2026-11-08T16:30:00.000Z')), true);
});

test('formatZoneTime renders clock, day, and offset labels', () => {
  const tokyo = zones.formatZoneTime('Asia/Tokyo', FROZEN);
  assert.equal(tokyo.zoneId, 'Asia/Tokyo');
  assert.equal(tokyo.time, '21:00');
  assert.equal(tokyo.dayLabel, 'Sun 08 Nov');
  assert.equal(tokyo.offsetMinutes, 540);
  assert.equal(tokyo.offsetLabel, 'UTC+09');
  assert.throws(() => zones.formatZoneTime('Mars/Olympus', FROZEN), /supported time zone/);
});

test('formatOffset renders signed UTC offsets without inventing minutes', () => {
  assert.equal(zones.formatOffset(330), 'UTC+05:30');
  assert.equal(zones.formatOffset(0), 'UTC+00');
  assert.equal(zones.formatOffset(-480), 'UTC-08');
  assert.equal(zones.formatOffset(-90), 'UTC-01:30');
});

test('zone lists are normalized, de-duplicated, and capped', () => {
  assert.deepEqual(zones.normalizeZoneList(['Asia/Kolkata', ' Asia/Kolkata ', 'Europe/London', 'Mars/Olympus']), {
    zones: ['Asia/Kolkata', 'Europe/London'],
    dropped: 2
  });
  const tooMany = zones.ZONE_CATALOG.map((zone) => zone.id).concat(['Asia/Kolkata']);
  const normalized = zones.normalizeZoneList(tooMany);
  assert.equal(normalized.zones.length, zones.MAX_ZONES);
  assert.ok(normalized.dropped > 0);
  assert.equal(zones.isValidZoneList(normalized.zones), true);
  assert.equal(zones.isValidZoneList([]), false);
  assert.equal(zones.isValidZoneList(['Asia/Kolkata', 'Asia/Kolkata']), false);
  assert.equal(zones.normalizeZoneList('nope'), { zones: [], dropped: 0 });
});

test('zone caches are validated fail-closed', () => {
  const cache = { version: 1, zones: ['Asia/Kolkata', 'Europe/London'], updatedAt: '2026-11-08T09:00:00.000Z' };
  assert.equal(zones.validateZonesCache(cache), true);
  assert.equal(zones.validateZonesCache({ version: 1, zones: [], updatedAt: '2026-11-08T09:00:00.000Z' }), false);
  assert.equal(zones.validateZonesCache({ version: 2, zones: ['Asia/Kolkata'], updatedAt: '2026-11-08T09:00:00.000Z' }), false);
  assert.equal(zones.validateZonesCache({ version: 1, zones: ['Asia/Kolkata'], updatedAt: 'not-a-date' }), false);
  assert.equal(zones.validateZonesCache(null), false);
  assert.equal(zones.validateZonesCache('nope'), false);
});

test('bestOverlap finds a waking window for a single zone', () => {
  const overlap = zones.bestOverlap(['Asia/Kolkata'], FROZEN);
  assert.equal(overlap.totalZones, 1);
  assert.equal(overlap.awakeCount, 1);
  assert.equal(overlap.allAwake, true);
  assert.ok(overlap.start !== null && overlap.end > overlap.start);
});

test('bestOverlap finds an all-awake window across distant zones', () => {
  const overlap = zones.bestOverlap(['Asia/Kolkata', 'Europe/London'], FROZEN);
  assert.equal(overlap.totalZones, 2);
  assert.equal(overlap.awakeCount, 2);
  assert.equal(overlap.allAwake, true);
  assert.ok(overlap.start !== null);
});

test('bestOverlap reports partial windows honestly for an awkward trio', () => {
  const overlap = zones.bestOverlap(['Asia/Tokyo', 'America/Los_Angeles', 'Europe/London'], FROZEN);
  assert.equal(overlap.totalZones, 3);
  assert.ok(overlap.awakeCount >= 1);
  assert.equal(overlap.allAwake, false);
});

test('bestOverlap fails closed on bad input', () => {
  assert.throws(() => zones.bestOverlap([], FROZEN), /at least one time zone/);
  assert.throws(() => zones.bestOverlap(['Mars/Olympus'], FROZEN), /at least one time zone/);
  assert.throws(() => zones.bestOverlap(['Asia/Kolkata'], null), /valid date/);
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof zones.bestOverlap, 'function');
  assert.equal(typeof zones.formatZoneTime, 'function');
  assert.equal(typeof zones.relativeUntilLabel, 'function');
  assert.equal(zones.MAX_ZONES, 6);
  assert.equal(zones.DEFAULT_ZONE, 'Asia/Kolkata');
  assert.equal(zones.WAKE_START_MIN, 480);
  assert.equal(zones.WAKE_END_MIN, 1320);
});

test('relativeUntilLabel reports now, minutes, and hours', () => {
  const from = new Date('2026-11-08T12:00:00.000Z');
  assert.equal(zones.relativeUntilLabel(from.getTime() - 1000, from), 'now');
  assert.equal(zones.relativeUntilLabel(from.getTime() + 30 * 60000, from), 'in 30 min');
  assert.equal(zones.relativeUntilLabel(from.getTime() + 90 * 60000, from), 'in 1 h 30 min');
  assert.equal(zones.relativeUntilLabel(from.getTime() + 120 * 60000, from), 'in 2 h');
  assert.equal(zones.relativeUntilLabel(null, from), '');
  assert.equal(zones.relativeUntilLabel(from.getTime(), null), '');
});
