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
  //
  // Result now renders a safe clickable release link plus a Copy link action
  // with glass busy feedback and re-entry guard.

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
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('role', 'status');
    if (typeof statusLine.setAttribute === 'function') statusLine.setAttribute('aria-live', 'polite');
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
    const clipboard = env.clipboard || (win && win.navigator && win.navigator.clipboard) || null;

    ensureCard(doc);

    const element = (id) => (typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
    const inputEl = element('releases-repo');
    const buttonEl = element('releases-check');
    const formEl = element('releases-form');
    const statusEl = element('releases-status');
    const resultEl = element('releases-result');
    const clearEl = element('releases-clear');

    let busy = false;
    const busyButtons = new WeakSet();

    function status(message) {
      if (statusEl) statusEl.textContent = message;
    }

    function setBusy(isBusy, target) {
      busy = isBusy;
      const targets = [buttonEl, clearEl];
      if (target) targets.push(target);
      targets.forEach((el) => {
        if (!el) return;
        if (isBusy) busyButtons.add(el); else busyButtons.delete(el);
        el.disabled = isBusy;
        if (el.classList && typeof el.classList.toggle === 'function') {
          el.classList.toggle('is-busy', isBusy);
        }
        if (typeof el.setAttribute === 'function') {
          if (isBusy) el.setAttribute('aria-busy', 'true');
          else el.removeAttribute('aria-busy');
        }
      });
    }

    function clearResult() {
      if (!resultEl) return;
      while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
      resultEl.textContent = '';
    }

    function render(record) {
      if (!resultEl || !record) return;
      clearResult();
      const release = record.release;
      const title = release.name ? release.tag + ' (' + release.name + ')' : release.tag;
      const summaryParts = [record.slug + ' latest release: ' + title];
      if (release.prerelease) summaryParts.push('pre-release');
      if (release.publishedAt) summaryParts.push('published ' + release.publishedAt.slice(0, 10));
      if (release.notes) {
        summaryParts.push('notes: ' + release.notes + (release.notesTruncated ? ' (notes truncated)' : ''));
      }
      resultEl.textContent = summaryParts.join(' · ');

      if (release.url && release.url.indexOf('https://github.com/') === 0) {
        const link = doc.createElement('a');
        link.href = release.url;
        link.textContent = 'Open release';
        link.className = 'releases-link';
        if (link.setAttribute) {
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
          link.setAttribute('aria-label', 'Open the latest release on GitHub');
        }
        resultEl.appendChild(link);

        const copyBtn = doc.createElement('button');
        copyBtn.id = 'releases-copy-link';
        copyBtn.type = 'button';
        copyBtn.className = 'button button-quiet releases-copy';
        copyBtn.textContent = 'Copy link';
        if (copyBtn.setAttribute) copyBtn.setAttribute('aria-label', 'Copy the release link');
        copyBtn.addEventListener('click', () => onCopy(release.url, copyBtn));
        resultEl.appendChild(copyBtn);
      }
      // Keep textContent for existing test compatibility (includes tag)
    }

    async function onCopy(url, btn) {
      if (busy || busyButtons.has(btn)) return;
      if (!url) return;
      setBusy(true, btn);
      try {
        if (clipboard && typeof clipboard.writeText === 'function') {
          await clipboard.writeText(url);
          status('Release link copied. Not saved on this device.');
        } else if (typeof doc.execCommand === 'function') {
          // Fallback for older environments; not used in modern browsers.
          status('Copy is unavailable in this browser.');
        } else {
          status('Copy is unavailable in this browser.');
        }
      } catch (err) {
        status('Could not copy the link.');
      } finally {
        setBusy(false, btn);
      }
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
        status('Updated · ' + record.fetchedAt.slice(0, 16).replace('T', ' ')
          + ' UTC · not saved on this device');
      } catch (error) {
        const message = error && error.message ? error.message : 'unknown error';
        const friendly = typeof releasesApi.classifyReleaseError === 'function'
          ? releasesApi.classifyReleaseError(error)
          : null;
        status(friendly ? friendly : 'Could not check: ' + message);
        clearResult();
      } finally {
        setBusy(false);
      }
    }

    function onClear() {
      if (busy) return;
      if (inputEl && typeof inputEl.value === 'string') inputEl.value = '';
      clearResult();
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
