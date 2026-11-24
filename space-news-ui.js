(function (root) {
  'use strict';
  // 'Spaceflight news' UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, no storage key, no
  // boot-time storage reads, no background timers. Each Check is one manual
  // fetch, so the card costs zero battery while idle. Mirrors iss-ui.js:
  // attachSpaceNewsUi(env) is fully injectable for tests.
  const CARD_ID = 'space-news-card';
  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;
    if (typeof doc.createElement !== 'function') throw new Error('spaceflight news card host is unavailable.');
    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'space-news-heading');
    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);
    const heading = doc.createElement('h2');
    heading.id = 'space-news-heading';
    heading.textContent = 'Spaceflight news';
    aside.appendChild(heading);
    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'space-news-description';
    description.textContent = 'Tap Check and the free keyless Spaceflight News API is asked once for the latest articles. Each story links straight to its publisher in a new tab. No tracking between checks, no background timers, and nothing is saved on this device. No account or API key.';
    aside.appendChild(description);
    const form = doc.createElement('form');
    form.id = 'space-news-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');
    const checkButton = doc.createElement('button');
    checkButton.id = 'space-news-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (checkButton.setAttribute) checkButton.setAttribute('title', 'Check the latest spaceflight news');
    form.appendChild(checkButton);
    const clearButton = doc.createElement('button');
    clearButton.id = 'space-news-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (clearButton.setAttribute) clearButton.setAttribute('title', 'Clear the spaceflight news view');
    form.appendChild(clearButton);
    aside.appendChild(form);
    const statusLine = doc.createElement('p');
    statusLine.id = 'space-news-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);
    const result = doc.createElement('div');
    result.id = 'space-news-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);
    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('iss-card') || doc.getElementById('earthquake-card')
        || doc.getElementById('launch-card') || doc.getElementById('country-card')
        || doc.getElementById('crypto-card') || doc.getElementById('holiday-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }
  function safeLink(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.length > 1024 || value.indexOf('https://') !== 0) return null;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code < 32 || code === 127) return null;
    }
    return value;
  }
  function attachSpaceNewsUi(env) {
    if (!env || !env.document) throw new Error('attachSpaceNewsUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.spaceNewsApi || root.DaymarkSpaceNews || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);
    ensureCard(doc);
    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const buttonEl = element('space-news-check');
    const formEl = element('space-news-form');
    const statusEl = element('space-news-status');
    const resultEl = element('space-news-result');
    const clearEl = element('space-news-clear');
    let busy = false;
    function status(message) { if (statusEl) statusEl.textContent = message; }
    function setBusy(isBusy) {
      busy = isBusy;
      if (buttonEl) {
        buttonEl.disabled = isBusy;
        if (buttonEl.classList && typeof buttonEl.classList.toggle === 'function') {
          buttonEl.classList.toggle('is-busy', isBusy);
          if (clearEl && clearEl.classList) clearEl.classList.toggle('is-busy', isBusy);
        }
        if (typeof buttonEl.setAttribute === 'function') {
          if (isBusy) buttonEl.setAttribute('aria-busy', 'true');
          else buttonEl.removeAttribute('aria-busy');
        }
      }
    }
    function render(snapshot) {
      if (!resultEl || !snapshot) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      const articles = Array.isArray(snapshot.articles) ? snapshot.articles : [];
      if (!articles.length) {
        const empty = doc.createElement('p');
        empty.textContent = 'The feed answered, but no readable article was in it.';
        resultEl.appendChild(empty);
        return;
      }
      for (let index = 0; index < articles.length; index += 1) {
        const article = articles[index];
        const row = doc.createElement('p');
        const link = doc.createElement('a');
        const linkUrl = safeLink(article.url);
        if (linkUrl) {
          link.href = linkUrl;
          link.textContent = article.title;
          if (typeof link.setAttribute === 'function') {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            link.setAttribute('aria-label', article.title + ' (opens in a new tab)');
          }
          row.appendChild(link);
        } else {
          row.appendChild(doc.createTextNode(article.title));
        }
        const meta = [' · ' + article.site + ' · ' + article.publishedAt];
        if (article.summary) meta.push(' · ' + article.summary);
        row.appendChild(doc.createTextNode(meta.join('')));
        resultEl.appendChild(row);
      }
      if (snapshot.listTruncated && snapshot.truncationNote) {
        const note = doc.createElement('p');
        note.textContent = snapshot.truncationNote + ' Nothing more was fetched.';
        resultEl.appendChild(note);
      }
    }
    async function onCheck() {
      if (busy) return;
      if (!logicApi || typeof logicApi.fetchSpaceNews !== 'function') {
        status('The spaceflight news card is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      setBusy(true);
      try {
        const snapshot = await logicApi.fetchSpaceNews(fetchImpl, { now: now });
        render(snapshot);
        status('Updated · ' + snapshot.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC · ' + snapshot.returned + ' article(s) · not saved on this device · check again for fresh stories');
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function'
          && typeof setTimeout === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'Spaceflight news updated');
          setTimeout(() => {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof logicApi.classifySpaceNewsError === 'function'
          ? logicApi.classifySpaceNewsError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
          statusEl.classList.remove('is-success');
          if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
        }
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        }
      } finally {
        setBusy(false);
      }
    }
    function onClear() {
      if (busy) return;
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      }
      status('Cleared. Tap Check when you want the next stories.');
      if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
        statusEl.classList.remove('is-success');
        if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
      }
    }
    status('Tap Check for the latest spaceflight news.');
    if (formEl && typeof formEl.addEventListener === 'function') {
      formEl.addEventListener('submit', (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        return onCheck();
      });
    }
    if (buttonEl && typeof buttonEl.addEventListener === 'function') {
      buttonEl.addEventListener('click', () => { onCheck(); });
    }
    if (clearEl && typeof clearEl.addEventListener === 'function') {
      clearEl.addEventListener('click', () => { onClear(); });
    }
    return {
      onCheck: onCheck,
      onClear: onClear,
      detach() { setBusy(false); }
    };
  }
  const api = { attachSpaceNewsUi: attachSpaceNewsUi, ensureCard: ensureCard, CARD_ID: CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkSpaceNewsUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachSpaceNewsUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);