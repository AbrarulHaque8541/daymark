(function (root) {
  'use strict';

  // "Trending on Wikipedia" UI wiring for the web prototype. A deliberately
  // stateless card: nothing is saved on this device, so there is no storage
  // key, no boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, mirroring onthisday-ui.js: attachTrendingUi(env) is fully
  // injectable for unit tests.

  const CARD_ID = 'trending-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('trending card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'trending-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'trending-heading';
    heading.textContent = 'Trending on Wikipedia';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'trending-description';
    description.textContent = 'Before Check: today\u2019s date is sent to the free public Wikimedia Feed API (api.wikimedia.org) to fetch the most-read articles. This happens only after you tap Check. Nothing is saved on this device. No account or API key.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'trending-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'trending-date');
    label.textContent = 'Date as month/day, or leave empty for today';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'trending-date';
    if (input.setAttribute) {
      input.setAttribute('name', 'date');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '5');
      input.setAttribute('placeholder', 'MM-DD, empty = today');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('aria-describedby', 'trending-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'trending-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    if (checkButton.setAttribute) checkButton.setAttribute('title', 'Check trending articles for the date');
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'trending-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    if (clearButton.setAttribute) clearButton.setAttribute('title', 'Clear the trending view');
    form.appendChild(clearButton);

    const copyButton = doc.createElement('button');
    copyButton.id = 'trending-copy';
    copyButton.className = 'button button-quiet';
    if (copyButton.setAttribute) {
      copyButton.setAttribute('type', 'button');
      copyButton.setAttribute('title', 'Copy the trending list');
    }
    if (typeof copyButton.hidden !== 'undefined') copyButton.hidden = true;
    else if (copyButton.setAttribute) copyButton.setAttribute('hidden', 'hidden');
    copyButton.textContent = 'Copy';
    form.appendChild(copyButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'trending-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'trending-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('potd-card') || doc.getElementById('onthisday-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachTrendingUi(env) {
    if (!env || !env.document) throw new Error('attachTrendingUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const logicApi = env.trendingApi || root.DaymarkTrending || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('trending-date');
    const buttonEl = element('trending-check');
    const formEl = element('trending-form');
    const statusEl = element('trending-status');
    const resultEl = element('trending-result');
    const clearEl = element('trending-clear');
    const copyEl = element('trending-copy');

    let busy = false;
    let lastRecord = null;

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

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

    function addPressFeedback(button) {
      if (!button || !button.classList) return;
      const press = () => {
        if (!busy && button.classList) button.classList.add('is-pressed');
      };
      const release = () => {
        if (button.classList) button.classList.remove('is-pressed');
      };
      if (typeof button.addEventListener === 'function') {
        button.addEventListener('pointerdown', press);
        button.addEventListener('pointerup', release);
        button.addEventListener('pointerleave', release);
        button.addEventListener('pointercancel', release);
      }
    }

    if (buttonEl) addPressFeedback(buttonEl);
    if (clearEl) addPressFeedback(clearEl);
    if (copyEl) addPressFeedback(copyEl);

    function buildCopyText(record) {
      if (!record || !record.articles || !record.articles.length) return '';
      const lines = [];
      const paddedMonth = (record.month < 10 ? '0' + record.month : String(record.month));
      const paddedDay = (record.day < 10 ? '0' + record.day : String(record.day));
      lines.push('Trending on Wikipedia for ' + paddedMonth + '/' + paddedDay);
      const viewsApi = logicApi && typeof logicApi.formatViews === 'function' ? logicApi : null;
      for (let index = 0; index < record.articles.length; index += 1) {
        const article = record.articles[index];
        const viewsText = viewsApi ? viewsApi.formatViews(article.views) : String(article.views);
        let line = (index + 1) + '. ' + article.title + (article.titleTruncated ? ' (truncated)' : '') + ' · ' + viewsText + ' views';
        if (article.url) line += ' · ' + article.url;
        lines.push(line);
      }
      if (record.articlesTruncated) lines.push('(list truncated)');
      return lines.join('\n');
    }

    function updateCopyVisibility(has) {
      if (!copyEl) return;
      if (typeof copyEl.hidden !== 'undefined') copyEl.hidden = !has;
      if (typeof copyEl.setAttribute === 'function') {
        if (has) copyEl.removeAttribute('hidden');
        else copyEl.setAttribute('hidden', 'hidden');
      }
    }

    function render(record) {
      lastRecord = record;
      if (!resultEl || !record) return;
      while (resultEl.firstChild) {
        resultEl.removeChild(resultEl.firstChild);
      }
      const paddedMonth = (record.month < 10 ? '0' + record.month : String(record.month));
      const paddedDay = (record.day < 10 ? '0' + record.day : String(record.day));
      const dateLabel = paddedMonth + '/' + paddedDay;
      const viewsApi = logicApi && typeof logicApi.formatViews === 'function' ? logicApi : null;
      for (let index = 0; index < record.articles.length; index += 1) {
        const article = record.articles[index];
        const item = doc.createElement('div');
        item.className = 'feed-item';
        const rankNum = index + 1;
        const rank = doc.createElement('span');
        rank.className = 'feed-item-rank';
        rank.textContent = String(rankNum);
        if (typeof rank.setAttribute === 'function') rank.setAttribute('aria-hidden', 'true');
        item.appendChild(rank);
        const title = doc.createElement('span');
        title.className = 'feed-item-title';
        title.textContent = article.title + (article.titleTruncated ? ' (title truncated)' : '');
        item.appendChild(title);
        const meta = doc.createElement('span');
        meta.className = 'feed-item-date';
        const viewsText = viewsApi ? viewsApi.formatViews(article.views) : String(article.views);
        meta.textContent = viewsText + ' views';
        item.appendChild(meta);
        if (typeof item.setAttribute === 'function') {
          const itemLabel = 'Rank ' + rankNum + ': ' + article.title + ', ' + viewsText + ' views' + (article.titleTruncated ? ' (title truncated)' : '');
          item.setAttribute('aria-label', itemLabel);
        }
        if (article.url) {
          const link = doc.createElement('a');
          link.className = 'feed-item-link';
          link.href = article.url;
          link.textContent = 'Read';
          if (typeof link.setAttribute === 'function') {
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            link.setAttribute('aria-label', 'Read more about ' + article.title + ', rank ' + rankNum + ', trending for ' + dateLabel);
          }
          item.appendChild(link);
        }
        resultEl.appendChild(item);
      }
      const footer = doc.createElement('p');
      footer.className = 'feed-item-summary';
      footer.textContent = 'Trending for: ' + dateLabel
        + (record.articlesTruncated ? ' (list truncated, showing the top ' + record.articles.length + ')' : '');
      resultEl.appendChild(footer);
      updateCopyVisibility(record.articles && record.articles.length > 0);
    }

    async function onCheck() {
      if (busy) return;
      if (!logicApi || typeof logicApi.fetchTrending !== 'function') {
        status('Trending is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value.trim() : '';
      let options = { now: now };
      if (typed) {
        const parts = typeof logicApi.normalizeDateParts === 'function' ? logicApi.normalizeDateParts(typed) : null;
        if (!parts) {
          status('Enter the date as month/day, e.g. 11-20, or leave the field empty for today.');
          return;
        }
        options.month = parts.month;
        options.day = parts.day;
      }
      setBusy(true);
      try {
        const record = await logicApi.fetchTrending(fetchImpl, options);
        render(record);
        const statsDate = record.statsDate ? record.statsDate : 'the feed';
        status('Updated \u00b7 view counts ' + statsDate + ' \u00b7 '
          + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'Trending updated');
          setTimeout(function () {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof logicApi.classifyTrendingError === 'function'
          ? logicApi.classifyTrendingError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
          statusEl.classList.remove('is-success');
          if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
        }
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          resultEl.textContent = '';
        }
      } finally {
        setBusy(false);
      }
    }

    async function onCopy() {
      if (busy || !lastRecord) return;
      const textToCopy = buildCopyText(lastRecord);
      if (!textToCopy) {
        status('Nothing to copy yet.');
        return;
      }
      const clipboard = (win && win.navigator && win.navigator.clipboard && typeof win.navigator.clipboard.writeText === 'function')
        ? win.navigator.clipboard
        : (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function' ? navigator.clipboard : null);
      if (!clipboard) {
        status('Copy is not available in this browser.');
        return;
      }
      try {
        await clipboard.writeText(textToCopy);
        status('Copied the trending list.');
        if (statusEl && statusEl.classList && typeof statusEl.classList.add === 'function') {
          statusEl.classList.add('is-success');
          if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('title', 'List copied');
          setTimeout(function () {
            if (statusEl.classList) statusEl.classList.remove('is-success');
            if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
          }, 1400);
        }
      } catch (err) {
        status('Could not copy the list.');
      }
    }

    function onClear() {
      if (busy) return;
      lastRecord = null;
      updateCopyVisibility(false);
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
      status('Cleared. Leave the date empty for today, or type month/day, and tap Check.');
      if (statusEl && statusEl.classList && typeof statusEl.classList.remove === 'function') {
        statusEl.classList.remove('is-success');
        if (typeof statusEl.removeAttribute === 'function') statusEl.removeAttribute('title');
      }
    }

    status('Leave the date empty for today, or type month/day, and tap Check.');

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
    if (copyEl && typeof copyEl.addEventListener === 'function') {
      copyEl.addEventListener('click', () => { onCopy(); });
    }
    if (inputEl && typeof inputEl.addEventListener === 'function') {
      inputEl.addEventListener('keydown', (event) => {
        if (event && (event.key === 'Enter' || event.keyCode === 13)) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          onCheck();
        }
      });
    }

    return {
      onCheck,
      onClear,
      onCopy,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachTrendingUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkTrendingUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachTrendingUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
