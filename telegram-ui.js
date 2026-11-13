((root) => {
  'use strict';
  const STORAGE_KEY = 'daymark.tasks.v1';
  const CHAT_STORAGE_KEY = 'daymark.telegram.lastChat.v1';
  let activeHandle = null;
  function attachTelegramUi(env) {
    if (!env || !env.document) throw new Error('attachTelegramUi requires a document.');
    const doc = env.document;
    const hasOwn = Object.prototype.hasOwnProperty;
    const logicApi = hasOwn.call(env, 'logicApi') ? env.logicApi : (root.DaymarkTelegram || null);
    const taskLogicApi = hasOwn.call(env, 'taskLogicApi') ? env.taskLogicApi : (root.DaymarkLogic || null);
    const taskMutation = env.taskMutationApi || root.DaymarkTaskMutation || null;
    const lifecycleWindow = env.window || doc.defaultView || null;
    let lockManager = env.lockManager || null;
    if (!lockManager) {
      try { lockManager = (env.navigator || (lifecycleWindow && lifecycleWindow.navigator) || {}).locks || null; }
      catch (error) { lockManager = null; }
    }
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const tokenEl = element('telegram-token');
    const chatEl = element('telegram-chat');
    if (chatEl) chatEl.placeholder = 'Private chat ID or public @channelusername';
    const statusEl = element('telegram-status');
    const formEl = element('telegram-form');
    const testEl = element('telegram-test');
    const clearEl = element('telegram-clear');
    const sendEl = element('telegram-send');
    const observesPageLifecycle = lifecycleWindow
      && typeof lifecycleWindow.addEventListener === 'function'
      && typeof lifecycleWindow.removeEventListener === 'function';
    let busy = false;
    let observedClearEpoch = null;
    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }
    function setControlsBusy(isBusy) {
      busy = isBusy;
      const controls = [sendEl, testEl, clearEl];
      for (const el of controls) {
        if (!el) continue;
        el.disabled = isBusy;
        if (typeof el.setAttribute === 'function') {
          el.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
        }
      }
      if (formEl && typeof formEl.setAttribute === 'function') {
        formEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
      if (statusEl && typeof statusEl.setAttribute === 'function') {
        statusEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');
      }
    }
    function resolveStorage() {
      if (hasOwn.call(env, 'storage')) return env.storage;
      try {
        const candidate = root.localStorage;
        return candidate && typeof candidate.getItem === 'function' ? candidate : null;
      } catch (error) { return null; }
    }
    async function persistChatTarget(target, expectedClearEpoch) {
      if (!target || typeof target !== 'string' || !Number.isSafeInteger(expectedClearEpoch)
          || !taskMutation || !lockManager) return false;
      const storage = resolveStorage();
      if (!storage || typeof storage.setItem !== 'function') return false;
      const locked = await taskMutation.withExclusiveLock(lockManager, taskMutation.TASK_LOCK_NAME, () => {
        const generation = taskMutation.readGeneration(storage);
        if (!generation.ok || generation.value.clearEpoch !== expectedClearEpoch) return false;
        try {
          storage.setItem(CHAT_STORAGE_KEY, target);
          return true;
        } catch (error) {
          return false;
        }
      });
      return !!(locked.ok && locked.value === true);
    }
    function readClearEpoch() {
      const storage = resolveStorage();
      if (!taskMutation || !storage) return null;
      const generation = taskMutation.readGeneration(storage);
      return generation.ok ? generation.value.clearEpoch : null;
    }
    function resetForClearAll() {
      clearTokenField();
      if (chatEl && typeof chatEl.value === 'string') chatEl.value = '';
      const epoch = readClearEpoch();
      observedClearEpoch = Number.isSafeInteger(epoch) ? epoch : null;
      status('Cleared by local data controls. The token and remembered chat target were emptied.');
    }
    function restoreChatTarget() {
      if (!chatEl || !logicApi || typeof logicApi.isChatTarget !== 'function') return;
      const storage = resolveStorage();
      if (!storage || typeof storage.getItem !== 'function') return;
      try {
        const saved = storage.getItem(CHAT_STORAGE_KEY);
        if (typeof saved === 'string' && saved && logicApi.isChatTarget(saved)) {
          chatEl.value = saved;
          status('Last chat target restored. Token is still session-only.');
        }
      } catch (error) { /* Ignore unreadable preference. */ }
    }
    observedClearEpoch = readClearEpoch();
    restoreChatTarget();
    function readStoredTasks() {
      const storage = resolveStorage();
      if (!storage || typeof storage.getItem !== 'function') {
        return { tasks: null, reason: 'Task storage is unavailable in this browser.', note: '' };
      }
      let raw = null;
      try { raw = storage.getItem(STORAGE_KEY); } catch (error) {
        return { tasks: null, reason: 'Task storage could not be read.', note: '' };
      }
      if (raw === null) return { tasks: [], reason: '', note: '' };
      if (typeof raw !== 'string') return { tasks: null, reason: 'Saved tasks could not be read safely.', note: '' };
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (error) {
        return { tasks: null, reason: 'Saved tasks could not be read as JSON.', note: '' };
      }
      if (!taskLogicApi || typeof taskLogicApi.validateStoredTasks !== 'function') {
        return { tasks: null, reason: 'Task validation is unavailable, so nothing was sent.', note: '' };
      }
      let validated;
      try { validated = taskLogicApi.validateStoredTasks(parsed); } catch (error) {
        return { tasks: null, reason: 'Saved tasks could not be validated safely.', note: '' };
      }
      if (!validated || !Array.isArray(validated.tasks)) {
        return { tasks: null, reason: 'Saved tasks could not be validated safely.', note: '' };
      }
      const rejectedCount = Number.isInteger(validated.rejectedCount) && validated.rejectedCount > 0 ? validated.rejectedCount : 0;
      return {
        tasks: validated.tasks,
        reason: '',
        note: rejectedCount > 0 ? ' (' + rejectedCount + ' unreadable task(s) skipped.)' : ''
      };
    }
    function todayLabel() {
      if (taskLogicApi && typeof taskLogicApi.localDateString === 'function') {
        try { return taskLogicApi.localDateString(new Date()); } catch (error) { return ''; }
      }
      return '';
    }
    function readInputs() {
      return {
        botToken: tokenEl && typeof tokenEl.value === 'string' ? tokenEl.value : '',
        chatTarget: chatEl && typeof chatEl.value === 'string' ? chatEl.value : ''
      };
    }
    function networkDeps() {
      const deps = {};
      if (hasOwn.call(env, 'fetch')) deps.fetch = env.fetch;
      if (hasOwn.call(env, 'AbortController')) deps.AbortController = env.AbortController;
      if (hasOwn.call(env, 'setTimeout')) deps.setTimeout = env.setTimeout;
      if (hasOwn.call(env, 'clearTimeout')) deps.clearTimeout = env.clearTimeout;
      return deps;
    }
    function validateInputs() {
      const inputs = readInputs();
      if (!logicApi || typeof logicApi.isBotToken !== 'function' || typeof logicApi.isChatTarget !== 'function') {
        status('Telegram input validation is unavailable. Nothing was sent.');
        return null;
      }
      if (!logicApi.isBotToken(inputs.botToken.trim())) {
        status('Enter a bot token from @BotFather first. Nothing was sent.');
        return null;
      }
      if (!logicApi.isChatTarget(inputs.chatTarget.trim())) {
        status('Enter a numeric chat ID for a private chat, or an @channelusername for a public channel. Nothing was sent.');
        return null;
      }
      return inputs;
    }
    async function deliver(botToken, chatTarget, text) {
      setControlsBusy(true);
      let result;
      try {
        result = await logicApi.sendTelegramMessage({ botToken, chatTarget, text }, networkDeps());
      } catch (error) {
        result = { ok: false, reason: 'The send attempt failed unexpectedly. Nothing was announced as sent.' };
      } finally { setControlsBusy(false); }
      return result;
    }
    async function onSend() {
      if (!logicApi || typeof logicApi.sendTelegramMessage !== 'function' || typeof logicApi.buildCompletedDigest !== 'function' || typeof logicApi.isBotToken !== 'function') {
        status('Telegram digest is unavailable.');
        return;
      }
      if (busy) { status('Still sending the previous request. Wait a moment.'); return; }
      const inputs = validateInputs();
      if (!inputs) return;
      const operationClearEpoch = readClearEpoch();
      const stored = readStoredTasks();
      if (stored.tasks === null) {
        status((stored.reason || 'Saved tasks could not be read.') + ' Nothing was sent.');
        return;
      }
      const digest = logicApi.buildCompletedDigest(stored.tasks, { dateLabel: todayLabel() });
      if (!digest || digest.ok !== true) {
        status((digest && digest.reason) ? digest.reason + ' Nothing was sent.' : 'The digest could not be built. Nothing was sent.');
        return;
      }
      if (digest.totalCompleted === 0) {
        status('No completed tasks to announce. Nothing was sent to Telegram.' + (stored.note || ''));
        return;
      }
      status('Sending ' + digest.includedCount + ' completed task(s) to Telegram…');
      const result = await deliver(inputs.botToken.trim(), inputs.chatTarget.trim(), digest.text);
      if (result.ok) {
        const preferenceSaved = await persistChatTarget(inputs.chatTarget.trim(), operationClearEpoch);
        status('Sent \u00b7 ' + digest.includedCount + ' completed task(s) delivered to Telegram.'
          + (digest.omittedCount > 0 ? ' ' + digest.omittedCount + ' omitted for the message limit.' : '')
          + (stored.note || '')
          + (preferenceSaved ? '' : ' The chat target was not remembered because local data was cleared or could not be safely saved.'));
      } else {
        status(result.reason || 'The message could not be delivered.');
      }
    }
    async function onTest() {
      if (!logicApi || typeof logicApi.sendTelegramMessage !== 'function' || typeof logicApi.TEST_MESSAGE !== 'string') {
        status('Telegram digest is unavailable.');
        return;
      }
      if (busy) { status('Still sending the previous request. Wait a moment.'); return; }
      const inputs = validateInputs();
      if (!inputs) return;
      const operationClearEpoch = readClearEpoch();
      status('Sending a test message to Telegram…');
      const result = await deliver(inputs.botToken.trim(), inputs.chatTarget.trim(), logicApi.TEST_MESSAGE);
      const preferenceSaved = result.ok
        ? await persistChatTarget(inputs.chatTarget.trim(), operationClearEpoch) : false;
      status(result.ok
        ? 'Test message sent to Telegram.' + (preferenceSaved ? '' : ' The chat target was not remembered because local data was cleared or could not be safely saved.')
        : (result.reason || 'The test message could not be delivered.'));
    }
    function clearTokenField() {
      if (tokenEl && typeof tokenEl.value === 'string') tokenEl.value = '';
    }
    function onStorageChange(event) {
      if (!event) return;
      if (event.key === CHAT_STORAGE_KEY && event.newValue === null) {
        if (chatEl && typeof chatEl.value === 'string') chatEl.value = '';
      }
      const generationKey = taskMutation && taskMutation.GENERATION_KEY;
      if (generationKey && (event.key === generationKey || event.key === null)) {
        const nextEpoch = readClearEpoch();
        if (nextEpoch === null || observedClearEpoch === null || nextEpoch > observedClearEpoch) {
          resetForClearAll();
        } else {
          observedClearEpoch = nextEpoch;
        }
      }
    }
    function onPageHide() { clearTokenField(); }
    function onPageShow() { clearTokenField(); }
    function onClear() {
      clearTokenField();
      status('Cleared. The bot token is emptied; the chat target remains available.');
    }
    if (observesPageLifecycle) {
      lifecycleWindow.addEventListener('pagehide', onPageHide);
      lifecycleWindow.addEventListener('pageshow', onPageShow);
    }
    if (lifecycleWindow && typeof lifecycleWindow.addEventListener === 'function') {
      lifecycleWindow.addEventListener('storage', onStorageChange);
    }
    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        onSend();
      });
    }
    if (testEl && typeof testEl.addEventListener === 'function') testEl.addEventListener('click', onTest);
    if (clearEl && typeof clearEl.addEventListener === 'function') clearEl.addEventListener('click', onClear);
    const handle = {
      send: onSend,
      test: onTest,
      clear: onClear,
      resetForClearAll,
      detach() {
        clearTokenField();
        if (observesPageLifecycle) {
          lifecycleWindow.removeEventListener('pagehide', onPageHide);
          lifecycleWindow.removeEventListener('pageshow', onPageShow);
        }
        if (lifecycleWindow && typeof lifecycleWindow.removeEventListener === 'function') {
          lifecycleWindow.removeEventListener('storage', onStorageChange);
        }
        status('');
      }
    };
    activeHandle = handle;
    return handle;
  }
  const api = {
    attachTelegramUi,
    resetForClearAll() {
      if (!activeHandle) return false;
      activeHandle.resetForClearAll();
      return true;
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTelegramUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachTelegramUi({ document });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
