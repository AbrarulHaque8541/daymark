((root) => {
  'use strict';
  const OVERLAY_ID = 'command-bar-overlay';
  const STATUS_ONLY = 'Status messages only. Nothing here is sent to a server.';
  function resolveStorage(rootRef, preferred) {
    if (typeof preferred !== 'undefined') return preferred;
    try {
      const candidate = rootRef.localStorage;
      return candidate && typeof candidate.getItem === 'function' ? candidate : null;
    } catch (error) { return null; }
  }
  function attachCommandBarUi(env) {
    if (!env || typeof env !== 'object') return null;
    const doc = env.document;
    if (!doc || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function' || typeof doc.addEventListener !== 'function') return null;
    const commandBar = typeof env.commandBar !== 'undefined' ? env.commandBar : (root.DaymarkCommandBar || null);
    const flagsApi = typeof env.flags !== 'undefined' ? env.flags : (root.DaymarkFeatureFlags || null);
    if (!commandBar || !flagsApi
        || typeof commandBar.buildCommands !== 'function' || typeof commandBar.parseQuery !== 'function'
        || typeof commandBar.filterCommands !== 'function'
        || typeof flagsApi.readFlags !== 'function' || typeof flagsApi.setFlag !== 'function') return null;
    if (doc.getElementById(OVERLAY_ID)) return null;
    const win = env.window || doc.defaultView || null;
    const storage = resolveStorage(root, env.storage);
    const headEl = doc.head || null;
    const bodyEl = doc.body || null;
    if (!bodyEl || typeof bodyEl.appendChild !== 'function') return null;
    const overlay = doc.createElement('section');
    overlay.setAttribute('id', OVERLAY_ID);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'command-bar-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.className = 'command-bar-layer';
    const panel = doc.createElement('div');
    panel.className = 'command-bar-panel';
    overlay.appendChild(panel);
    const title = doc.createElement('h2');
    title.setAttribute('id', 'command-bar-title');
    title.className = 'command-bar-title';
    title.textContent = 'Command bar \u2014 palette, toggles, !bangs';
    panel.appendChild(title);
    const note = doc.createElement('p');
    note.className = 'command-bar-note';
    note.textContent = 'What it does not do: the palette runs no background jobs and never types anywhere on its own.';
    panel.appendChild(note);
    const footer = doc.createElement('p');
    footer.className = 'command-bar-note';
    footer.textContent = STATUS_ONLY;
    panel.appendChild(footer);
    const input = doc.createElement('input');
    input.setAttribute('id', 'command-bar-input');
    input.className = 'command-bar-input';
    input.setAttribute('type', 'text');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Search commands, cards, or !bangs');
    input.setAttribute('aria-controls', 'command-bar-list');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.disabled = true;
    input.tabIndex = -1;
    panel.appendChild(input);
    const listEl = doc.createElement('ul');
    listEl.setAttribute('id', 'command-bar-list');
    listEl.setAttribute('role', 'listbox');
    listEl.className = 'command-bar-list';
    panel.appendChild(listEl);
    const statusEl = doc.createElement('p');
    statusEl.setAttribute('id', 'command-bar-status');
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.textContent = '';
    panel.appendChild(statusEl);
    const closeButton = doc.createElement('button');
    closeButton.setAttribute('type', 'button');
    closeButton.setAttribute('aria-label', 'Close command bar');
    closeButton.className = 'command-bar-close';
    closeButton.textContent = 'Close';
    closeButton.disabled = true;
    closeButton.tabIndex = -1;
    panel.appendChild(closeButton);
    const styleEl = doc.createElement('style');
    styleEl.textContent = '#command-bar-overlay{position:fixed;top:0;right:0;bottom:0;left:0;box-sizing:border-box;margin:0;padding:12px;background:rgba(15,23,26,.55);display:flex;justify-content:center;align-items:flex-end;z-index:60;opacity:0;pointer-events:none;overscroll-behavior:contain;transition:opacity .18s ease;}#command-bar-overlay.is-open{opacity:1;pointer-events:auto;}#command-bar-overlay .command-bar-panel{width:min(560px,94vw);max-height:60vh;overflow:auto;padding:14px;border-radius:14px;}#command-bar-overlay .command-bar-input{width:100%;box-sizing:border-box;}#command-bar-overlay .command-bar-list{list-style:none;margin:8px 0 0;padding:0;}@media (prefers-reduced-motion: reduce){#command-bar-overlay{transition:none;}}';
    if (headEl && typeof headEl.appendChild === 'function') headEl.appendChild(styleEl);
    else bodyEl.appendChild(styleEl);
    bodyEl.appendChild(overlay);
    let allCommands = commandBar.buildCommands();
    let currentList = [];
    let selectedIndex = 0;
    let pendingParsed = null;
    let returnFocusTo = null;
    function setStatus(message) { statusEl.textContent = message; }
    function removeAttribute(element, name) {
      if (typeof element.removeAttribute === 'function') element.removeAttribute(name);
      else element.setAttribute(name, '');
    }
    function renderList(commands) {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      let activeId = null;
      for (let index = 0; index < commands.length; index += 1) {
        const li = doc.createElement('li');
        const optionId = 'command-bar-option-' + index;
        li.setAttribute('id', optionId);
        li.setAttribute('role', 'option');
        li.setAttribute('data-command-id', commands[index].id);
        li.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
        li.textContent = commands[index].label + (index === selectedIndex ? ' (selected)' : '');
        if (index === selectedIndex) activeId = optionId;
        listEl.appendChild(li);
      }
      listEl.hidden = commands.length === 0;
      input.setAttribute('aria-expanded', commands.length > 0 ? 'true' : 'false');
      if (activeId) input.setAttribute('aria-activedescendant', activeId);
      else removeAttribute(input, 'aria-activedescendant');
    }
    function render(rawText) {
      const parsed = commandBar.parseQuery(rawText || '');
      pendingParsed = parsed;
      if (parsed.kind === 'unknown-bang') {
        currentList = [];
        renderList(currentList);
        setStatus('There is no !bang called "' + parsed.token + '". Known ones: g, d, br, b, sp, y. Nothing was opened.');
        return;
      }
      if (parsed.kind === 'too-long') {
        currentList = [];
        renderList(currentList);
        setStatus('That query is over ' + commandBar.QUERY_MAX + ' characters. Shorten it. Nothing was run.');
        return;
      }
      if (parsed.kind === 'bang-empty') {
        currentList = [];
        renderList(currentList);
        setStatus('Add text after the !bang, like "!d daymark". Nothing was run.');
        return;
      }
      if (parsed.kind === 'search') {
        currentList = [];
        renderList(currentList);
        if (parsed.engine) {
          setStatus('');
        } else {
          setStatus('Search needs an engine bang like !g or !d, or open the link directly. Nothing was opened.');
        }
        return;
      }
      currentList = commandBar.filterCommands(allCommands, parsed);
      if (currentList.length > commandBar.MAX_RESULTS) currentList = currentList.slice(0, commandBar.MAX_RESULTS);
      selectedIndex = 0;
      renderList(currentList);
      setStatus('');
    }
    function flagOn(id) {
      if (!storage) return false;
      const read = flagsApi.readFlags(storage);
      return !!(read && read.ok === true && read.flags[id] === true);
    }
    function focusOrigin(trigger) {
      if (trigger && trigger !== doc && trigger !== input && trigger !== closeButton
          && typeof trigger.focus === 'function') return trigger;
      const active = doc.activeElement;
      if (active && active !== doc && active !== input && active !== closeButton
          && typeof active.focus === 'function') return active;
      return null;
    }
    function focusElement(element) {
      if (element && typeof element.focus === 'function') element.focus();
    }
    function openExternal(url, okMessage) {
      if (!win || typeof win.open !== 'function') {
        setStatus('Opening links needs a window. Nothing was opened.');
        return false;
      }
      win.open(url, '_blank', 'noopener');
      setStatus(okMessage);
      close();
      return true;
    }
    function run(command) {
      if (!command) {
        setStatus('Nothing is selected. Nothing was run.');
        return false;
      }
      if (command.kind === 'goto') {
        const target = doc.getElementById(command.target);
        if (!target) {
          setStatus('The "' + command.label + '" card is not on the page right now.');
          return false;
        }
        if (typeof target.scrollIntoView === 'function') target.scrollIntoView();
        close();
        setStatus('Jumped to ' + command.label + '.');
        return true;
      }
      if (command.kind === 'toggle') {
        const isOn = flagOn(command.flagId);
        const saved = flagsApi.setFlag(storage, command.flagId, !isOn);
        if (!saved || saved.ok !== true) {
          setStatus('Could not switch ' + command.label + (saved && saved.reason ? ' (' + saved.reason + ')' : '') + '. Nothing changed on disk.');
          return false;
        }
        setStatus(command.label + ': now ' + (!isOn ? 'on' : 'off') + '. The Feature settings card shows the same state.');
        return true;
      }
      if (command.kind === 'url') {
        return openExternal(command.url, 'Link opened in a new tab. Popup blockers can keep it behind this page.');
      }
      if (command.kind === 'search') {
        if (!flagOn('search-bangs')) {
          setStatus('!bang search is switched off in Feature settings. Nothing was opened.');
          return false;
        }
        return openExternal(command.engine.url + command.query.split(' ').join('+'), 'Searched with ' + command.engine.name + ' in a new tab. Popup blockers can keep it behind this page.');
      }
      setStatus('That command type is not supported here. Nothing was run.');
      return false;
    }
    function open(trigger) {
      if (isOpen()) return true;
      if (!flagOn('command-bar')) {
        setStatus('The command bar is switched off in Feature settings. Turn it on there first. Nothing was opened.');
        return false;
      }
      returnFocusTo = focusOrigin(trigger);
      input.disabled = false;
      closeButton.disabled = false;
      input.tabIndex = 0;
      closeButton.tabIndex = 0;
      input.value = '';
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      render('');
      focusElement(input);
      return true;
    }
    function close() {
      if (!isOpen()) return false;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      input.setAttribute('aria-expanded', 'false');
      listEl.hidden = true;
      removeAttribute(input, 'aria-activedescendant');
      input.disabled = true;
      closeButton.disabled = true;
      input.tabIndex = -1;
      closeButton.tabIndex = -1;
      const target = returnFocusTo;
      returnFocusTo = null;
      focusElement(target);
      return true;
    }
    function isOpen() { return overlay.classList.contains('is-open'); }
    function toggle(trigger) {
      if (isOpen()) { close(); return true; }
      return open(trigger);
    }
    input.addEventListener('input', () => { render(input.value); });
    input.addEventListener('keydown', (event) => {
      if (!event || typeof event.key !== 'string') return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        close();
        return;
      }
      if (key === 'arrowdown' || key === 'arrowup') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (currentList.length > 0) {
          selectedIndex = key === 'arrowdown'
            ? (selectedIndex + 1) % currentList.length
            : (selectedIndex - 1 + currentList.length) % currentList.length;
          renderList(currentList);
          const active = doc.getElementById('command-bar-option-' + selectedIndex);
          if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      if (key === 'enter') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        const candidate = currentList[selectedIndex] || (currentList.length === 1 ? currentList[0] : null);
        if (candidate) { run(candidate); return; }
        if (pendingParsed && pendingParsed.kind === 'url' && pendingParsed.url) {
          run({ kind: 'url', url: pendingParsed.url });
          return;
        }
        if (pendingParsed && pendingParsed.kind === 'search' && pendingParsed.engine) {
          run({ kind: 'search', engine: pendingParsed.engine, query: pendingParsed.query });
          return;
        }
        setStatus(currentList.length === 0 ? 'Nothing matches that. Try a card name, "open ", or a !bang with text.' : 'More than one match: pick one with the arrow keys first. Nothing was run.');
      }
    });
    closeButton.addEventListener('click', () => { close(); });
    doc.addEventListener('focusin', (event) => {
      if (!isOpen()) return;
      const target = event && event.target;
      if (target !== input && target !== closeButton) focusElement(input);
    });
    doc.addEventListener('keydown', (event) => {
      if (!event || typeof event.key !== 'string') return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey === true || event.metaKey === true) && key === 'k') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        toggle(focusOrigin(event.target));
        return;
      }
      if (!isOpen()) return;
      if (key === 'escape') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        close();
        return;
      }
      if (key === 'tab') {
        const active = doc.activeElement || event.target;
        if (event.shiftKey === true && active === input) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          focusElement(closeButton);
        } else if (event.shiftKey !== true && active === closeButton) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          focusElement(input);
        } else if (active !== input && active !== closeButton) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          focusElement(input);
        }
      }
    });
    closeButton.tabIndex = -1;
    input.tabIndex = -1;
    return {
      overlay: overlay,
      input: input,
      listEl: listEl,
      statusEl: statusEl,
      closeButton: closeButton,
      open: open,
      close: close,
      toggle: toggle,
      run: run,
      isOpen: isOpen
    };
  }
  const api = { attachCommandBarUi: attachCommandBarUi, STATUS_ONLY: STATUS_ONLY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkCommandBarUi = api;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => attachCommandBarUi({ document: document, window: window, flags: root.DaymarkFeatureFlags, commandBar: root.DaymarkCommandBar });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
