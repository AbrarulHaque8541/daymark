(function (root) {
  'use strict';

  // Keyless prayer times glance card for the Daymark web prototype, powered by
  // the public Aladhan open API (api.aladhan.com, no API key, no account, no
  // maintainer backend). Stateless like earthquake-logic.js: no DOM, no
  // storage, so it is directly unit-testable and safe to reuse.
  const api = {
    mechanism: 'bounded fetch',
    endpointBase: 'https://api.aladhan.com/v1/timings/',
    method: 2,
    maxPayloadBytes: 256 * 1024,
    prayerOrder: ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Sunset', 'Maghrib', 'Isha'],
    cities: [
      { id: 'kanyakumari', label: 'Kanyakumari', latitude: 8.0883, longitude: 77.5385 },
      { id: 'delhi', label: 'New Delhi', latitude: 28.6139, longitude: 77.2090 },
      { id: 'mumbai', label: 'Mumbai', latitude: 19.0760, longitude: 72.8777 },
      { id: 'hyderabad', label: 'Hyderabad', latitude: 17.3850, longitude: 78.4867 },
      { id: 'chennai', label: 'Chennai', latitude: 13.0827, longitude: 80.2707 },
      { id: 'kolkata', label: 'Kolkata', latitude: 22.5726, longitude: 88.3639 },
      { id: 'dubai', label: 'Dubai', latitude: 25.2048, longitude: 55.2708 },
      { id: 'london', label: 'London', latitude: 51.5072, longitude: -0.1276 }
    ],
    normalizesCity: normalizeCityId,
    validatesTime: isValidTime,
    formatsTime: formatTime,
    datePartsFromIso: datePartsFromIso,
    buildsTimingsUrl: buildTimingsUrl,
    parsesTimings: parseTimings,
    classifiesError: classifyPrayerTimesError,
    fetchesTimings: fetchTimings
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  root.DaymarkPrayerTimes = api;

  function isDigits(text) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 48 || code > 57) return false;
    }
    return true;
  }

  function isValidTime(value) {
    if (typeof value !== 'string' || value.length !== 5) return false;
    const colon = value.charAt(2);
    if (colon !== ':') return false;
    const hours = value.slice(0, 2);
    const minutes = value.slice(3, 5);
    if (!isDigits(hours) || !isDigits(minutes)) return false;
    const h = Number(hours);
    const m = Number(minutes);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  function formatTime(value) {
    return isValidTime(value) ? value : null;
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

  function normalizeCityId(cityId) {
    if (typeof cityId !== 'string' || !cityId) return null;
    for (let i = 0; i < api.cities.length; i += 1) {
      if (api.cities[i].id === cityId) return api.cities[i];
    }
    return null;
  }

  function buildTimingsUrl(cityId, isoDate) {
    const city = normalizeCityId(cityId);
    if (!city) throw new Error('The city was not recognized.');
    const parts = datePartsFromIso(isoDate);
    if (!parts) throw new Error('The date was not recognized.');
    const latitude = numberOrThrow(city.latitude, 'latitude');
    const longitude = numberOrThrow(city.longitude, 'longitude');
    return api.endpointBase + parts.dd + '-' + parts.mm + '-' + parts.yyyy
      + '?latitude=' + latitude + '&longitude=' + longitude + '&method=' + String(api.method);
  }

  function numberOrThrow(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('The ' + label + ' was not a finite number.');
    return number;
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
    return day + ' ' + month + ' ' + year + ' AH';
  }

  function parseTimings(payload) {
    const data = payload && typeof payload === 'object' ? payload.data : null;
    const timings = data && typeof data === 'object' ? data.timings : null;
    if (!data || !timings || typeof timings !== 'object') {
      throw new Error('The prayer times response was malformed.');
    }
    const prayers = [];
    let missing = 0;
    for (let i = 0; i < api.prayerOrder.length; i += 1) {
      const name = api.prayerOrder[i];
      const time = formatTime(timings[name]);
      if (time === null) missing += 1;
      else prayers.push({ name: name, time: time });
    }
    if (!prayers.length) throw new Error('The prayer times response was malformed.');
    const meta = data.meta && typeof data.meta === 'object' ? data.meta : null;
    const methodInfo = meta && meta.method && typeof meta.method === 'object' ? meta.method : null;
    return {
      prayers: prayers,
      count: prayers.length,
      missing: missing,
      hijri: describeHijri(data.date && data.date.hijri),
      gregorian: nonEmptyText(data.date && data.date.readable),
      method: nonEmptyText(methodInfo && methodInfo.name)
    };
  }

  function classifyPrayerTimesError(error) {
    const message = error && error.message ? String(error.message) : '';
    if (message.indexOf('HTTP 403') !== -1) {
      return 'The public Aladhan API limited this request. Try again in a moment.';
    }
    if (message.indexOf('HTTP 404') !== -1) {
      return 'The prayer times endpoint was not found. Try again later.';
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
      return 'The prayer times response could not be read. Try again in a moment.';
    }
    if (message.indexOf('too large') !== -1) {
      return 'The prayer times response was too large to read safely. Try again later.';
    }
    if (message.indexOf('unavailable in this environment') !== -1) {
      return 'The prayer times glance is unavailable in this environment.';
    }
    return null;
  }

  async function fetchTimings(fetch, cityId, isoDate) {
    if (typeof fetch !== 'function') throw new Error('fetch is unavailable in this environment.');
    const url = buildTimingsUrl(cityId, isoDate);
    let response = null;
    try {
      response = await fetch(url, { cache: 'no-store' });
      if (!response || typeof response !== 'object') {
        throw new Error('The prayer times request returned no response.');
      }
      if (!response.ok) throw new Error('HTTP ' + String(response.status));
      const responseBodyModule = (typeof require === 'function')
        ? require('./response-body-logic.js')
        : (root.DaymarkResponseBody || null);
      const readBoundedText = responseBodyModule && typeof responseBodyModule.readBoundedText === 'function'
        ? responseBodyModule.readBoundedText
        : null;
      if (!readBoundedText) throw new Error('The prayer times response could not be read.');
      const text = await readBoundedText(response, {
        maxBytes: api.maxPayloadBytes,
        tooLargeMessage: 'The prayer times response was too large to read safely. Try again later.',
        malformedMessage: 'The prayer times response was malformed.',
        timeoutMessage: 'The prayer times request timed out.',
        streamRequiredMessage: 'The prayer times response could not be read.'
      });
      let payload;
      try { payload = JSON.parse(text); } catch (error) {
        throw new Error('The prayer times response was malformed.');
      }
      const record = parseTimings(payload);
      const city = normalizeCityId(cityId);
      record.cityId = city ? cityId : null;
      record.city = city ? city.label : null;
      record.url = url;
      return record;
    } catch (error) {
      const friendly = classifyPrayerTimesError(error);
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
