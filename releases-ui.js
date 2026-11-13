(function (root) {
  'use strict';

  // Release radar UI wiring for the web prototype. A deliberately stateless
  // card: nothing is saved on this device, so there is no storage key, no
  // boot-time storage reads, and Clear only empties the view.
  //
  // The card markup is injected here instead of being hand-placed in
  // index.html, so the module can ship without touching shared markup files.
  // Mirrors the daylight-ui.js module style: attachReleasesUi(env) is fully
  // injectable for unit tests.

  const CARD_ID = 'releases-card';

  function ensureCard(doc) {
    const existing = typeof doc.getElementById === 'function' ? doc.getElementById(CARD_ID) : null;
    if (existing) return existing;

    if (typeof doc.createElement !== 'function') throw new Error('releases card host is unavailable.');

    const aside = doc.createElement('aside');
    aside.id = CARD_ID;
    aside.className = 'briefing-card';
    if (typeof aside.setAttribute === 'function') aside.setAttribute('aria-labelledby', 'releases-heading');

    const topline = doc.createElement('div');
    topline.className = 'briefing-topline';
    const dot = doc.createElement('span');
    dot.className = 'briefing-dot';
    if (typeof dot.setAttribute === 'function') dot.setAttribute('aria-hidden', 'true');
    topline.appendChild(dot);
    aside.appendChild(topline);

    const heading = doc.createElement('h2');
    heading.id = 'releases-heading';
    heading.textContent = 'Release radar';
    aside.appendChild(heading);

    const description = doc.createElement('p');
    description.className = 'briefing-description';
    description.id = 'releases-description';
    description.textContent = 'Before Check: the repository name is sent to the public GitHub API (api.github.com) to fetch its latest release. This happens only after you tap Check. No repository or result is saved on this device. No account or API key; the free quota allows 60 checks per hour.';
    aside.appendChild(description);

    const form = doc.createElement('form');
    form.id = 'releases-form';
    form.className = 'feed-form';
    if (typeof form.setAttribute === 'function') form.setAttribute('novalidate', 'novalidate');

    const label = doc.createElement('label');
    label.className = 'sr-only';
    if (typeof label.setAttribute === 'function') label.setAttribute('for', 'releases-repo');
    label.textContent = 'Repository as owner/repo';
    form.appendChild(label);

    const input = doc.createElement('input');
    input.id = 'releases-repo';
    if (input.setAttribute) {
      input.setAttribute('name', 'repo');
      input.setAttribute('type', 'text');
      input.setAttribute('maxlength', '210');
      input.setAttribute('placeholder', 'owner/repo, e.g. octocat/Hello-World');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('aria-describedby', 'releases-description');
    }
    form.appendChild(input);

    const checkButton = doc.createElement('button');
    checkButton.id = 'releases-check';
    checkButton.className = 'button button-primary';
    if (checkButton.setAttribute) checkButton.setAttribute('type', 'submit');
    checkButton.textContent = 'Check';
    form.appendChild(checkButton);

    const clearButton = doc.createElement('button');
    clearButton.id = 'releases-clear';
    clearButton.className = 'button button-quiet';
    if (clearButton.setAttribute) clearButton.setAttribute('type', 'button');
    clearButton.textContent = 'Clear';
    form.appendChild(clearButton);

    aside.appendChild(form);

    const statusLine = doc.createElement('p');
    statusLine.id = 'releases-status';
    statusLine.className = 'feed-status';
    if (typeof statusLine.setAttribute === 'function') {
      statusLine.setAttribute('role', 'status');
      statusLine.setAttribute('aria-live', 'polite');
      statusLine.setAttribute('aria-atomic', 'true');
    }
    aside.appendChild(statusLine);

    const result = doc.createElement('div');
    result.id = 'releases-result';
    result.className = 'feed-list';
    if (typeof result.setAttribute === 'function') result.setAttribute('aria-live', 'polite');
    aside.appendChild(result);

    const anchor = typeof doc.getElementById === 'function'
      ? (doc.getElementById('wiki-card') || doc.getElementById('currency-card'))
      : null;
    if (anchor && anchor.parentNode && typeof anchor.parentNode.insertBefore === 'function') {
      anchor.parentNode.insertBefore(aside, anchor.nextSibling);
    } else if (doc.body && typeof doc.body.appendChild === 'function') {
      doc.body.appendChild(aside);
    }
    return aside;
  }

  function attachReleasesUi(env) {
    if (!env || !env.document) throw new Error('attachReleasesUi requires a document.');
    const doc = env.document;
    const win = env.window || root;
    const releasesApi = env.releasesApi || root.DaymarkReleases || null;
    const now = typeof env.now === 'function' ? env.now : () => new Date().toISOString();
    const fetchImpl = env.fetch
      || (win && typeof win.fetch === 'function' ? (input, init) => win.fetch(input, init) : null);

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('releases-repo');
    const buttonEl = element('releases-check');
    const formEl = element('releases-form');
    const statusEl = element('releases-status');
    const resultEl = element('releases-result');
    const clearEl = element('releases-clear');

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

    function render(record) {
      if (!resultEl || !record) return;
      // Clear previous content
      while (resultEl.firstChild) {
        resultEl.removeChild(resultEl.firstChild);
      }
      const release = record.release;
      const title = release.name ? release.tag + ' (' + release.name + ')' : release.tag;
      const parts = [record.slug + ' latest release: ' + title];
      if (release.prerelease) parts.push('pre-release');
      if (release.publishedAt) parts.push('published ' + release.publishedAt.slice(0, 10));
      if (release.notes) {
        parts.push('notes: ' + release.notes + (release.notesTruncated ? ' (notes truncated)' : ''));
      }
      const text = doc.createTextNode(parts.join(' \u00b7 ') + ' \u00b7 ');
      resultEl.appendChild(text);
      const link = doc.createElement('a');
      link.href = release.url;
      link.textContent = release.url;
      link.className = 'release-link';
      if (typeof link.setAttribute === 'function') {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('aria-label', 'Open latest release for ' + record.slug);
      }
      resultEl.appendChild(link);
    }

    async function onCheck() {
      if (busy) return;
      if (!releasesApi || typeof releasesApi.fetchLatestRelease !== 'function') {
        status('Release radar is unavailable.');
        return;
      }
      if (!fetchImpl) {
        status('Could not check: fetch is unavailable in this browser.');
        return;
      }
      const typed = inputEl && typeof inputEl.value === 'string' ? inputEl.value : '';
      if (!typed.trim()) {
        status('Type a repository as owner/repo first.');
        return;
      }
      setBusy(true);
      try {
        const record = await releasesApi.fetchLatestRelease(typed, fetchImpl, { now: now });
        render(record);
        status('Updated \u00b7 ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC \u00b7 not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof releasesApi.classifyReleaseError === 'function'
          ? releasesApi.classifyReleaseError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        if (resultEl) {
          while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
          resultEl.textContent = '';
        }
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      if (resultEl) {
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        resultEl.textContent = '';
      }
      status('Cleared. Type a repository as owner/repo and tap Check.');
    }

    status('Type a repository as owner/repo and tap Check.');

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
      detach() {
        setBusy(false);
      }
    };
  }

  const api = { attachReleasesUi, ensureCard, CARD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkReleasesUi = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachReleasesUi({ document: document, window: window });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
