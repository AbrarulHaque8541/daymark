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

  function zoneOffsetMinutes(zoneId, date) {
    const id = requireZone(zoneId);
    const when = requireDate(date);
    const formatter = offsetFormatter(id);
    const parts = formatter.formatToParts(when);
    const get = (type) => Number(parts.find((part) => part.type === type).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - when.getTime()) / 60000);
  }

  function localMinuteOfDay(zoneOffsetMin, date) {
    const when = requireDate(date);
    const local = new Date(when.getTime() + zoneOffsetMin * 60000);
    return local.getUTCHours() * 60 + local.getUTCMinutes();
  }

  function isAwake(zoneOffsetMin, date) {
    const minute = localMinuteOfDay(zoneOffsetMin, date);
    return minute >= WAKE_START_MIN && minute < WAKE_END_MIN;
  }

  function formatOffset(offsetMin) {
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return 'UTC' + sign + String(hours).padStart(2, '0') + (minutes ? ':' + String(minutes).padStart(2, '0') : '');
  }

  function formatZoneTime(zoneId, date) {
    const id = requireZone(zoneId);
    const when = requireDate(date);
    const offsetMin = zoneOffsetMinutes(id, when);
    if (!timeFormatters.has(id)) {
      timeFormatters.set(id, new root.Intl.DateTimeFormat('en-GB', {
        timeZone: id,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }));
    }
    if (!dayFormatters.has(id)) {
      dayFormatters.set(id, new root.Intl.DateTimeFormat('en-GB', {
        timeZone: id,
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }));
    }
    return {
      zoneId: id,
      time: timeFormatters.get(id).format(when),
      dayLabel: dayFormatters.get(id).format(when),
      offsetMinutes: offsetMin,
      offsetLabel: formatOffset(offsetMin)
    };
  }

  function normalizeZoneList(values) {
    const seen = new Set();
    const zones = [];
    let dropped = 0;
    const list = Array.isArray(values) ? values : [];
    for (const value of list) {
      const id = normalizeZoneId(value);
      if (!id) { dropped += 1; continue; }
      if (seen.has(id)) { dropped += 1; continue; }
      if (zones.length >= MAX_ZONES) { dropped += 1; continue; }
      seen.add(id);
      zones.push(id);
    }
    return { zones, dropped };
  }

  function isValidZoneList(zones) {
    return Array.isArray(zones) && zones.length >= MIN_ZONES && zones.length <= MAX_ZONES
      && zones.every((zoneId, index) => normalizeZoneId(zoneId) === zoneId && zones.indexOf(zoneId) === index);
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
  function relativeUntilLabel(startMs, fromDate) {
    if (startMs == null || !fromDate || typeof fromDate.getTime !== "function") return "";
    const deltaMs = Number(startMs) - fromDate.getTime();
    if (Number.isNaN(deltaMs)) return "";
    if (deltaMs <= 0) return "now";
    const minutes = Math.round(deltaMs / 60000);
    if (minutes < 60) return "in " + minutes + " min";
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    if (rem === 0) return "in " + hours + " h";
    return "in " + hours + " h " + rem + " min";
  }

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
    relativeUntilLabel,
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
