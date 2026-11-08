'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const responseBody = require('../response-body-logic.js');
const weather = require('../weather-logic.js');
const currency = require('../currency-logic.js');
const holidays = require('../holidays-logic.js');
const wiki = require('../wiki-logic.js');

function makeStreamResponse(chunks, options) {
  const opts = options || {};
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
    }
  };
  const response = {
    ok: true,
    status: 200,
    headers: opts.contentLength === undefined
      ? { get() { return null; } }
      : { get(name) { return name.toLowerCase() === 'content-length' ? String(opts.contentLength) : null; } },
    body: {
      getReader() {
        state.opened = true;
        state.activeReader = reader;
        return reader;
      }
    },
    text() {
      state.textCalled = true;
      throw new Error('streaming path must not call response.text()');
    }
  };
  return { response, state };
}

test('shared reader incrementally decodes UTF-8 split across chunks', async () => {
  const expected = { place: 'Kolkata', note: '🌦️' };
  const bytes = new TextEncoder().encode(JSON.stringify(expected));
  const emojiStart = bytes.findIndex((value) => value === 0xF0);
  assert.ok(emojiStart >= 0);
  const splitAt = emojiStart + 2;
  const { response, state } = makeStreamResponse([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
  const text = await responseBody.readBoundedText(response, { maxBytes: bytes.byteLength, maxChars: 1000 });
  assert.deepEqual(JSON.parse(text), expected);
  assert.equal(state.released, true);
  assert.equal(state.cancelled, false);
  assert.equal(state.textCalled, undefined);
});

test('shared reader cancels and aborts immediately after the byte cap is crossed', async () => {
  const controller = new AbortController();
  const { response, state } = makeStreamResponse([
    new Uint8Array(32),
    new Uint8Array([0x7B])
  ]);
  await assert.rejects(
    responseBody.readBoundedText(response, { maxBytes: 32, maxChars: 32, controller }),
    /too large/
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(state.cancelled, true);
  assert.equal(state.released, true);
  assert.equal(state.textCalled, undefined);
});

test('oversized Content-Length is rejected before opening a reader', async () => {
  const controller = new AbortController();
  const { response, state } = makeStreamResponse([], { contentLength: 33 });
  await assert.rejects(
    responseBody.readBoundedText(response, { maxBytes: 32, controller }),
    /too large/
  );
  assert.equal(controller.signal.aborted, true);
  assert.equal(state.opened, false);
  assert.equal(state.textCalled, undefined);
});

test('text-only compatibility responses are checked by UTF-8 byte size', async () => {
  const text = await responseBody.readBoundedText({
    text: async () => '{"ok":true}'
  }, { maxBytes: 32, maxChars: 32 });
  assert.deepEqual(JSON.parse(text), { ok: true });
  await assert.rejects(
    responseBody.readBoundedText({ text: async () => 'é' }, { maxBytes: 1, maxChars: 10 }),
    /too large/
  );
});

test('all JSON API modules cancel oversized streamed responses', async () => {
  const clients = [
    ['weather', weather],
    ['currency', currency],
    ['holidays', holidays],
    ['Wikipedia', wiki]
  ];
  for (const [name, api] of clients) {
    let index = 0;
    let cancelled = false;
    const response = {
      ok: true,
      status: 200,
      body: {
        getReader() {
          return {
            async read() {
              return index++ === 0
                ? { done: false, value: new Uint8Array(api.MAX_JSON_BYTES) }
                : { done: false, value: new Uint8Array([0x7B]) };
            },
            cancel() { cancelled = true; return Promise.resolve(); },
            releaseLock() {}
          };
        }
      },
      text() { throw new Error('module bypassed the shared streaming reader'); }
    };
    await assert.rejects(
      api.fetchJson('https://example.test/api', () => Promise.resolve(response), 1000),
      /too large/,
      name
    );
    assert.equal(cancelled, true, name + ' must cancel its oversized stream');
  }
});

test('Wikipedia fetchJson enforces its timeout even when fetch ignores AbortSignal', async () => {
  await assert.rejects(
    wiki.fetchJson('https://example.test/wiki', () => new Promise(() => {}), 10),
    /Wikipedia request timed out/
  );
});

test('index loads the shared response reader before every JSON API module', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const helper = html.indexOf('<script src="response-body-logic.js"');
  assert.ok(helper >= 0, 'shared response reader script is present');
  for (const script of ['weather-logic.js', 'holidays-logic.js', 'currency-logic.js', 'wiki-logic.js']) {
    const index = html.indexOf('<script src="' + script + '"');
    assert.ok(index > helper, script + ' must load after the shared response reader');
  }
});
