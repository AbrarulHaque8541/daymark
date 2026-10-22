'use strict';

const HOME = 'https://duckduckgo.com/';
let tabs = [];
let activeTabId = null;
let tabSeq = 0;
let lastFind = '';
let hideTimer = null;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function isLocal(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

// Same policy as lib/rules.js (renderer has no node access).
function httpsUpgrade(input) {
  const trimmed = String(input == null ? '' : input).trim();
  if (!trimmed) return null;
  const withScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : 'https://' + trimmed;
  const u = new URL(withScheme); // throws on garbage
  if (u.protocol === 'http:' && !isLocal(u.hostname)) u.protocol = 'https:';
  return u.toString();
}

function activeTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function isActive(tab) {
  return tab.id === activeTabId;
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((el) => {
    const tab = tabs.find((t) => String(t.id) === el.dataset.tabId);
    if (!tab) return;
    el.querySelector('.tab-title').textContent = tab.title || 'Loading...';
    el.classList.toggle('active', isActive(tab));
  });
}

function activateTab(id) {
  activeTabId = id;
  tabs.forEach((t) => t.view.classList.toggle('active', t.id === id));
  const tab = activeTab();
  if (tab) {
    try { $('urlbar').value = tab.view.getURL() || HOME; } catch { /* noop */ }
  }
  renderTabs();
}

function showError(title, detail) {
  $('err-title').textContent = title;
  $('err-detail').textContent = detail || '';
  $('errorbox').classList.add('show');
}

function hideError() {
  $('errorbox').classList.remove('show');
}

function wireEvents(tab) {
  const v = tab.view;
  v.addEventListener('page-title-updated', (e) => {
    tab.title = e.title;
    renderTabs();
  });
  v.addEventListener('did-navigate', (e) => {
    if (isActive(tab)) $('urlbar').value = e.url;
    renderTabs();
  });
  v.addEventListener('did-navigate-in-page', (e) => {
    if (isActive(tab)) $('urlbar').value = e.url;
  });
  v.addEventListener('dom-ready', () => renderTabs());
  v.addEventListener('found-in-page', (e) => {
    const r = e.result || {};
    $('find-count').textContent = r.matches
      ? r.activeMatchOrdinal + '/' + r.matches
      : '0';
  });
  v.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return; // -3 = aborted
    if (!isActive(tab)) return;
    const blocked = e.errorCode === -20 || e.errorCode === -501;
    showError(
      blocked ? 'Blocked by HTTPS-only policy' : "Can't open this page",
      blocked
        ? e.validatedURL + ' was refused because it is not HTTPS.'
        : (e.errorDescription || '') + ' (' + e.errorCode + ')',
    );
  });
}

function createTab(url = HOME) {
  hideError();
  const id = ++tabSeq;
  const view = document.createElement('webview');
  view.setAttribute('allowpopups', '');
  view.setAttribute('src', url);
  view.classList.add('view');
  view.dataset.tabId = String(id);
  $('views').appendChild(view);

  const tab = { id, view, title: 'New tab' };
  tabs.push(tab);

  const el = document.createElement('div');
  el.className = 'tab';
  el.dataset.tabId = String(id);
  el.innerHTML = '<span class="tab-title">New tab</span><span class="tab-close" title="Close tab">&times;</span>';
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-close')) closeTab(id);
    else activateTab(id);
  });
  $('tabs').appendChild(el);

  wireEvents(tab);
  activateTab(id);
  return tab;
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  tabs[i].view.remove();
  tabs.splice(i, 1);
  const el = document.querySelector('.tab[data-tab-id="' + id + '"]');
  if (el) el.remove();
  if (activeTabId === id) {
    const next = tabs[i] || tabs[i - 1];
    if (next) activateTab(next.id);
    else createTab();
  }
}

function navigate(raw) {
  const tab = activeTab();
  if (!tab) return;
  let url;
  try {
    url = httpsUpgrade(raw);
  } catch {
    toast('That address is not valid');
    return;
  }
  if (!url) return;
  hideError();
  const p = tab.view.loadURL(url);
  if (p && p.catch) {
    p.catch(() => toast('Blocked by HTTPS-only policy or navigation failed'));
  }
}

// --- find in page ---
function openFind() {
  $('findbar').classList.add('open');
  const input = $('find-input');
  input.focus();
  input.select();
}

function closeFind() {
  const tab = activeTab();
  if (tab) {
    try { tab.view.stopFindInPage('clearSelection'); } catch { /* noop */ }
  }
  $('findbar').classList.remove('open');
  $('find-count').textContent = '';
  lastFind = '';
}

function doFind(forward) {
  const tab = activeTab();
  if (!tab) return;
  const q = $('find-input').value;
  if (!q) {
    tab.view.stopFindInPage('clearSelection');
    $('find-count').textContent = '';
    return;
  }
  if (q !== lastFind) {
    lastFind = q;
    tab.view.findInPage(q, { forward: true, findNext: false, matchCase: false });
  } else {
    tab.view.findInPage(q, { forward, findNext: true, matchCase: false });
  }
}

// --- toolbar wiring ---
$('btn-back').onclick = () => activeTab() && activeTab().view.goBack();
$('btn-fwd').onclick = () => activeTab() && activeTab().view.goForward();
$('btn-reload').onclick = () => activeTab() && activeTab().view.reload();
$('btn-home').onclick = () => navigate(HOME);
$('btn-find').onclick = openFind;
$('find-prev').onclick = () => doFind(false);
$('find-next').onclick = () => doFind(true);
$('find-close').onclick = closeFind;
$('err-dismiss').onclick = hideError;
$('newtab') ? null : null;

$('urlbar').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    navigate($('urlbar').value);
    $('urlbar').blur();
  }
});

$('find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doFind(true);
});

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'l') {
    e.preventDefault();
    $('urlbar').focus();
    $('urlbar').select();
  } else if (mod && e.key === 'f') {
    e.preventDefault();
    openFind();
  } else if (mod && e.key === 't') {
    e.preventDefault();
    createTab();
  } else if (mod && e.key === 'w') {
    e.preventDefault();
    const tab = activeTab();
    if (tab) closeTab(tab.id);
  } else if (e.key === 'Escape') {
    if ($('findbar').classList.contains('open')) closeFind();
    else hideError();
  }
});

// new tab button (appended after tabs)
const newTabBtn = document.createElement('button');
newTabBtn.id = 'newtab';
newTabBtn.title = 'New tab (Ctrl+T)';
newTabBtn.textContent = '+';
newTabBtn.onclick = () => createTab();
$('tabs').appendChild(newTabBtn);

// messages from main process
if (window.daymark) {
  window.daymark.onOpenTabRequest((url) => {
    try {
      createTab(httpsUpgrade(url));
    } catch {
      createTab();
    }
  });
  window.daymark.onDownloadStarted((name) => toast('Downloading: ' + name));
}

createTab();
