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
  assert.equal(tokyo.offsetLabel, 'UTC+09:00');
  const losAngeles = zones.formatZoneTime('America/Los_Angeles', FROZEN);
  assert.equal(losAngeles.time, '04:00');
  assert.equal(losAngeles.offsetLabel, 'UTC-08:00');
  assert.throws(() => zones.formatZoneTime('Mars/Olympus', FROZEN), /supported time zone/);
});

test('formatOffset renders signed UTC offsets without inventing minutes', () => {
  assert.equal(zones.formatOffset(330), 'UTC+05:30');
  assert.equal(zones.formatOffset(0), 'UTC+00:00');
  assert.equal(zones.formatOffset(-480), 'UTC-08:00');
  assert.equal(zones.formatOffset(-210), 'UTC-03:30');
});

test('zone lists are normalized, deduped, and capped', () => {
  const mixed = zones.normalizeZoneList(['Asia/Kolkata', ' Asia/Kolkata ', 'Mars/Olympus', 'Europe/London']);
  assert.deepEqual(mixed.zones, ['Asia/Kolkata', 'Europe/London']);
  assert.equal(mixed.dropped, 2);
  const tooMany = zones.normalizeZoneList([
    'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
    'Europe/London', 'Europe/Berlin', 'Europe/Paris'
  ]);
  assert.equal(tooMany.zones.length, zones.MAX_ZONES);
  assert.equal(tooMany.dropped, 1);
  assert.deepEqual(zones.normalizeZoneList('nope'), { zones: [], dropped: 0 });
});

test('zone caches are validated fail-closed', () => {
  const cache = { version: 1, zones: ['Asia/Kolkata', 'Europe/London'], updatedAt: '2026-11-08T09:00:00.000Z' };
  assert.ok(zones.validateZonesCache(cache));
  assert.ok(!zones.validateZonesCache(Object.assign({}, cache, { version: 2 })));
  assert.ok(!zones.validateZonesCache(Object.assign({}, cache, { zones: [] })));
  assert.ok(!zones.validateZonesCache(Object.assign({}, cache, { zones: ['Asia/Kolkata', 'Asia/Kolkata'] })));
  assert.ok(!zones.validateZonesCache(Object.assign({}, cache, { zones: ['Mars/Olympus'] })));
  assert.ok(!zones.validateZonesCache(Object.assign({}, cache, { updatedAt: 'nope' })));
  assert.ok(!zones.validateZonesCache(null));
});

test('bestOverlap finds a waking window for a single zone', () => {
  const overlap = zones.bestOverlap(['Asia/Kolkata'], FROZEN);
  assert.equal(overlap.allAwake, true);
  assert.equal(overlap.awakeCount, 1);
  assert.equal(overlap.totalZones, 1);
  assert.ok(overlap.start >= FROZEN.getTime());
  assert.ok(overlap.end > overlap.start);
  assert.ok(overlap.end - overlap.start >= zones.SCAN_STEP_MIN * 60000);
  assert.equal(overlap.start % (zones.SCAN_STEP_MIN * 60000), 0, 'windows start on 30-minute boundaries');
});

test('bestOverlap finds an all-awake window across distant zones', () => {
  const overlap = zones.bestOverlap(['Asia/Kolkata', 'America/Los_Angeles'], FROZEN);
  assert.equal(overlap.totalZones, 2);
  assert.equal(overlap.allAwake, true);
  const start = new Date(overlap.start);
  const midway = new Date(overlap.start + 15 * 60000);
  const end = new Date(overlap.end - 15 * 60000);
  assert.ok(zones.isAwake(zones.zoneOffsetMinutes('Asia/Kolkata', start), start));
  assert.ok(zones.isAwake(zones.zoneOffsetMinutes('America/Los_Angeles', midway), midway));
  assert.ok(zones.isAwake(zones.zoneOffsetMinutes('America/Los_Angeles', end), end));
  assert.ok(overlap.end - FROZEN.getTime() <= (24 * 60 + zones.SCAN_STEP_MIN) * 60000,
    'the window stays within the next 24 hours');
});

test('bestOverlap reports partial windows honestly for an awkward trio', () => {
  const overlap = zones.bestOverlap(['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Auckland'], FROZEN);
  assert.equal(overlap.totalZones, 3);
  assert.ok(overlap.awakeCount >= 1 && overlap.awakeCount <= 3);
  assert.equal(typeof overlap.allAwake, 'boolean');
  assert.equal(overlap.allAwake, overlap.awakeCount === 3);
});

test('bestOverlap fails closed on bad input', () => {
  assert.throws(() => zones.bestOverlap([], FROZEN), /at least one time zone/);
  assert.throws(() => zones.bestOverlap(['Mars/Olympus'], FROZEN), /at least one time zone/);
  assert.throws(() => zones.bestOverlap(['Asia/Kolkata'], null), /valid date/);
});

test('the module exposes its API and stays inert under Node', () => {
  assert.equal(typeof zones.bestOverlap, 'function');
  assert.equal(typeof globalThis.DaymarkZones, 'object');
  assert.equal(zones.MAX_ZONES, 6);
  assert.equal(zones.DEFAULT_ZONE, 'Asia/Kolkata');
  assert.equal(zones.WAKE_START_MIN, 480);
  assert.equal(zones.WAKE_END_MIN, 1320);
});
