
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../telegram-logic.js');
const VALID_TOKEN = '123456789:AAEfiK0sdVHqWlsZb2t3rJpQ5vLmNoPqR4sT';
function makeTask(title, options) {
  options = options || {};
  return {
    id: 'task-' + Math.abs(options.id !== undefined ? options.id : title.length),
    title: title,
    completed: options.completed === true,
    priority: 'medium',
    dueDate: options.dueDate || null,
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z'
  };
}
function makeFetch(handler) {
  const calls = [];
  const fn = (url, options) => { calls.push({ url, options }); return Promise.resolve(handler(calls.length)); };
  fn.calls = calls;
  return fn;
}
function okBody() { return { ok: true, result: { message_id: 4242 } }; }
function networkDeps(fetchFn) {
  class FakeAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  return { fetch: fetchFn, AbortController: FakeAbortController, setTimeout: () => 0, clearTimeout: () => {} };
}
test('bot tokens are validated strictly and trimmed', () => {
  assert.equal(engine.isBotToken(VALID_TOKEN), true);
  assert.equal(engine.isBotToken('  ' + VALID_TOKEN + '  '), true);
  assert.equal(engine.isBotToken('not-a-token'), false);
  assert.equal(engine.isBotToken('123456789:short'), false);
  assert.equal(engine.isBotToken('123456789'), false);
  assert.equal(engine.isBotToken(12345), false);
  assert.equal(engine.isBotToken(null), false);
});
test('chat targets accept @usernames and numeric ids only', () => {
  assert.equal(engine.isChatTarget('@daymark_user'), true);
  assert.equal(engine.isChatTarget('123456789'), true);
  assert.equal(engine.isChatTarget('-1001234567890'), true);
  assert.equal(engine.isChatTarget('  @daymark_user  '), true);
  assert.equal(engine.isChatTarget('hello world'), false);
  assert.equal(engine.isChatTarget('https://t.me/daymark'), false);
  assert.equal(engine.isChatTarget(''), false);
  assert.equal(engine.isChatTarget('@ab'), false);
  assert.equal(engine.isChatTarget(null), false);
});
test('the digest fails closed when tasks are not a list', () => {
  const digest = engine.buildCompletedDigest(null, {});
  assert.equal(digest.ok, false);
  assert.match(digest.reason, /could not be read as a list/);
});
test('a digest with no completed tasks reports zero honestly', () => {
  const digest = engine.buildCompletedDigest([makeTask('Still open')], { dateLabel: '2026-11-10' });
  assert.equal(digest.ok, true);
  assert.equal(digest.totalCompleted, 0);
  assert.match(digest.text, /No completed tasks yet/);
});
test('the digest lists only completed tasks with their due dates', () => {
  const tasks = [
    makeTask('Buy milk', { completed: true, dueDate: '2026-11-10' }),
    makeTask('Write report', { completed: true }),
    makeTask('Still open', {})
  ];
  const digest = engine.buildCompletedDigest(tasks, { dateLabel: '2026-11-10' });
  assert.equal(digest.ok, true);
  assert.equal(digest.totalCompleted, 2);
  assert.equal(digest.includedCount, 2);
  assert.equal(digest.omittedCount, 0);
  assert.match(digest.text, /Daymark completed-tasks digest \u00b7 2026-11-10/);
  assert.match(digest.text, /- Buy milk \(due 2026-11-10\)/);
  assert.match(digest.text, /- Write report/);
  assert.doesNotMatch(digest.text, /Still open/);
});
test('a huge completed list is truncated honestly and stays under the Telegram limit', () => {
  const tasks = [];
  for (let i = 0; i < 200; i += 1) {
    tasks.push(makeTask('Completed item number ' + i + ' with a fairly long descriptive title to consume space', { completed: true, id: i }));
  }
  const digest = engine.buildCompletedDigest(tasks, {});
  assert.equal(digest.ok, true);
  assert.equal(digest.totalCompleted, 200);
  assert.ok(digest.includedCount < 200, 'some tasks must be omitted');
  assert.equal(digest.omittedCount, 200 - digest.includedCount);
  assert.ok(digest.text.length <= engine.MAX_MESSAGE_CHARS, 'digest must fit the Telegram limit');
  assert.match(digest.text, /omitted to fit the Telegram message limit/);
});
test('the digest never grows past the limit even with maximum-length titles', () => {
  const tasks = [];
  for (let i = 0; i < 60; i += 1) {
    tasks.push(makeTask('T'.repeat(160), { completed: true, id: i }));
  }
  const digest = engine.buildCompletedDigest(tasks, {});
  assert.ok(digest.ok === true);
  assert.ok(digest.text.length <= engine.MAX_MESSAGE_CHARS);
  assert.ok(digest.includedCount >= 1);
});
test('send failures are explained in plain words per status', () => {
  assert.match(engine.classifySendOutcome(401, null, null), /rejected the bot token/);
  assert.match(engine.classifySendOutcome(403, null, null), /refused this bot/);
  assert.match(engine.classifySendOutcome(404, null, null), /does not know that chat/);
  assert.match(engine.classifySendOutcome(429, null, null), /rate-limiting/);
  assert.match(engine.classifySendOutcome(418, null, null), /HTTP 418/);
  assert.match(engine.classifySendOutcome(502, null, null), /server problem/);
  assert.match(engine.classifySendOutcome(200, false, 'Bad Request: chat not found'), /chat not found/);
  assert.match(engine.classifySendOutcome(200, undefined, ''), /did not confirm delivery/);
});
test('an invalid token or chat target never reaches the network', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const badToken = await engine.sendTelegramMessage({ botToken: 'nope', chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(badToken.ok, false);
  assert.match(badToken.reason, /does not look like a Telegram bot token/);
  assert.equal(fetchFn.calls.length, 0, 'no request for a bad token');
  const badChat = await engine.sendTelegramMessage({ botToken: VALID_TOKEN, chatTarget: 'nope', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(badChat.ok, false);
  assert.match(badChat.reason, /chat target/);
  assert.equal(fetchFn.calls.length, 0, 'no request for a bad chat target');
  const empty = await engine.sendTelegramMessage({ botToken: VALID_TOKEN, chatTarget: '12345', text: '   ' }, networkDeps(fetchFn));
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /nothing to send/);
  const oversized = await engine.sendTelegramMessage({ botToken: VALID_TOKEN, chatTarget: '12345', text: 'x'.repeat(4097) }, networkDeps(fetchFn));
  assert.equal(oversized.ok, false);
  assert.match(oversized.reason, /longer than Telegram allows/);
  assert.equal(fetchFn.calls.length, 0, 'rejected inputs never make a request');
});
test('a successful send posts the exact payload over HTTPS and reports the message id', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '@daymark_user', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 4242);
  assert.equal(fetchFn.calls.length, 1);
  assert.equal(fetchFn.calls[0].url, 'https://api.telegram.org/bot' + VALID_TOKEN + '/sendMessage');
  const payload = JSON.parse(fetchFn.calls[0].options.body);
  assert.equal(payload.chat_id, '@daymark_user');
  assert.equal(payload.text, 'hello');
  assert.equal(fetchFn.calls[0].options.method, 'POST');
  assert.equal(fetchFn.calls[0].options.credentials, 'omit');
  assert.equal(fetchFn.calls[0].options.cache, 'no-store');
  assert.equal(fetchFn.calls[0].options.redirect, 'error');
  assert.equal(fetchFn.calls[0].options.referrerPolicy, 'no-referrer');
});
test('a 2xx success response requires a positive safe Telegram message id', async () => {
  const invalidBodies = [
    { ok: true, result: null },
    { ok: true, result: [] },
    { ok: true, result: {} },
    { ok: true, result: { message_id: '4242' } },
    { ok: true, result: { message_id: 0 } },
    { ok: true, result: { message_id: -1 } },
    { ok: true, result: { message_id: 1.5 } },
    { ok: true, result: { message_id: Number.MAX_SAFE_INTEGER + 1 } }
  ];
  for (const body of invalidBodies) {
    const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(body) }));
    const result = await engine.sendTelegramMessage(
      { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
    assert.equal(result.ok, false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'messageId'), false);
    assert.match(result.reason, /incomplete success response/);
    assert.equal(fetchFn.calls.length, 1);
  }
});

test('a synchronous fetch exception becomes a failure result and still clears the timeout', async () => {
  let cleared = 0;
  const deps = networkDeps(() => { throw new Error('synchronous transport failure'); });
  deps.setTimeout = () => 73;
  deps.clearTimeout = (handle) => {
    assert.equal(handle, 73);
    cleared += 1;
  };
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(result.ok, false);
  assert.match(result.reason, /could not reach Telegram/);
  assert.equal(cleared, 1);
});

test('timeout setup exceptions fail closed before making a network request', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const deps = networkDeps(fetchFn);
  deps.AbortController = class {
    constructor() { throw new Error('controller unavailable'); }
  };
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(result.ok, false);
  assert.match(result.reason, /cannot make network requests/);
  assert.equal(fetchFn.calls.length, 0);
});

test('a synchronous timeout scheduler exception fails closed before making a request', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const deps = networkDeps(fetchFn);
  deps.setTimeout = () => { throw new Error('timeout scheduler unavailable'); };
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(result.ok, false);
  assert.match(result.reason, /cannot make network requests/);
  assert.equal(fetchFn.calls.length, 0);
});

test('timeout cleanup failure cannot turn confirmed delivery into a retry-inducing failure', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const deps = networkDeps(fetchFn);
  deps.clearTimeout = () => { throw new Error('timer cleanup failed'); };
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 4242);
});

test('an offline device reports an honest network reason without echoing the token', async () => {
  const fetchFn = (url, options) => Promise.reject(new Error('offline'));
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(result.ok, false);
  assert.match(result.reason, /could not reach Telegram/);
  assert.ok(result.reason.indexOf(VALID_TOKEN) === -1, 'the token must never be echoed');
});
test('a rejected token is reported without ever echoing the token value', async () => {
  const fetchFn = makeFetch(() => ({ status: 401, json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }) }));
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(result.ok, false);
  assert.match(result.reason, /rejected the bot token/);
  assert.ok(result.reason.indexOf(VALID_TOKEN) === -1);
});
test('a Telegram error body is surfaced in plain words', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve({ ok: false, description: 'Bad Request: chat not found' }) }));
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(result.ok, false);
  assert.match(result.reason, /chat not found/);
});
test('an API error description redacts the bot token before reaching the UI', async () => {
  const description = 'Request failed for https://api.telegram.org/bot' + VALID_TOKEN + '/sendMessage';
  const fetchFn = makeFetch(() => ({
    status: 200,
    json: () => Promise.resolve({ ok: false, description: description })
  }));
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, networkDeps(fetchFn));
  assert.equal(result.ok, false);
  assert.ok(result.reason.indexOf(VALID_TOKEN) === -1, 'untrusted API descriptions must not echo the bot token');
  assert.match(result.reason, /\[redacted\]/);
});

test('an environment with an explicit null fetch fails closed', async () => {
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' },
    { fetch: null, AbortController: function () { this.signal = null; }, setTimeout: () => 0, clearTimeout: () => {} });
  assert.equal(result.ok, false);
  assert.match(result.reason, /cannot make network requests/);
});
test('the test message is a short fixed Daymark string', () => {
  assert.equal(typeof engine.TEST_MESSAGE, 'string');
  assert.ok(engine.TEST_MESSAGE.length > 0 && engine.TEST_MESSAGE.length <= 200);
  assert.ok(engine.TEST_MESSAGE.indexOf('Daymark') !== -1);
});

test('timeout path settles even when AbortController.abort throws', async () => {
  let timeoutCb = null;
  const fetchFn = () => new Promise(() => { /* never settles */ });
  const deps = networkDeps(fetchFn);
  deps.AbortController = class {
    constructor() { this.signal = { aborted: false }; }
    abort() { throw new Error('abort refused'); }
  };
  deps.setTimeout = (cb) => {
    timeoutCb = cb;
    return 91;
  };
  let cleared = 0;
  deps.clearTimeout = () => { cleared += 1; };
  const pending = engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(typeof timeoutCb, 'function', 'timeout must be scheduled');
  timeoutCb();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /unconfirmed/i);
  assert.match(result.reason, /check the chat/i);
  assert.ok(result.reason.indexOf(VALID_TOKEN) === -1);
  assert.equal(cleared, 1);
});

test('never-settling fetch is bounded by the independent timeout settlement', async () => {
  let timeoutCb = null;
  const fetchFn = () => new Promise(() => { /* hangs forever */ });
  const deps = networkDeps(fetchFn);
  deps.setTimeout = (cb) => {
    timeoutCb = cb;
    return 42;
  };
  const pending = engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  timeoutCb();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /unconfirmed/i);
});

test('late confirmed success after timeout settlement is ignored', async () => {
  let timeoutCb = null;
  let resolveFetch = null;
  const fetchFn = () => new Promise((resolve) => { resolveFetch = resolve; });
  const deps = networkDeps(fetchFn);
  deps.setTimeout = (cb) => {
    timeoutCb = cb;
    return 7;
  };
  const pending = engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  // Timeout fires first
  timeoutCb();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /unconfirmed/i);
  // Late success must not change the already-settled outcome (promise already resolved)
  resolveFetch({ status: 200, json: () => Promise.resolve(okBody()) });
  // Give microtasks a tick; result object remains the timed-out one
  await Promise.resolve();
  assert.equal(result.ok, false);
  assert.match(result.reason, /unconfirmed/i);
});

test('timeout scheduler that never fires still allows successful delivery', async () => {
  const fetchFn = makeFetch(() => ({ status: 200, json: () => Promise.resolve(okBody()) }));
  const deps = networkDeps(fetchFn);
  // Schedule but never invoke the callback (simulates long timeout / success first)
  deps.setTimeout = () => 55;
  const result = await engine.sendTelegramMessage(
    { botToken: VALID_TOKEN, chatTarget: '12345', text: 'hello' }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.messageId, 4242);
});
