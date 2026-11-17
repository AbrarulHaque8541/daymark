(function (root) {
  'use strict';

  // Crypto glance UI wiring for the web prototype. A deliberately stateless
  // card: nothing is saved on this device, so there is no storage key, no
  // boot-time storage reads, and Clear only empties the view. The card
  // markup is injected here instead of being hand-placed in index.html.
  // Mirrors the dictionary-ui.js module style: attachCryptoUi(env) is fully
  // injectable for unit tests.

  const CARD_ID = 'crypto-card';
  const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'LTC', 'BCH', 'DOT', 'LINK'];
  const FIATS = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'SGD'];

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('crypto card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'crypto-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'crypto-heading';
    heading.textContent = 'Crypto glance';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'crypto-description';
    description.textContent = 'The request goes to the public Coinbase exchange-rates API (api.coinbase.com) only after you tap Check. No account or API key. Nothing is saved on this device.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'crypto-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const coinLabel = doc.createElement('label');
    coinLabel.className = 'sr-only';
    if (typeof coinLabel.setAttribute === 'function') coinLabel.setAttribute('for', 'crypto-coin');
    coinLabel.textContent = 'Cryptocurrency';
    form.appendChild(coinLabel);

    const coinSelect = doc.createElement('select');
    coinSelect.id = 'crypto-coin';
    coinSelect.className = 'sort-select';
    if (typeof coinSelect.setAttribute === 'function') {
      coinSelect.setAttribute('aria-label', 'Cryptocurrency');
      coinSelect.setAttribute('title', 'Cryptocurrency to check');
    }
    COINS.forEach((coin, index) => {
      const option = doc.createElement('option');
      option.value = coin;
      option.textContent = coin;
      if (index === 0) option.selected = true;
      coinSelect.appendChild(option);
    });
    form.appendChild(coinSelect);

    const fiatLabel = doc.createElement('label');
    fiatLabel.className = 'sr-only';
    if (typeof fiatLabel.setAttribute === 'function') fiatLabel.setAttribute('for', 'crypto-fiat');
    fiatLabel.textContent = 'Currency';
    form.appendChild(fiatLabel);

    const fiatSelect = doc.createElement('select');
    fiatSelect.id = 'crypto-fiat';
    fiatSelect.className = 'sort-select';
    if (typeof fiatSelect.setAttribute === 'function') {
      fiatSelect.setAttribute('aria-label', 'Currency');
      fiatSelect.setAttribute('title', 'Fiat currency for the rate');
    }
    FIATS.forEach((fiat, index) => {
      const option = doc.createElement('option');
      option.value = fiat;
      option.textContent = fiat;
      if (index === 0) option.selected = true;
      fiatSelect.appendChild(option);
    });
    form.appendChild(fiatSelect);

    const checkButton = doc.createElement('button');
    checkButton.id = 'crypto-check';
    checkButton.className = 'button button-primary';
    if (typeof checkButton.setAttribute === 'function') {
      checkButton.setAttribute('type', 'submit');
      checkButton.setAttribute('title', 'Check the current crypto rate');
    }
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'crypto-clear';
    clearButton.className = 'button button-quiet';
    if (typeof clearButton.setAttribute === 'function') {
      clearButton.setAttribute('type', 'button');
      clearButton.setAttribute('title', 'Clear the crypto glance view');
    }
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'crypto-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'crypto-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('onthisday-card') || doc.getElementById('releases-card') || doc.getElementById('wiki-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachCryptoUi(env) {
    if (!env || !env.document) throw new Error('attachCryptoUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const cryptoApi = env.cryptoApi || root.DaymarkCrypto || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const coinEl = element('crypto-coin');
    const fiatEl = element('crypto-fiat');
    const buttonEl = element('crypto-check');
    const formEl = element('crypto-form');
    const statusEl = element('crypto-status');
    const resultEl = element('crypto-result');
    const clearEl = element('crypto-clear');

    let busy = false;

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

    function clearResult() {
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();
      const line = doc.createElement('div');
      line.className = 'crypto-line';
      const strong = doc.createElement('strong');
      strong.textContent = '1 ' + record.coin + ' = ' + record.priceText;
      line.appendChild(strong);
      resultEl.appendChild(line);

      const meta = doc.createElement('div');
      meta.className = 'crypto-meta';
      meta.textContent = 'Source: Coinbase public rates \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ') + ' UTC';
      resultEl.appendChild(meta);
    }

    async function onCheck() {
      if (busy) return;
      if (!cryptoApi || typeof cryptoApi.fetchRates !== 'function') {
        status('Crypto glance is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check the rate: fetch is unavailable in this browser.');
        return;
      }
      const coinValue = coinEl && typeof coinEl.value === 'string' ? coinEl.value : '';
      const fiatValue = fiatEl && typeof fiatEl.value === 'string' ? fiatEl.value : '';
      // A populated select always reports its first option in a real browser;
      // default to the catalog heads if the value is ever empty.
      const coin = COINS.indexOf(coinValue) !== -1 ? coinValue : COINS[0];
      const fiat = FIATS.indexOf(fiatValue) !== -1 ? fiatValue : FIATS[0];
      setBusy(true);
      try {
        const record = await cryptoApi.fetchRates(coin, fiat, fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof cryptoApi.classifyCryptoError === 'function'
          ? cryptoApi.classifyCryptoError(error)
          : null;
        status(friendly ? friendly : 'Could not check the rate: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      clearResult();
      status('Cleared. Pick currencies and tap Check.');
    }

    status('Pick currencies and tap Check.');

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
      onCheck,
      onClear,
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachCryptoUi, ensureCard, CARD_ID, COINS, FIATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCryptoUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCryptoUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
