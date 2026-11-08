"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const responseBody = require("../browser-extension/uc-china-lite/features/response-body.js");

function makeResponse(chunks, options) {
  const opts = options || {};
  let index = 0;
  const state = { opened: false, cancelled: false, released: false, textCalled: false };
  let pendingResolve = null;
  const reader = {
    async read() {
      if (opts.pending) return new Promise((resolve) => { pendingResolve = resolve; });
      if (index < chunks.length) return { done: false, value: chunks[index++] };
      return { done: true, value: undefined };
    },
    cancel() {
      state.cancelled = true;
      if (pendingResolve) pendingResolve({ done: true, value: undefined });
      return Promise.resolve();
    },
    releaseLock() { state.released = true; }
  };
  const response = {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-length" && opts.contentLength !== undefined
          ? String(opts.contentLength)
          : null;
      }
    },
    body: {
      getReader() {
        state.opened = true;
        return reader;
      }
    },
    text() {
      state.textCalled = true;
      throw new Error("response.text() must not be used for bounded extension JSON");
    }
  };
  return { response, state };
}

test("bounded reader decodes UTF-8 split across streamed chunks", async () => {
  const expected = { translated: "नमस्ते 🌦️" };
  const bytes = new TextEncoder().encode(JSON.stringify(expected));
  const split = bytes.findIndex((value) => value === 0xF0) + 2;
  const { response, state } = makeResponse([bytes.slice(0, split), bytes.slice(split)]);
  const text = await responseBody.readBoundedText(response, { maxBytes: bytes.byteLength, maxChars: 1000 });
  assert.deepEqual(JSON.parse(text), expected);
  assert.equal(state.released, true);
  assert.equal(state.cancelled, false);
  assert.equal(state.textCalled, false);
});

test("oversized streamed response aborts and cancels immediately", async () => {
  const controller = new AbortController();
  const { response, state } = makeResponse([new Uint8Array(32), new Uint8Array([0x7B])]);
  await assert.rejects(
    responseBody.readBoundedText(response, { maxBytes: 32, maxChars: 32, controller }),
    /safe size limit/
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
  assert.equal(state.textCalled, false);
});

test("oversized Content-Length is rejected before opening the stream", async () => {
  const controller = new AbortController();
  const { response, state } = makeResponse([], { contentLength: 65 });
  await assert.rejects(
    responseBody.readBoundedText(response, { maxBytes: 64, controller }),
    /safe size limit/
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(state.opened, false);
  assert.equal(state.textCalled, false);
});

test("non-streaming responses fail closed without calling response.text()", async () => {
  let textCalled = false;
  const controller = new AbortController();
  await assert.rejects(
    responseBody.readBoundedText({
      text() { textCalled = true; return Promise.resolve("{}"); }
    }, { controller }),
    /Streaming response bodies are unavailable/
  );
  assert.equal(textCalled, false);
  assert.equal(controller.signal.aborted, true);
});

test("malformed UTF-8 is rejected and the stream is cancelled", async () => {
  const { response, state } = makeResponse([new Uint8Array([0xC3, 0x28])]);
  await assert.rejects(
    responseBody.readBoundedText(response),
    /encoded data|encoding/i
  );
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
});

test("fetchJson enforces a deadline even when fetch ignores AbortSignal", async () => {
  await assert.rejects(
    responseBody.fetchJson("https://example.test/api", {}, {
      fetchImpl: () => new Promise(() => {}),
      timeoutMs: 10
    }),
    /timed out/
  );
});

test("fetchJson timeout cancels a stalled response reader", async () => {
  const { response, state } = makeResponse([], { pending: true });
  await assert.rejects(
    responseBody.fetchJson("https://example.test/api", {}, {
      fetchImpl: async () => response,
      timeoutMs: 10
    }),
    /timed out/
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
});

test("non-success HTTP responses are rejected without consuming their body", async () => {
  let readerOpened = false;
  const response = {
    ok: false,
    status: 429,
    body: { getReader() { readerOpened = true; throw new Error("must not read"); } }
  };
  await assert.rejects(
    responseBody.fetchJson("https://example.test/api", {}, { fetchImpl: async () => response }),
    /HTTP 429/
  );
  assert.equal(readerOpened, false);
});

test("AI and translation modules use bounded JSON reads instead of response.json()", () => {
  const root = path.join(__dirname, "..", "browser-extension", "uc-china-lite");
  const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
  const translate = fs.readFileSync(path.join(root, "features", "translate.js"), "utf8");
  const aiButton = fs.readFileSync(path.join(root, "features", "aibutton.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

  assert.match(background, /import ["']\.\/features\/response-body\.js["']/);
  assert.match(background, /responseBody\.fetchJson\(/);
  assert.doesNotMatch(background, /response\.json\s*\(/);
  assert.match(translate, /import ["']\.\/response-body\.js["']/);
  assert.match(translate, /responseBody\.fetchJson\(/);
  assert.doesNotMatch(translate, /response\.json\s*\(/);
  assert.match(aiButton, /response\.error === ["']no-api-key["']/);
  assert.doesNotMatch(aiButton, /if \(!response \|\| !response\.text\)[\s\S]*?window\.open/);
  assert.ok(manifest.web_accessible_resources.some((entry) =>
    entry.resources.includes("features/*.js")
  ), "the shared feature helper is covered by the existing web-accessible resource rule");
});
