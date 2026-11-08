((root) => {
  "use strict";

  const DEFAULT_MAX_BYTES = 128 * 1024;
  const DEFAULT_TIMEOUT_MS = 10000;

  function abortController(controller) {
    if (!controller || typeof controller.abort !== "function") return;
    try { controller.abort(); } catch (error) { /* already aborted or unavailable */ }
  }

  function cancelReader(reader) {
    if (!reader || typeof reader.cancel !== "function") return;
    try {
      const cancellation = reader.cancel();
      if (cancellation && typeof cancellation.catch === "function") cancellation.catch(() => {});
    } catch (error) {
      // Cancellation is best-effort; the caller still receives the original failure.
    }
  }

  function declaredContentLength(response) {
    try {
      const headers = response && response.headers;
      if (!headers || typeof headers.get !== "function") return null;
      const raw = headers.get("content-length");
      const value = raw === null || raw === undefined ? "" : String(raw).trim();
      if (!value || !Array.from(value).every((character) => character >= "0" && character <= "9")) return null;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function positiveLimit(value, fallback) {
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
  }

  async function readBoundedText(response, options) {
    const opts = options || {};
    const maxBytes = positiveLimit(opts.maxBytes, DEFAULT_MAX_BYTES);
    const maxChars = positiveLimit(opts.maxChars, maxBytes);
    const tooLargeMessage = opts.tooLargeMessage || "The response exceeded the safe size limit.";
    const malformedMessage = opts.malformedMessage || "The response body was malformed.";
    const unavailableMessage = opts.streamUnavailableMessage || "Streaming response bodies are unavailable; request rejected.";
    const abortedMessage = opts.abortedMessage || "The response request was aborted.";
    const controller = opts.controller && typeof opts.controller.abort === "function"
      ? opts.controller
      : null;
    const signal = controller && controller.signal ? controller.signal : (opts.signal || null);

    let reader = null;
    let abortListener = null;
    let readerCancelled = false;
    const cancelActiveReader = () => {
      if (readerCancelled || !reader) return;
      readerCancelled = true;
      cancelReader(reader);
    };

    try {
      if (signal && signal.aborted) throw new Error(abortedMessage);

      const length = declaredContentLength(response);
      if (length !== null && length > maxBytes) {
        abortController(controller);
        throw new Error(tooLargeMessage);
      }

      const body = response && response.body;
      const Decoder = typeof root.TextDecoder === "function" ? root.TextDecoder : null;
      if (!body || typeof body.getReader !== "function" || !Decoder) {
        abortController(controller);
        throw new Error(unavailableMessage);
      }

      reader = body.getReader();
      if (signal && typeof signal.addEventListener === "function") {
        abortListener = cancelActiveReader;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      if (signal && signal.aborted) {
        cancelActiveReader();
        throw new Error(abortedMessage);
      }

      const decoder = new Decoder("utf-8", { fatal: true });
      let bytesRead = 0;
      let text = "";
      while (true) {
        const part = await reader.read();
        if (signal && signal.aborted) throw new Error(abortedMessage);
        if (!part || typeof part !== "object") throw new Error(malformedMessage);
        if (part.done === true) break;

        const chunk = part.value;
        if (!chunk || !ArrayBuffer.isView(chunk)
          || chunk.BYTES_PER_ELEMENT !== 1
          || !Number.isSafeInteger(chunk.byteLength)) {
          throw new Error(malformedMessage);
        }
        if (chunk.byteLength > maxBytes - bytesRead) throw new Error(tooLargeMessage);
        bytesRead += chunk.byteLength;

        text += decoder.decode(chunk, { stream: true });
        if (text.length > maxChars) throw new Error(tooLargeMessage);
      }

      text += decoder.decode();
      if (signal && signal.aborted) throw new Error(abortedMessage);
      if (text.length > maxChars) throw new Error(tooLargeMessage);
      return text;
    } catch (error) {
      if (controller && !controller.signal.aborted) abortController(controller);
      cancelActiveReader();
      throw error;
    } finally {
      if (signal && abortListener && typeof signal.removeEventListener === "function") {
        try { signal.removeEventListener("abort", abortListener); } catch (error) { /* cleanup is best-effort */ }
      }
      if (reader && typeof reader.releaseLock === "function") {
        try { reader.releaseLock(); } catch (error) { /* cancellation may still be settling */ }
      }
    }
  }

  async function fetchJson(url, init, options) {
    const opts = options || {};
    const fetchImpl = typeof opts.fetchImpl === "function" ? opts.fetchImpl : root.fetch;
    if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable.");
    if (typeof root.AbortController !== "function") throw new Error("AbortController is unavailable.");

    const timeoutMs = positiveLimit(opts.timeoutMs, DEFAULT_TIMEOUT_MS);
    const maxBytes = positiveLimit(opts.maxBytes, DEFAULT_MAX_BYTES);
    const maxChars = positiveLimit(opts.maxChars, maxBytes);
    const timeoutMessage = opts.timeoutMessage || "The response request timed out.";
    const controller = new root.AbortController();
    let timer = null;

    const request = (async () => {
      const requestInit = Object.assign({}, init || {}, { signal: controller.signal });
      const response = await fetchImpl(url, requestInit);
      if (!response || !response.ok) {
        throw new Error("HTTP " + (response ? response.status : "unknown"));
      }
      const text = await readBoundedText(response, {
        maxBytes,
        maxChars,
        tooLargeMessage: opts.tooLargeMessage,
        malformedMessage: opts.malformedMessage,
        streamUnavailableMessage: opts.streamUnavailableMessage,
        abortedMessage: timeoutMessage,
        controller
      });
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(opts.malformedJsonMessage || "The response contained invalid JSON.");
      }
    })();

    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        abortController(controller);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  const api = { readBoundedText, fetchJson, DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS };
  root.DaymarkExtensionResponseBody = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
