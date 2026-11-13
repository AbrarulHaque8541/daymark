((root) => {
  'use strict';

  // Pure offline Moon phase calculator for the Daymark web prototype.
  // No network, no API key, no storage. Uses a standard synodic-month
  // approximation anchored to a well-known new-moon epoch so the card works
  // fully offline and stays honest about precision.

  const SYNODIC_DAYS = 29.530588853;
  // Known new moon near J2000 reference (UTC): 2000-01-06 18:14
  const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
  const MS_PER_DAY = 86400000;
  const MAX_DAYS_AHEAD = 40;

  const PHASE_NAMES = [
    { min: 0, max: 0.03, name: 'New Moon' },
    { min: 0.03, max: 0.22, name: 'Waxing Crescent' },
    { min: 0.22, max: 0.28, name: 'First Quarter' },
    { min: 0.28, max: 0.47, name: 'Waxing Gibbous' },
    { min: 0.47, max: 0.53, name: 'Full Moon' },
    { min: 0.53, max: 0.72, name: 'Waning Gibbous' },
    { min: 0.72, max: 0.78, name: 'Last Quarter' },
    { min: 0.78, max: 0.97, name: 'Waning Crescent' },
    { min: 0.97, max: 1.0001, name: 'New Moon' }
  ];

  function requireDate(date) {
    if (!date || typeof date.getTime !== 'function' || Number.isNaN(date.getTime())) {
      throw new Error('A valid date is required.');
    }
    return date;
  }

  function phaseFraction(date) {
    const instant = requireDate(date).getTime();
    const daysSince = (instant - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
    let fraction = daysSince / SYNODIC_DAYS;
    fraction = fraction - Math.floor(fraction);
    if (fraction < 0) fraction += 1;
    // Clamp floating noise at the edges
    if (fraction >= 1) fraction = 0;
    if (fraction < 0) fraction = 0;
    return fraction;
  }

  function phaseName(fraction) {
    if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      return 'Unknown';
    }
    for (const band of PHASE_NAMES) {
      if (fraction >= band.min && fraction < band.max) return band.name;
    }
    return 'New Moon';
  }

  function illuminationPercent(fraction) {
    if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      return null;
    }
    // Illuminated fraction of the disk ≈ (1 - cos(2πf)) / 2
    const illuminated = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
    return Math.round(illuminated * 100);
  }

  function daysUntilFraction(fromDate, targetFraction) {
    const start = requireDate(fromDate).getTime();
    const current = phaseFraction(new Date(start));
    let delta = targetFraction - current;
    if (delta <= 0.0005) delta += 1;
    return delta * SYNODIC_DAYS;
  }

  function nextNamedPhase(fromDate, targetFraction, label) {
    const days = daysUntilFraction(fromDate, targetFraction);
    if (days < 0 || days > MAX_DAYS_AHEAD) return null;
    const at = new Date(fromDate.getTime() + days * MS_PER_DAY);
    return {
      label,
      daysAhead: Math.round(days * 10) / 10,
      atIso: at.toISOString()
    };
  }

  function formatDaysAhead(days) {
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return 'unknown';
    if (days < 0.05) return 'today';
    if (days < 1.05) return 'about 1 day';
    const rounded = Math.round(days * 10) / 10;
    if (Number.isInteger(rounded)) return 'about ' + rounded + ' days';
    return 'about ' + rounded + ' days';
  }

  function moonBriefing(date) {
    const when = requireDate(date);
    const fraction = phaseFraction(when);
    const name = phaseName(fraction);
    const illumination = illuminationPercent(fraction);
    const nextFull = nextNamedPhase(when, 0.5, 'Full Moon');
    const nextNew = nextNamedPhase(when, 0, 'New Moon');
    return {
      fraction: Math.round(fraction * 1000) / 1000,
      name,
      illumination,
      nextFull,
      nextNew,
      computedAtIso: when.toISOString(),
      precisionNote: 'Approximate local calculation from a fixed epoch; not an ephemeris service.'
    };
  }

  function formatBriefingLine(briefing) {
    if (!briefing || typeof briefing !== 'object') return '';
    const illum = briefing.illumination === null || briefing.illumination === undefined
      ? 'unknown'
      : briefing.illumination + '%';
    let line = briefing.name + ' · illuminated ' + illum;
    if (briefing.nextFull && typeof briefing.nextFull.daysAhead === 'number') {
      line += ' · next full ' + formatDaysAhead(briefing.nextFull.daysAhead);
    }
    if (briefing.nextNew && typeof briefing.nextNew.daysAhead === 'number') {
      line += ' · next new ' + formatDaysAhead(briefing.nextNew.daysAhead);
    }
    return line;
  }

  const api = {
    SYNODIC_DAYS,
    phaseFraction,
    phaseName,
    illuminationPercent,
    nextNamedPhase,
    daysUntilFraction,
    formatDaysAhead,
    moonBriefing,
    formatBriefingLine
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.DaymarkMoon = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
