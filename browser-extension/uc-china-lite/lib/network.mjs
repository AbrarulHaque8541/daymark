const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";

export const MAX_AI_PROMPT_CHARS = 12000;
export const MAX_AI_OUTPUT_CHARS = 12000;
export const MAX_AI_RESPONSE_BYTES = 256 * 1024;
export const MAX_TRANSLATION_TEXT_CHARS = 500;
export const MAX_TRANSLATION_RESPONSE_BYTES = 64 * 1024;

function networkError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abort(controller) {
  if (!controller || typeof controller.abort !== "function") return;
  try { controller.abort(); } catch (error) { /* already aborted */ }
}

function cancel(reader) {
  if (!reader || typeof reader.cancel !== "function") return;
  try {
    const pending = reader.cancel();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (error) {
    // Cancellation is best-effort; the original failure remains authoritative.
  }
}

function contentLength(response) {
  try {
    const headers = response && response.headers;
    if (!headers || typeof headers.get !== "function") return null;
    const raw = headers.get("content-length");
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function requireHttpsUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch (error) {
    throw networkError("invalid-url", "A valid HTTPS URL is required.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw networkError("invalid-url", "Only credential-free HTTPS requests are allowed.");
  }
  return url;
}

export function validateAiEndpointConfig(apiUrl, apiOrigin, apiKey) {
  const endpointText = typeof apiUrl === "string" ? apiUrl.trim() : "";
  const originText = typeof apiOrigin === "string" ? apiOrigin.trim() : "";
  const keyText = typeof apiKey === "string" ? apiKey.trim() : "";

  if (!endpointText && !originText) {
    if (keyText) return { ok: false, error: "An HTTPS API endpoint is required when an API key is set." };
    return { ok: true, endpoint: "", origin: "" };
  }
  if (!endpointText || !originText || endpointText.length > 2048 || originText.length > 512) {
    return { ok: false, error: "Enter an HTTPS API endpoint and its matching origin." };
  }

  try {
    const endpoint = new URL(endpointText);
    const origin = new URL(originText);
    if (endpoint.protocol !== "https:" || origin.protocol !== "https:"
      || endpoint.username || endpoint.password || endpoint.hash
      || origin.username || origin.password || origin.pathname !== "/"
      || origin.search || origin.hash || endpoint.origin !== origin.origin) {
      return { ok: false, error: "The API endpoint must use HTTPS and match the permission origin exactly." };
    }
    return { ok: true, endpoint: endpoint.href, origin: origin.origin };
  } catch (error) {
    return { ok: false, error: "Enter a valid HTTPS API endpoint and origin." };
  }
}

export function normalizeLanguageCode(value) {
  const language = typeof value === "string" ? value.trim() : "";
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language) ? language : "hi";
}

async function readResponseText(response, controller, setActiveReader, isTimedOut, maxBytes, maxChars) {
  const declaredLength = contentLength(response);
  if (declaredLength !== null && declaredLength > maxBytes) {
    abort(controller);
    throw networkError("response-too-large", "The response exceeded the configured size limit.");
  }

  const body = response && response.body;
  const Decoder = globalThis.TextDecoder;
  if (!body || typeof body.getReader !== "function" || typeof Decoder !== "function") {
    if (!response || typeof response.text !== "function") {
      throw networkError("invalid-response", "The server returned no readable response body.");
    }
    const text = await response.text();
    if (isTimedOut()) throw networkError("timeout", "The network request timed out.");
    if (typeof text !== "string" || text.length > maxChars) {
      abort(controller);
      throw networkError("response-too-large", "The response exceeded the configured size limit.");
    }
    if (typeof globalThis.TextEncoder !== "function") {
      abort(controller);
      throw networkError("decoder-unavailable", "A safe response-size check is unavailable.");
    }
    const byteLength = new globalThis.TextEncoder().encode(text).byteLength;
    if (byteLength > maxBytes) {
      abort(controller);
      throw networkError("response-too-large", "The response exceeded the configured size limit.");
    }
    return text;
  }

  let reader;
  try {
    reader = body.getReader();
  } catch (error) {
    abort(controller);
    throw networkError("body-unavailable", "The response body could not be read safely.");
  }
  setActiveReader(reader);
  const decoder = new Decoder("utf-8", { fatal: true });
  let text = "";
  let bytesRead = 0;
  try {
    for (;;) {
      if (isTimedOut()) throw networkError("timeout", "The network request timed out.");
      const part = await reader.read();
      if (isTimedOut()) throw networkError("timeout", "The network request timed out.");
      if (!part || typeof part !== "object") {
        throw networkError("invalid-response", "The server returned an invalid response stream.");
      }
      if (part.done) break;
      const chunk = part.value;
      if (!(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk)) {
        throw networkError("invalid-response", "The server returned a non-binary response chunk.");
      }
      const chunkBytes = chunk.byteLength;
      if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 0) {
        throw networkError("invalid-response", "The server returned an invalid response chunk.");
      }
      bytesRead += chunkBytes;
      if (bytesRead > maxBytes) {
        throw networkError("response-too-large", "The response exceeded the configured size limit.");
      }
      try {
        text += decoder.decode(chunk, { stream: true });
      } catch (error) {
        throw networkError("invalid-utf8", "The server returned malformed UTF-8.");
      }
      if (text.length > maxChars) {
        throw networkError("response-too-large", "The response exceeded the configured size limit.");
      }
    }
    try {
      text += decoder.decode();
    } catch (error) {
      throw networkError("invalid-utf8", "The server returned malformed UTF-8.");
    }
    if (text.length > maxChars) {
      throw networkError("response-too-large", "The response exceeded the configured size limit.");
    }
    if (isTimedOut()) throw networkError("timeout", "The network request timed out.");
    return text;
  } catch (error) {
    abort(controller);
    cancel(reader);
    throw error && error.code ? error : networkError("read-failed", "The response could not be read safely.");
  } finally {
    setActiveReader(null);
    try { reader.releaseLock(); } catch (error) { /* optional on minimal test readers */ }
  }
}

export async function fetchBoundedJson(url, init = {}, options = {}) {
  const parsedUrl = requireHttpsUrl(url);
  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") throw networkError("fetch-unavailable", "Network access is unavailable.");

  const maxBytes = Number.isSafeInteger(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes : DEFAULT_MAX_RESPONSE_BYTES;
  const maxChars = Number.isSafeInteger(options.maxChars) && options.maxChars > 0
    ? options.maxChars : maxBytes;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.min(options.timeoutMs, 120000) : DEFAULT_TIMEOUT_MS;
  const Controller = typeof options.AbortController === "function"
    ? options.AbortController : globalThis.AbortController;
  const controller = typeof Controller === "function" ? new Controller() : null;
  let activeReader = null;
  let timedOut = false;
  let timer = null;

  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      abort(controller);
      cancel(activeReader);
      reject(networkError("timeout", "The network request timed out."));
    }, timeoutMs);
  });

  const request = (async () => {
    const response = await fetchImpl(parsedUrl.href, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller ? controller.signal : undefined,
    });
    if (timedOut) throw networkError("timeout", "The network request timed out.");
    if (!response || !response.ok) {
      throw networkError("http-error", "The server did not return a successful response.");
    }
    const text = await readResponseText(
      response,
      controller,
      (reader) => { activeReader = reader; },
      () => timedOut,
      maxBytes,
      maxChars
    );
    if (timedOut) throw networkError("timeout", "The network request timed out.");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw networkError("invalid-json", "The server returned invalid JSON.");
    }
  })();

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function requestAiCompletion(settings, prompt, options = {}) {
  const apiKey = settings && typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";
  if (!apiKey) throw networkError("no-api-key", "No API key is configured.");
  if (apiKey.length > 4096 || /[\r\n\u0000]/.test(apiKey)) {
    throw networkError("invalid-api-key", "The configured API key is invalid.");
  }
  const endpoint = validateAiEndpointConfig(
    settings && settings.apiUrl,
    settings && settings.apiOrigin,
    apiKey
  );
  if (!endpoint.ok || !endpoint.endpoint) {
    throw networkError("invalid-api-endpoint", endpoint.error || "Configure a valid HTTPS API endpoint.");
  }
  const promptText = typeof prompt === "string" ? prompt.trim() : "";
  if (!promptText) throw networkError("empty-prompt", "Select some text first.");
  if (promptText.length > MAX_AI_PROMPT_CHARS) {
    throw networkError("prompt-too-large", "Select up to 12,000 characters at a time.");
  }
  const model = settings && typeof settings.model === "string" && settings.model.trim()
    ? settings.model.trim().slice(0, 100) : "gpt-4o-mini";
  const data = await fetchBoundedJson(endpoint.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: promptText }],
    }),
  }, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs || 15000,
    maxBytes: options.maxBytes || MAX_AI_RESPONSE_BYTES,
    maxChars: options.maxChars || MAX_AI_RESPONSE_BYTES,
  });
  const content = data && data.choices && data.choices[0]
    && data.choices[0].message && data.choices[0].message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw networkError("bad-response", "The AI provider returned no text.");
  }
  if (content.length > MAX_AI_OUTPUT_CHARS) {
    throw networkError("response-too-large", "The AI response exceeded the display limit.");
  }
  return content.trim();
}

export async function requestTranslation(text, language, options = {}) {
  const source = typeof text === "string" ? text.trim() : "";
  if (!source) throw networkError("empty-text", "Select some text first.");
  if (source.length > MAX_TRANSLATION_TEXT_CHARS) {
    throw networkError("text-too-large", "Select up to 500 characters at a time.");
  }
  const url = new URL(MYMEMORY_ENDPOINT);
  url.searchParams.set("q", source);
  url.searchParams.set("langpair", "en|" + normalizeLanguageCode(language));
  const data = await fetchBoundedJson(url.href, { method: "GET" }, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs || 8000,
    maxBytes: options.maxBytes || MAX_TRANSLATION_RESPONSE_BYTES,
    maxChars: options.maxChars || MAX_TRANSLATION_RESPONSE_BYTES,
  });
  const translated = data && data.responseData && data.responseData.translatedText;
  if (typeof translated !== "string" || !translated.trim()) {
    throw networkError("bad-response", "The translation service returned no text.");
  }
  if (translated.length > 5000) {
    throw networkError("response-too-large", "The translation response exceeded the display limit.");
  }
  return translated.trim();
}
