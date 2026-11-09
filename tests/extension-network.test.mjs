'use strict';

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_AI_OUTPUT_CHARS,
  MAX_AI_PROMPT_CHARS,
  MAX_TRANSLATION_RESPONSE_BYTES,
  fetchBoundedJson,
  normalizeLanguageCode,
  requestAiCompletion,
  requestTranslation,
  validateAiEndpointConfig,
} from "../browser-extension/uc-china-lite/lib/network.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function streamResponse(chunks, options = {}) {
  let index = 0;
  const state = { opened: false, cancelled: false, released: false, activeReader: null };
  const reader = {
    async read() {
      if (index < chunks.length) return { done: false, value: chunks[index++] };
      return { done: true, value: undefined };
    },
    cancel() {
      state.cancelled = true;
      return Promise.resolve();
    },
    releaseLock() {
      state.released = true;
    },
  };
  const response = {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-length" && options.contentLength !== undefined
          ? String(options.contentLength) : null;
      },
    },
    body: {
      getReader() {
        state.opened = true;
        state.activeReader = reader;
        return reader;
      },
    },
    async text() {
      throw new Error("streaming response must not be materialized with text()");
    },
  };
  return { response, state, reader };
}

function jsonStream(value, options) {
  return streamResponse([new TextEncoder().encode(JSON.stringify(value))], options);
}

test("AI endpoint validation requires HTTPS and an exact credential-free origin", () => {
  assert.deepEqual(
    validateAiEndpointConfig("https://api.example.com/v1/chat/completions", "https://api.example.com", "key"),
    { ok: true, endpoint: "https://api.example.com/v1/chat/completions", origin: "https://api.example.com" }
  );
  assert.equal(validateAiEndpointConfig("", "", "key").ok, false);
  assert.equal(validateAiEndpointConfig("http://api.example.com/chat", "http://api.example.com", "key").ok, false);
  assert.equal(validateAiEndpointConfig("https://api.example.com/chat", "https://other.example.com", "key").ok, false);
  assert.equal(validateAiEndpointConfig("https://user:pass@api.example.com/chat", "https://api.example.com", "key").ok, false);
  assert.equal(validateAiEndpointConfig("https://api.example.com/chat#token", "https://api.example.com", "key").ok, false);
  assert.equal(validateAiEndpointConfig("https://api.example.com/chat", "https://api.example.com/path", "key").ok, false);
  assert.equal(validateAiEndpointConfig("", "", "").ok, true);
});

test("language codes are bounded and fall back to Hindi when invalid", () => {
  assert.equal(normalizeLanguageCode("en"), "en");
  assert.equal(normalizeLanguageCode("zh-CN"), "zh-CN");
  assert.equal(normalizeLanguageCode("en|fr"), "hi");
  assert.equal(normalizeLanguageCode("https://evil.example"), "hi");
  assert.equal(normalizeLanguageCode(""), "hi");
});

test("bounded JSON reader streams UTF-8 chunks and applies safe request defaults", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: "नमस्ते 🌏" }));
  const { response, state } = streamResponse([
    bytes.slice(0, 10),
    bytes.slice(10, 17),
    bytes.slice(17),
  ]);
  let seenInit;
  const result = await fetchBoundedJson("https://api.example.com/result", {}, {
    fetchImpl: async (_url, init) => { seenInit = init; return response; },
    maxBytes: 1024,
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { text: "नमस्ते 🌏" });
  assert.equal(seenInit.redirect, "error");
  assert.equal(seenInit.credentials, "omit");
  assert.equal(seenInit.referrerPolicy, "no-referrer");
  assert.equal(seenInit.cache, "no-store");
  assert.ok(seenInit.signal);
  assert.equal(state.opened, true);
  assert.equal(state.released, true);
});

test("HTTP error responses are aborted and their unread bodies are cancelled", async () => {
  let signal;
  let cancelled = false;
  const response = {
    ok: false,
    status: 503,
    headers: { get: () => null },
    body: { cancel() { cancelled = true; return Promise.resolve(); } },
  };
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async (_url, init) => { signal = init.signal; return response; },
      timeoutMs: 1000,
    }),
    (error) => error.code === "http-error"
  );
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
});

test("declared oversized bodies are rejected before opening the stream", async () => {
  const { response, state } = streamResponse([new Uint8Array(1)], { contentLength: 101 });
  let signal;
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async (_url, init) => { signal = init.signal; return response; },
      maxBytes: 100,
      timeoutMs: 1000,
    }),
    (error) => error.code === "response-too-large"
  );
  assert.equal(state.opened, false);
  assert.equal(signal.aborted, true);
});

test("streamed bodies are cancelled and aborted as soon as the byte cap is crossed", async () => {
  const { response, state } = streamResponse([new Uint8Array(8), new Uint8Array(8)]);
  let signal;
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async (_url, init) => { signal = init.signal; return response; },
      maxBytes: 10,
      timeoutMs: 1000,
    }),
    (error) => error.code === "response-too-large"
  );
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
  assert.equal(signal.aborted, true);
});

test("malformed UTF-8 and malformed JSON are rejected rather than silently replaced", async () => {
  const invalidUtf8 = streamResponse([new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])]);
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async () => invalidUtf8.response,
      timeoutMs: 1000,
    }),
    (error) => error.code === "invalid-utf8"
  );

  const invalidJson = streamResponse([new TextEncoder().encode("{not json")]);
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async () => invalidJson.response,
      timeoutMs: 1000,
    }),
    (error) => error.code === "invalid-json"
  );
});

test("decoder construction failures abort and release the acquired reader", async () => {
  const { response, state } = jsonStream({ ok: true });
  const originalDecoder = globalThis.TextDecoder;
  let signal;
  globalThis.TextDecoder = class {
    constructor() { throw new Error("decoder initialization failed"); }
  };
  try {
    await assert.rejects(
      fetchBoundedJson("https://api.example.com/result", {}, {
        fetchImpl: async (_url, init) => { signal = init.signal; return response; },
        timeoutMs: 1000,
      }),
      (error) => error.code === "decoder-unavailable"
    );
  } finally {
    globalThis.TextDecoder = originalDecoder;
  }
  assert.equal(signal.aborted, true);
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
});

test("responses without a streaming body fail closed without materializing text", async () => {
  let textRead = false;
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: null,
    async text() { textRead = true; return "{}"; },
  };
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async () => response,
      timeoutMs: 1000,
    }),
    (error) => error.code === "stream-unavailable"
  );
  assert.equal(textRead, false);
});

test("timeouts abort the request and cancel an active stream reader", async () => {
  let signal;
  let cancelled = false;
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: {
      getReader() {
        return {
          read: () => new Promise(() => {}),
          cancel() { cancelled = true; return Promise.resolve(); },
          releaseLock() {},
        };
      },
    },
  };
  await assert.rejects(
    fetchBoundedJson("https://api.example.com/result", {}, {
      fetchImpl: async (_url, init) => { signal = init.signal; return response; },
      timeoutMs: 10,
    }),
    (error) => error.code === "timeout"
  );
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
});

test("non-HTTPS URLs are rejected before any network request", async () => {
  let calls = 0;
  await assert.rejects(
    fetchBoundedJson("http://api.example.com/result", {}, {
      fetchImpl: async () => { calls += 1; return { ok: true, text: async () => "{}" }; },
    }),
    (error) => error.code === "invalid-url"
  );
  assert.equal(calls, 0);
});

test("AI completion bounds prompts and responses and sends the key only to the validated origin", async () => {
  const settings = {
    apiUrl: "https://api.example.com/v1/chat/completions",
    apiOrigin: "https://api.example.com",
    apiKey: "secret-test-key",
    model: "gpt-test",
  };
  const { response } = jsonStream({ choices: [{ message: { content: "Safe answer" } }] });
  let seenUrl;
  let seenInit;
  const result = await requestAiCompletion(settings, "Explain this", {
    fetchImpl: async (url, init) => { seenUrl = url; seenInit = init; return response; },
  });
  assert.equal(result, "Safe answer");
  assert.equal(seenUrl, settings.apiUrl);
  assert.equal(seenInit.headers.Authorization, "Bearer secret-test-key");
  assert.equal(seenInit.redirect, "error");
  assert.equal(seenInit.credentials, "omit");
  let calls = 0;
  await assert.rejects(
    requestAiCompletion(settings, "x".repeat(MAX_AI_PROMPT_CHARS + 1), {
      fetchImpl: async () => { calls += 1; return response; },
    }),
    (error) => error.code === "prompt-too-large"
  );
  assert.equal(calls, 0);
});

test("AI completion rejects provider output beyond the display limit", async () => {
  const settings = {
    apiUrl: "https://api.example.com/v1/chat/completions",
    apiOrigin: "https://api.example.com",
    apiKey: "secret-test-key",
  };
  const { response } = jsonStream({ choices: [{ message: { content: "x".repeat(MAX_AI_OUTPUT_CHARS + 1) } }] });
  await assert.rejects(
    requestAiCompletion(settings, "Explain", { fetchImpl: async () => response }),
    (error) => error.code === "response-too-large"
  );
});

test("translation requests are bounded, HTTPS-only, and encode user text", async () => {
  const { response } = jsonStream({ responseData: { translatedText: "नमस्ते" } });
  let seenUrl;
  const result = await requestTranslation("hello & goodbye", "hi", {
    fetchImpl: async (url, init) => { seenUrl = new URL(url); assert.equal(init.redirect, "error"); return response; },
  });
  assert.equal(result, "नमस्ते");
  assert.equal(seenUrl.protocol, "https:");
  assert.equal(seenUrl.searchParams.get("q"), "hello & goodbye");
  assert.equal(seenUrl.searchParams.get("langpair"), "en|hi");
  await assert.rejects(
    requestTranslation("x".repeat(501), "hi", { fetchImpl: async () => response }),
    (error) => error.code === "text-too-large"
  );
  assert.equal(MAX_TRANSLATION_RESPONSE_BYTES, 64 * 1024);
});


function makeExtensionFeatureEnvironment() {
  const elements = new Map();
  const listeners = new Map();
  const calls = { messages: 0, storageReads: 0, opens: 0, alerts: 0 };

  function createElement(tagName) {
    return {
      tagName: String(tagName).toUpperCase(),
      id: "",
      title: "",
      textContent: "",
      style: {},
      attributes: {},
      children: [],
      onclick: null,
      setAttribute(name, value) { this.attributes[name] = String(value); },
      appendChild(child) {
        this.children.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      remove() {
        if (this.id) elements.delete(this.id);
        for (const child of this.children) if (child.id) elements.delete(child.id);
      },
    };
  }

  const documentElement = createElement("html");
  const document = {
    documentElement,
    getElementById(id) { return elements.get(id) || null; },
    createElement,
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) || [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
  };
  const window = {
    getSelection() {
      return {
        toString() { return "private selected page text"; },
        rangeCount: 1,
        getRangeAt() {
          return { getBoundingClientRect() { return { left: 10, top: 20, right: 120, width: 110, height: 16 }; } };
        },
      };
    },
    open() { calls.opens += 1; },
  };
  const chrome = {
    runtime: {
      async sendMessage() {
        calls.messages += 1;
        return { text: "safe response" };
      },
    },
    storage: {
      sync: {
        async get() {
          calls.storageReads += 1;
          return { settings: { language: "hi" } };
        },
      },
    },
  };
  const alert = () => { calls.alerts += 1; };
  return { document, window, chrome, alert, elements, calls };
}

function loadExtensionFeature(file, environment) {
  const source = fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^export\s+\{[^}]+\};\s*$/m, "")
    .replace(/^export default \{[^\n]*\};\s*$/m, "");
  const factory = new Function("document", "window", "chrome", "alert",
    source + "\nreturn { onEnable, onDisable }; ");
  return factory(environment.document, environment.window, environment.chrome, environment.alert);
}

test("AI launcher and action buttons reject synthetic clicks before sending selected text", async () => {
  const environment = makeExtensionFeatureEnvironment();
  const feature = loadExtensionFeature("browser-extension/uc-china-lite/features/aibutton.js", environment);
  feature.onEnable();

  const launcher = environment.elements.get("uccl-ai-btn");
  assert.ok(launcher);
  await launcher.onclick({ isTrusted: false });
  assert.equal(environment.elements.has("uccl-ai-panel"), false);
  assert.equal(environment.calls.messages, 0);
  assert.equal(environment.calls.opens, 0);

  await launcher.onclick({ isTrusted: true });
  const panel = environment.elements.get("uccl-ai-panel");
  assert.ok(panel, "a trusted user click opens the AI panel");
  const row = panel.children.find((child) => child.children.length === 3);
  assert.ok(row, "the panel exposes the three AI actions");
  await row.children[0].onclick({ isTrusted: false });
  assert.equal(environment.calls.messages, 0,
    "a synthetic click on Explain cannot send the selected text");
  assert.equal(environment.calls.opens, 0);

  await row.children[0].onclick({ isTrusted: true });
  assert.equal(environment.calls.messages, 1,
    "a trusted user click still sends the selected text through the configured AI flow");
});

test("Quick Translate rejects synthetic clicks before storage, network, alert, or external navigation", async () => {
  const environment = makeExtensionFeatureEnvironment();
  const feature = loadExtensionFeature("browser-extension/uc-china-lite/features/translate.js", environment);
  feature.onEnable();

  const button = environment.elements.get("uccl-translate-btn");
  assert.ok(button);
  await button.onclick({ isTrusted: false });
  assert.equal(environment.calls.storageReads, 0);
  assert.equal(environment.calls.messages, 0);
  assert.equal(environment.calls.alerts, 0);
  assert.equal(environment.calls.opens, 0);

  await button.onclick({ isTrusted: true });
  assert.equal(environment.calls.storageReads, 1);
  assert.equal(environment.calls.messages, 1);
  assert.equal(environment.calls.alerts, 1);
  assert.equal(environment.calls.opens, 0);
});

test("optional API host permissions are HTTPS-only while page features retain HTTP support", () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, "browser-extension/uc-china-lite/manifest.json"),
    "utf8"
  ));
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
  const pageMatches = manifest.content_scripts.flatMap((entry) => entry.matches || []);
  assert.ok(pageMatches.includes("http://*/*"), "content features still run on plain HTTP pages");
  assert.ok(pageMatches.includes("https://*/*"), "content features still run on HTTPS pages");
});

test("extension entry points use the bounded background transport and avoid silent search fallback on request errors", () => {
  const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
  const background = read("browser-extension/uc-china-lite/background.js");
  const translate = read("browser-extension/uc-china-lite/features/translate.js");
  const aiButton = read("browser-extension/uc-china-lite/features/aibutton.js");
  const options = read("browser-extension/uc-china-lite/options/options.js");
  const popup = read("browser-extension/uc-china-lite/popup/popup.js");

  assert.match(background, /requestAiCompletion/);
  assert.match(background, /requestTranslation/);
  assert.match(background, /permissions\.contains/);
  assert.doesNotMatch(background, /response\.json\s*\(/);
  assert.match(translate, /type:\s*"translateRequest"/);
  assert.doesNotMatch(translate, /fetch\s*\(/);
  assert.doesNotMatch(translate, /response\.json\s*\(/);
  assert.match(aiButton, /MAX_SELECTED_TEXT_CHARS = 11800/);
  assert.match(aiButton, /code === "no-api-key"/);
  assert.match(aiButton, /Your selection was not sent to a search provider/);
  assert.match(options, /validateAiEndpointConfig/);
  assert.match(options, /permissions\.request/);
  assert.match(popup, /TRANSLATE_ORIGIN/);
  assert.match(popup, /permissions\.request/);
});
