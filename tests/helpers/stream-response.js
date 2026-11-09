'use strict';

function createStreamResponse(body, options) {
  const opts = options || {};
  const bytes = new TextEncoder().encode(String(body));
  let offset = 0;
  let cancelled = false;
  const reader = {
    async read() {
      if (offset >= bytes.length) return { done: true, value: undefined };
      const end = Math.min(offset + 1024, bytes.length);
      const chunk = bytes.slice(offset, end);
      offset = end;
      return { done: false, value: chunk };
    },
    cancel() {
      cancelled = true;
      return Promise.resolve();
    },
    releaseLock() {}
  };
  const response = {
    ok: opts.ok !== false,
    status: Number.isInteger(opts.status) ? opts.status : (opts.ok === false ? 500 : 200),
    headers: {
      get(name) {
        return name && name.toLowerCase() === 'content-length' ? String(bytes.byteLength) : null;
      }
    },
    body: {
      getReader() { return reader; },
      cancel() { return reader.cancel(); }
    },
    text() {
      throw new Error('bounded API response fixtures must not use response.text()');
    }
  };
  return { response, state: { get cancelled() { return cancelled; } } };
}

module.exports = { createStreamResponse };
