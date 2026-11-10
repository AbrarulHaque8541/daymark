
((root) => {
  'use strict';
  const API_BASE = 'https://api.telegram.org/';
  const MAX_MESSAGE_CHARS = 4096;
  const TRUNCATION_RESERVE = 64;
  const FETCH_TIMEOUT_MS = 8000;
  const TEST_MESSAGE = 'Daymark test message from the web prototype.';
  function isBotToken(value) {
    if (typeof value !== 'string') return false;
    return /^[0-9]{8,12}:[A-Za-z0-9_-]{30,60}$/.test(value.trim());
  }
  function isChatTarget(value) {
    if (typeof value !== 'string') return false;
    const target = value.trim();
    if (/^@[A-Za-z0-9_]{4,60}$/.test(target)) return true;
    return /^-?[0-9]{3,18}$/.test(target);
  }
  function buildCompletedDigest(tasks, options) {
    const dateLabel = options && typeof options.dateLabel === 'string' ? options.dateLabel.trim() : '';
    const header = 'Daymark completed-tasks digest' + (dateLabel ? ' \u00b7 ' + dateLabel : '');
    if (!Array.isArray(tasks)) {
      return { ok: false, reason: 'Saved tasks could not be read as a list.' };
    }
    const completed = tasks.filter((task) => task && typeof task === 'object' && task.completed === true);
    if (completed.length === 0) {
      return { ok: true, text: header + '\nNo completed tasks yet. Nothing to announce.', includedCount: 0, omittedCount: 0, totalCompleted: 0 };
    }
    const lines = [];
    let included = 0;
    for (const task of completed) {
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) continue;
      const line = '- ' + title + (typeof task.dueDate === 'string' && task.dueDate ? ' (due ' + task.dueDate + ')' : '');
      const projected = header.length + 1 + lines.join('\n').length + (lines.length > 0 ? 1 : 0) + line.length;
      if (projected > MAX_MESSAGE_CHARS - TRUNCATION_RESERVE) break;
      lines.push(line);
      included += 1;
    }
    const omitted = completed.length - included;
    let text = header + '\n' + lines.join('\n');
    if (omitted > 0) text += '\n(' + omitted + ' completed task(s) omitted to fit the Telegram message limit.)';
    return { ok: true, text, includedCount: included, omittedCount: omitted, totalCompleted: completed.length };
  }
  function classifySendOutcome(status, bodyOk, bodyDescription) {
    const description = typeof bodyDescription === 'string' ? bodyDescription.slice(0, 200) : '';
    if (status === 401) return 'Telegram rejected the bot token. Copy a fresh token from @BotFather.';
    if (status === 403) return 'Telegram refused this bot for that chat. The chat may have blocked the bot, or the bot has never seen the chat.';
    if (status === 404) return 'Telegram does not know that chat target. Send a first message to your bot, or check the chat id.';
    if (status === 429) return 'Telegram is rate-limiting this bot. Wait a little and send again.';
    if (status >= 400 && status < 500) return 'Telegram refused the request (HTTP ' + status + '). Nothing was sent.';
    if (status >= 500) return 'Telegram had a server problem (HTTP ' + status + '). Try again later.';
    if (bodyOk === false) return 'Telegram replied without confirming delivery' + (description ? ': ' + description : '.');
    return 'Telegram did not confirm delivery. Nothing was announced as sent.';
  }
  function resolveCallable(deps, name) {
    if (deps && Object.prototype.hasOwnProperty.call(deps, name)) {
      return typeof deps[name] === 'function' ? deps[name] : null;
    }
    return typeof root[name] === 'function' ? root[name] : null;
  }
  function sendTelegramMessage(options, deps) {
    const botToken = options && typeof options.botToken === 'string' ? options.botToken.trim() : '';
    const chatTarget = options && typeof options.chatTarget === 'string' ? options.chatTarget.trim() : '';
    const text = options && typeof options.text === 'string' ? options.text : '';
    if (!isBotToken(botToken)) return Promise.resolve({ ok: false, reason: 'That does not look like a Telegram bot token (expected 123456789:AA from @BotFather).' });
    if (!isChatTarget(chatTarget)) return Promise.resolve({ ok: false, reason: 'That does not look like a chat target (a numeric chat id or an @username).' });
    if (!text.trim()) return Promise.resolve({ ok: false, reason: 'There is nothing to send.' });
    if (text.length > MAX_MESSAGE_CHARS) return Promise.resolve({ ok: false, reason: 'The message is longer than Telegram allows. Nothing was sent.' });
    const fetchFn = resolveCallable(deps, 'fetch');
    const AbortControllerCtor = resolveCallable(deps, 'AbortController');
    const scheduleAbort = resolveCallable(deps, 'setTimeout');
    if (!fetchFn || !AbortControllerCtor || !scheduleAbort) {
      return Promise.resolve({ ok: false, reason: 'This environment cannot make network requests.' });
    }
    const url = API_BASE + 'bot' + botToken + '/sendMessage';
    if (!/^https:\/\//.test(url)) return Promise.resolve({ ok: false, reason: 'The Telegram API address must be HTTPS. Nothing was sent.' });

    return new Promise((resolve) => {
      let settled = false;
      let aborted = false;
      let controller = null;
      let timer = null;
      const cancelAbort = resolveCallable(deps, 'clearTimeout');

      function settle(result) {
        if (settled) return;
        settled = true;
        if (cancelAbort) {
          try { cancelAbort(timer); } catch (error) { /* Timer cleanup must not rewrite delivery status. */ }
        }
        resolve(result);
      }

      try {
        controller = new AbortControllerCtor();
        timer = scheduleAbort(() => {
          aborted = true;
          try {
            if (controller && typeof controller.abort === 'function') {
              controller.abort();
            }
          } catch (error) { /* Abort failure must not hang the UI; independent settlement follows. */ }
          // Independent bounded settlement: never leave the UI waiting forever.
          // A timed-out POST may already have reached Telegram, so do not claim a clean failure.
          settle({
            ok: false,
            reason: 'Delivery is unconfirmed. Telegram may already have the message — check the chat before sending again.'
          });
        }, FETCH_TIMEOUT_MS);
      } catch (error) {
        settle({ ok: false, reason: 'This environment cannot make network requests.' });
        return;
      }

      let request;
      try {
        request = fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatTarget, text, disable_web_page_preview: true }),
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
      } catch (error) {
        request = Promise.reject(error);
      }

      Promise.resolve(request).then((response) => response.json()
        .then((body) => ({ response, body }), () => ({ response, body: null })))
        .then(({ response, body }) => {
          const status = response && typeof response.status === 'number' ? response.status : 0;
          if (status < 200 || status > 299) {
            settle({ ok: false, reason: classifySendOutcome(status, null, null) });
            return;
          }
          if (!body || body.ok !== true) {
            settle({
              ok: false,
              reason: classifySendOutcome(
                status,
                body ? body.ok : undefined,
                body && typeof body.description === 'string' ? body.description.split(botToken).join('[redacted]') : ''
              )
            });
            return;
          }
          const message = body.result;
          const messageId = message && typeof message === 'object' && !Array.isArray(message)
            ? message.message_id : null;
          if (!Number.isSafeInteger(messageId) || messageId <= 0) {
            settle({ ok: false, reason: 'Telegram returned an incomplete success response. Delivery could not be confirmed.' });
            return;
          }
          settle({ ok: true, messageId });
        })
        .catch(() => {
          // Only used when the request settles before the independent timeout path.
          // Prefer the timeout's unconfirmed wording when the abort path already ran.
          if (aborted) {
            settle({
              ok: false,
              reason: 'Delivery is unconfirmed. Telegram may already have the message — check the chat before sending again.'
            });
            return;
          }
          settle({
            ok: false,
            reason: 'This device could not reach Telegram. You may be offline, or the request was blocked.'
          });
        });
    });
  }

  const api = { isBotToken, isChatTarget, buildCompletedDigest, classifySendOutcome, sendTelegramMessage, TEST_MESSAGE, MAX_MESSAGE_CHARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTelegram = api;
})(globalThis);
