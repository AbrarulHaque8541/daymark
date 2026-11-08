((root) => {
  'use strict';

  // Offline world-clock and meeting-overlap planning for the Daymark web
  // prototype. Zero network: zone clocks come from the platform Intl
  // time-zone database and every calculation is local arithmetic, so the card
  // works fully offline and never touches a backend or API. Pure functions, no
  // DOM, no storage, no timers — unit-testable in Node and loaded in the
  // browser as window.DaymarkZones. Mirrors the holidays-logic.js module style.

  const MAX_ZONES = 6;
  const MIN_ZONES = 1;
  const DEFAULT_ZONE = 'Asia/Kolkata';
  const WAKE_START_MIN = 8 * 60;   // 08:00 local time
  const WAKE_END_MIN = 22 * 60;    // up to 21:59 local time
  const SCAN_STEP_MIN = 30;
  const SCAN_MINUTES = 24 * 60;

  const ZONE_CATALOG = [
    { id: 'Asia/Kolkata', label: 'India · Kolkata' },
    { id: 'Asia/Dubai', label: 'UAE · Dubai' },
    { id: 'Asia/Singapore', label: 'Singapore' },
    { id: 'Asia/Tokyo', label: 'Japan · Tokyo' },
    { id: 'Asia/Shanghai', label: 'China · Shanghai' },
    { id: 'Australia/Sydney', label: 'Australia · Sydney' },
    { id: 'Pacific/Auckland', label: 'New Zealand · Auckland' },
    { id: 'Europe/London', label: 'UK · London' },
    { id: 'Europe/Berlin', label: 'Germany · Berlin' },
    { id: 'Europe/Paris', label: 'France · Paris' },
    { id: 'Europe/Moscow', label: 'Russia · Moscow' },
    { id: 'America/New_York', label: 'US East · New York' },
    { id: 'America/Chicago', label: 'US Central · Chicago' },
    { id: 'America/Los_Angeles', label: 'US West · Los Angeles' },
    { id: 'America/Sao_Paulo', label: 'Brazil · São Paulo' },
    { id: 'Africa/Nairobi', label: 'Kenya · Nairobi' },
    { id: 'Africa/Lagos', label: 'Nigeria · Lagos' }
  ];

  const CATALOG_IDS = new Set(ZONE_CATALOG.map((zone) => zone.id));
  const offsetFormatters = new Map();
  const timeFormatters = new Map();
  const dayFormatters = new Map();

  function normalizeZoneId(value) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    return CATALOG_IDS.has(id) ? id : null;
  }

  function listZones() {
    return ZONE_CATALOG.map((zone) => ({ id: zone.id, label: zone.label }));
  }

  function zoneLabel(zoneId) {
    const id = normalizeZoneId(zoneId);
    if (!id) return '';
    const zone = ZONE_CATALOG.find((entry) => entry.id === id);
    return zone ? zone.label : '';
  }

  function requireZone(zoneId) {
    const id = normalizeZoneId(zoneId);
    if (!id) throw new Error('Choose a supported time zone first.');
    return id;
  }

  function requireDate(date) {
    if (!date || typeof date.getTime !== 'function' || Number.isNaN(date.getTime())) {
      throw new Error('A valid date is required.');
    }
    return date;
  }

  function offsetFormatter(zoneId) {
    if (!offsetFormatters.has(zoneId)) {
      offsetFormatters.set(zoneId, new root.Intl.DateTimeFormat('en-US', {
        timeZone: zoneId,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    }
    return offsetFormatters.get(zoneId);
  }

  // The classic wall-clock technique: format the instant in the zone, read the
  // zone's local calendar fields back as if they were UTC, and compare.
  function zoneOffsetMinutes(zoneId, date) {
    const id = requireZone(zoneId);
    requireDate(date);
    let parts;
    try {
      parts = offsetFormatter(id).formatToParts(date);
    } catch (error) {
      throw new Error('This browser cannot read that time zone.');
    }
    const map = {};
    for (const part of parts) map[part.type] = part.value;
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second)
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  function localMinuteOfDay(zoneOffsetMin, date) {
    requireDate(date);
    const utcMinute = Math.floor(date.getTime() / 60000) % 1440;
    return ((((utcMinute + zoneOffsetMin) % 1440) + 1440) % 1440);
  }

  function isAwake(zoneOffsetMin, date) {
    const minute = localMinuteOfDay(zoneOffsetMin, date);
    return minute >= WAKE_START_MIN && minute < WAKE_END_MIN;
  }

  function formatOffset(offsetMin) {
    const sign = offsetMin < 0 ? '-' : '+';
    const absolute = Math.abs(Math.round(offsetMin));
    const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
    const minutes = String(absolute % 60).padStart(2, '0');
    return 'UTC' + sign + hours + ':' + minutes;
  }

  function formatZoneTime(zoneId, date) {
    const id = requireZone(zoneId);
    requireDate(date);
    let time = '';
    let dayLabel = '';
    try {
      if (!timeFormatters.has(id)) {
        timeFormatters.set(id, new root.Intl.DateTimeFormat('en-GB', {
          timeZone: id, hour: '2-digit', minute: '2-digit', hour12: false
        }));
      }
      if (!dayFormatters.has(id)) {
        dayFormatters.set(id, new root.Intl.DateTimeFormat('en-GB', {
          timeZone: id, weekday: 'short', day: '2-digit', month: 'short'
        }));
      }
      time = timeFormatters.get(id).format(date);
      dayLabel = dayFormatters.get(id).format(date);
    } catch (error) {
      throw new Error('This browser cannot read that time zone.');
    }
    const offsetMinutes = zoneOffsetMinutes(id, date);
    return {
      zoneId: id,
      time: time === '24:00' ? '00:00' : time,
      dayLabel,
      offsetMinutes,
      offsetLabel: formatOffset(offsetMinutes)
    };
  }

  function normalizeZoneList(values) {
    const zones = [];
    const seen = new Set();
    let dropped = 0;
    if (Array.isArray(values)) {
      for (const value of values) {
        const id = normalizeZoneId(value);
        if (!id || seen.has(id) || zones.length >= MAX_ZONES) {
          dropped += 1;
          continue;
        }
        seen.add(id);
        zones.push(id);
      }
    }
    return { zones, dropped };
  }

  function isValidZoneList(zones) {
    return Boolean(Array.isArray(zones)
      && zones.length >= MIN_ZONES
      && zones.length <= MAX_ZONES
      && zones.every((zone) => typeof zone === 'string' && normalizeZoneId(zone) === zone)
      && new Set(zones).size === zones.length);
  }

  function validateZonesCache(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && isValidZoneList(value.zones)
      && typeof value.updatedAt === 'string'
      && !Number.isNaN(root.Date.parse(value.updatedAt)));
  }

  // Scan the next 24 hours in 30-minute steps and find the window where as
  // many saved zones as possible are inside their local waking hours. Ties
  // prefer the longer window, then the earlier start. Offsets are recomputed
  // per step so daylight-saving shifts are handled exactly.
  function bestOverlap(zoneIds, from) {
    const ids = (Array.isArray(zoneIds) ? zoneIds : [])
      .map((zoneId) => normalizeZoneId(zoneId))
      .filter(Boolean);
    if (!ids.length) throw new Error('Add at least one time zone first.');
    requireDate(from);
    const stepMs = SCAN_STEP_MIN * 60000;
    const firstSlot = Math.ceil(from.getTime() / stepMs) * stepMs;
    const slotCount = SCAN_MINUTES / SCAN_STEP_MIN;
    const awakeCounts = [];
    for (let index = 0; index < slotCount; index += 1) {
      const slot = new Date(firstSlot + index * stepMs);
      let awake = 0;
      for (const id of ids) {
        if (isAwake(zoneOffsetMinutes(id, slot), slot)) awake += 1;
      }
      awakeCounts.push(awake);
    }
    let best = null;
    for (let length = slotCount; length >= 1; length -= 1) {
      for (let start = 0; start + length <= slotCount; start += 1) {
        let minCount = ids.length;
        for (let index = start; index < start + length; index += 1) {
          if (awakeCounts[index] < minCount) minCount = awakeCounts[index];
        }
        if (!best || minCount > best.minCount) {
          best = { length, start, minCount };
        }
      }
      if (best && best.minCount === ids.length) break;
    }
    if (!best || best.minCount === 0) {
      return { start: null, end: null, awakeCount: 0, totalZones: ids.length, allAwake: false };
    }
    return {
      start: firstSlot + best.start * stepMs,
      end: firstSlot + (best.start + best.length - 1) * stepMs + stepMs,
      awakeCount: best.minCount,
      totalZones: ids.length,
      allAwake: best.minCount === ids.length
    };
  }

  const api = {
    normalizeZoneId,
    listZones,
    zoneLabel,
    zoneOffsetMinutes,
    localMinuteOfDay,
    isAwake,
    formatOffset,
    formatZoneTime,
    normalizeZoneList,
    isValidZoneList,
    validateZonesCache,
    bestOverlap,
    ZONE_CATALOG,
    DEFAULT_ZONE,
    MAX_ZONES,
    MIN_ZONES,
    WAKE_START_MIN,
    WAKE_END_MIN,
    SCAN_STEP_MIN
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkZones = api;
})(globalThis);
