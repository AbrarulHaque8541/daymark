(function () {
  'use strict';

  try {
    var config = window.__daymarkSpaConfig;
    if (!config
        || String(window.location.href) !== String(config.expectedUrl)
        || !Array.isArray(config.packs)) return;

    var state = window.__daymarkSpaState;
    var maximum = Number(config.maxEnabled);
    if (!Number.isFinite(maximum) || maximum < 1) maximum = 8;
    maximum = Math.min(8, Math.floor(maximum));

    if (state) {
      state.packs = config.packs;
      state.maxEnabled = maximum;
      if (typeof state.reconcile === 'function') state.reconcile(true);
      return;
    }

    state = {
      packs: config.packs,
      maxEnabled: maximum,
      lastUrl: null,
      active: Object.create(null),
      styles: Object.create(null),
      currentPackId: null,
      reconcile: null,
      addStyle: null
    };
    window.__daymarkSpaState = state;

    function parseWebUrl(value) {
      try {
        var parsed = new URL(String(value));
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
            || parsed.username || parsed.password) return null;
        return parsed;
      } catch (invalidUrl) {
        return null;
      }
    }

    function hostMatches(pattern, host) {
      var value = String(pattern || '').toLowerCase();
      if (value === '*') return true;
      if (value.indexOf('*.') === 0) {
        var suffix = value.substring(1);
        return host.endsWith(suffix) || host === value.substring(2);
      }
      return host === value;
    }

    function pathMatches(pattern, path) {
      var value = String(pattern || '');
      if (value === '*' || value === '/*') return true;
      if (value.charAt(value.length - 1) === '*') {
        return path.indexOf(value.substring(0, value.length - 1)) === 0;
      }
      return path === value;
    }

    function matchesPattern(pattern, parsedUrl) {
      var value = String(pattern || '').trim();
      if (value === '<all_urls>' || value === '*://*/*') return true;

      var requiredScheme;
      var rest;
      if (value.indexOf('https://') === 0) {
        requiredScheme = 'https:';
        rest = value.substring(8);
      } else if (value.indexOf('*://') === 0) {
        requiredScheme = '*';
        rest = value.substring(4);
      } else {
        return false;
      }

      var slash = rest.indexOf('/');
      var hostPattern = slash < 0 ? rest : rest.substring(0, slash);
      var pathPattern = slash < 0 ? '/*' : rest.substring(slash);
      if (requiredScheme !== '*' && parsedUrl.protocol !== requiredScheme) return false;
      return hostMatches(hostPattern, parsedUrl.hostname.toLowerCase())
        && pathMatches(pathPattern, parsedUrl.pathname || '/');
    }

    function packMatches(pack, url) {
      if (!pack || pack.enabled === false) return false;
      var parsedUrl = parseWebUrl(url);
      if (!parsedUrl) return false;
      var host = parsedUrl.hostname.toLowerCase();

      var disabledSites = Array.isArray(pack.disabledSites) ? pack.disabledSites : [];
      for (var i = 0; i < disabledSites.length; i++) {
        var site = String(disabledSites[i] || '').toLowerCase();
        if (site && (host === site || host.endsWith('.' + site))) return false;
      }

      var excludes = Array.isArray(pack.excludes) ? pack.excludes : [];
      for (var e = 0; e < excludes.length; e++) {
        if (matchesPattern(excludes[e], parsedUrl)) return false;
      }

      var matches = Array.isArray(pack.matches) ? pack.matches : [];
      for (var m = 0; m < matches.length; m++) {
        if (matchesPattern(matches[m], parsedUrl)) return true;
      }
      return false;
    }

    function removeElement(element) {
      if (element && element.parentNode
          && typeof element.parentNode.removeChild === 'function') {
        element.parentNode.removeChild(element);
      }
    }

    function removePackStyles(packId) {
      var elements = state.styles[packId] || [];
      for (var i = 0; i < elements.length; i++) removeElement(elements[i]);
      delete state.styles[packId];
    }

    function removePackCss(packId) {
      var elements = state.styles[packId] || [];
      var remaining = [];
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element && element.getAttribute
            && element.getAttribute('data-daymark-pack-css') === 'true') {
          removeElement(element);
        } else if (element) {
          remaining.push(element);
        }
      }
      if (remaining.length) state.styles[packId] = remaining;
      else delete state.styles[packId];
    }

    function appendManagedStyle(packId, css, isPackCss) {
      if (!state.active[packId] || typeof css !== 'string' || css.length > 120000) return null;
      var parent = document.head || document.documentElement;
      if (!parent || typeof parent.appendChild !== 'function'
          || typeof document.createElement !== 'function') return null;

      var element = document.createElement('style');
      element.setAttribute('data-daymark-managed', 'true');
      element.setAttribute('data-daymark-pack-id', packId);
      if (isPackCss) element.setAttribute('data-daymark-pack-css', 'true');
      element.textContent = css;
      parent.appendChild(element);
      state.styles[packId] = state.styles[packId] || [];
      state.styles[packId].push(element);
      return element;
    }

    function ensurePackCss(pack) {
      var packId = String(pack && pack.id || '');
      if (!packId || !state.active[packId]) return;
      var css = typeof pack.css === 'string' ? pack.css : '';
      if (!css) {
        removePackCss(packId);
        return;
      }

      var elements = state.styles[packId] || [];
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element && element.getAttribute
            && element.getAttribute('data-daymark-pack-css') === 'true') {
          if (element.textContent !== css) element.textContent = css;
          return;
        }
      }
      appendManagedStyle(packId, css, true);
    }

    function reconcile(force) {
      var currentUrl = String(window.location.href);
      if (!force && currentUrl === state.lastUrl) return;
      state.lastUrl = currentUrl;

      var nextActive = Object.create(null);
      var activePacks = [];
      for (var i = 0; i < state.packs.length; i++) {
        var pack = state.packs[i];
        var packId = String(pack && pack.id || '');
        if (!packId || nextActive[packId] || !packMatches(pack, currentUrl)) continue;
        if (activePacks.length >= state.maxEnabled) break;
        nextActive[packId] = true;
        activePacks.push(pack);
      }

      var previousActive = state.active;
      Object.keys(previousActive).forEach(function (packId) {
        if (!nextActive[packId]) removePackStyles(packId);
      });
      state.active = nextActive;
      for (var j = 0; j < activePacks.length; j++) ensurePackCss(activePacks[j]);
    }

    state.reconcile = reconcile;
    state.addStyle = function (packId, css) {
      var id = String(packId || '');
      if (!id || !state.active[id]) return null;
      return appendManagedStyle(id, String(css == null ? '' : css), false);
    };
    window.__daymarkAddStyle = state.addStyle;
    window.GM_addStyle = function (css) {
      if (state.currentPackId == null) return null;
      return state.addStyle(state.currentPackId, css);
    };

    var history = window.history;
    if (history && typeof history.pushState === 'function') {
      var originalPushState = history.pushState;
      history.pushState = function () {
        var result = originalPushState.apply(this, arguments);
        reconcile(false);
        return result;
      };
    }
    if (history && typeof history.replaceState === 'function') {
      var originalReplaceState = history.replaceState;
      history.replaceState = function () {
        var result = originalReplaceState.apply(this, arguments);
        reconcile(false);
        return result;
      };
    }

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('popstate', function () { reconcile(false); });
      window.addEventListener('hashchange', function () { reconcile(false); });
      window.addEventListener('pageshow', function () { reconcile(false); });
    }

    try {
      if (typeof window.MutationObserver === 'function' && document.documentElement) {
        var observer = new window.MutationObserver(function () { reconcile(false); });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        state.observer = observer;
      }
    } catch (observerUnavailable) { }

    reconcile(true);
  } catch (bootstrapFailure) { }
})();
