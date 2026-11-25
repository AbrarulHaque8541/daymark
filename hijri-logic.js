(function (root) {
  'use strict';

  // Keyless Hijri date glance card for the Daymark web prototype, powered by
  // the public Aladhan open API gToH endpoint (api.aladhan.com, no API key,
  // no account, no maintainer backend). Stateless like prayer-times-logic.js:
  // no DOM, no storage, so it is directly unit-testable and safe to reuse.
  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://api.aladhan.com/v1/gToH',
    maxPayloadBytes: 256 * 1024,
    maxHolidays: 8,
    validatesDateParts: isValidDayMonthYear,
    datePartsFromIso: datePartsFromIso,
    buildsHijriUrl: buildHijriUrl,
    describesHijri: describeHijri,
    parsesHijri: parseHijri,
    classifiesError: classifyHijriError,
    fetchesHijri: fetchHijri
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkHijri = api;

  function isDigits(text) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function datePartsFromIso(isoDate) {
    if (typeof isoDate !== 'string' || isoDate.length < 10) return null;
    const yyyy = isoDate.slice(0, 4);
    const sepOne = isoDate.charAt(4);
    const mm = isoDate.slice(5, 7);
    const sepTwo = isoDate.charAt(7);
    const dd = isoDate.slice(8, 10);
    if (sepOne !== '-' || sepTwo !== '-') return null;
    if (!isDigits(yyyy) || !isDigits(mm) || !isDigits(dd)) return null;
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return { yyyy: yyyy, mm: mm, dd: dd };
  }

  function isValidDayMonthYear(day, year) {
    if (typeof day !== 'string' || !isDigits(day) || day.length < 1 || day.length > 2) return false;
    const dayNumber = Number(day);
    if (dayNumber < 1 || dayNumber > 30) return false;
    if (typeof year !== 'string' || !isDigits(year) || year.length < 1 || year.length > 4) return false;
    const yearNumber = Number(year);
    return yearNumber >= 0 && yearNumber <= 9999;
  }

  function buildHijriUrl(isoDate) {
    const parts = datePartsFromIso(isoDate);
    if (!parts) throw new Error('The date was not recognized.');
    return api.endpointBase + '?date=' + parts.dd + '-' + parts.mm + '-' + parts.yyyy;
  }

  function nonEmptyText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  function describeHijri(hijri) {
    if (!hijri || typeof hijri !== 'object') return null;
    const day = nonEmptyText(hijri.day);
    const year = nonEmptyText(hijri.year);
    const month = hijri.month && typeof hijri.month === 'object' ? nonEmptyText(hijri.month.en) : null;
    if (!day || !year || !month) return null;
    if (!isValidDayMonthYear(day, year)) return null;
    return day + ' ' + month + ' ' + year + ' AH';
  }

  function parseHijri(payload) {
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const hijri = data && typeof data === 'object' ? data.hijri : null;
    if (!hijri || typeof hijri !== 'object') {
      throw new Error('The Hijri date response was malformed.');
    }
    const described = describeHijri(hijri);
    const weekday = hijri.weekday && typeof hijri.weekday === 'object' ? nonEmptyText(hijri.weekday.en) : null;
    const month = hijri.month && typeof hijri.month === 'object' ? nonEmptyText(hijri.month.en) : null;
    const monthNumberRaw = hijri.month && typeof hijri.month === 'object' ? hijri.month.number : null;
    const monthNumber = typeof monthNumberRaw === 'number' && Number.isFinite(monthNumberRaw)
      && monthNumberRaw >= 1 && monthNumberRaw <= 12 ? monthNumberRaw : null;
    if (!described || !weekday || !month || monthNumber === null) {
      throw new Error('The Hijri date response was malformed.');
    }
    let holidaysCapHit = false;
    const holidays = [];
    if (Array.isArray(hijri.holidays)) {
      for (let i = 0; i < hijri.holidays.length; i += 1) {
        const holiday = nonEmptyText(hijri.holidays[i]);
        if (holiday === null) continue;
        if (holidays.length >= api.maxHolidays) { holidaysCapHit = true; break; }
        holidays.push(holiday);
      }
    }
    const requestedParts = data.gregorian && typeof data.gregorian === 'string'
      ? nonEmptyText(data.gregorian) : null;
    return {
      hijri: described,
      weekday: weekday,
      month: month,
      monthNumber: monthNumber,
      year: nonEmptyText(hijri.year),
      holidays: holidays,
      holidaysTruncated: holidaysCapHit,
      gregorian: requestedParts,
      designation: hijri.designation && typeof hijri.designation === 'object'
        ? nonEmptyText(hijri.designation.expanded) : null
    };
  }

  function classifyHijriError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The public Aladhan API limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'The Hijri date endpoint was not found. Try again later.';
    }
    if (message.indexOf('HTTP 4') === 0) {
      return 'The Aladhan API rejected the request (' + message + ')';
    }
    if (message.indexOf('HTTP 5') === 0) {
      return 'The Aladhan API had a server problem. Try again in a moment.';
    }
    if (message.indexOf('timed out') !== -1) {
      return 'The request timed out. Check your connection and try again.';
    }
    if (message.indexOf('malformed') !== -1) {
      return 'The Hijri date response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The Hijri date response was too large to read safely. Try again later.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The Hijri date glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchHijri(fetch, isoDate) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    const url = buildHijriUrl(isoDate);
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The Hijri date request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The Hijri date response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The Hijri date response was too large to read safely. Try again later.',
        malformedMessage: 'The Hijri date response was malformed.',
        timeoutMessage: 'The Hijri date request timed out.',
        streamRequiredMessage: 'The Hijri date response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The Hijri date response was malformed.');
      }
      const record = parseHijri(payload);
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyHijriError(error);
      if (friendly === null) throw error;
      const typed = new Error(friendly);
      typed.originalMessage = error && error.message ? String(error.message) : '';
      throw typed;
    } finally {
      if (response && response.body && typeof response.body.cancel === 'function') {
        try {
          const cancellation = response.body.cancel();
          if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
        } catch (error) {
          // the caller already has its answer; the stream cleanup is best-effort
        }
      }
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
