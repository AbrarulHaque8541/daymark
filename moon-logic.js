(function (root) {
  'use strict';

  // Keyless, offline moon-phase glance for the Daymark web prototype.
  // Everything is computed on this device from a mean-synodic-month model
  // anchored to the well-known reference new moon of 2000-01-06 18:14 UTC.
  // There is no network request, no API key, no account and no storage:
  // pure functions only, no DOM, so the module is unit-testable directly
  // and loads in the browser as window.DaymarkMoon.
  //
  // Accuracy note (disclosed in the card too): a mean synodic month is an
  // approximation, so reported dates can drift roughly half a day from
  // precise ephemeris values. The card says "approximate" and never claims
  // exact astronomical times.

  const SYNODIC_MONTH_DAYS = 29.530588853;
  const EPOCH_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MAX_YEAR = 275760; // far future guard, well inside Date range
  const MIN_YEAR = 1970;

  const PHASE_NAMES = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent'
  ];

  function pad2(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  function daysInMonth(year, month) {
    const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return lengths[month - 1];
  }

  // Accepts nothing (today from the injected clock), an ISO string whose
  // first 10 characters are a calendar date, or a "YYYY-MM-DD" string.
  // Anything else is rejected fail-closed: no guessing, no silent clamping.
  function normalizeDate(input, nowIso) {
    let text = input;
    if (text === undefined || text === null || text === '') {
      text = typeof nowIso === 'function' ? nowIso() : nowIso;
    }
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < MIN_YEAR || year > MAX_YEAR) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > daysInMonth(year, month)) return null;
    return { year: year, month: month, day: day };
  }

  function toUtcMidnightMs(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  }

  function toIsoDate(ms) {
    const date = new Date(ms);
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  // Age of the moon in days (0 to just under one synodic month) at UTC
  // midnight of the given date.
  function moonAgeDays(parts) {
    const elapsed = (toUtcMidnightMs(parts) - EPOCH_NEW_MOON_MS) / MS_PER_DAY;
    const age = elapsed % SYNODIC_MONTH_DAYS;
    return age < 0 ? age + SYNODIC_MONTH_DAYS : age;
  }

  // Phase fraction in [0, 1): 0 = new moon, 0.5 = full moon.
  function phaseFraction(parts) {
    return moonAgeDays(parts) / SYNODIC_MONTH_DAYS;
  }

  function phaseName(fraction) {
    const value = Number(fraction);
    if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
    const index = Math.floor(value * 8 + 0.5) % 8;
    return PHASE_NAMES[index];
  }

  // Illuminated share of the disc, in whole percent (0-100).
  function illuminationPercent(fraction) {
    const value = Number(fraction);
    if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
    return Math.round((1 - Math.cos(2 * Math.PI * value)) / 2 * 100);
  }

  // Days from the given date until the next occurrence of a target phase
  // fraction (0 for new, 0.5 for full). Never negative: if the phase falls
  // on the requested date itself the answer is 0.
  function daysUntilPhase(parts, targetFraction) {
    const targetAge = targetFraction * SYNODIC_MONTH_DAYS;
    const delta = (targetAge - moonAgeDays(parts) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
    if (delta < 0.5) return 0;
    return Math.round(delta);
  }

  function nextPhaseIso(parts, targetFraction) {
    return toIsoDate(toUtcMidnightMs(parts) + daysUntilPhase(parts, targetFraction) * MS_PER_DAY);
  }

  // Stateless record for one date. Nothing is cached or saved anywhere.
  function moonPhaseInfo(input, options) {
    const opts = options || {};
    const nowIso = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const parts = normalizeDate(input, nowIso());
    if (!parts) {
      throw new Error('Enter a real calendar date as YYYY-MM-DD, or leave the field empty for today.');
    }
    const fraction = phaseFraction(parts);
    const nextNewIn = daysUntilPhase(parts, 0);
    const nextFullIn = daysUntilPhase(parts, 0.5);
    return {
      version: 1,
      year: parts.year,
      month: parts.month,
      day: parts.day,
      date: parts.year + '-' + pad2(parts.month) + '-' + pad2(parts.day),
      phaseFraction: fraction,
      phaseName: phaseName(fraction),
      illuminationPercent: illuminationPercent(fraction),
      ageDays: Math.round(moonAgeDays(parts) * 10) / 10,
      nextNewMoon: nextPhaseIso(parts, 0),
      nextNewMoonInDays: nextNewIn,
      nextFullMoon: nextPhaseIso(parts, 0.5),
      nextFullMoonInDays: nextFullIn,
      approximate: true,
      computedAt: nowIso()
    };
  }

  const api = {
    normalizeDate,
    moonAgeDays,
    phaseFraction,
    phaseName,
    illuminationPercent,
    daysUntilPhase,
    nextPhaseIso,
    moonPhaseInfo,
    SYNODIC_MONTH_DAYS,
    EPOCH_NEW_MOON_MS,
    PHASE_NAMES,
    MIN_YEAR,
    MAX_YEAR
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkMoon = api;
})(globalThis);
