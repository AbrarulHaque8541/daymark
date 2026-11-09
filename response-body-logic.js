((root) => {
  'use strict';

  const DEFAULT_MAX_BYTES = 256 * 1024;

  function abortController(controller) {
    if (!controller || typeof controller.abort !== 'function') return;
    try { controller.abort(); } catch (error) { /* already aborted or unavailable */ }
  }

  function cancelReader(reader) {
    if (!reader || typeof reader.cancel !== 'function') return;
    try {
      const cancellation = reader.cancel();
      if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
    } catch (error) {
      // Cancellation is best-effort; the caller still receives the original failure.
    }
  }

  function cancelBody(body) {
    if (!body || typeof body.cancel !== 'function') return;
    try {
      const cancellation = body.cancel();
      if (cancellation && typeof cancellation.catch === 'function') cancellation.catch(() => {});
    } catch (error) {
      // An unavailable/locked body is still rejected; the controller is also aborted.
    }
  }

  function declaredContentLength(response) {
    try {
      const headers = response && response.headers;
      if (!headers || typeof headers.get !== 'function') return null;
      const raw = headers.get('content-length');
      const value = raw === null || raw === undefined ? '' : String(raw).trim();
      if (!value || !Array.from(value).every((character) => character >= '0' && character <= '9')) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  async function readBoundedText(response, options) {
    const opts = options || {};
    const maxBytes = Number.isSafeInteger(opts.maxBytes) && opts.maxBytes > 0
      ? opts.maxBytes
      : DEFAULT_MAX_BYTES;
    const maxChars = Number.isSafeInteger(opts.maxChars) && opts.maxChars > 0
      ? opts.maxChars
      : maxBytes;
    const tooLargeMessage = typeof opts.tooLargeMessage === 'string' && opts.tooLargeMessage
      ? opts.tooLargeMessage
      : 'The response was too large to read safely.';
    const malformedMessage = typeof opts.malformedMessage === 'string' && opts.malformedMessage
      ? opts.malformedMessage
      : 'The response body was malformed.';
    const timeoutMessage = typeof opts.timeoutMessage === 'string' && opts.timeoutMessage
      ? opts.timeoutMessage
      : 'The response read timed out.';
    const streamRequiredMessage = typeof opts.streamRequiredMessage === 'string' && opts.streamRequiredMessage
      ? opts.streamRequiredMessage
      : 'A bounded response stream is required; unbounded text reads are disabled.';
    const controller = opts.controller && typeof opts.controller.abort === 'function'
      ? opts.controller
      : null;
    const isTimedOut = typeof opts.isTimedOut === 'function' ? opts.isTimedOut : () => false;
    const onReader = typeof opts.onReader === 'function' ? opts.onReader : null;
    const checkTimeout = () => {
      if (isTimedOut()) throw new Error(timeoutMessage);
    };

    let reader = null;
    let body = null;
    let bodyCancelled = false;
    const cancelBodyOnce = () => {
      if (bodyCancelled) return;
      bodyCancelled = true;
      cancelBody(body);
    };
    try {
      checkTimeout();
      body = response && response.body;
      const length = declaredContentLength(response);
      if (length !== null && length > maxBytes) {
        abortController(controller);
        cancelBodyOnce();
        throw new Error(tooLargeMessage);
      }

      const Decoder = typeof root.TextDecoder === 'function' ? root.TextDecoder : null;
      if (!body || typeof body.getReader !== 'function' || !Decoder) {
        abortController(controller);
        cancelBodyOnce();
        throw new Error(streamRequiredMessage);
      }

      reader = body.getReader();
      if (onReader) onReader(reader);
      const decoder = new Decoder('utf-8', { fatal: true });
      let bytesRead = 0;
      let text = '';
      while (true) {
        const part = await reader.read();
        checkTimeout();
        if (!part || typeof part !== 'object') throw new Error(malformedMessage);
        if (part.done) break;
        const chunk = part.value;
        if (!chunk || !Number.isFinite(chunk.byteLength) || chunk.byteLength < 0) {
          throw new Error(malformedMessage);
        }
        bytesRead += chunk.byteLength;
        if (bytesRead > maxBytes) throw new Error(tooLargeMessage);
        text += decoder.decode(chunk, { stream: true });
        if (text.length > maxChars) throw new Error(tooLargeMessage);
      }
      text += decoder.decode();
      checkTimeout();
      if (text.length > maxChars) throw new Error(tooLargeMessage);
      return text;
    } catch (error) {
      if (reader) {
        abortController(controller);
        cancelReader(reader);
      } else {
        abortController(controller);
        cancelBodyOnce();
      }
      throw error;
    } finally {
      if (reader) {
        if (onReader) {
          try { onReader(null); } catch (error) { /* reader cleanup must still complete */ }
        }
        try { reader.releaseLock(); } catch (error) { /* minimal test readers may omit releaseLock */ }
      }
    }
  }

  const api = { readBoundedText, DEFAULT_MAX_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkResponseBody = api;
})(globalThis);
