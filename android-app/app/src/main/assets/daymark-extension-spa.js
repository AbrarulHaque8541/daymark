(function (config) {
  'use strict';

  try {
    if (!config
        || String(window.location.href) !== String(config.expectedUrl)
        || !Array.isArray(config.packs)
        || !document
        || typeof document.querySelectorAll !== 'function'
        || typeof document.createElement !== 'function') return;

    var allowed = Object.create(null);
    var packs = config.packs.slice(0, 8);

    for (var i = 0; i < packs.length; i++) {
      var pack = packs[i];
      var id = String(pack && pack.id || '');
      if (id) allowed[id] = true;
    }

    function removeElement(element) {
      if (element && element.parentNode
          && typeof element.parentNode.removeChild === 'function') {
        element.parentNode.removeChild(element);
      }
    }

    function findPackCss(packId) {
      var elements = document.querySelectorAll('style[data-daymark-managed="true"]');
      var found = null;
      for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (element
            && element.getAttribute('data-daymark-pack-id') === packId
            && element.getAttribute('data-daymark-pack-css') === 'true') {
          if (!found) found = element;
          else removeElement(element);
        }
      }
      return found;
    }

    // Remove every Daymark-owned style for packs that do not match this exact page.
    // User-created GM_addStyle nodes are retained only while their owning pack still matches.
    var managed = document.querySelectorAll('style[data-daymark-managed="true"]');
    for (var j = 0; j < managed.length; j++) {
      var style = managed[j];
      var owner = style && style.getAttribute('data-daymark-pack-id');
      if (!owner || !allowed[owner]) removeElement(style);
    }

    for (var k = 0; k < packs.length; k++) {
      var current = packs[k];
      var packId = String(current && current.id || '');
      if (!packId) continue;

      var css = typeof current.css === 'string' ? current.css : '';
      var existing = findPackCss(packId);
      if (!css) {
        removeElement(existing);
        continue;
      }

      if (existing) {
        if (existing.textContent !== css) existing.textContent = css;
        continue;
      }

      var parent = document.head || document.documentElement;
      if (!parent || typeof parent.appendChild !== 'function') continue;
      var element = document.createElement('style');
      element.setAttribute('data-daymark-managed', 'true');
      element.setAttribute('data-daymark-pack-id', packId);
      element.setAttribute('data-daymark-pack-css', 'true');
      element.textContent = css;
      parent.appendChild(element);
    }
  } catch (reconcileFailure) { }
})
