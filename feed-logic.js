((root) => {
  'use strict';

  const MAX_ITEMS = 20;
  const MAX_FEED_TITLE_CHARS = 120;
  const MAX_ITEM_TITLE_CHARS = 200;
  const MAX_SUMMARY_CHARS = 280;
  const MAX_XML_CHARS = 512 * 1024;

  function decodeEntities(text) {
    return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
      if (entity[0] === '#') {
        const code = entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        if (Number.isNaN(code) || code < 0 || code > 0x10FFFF) return match;
        try {
          return String.fromCodePoint(code);
        } catch (error) {
          return match;
        }
      }
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
      return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity] : match;
    });
  }

  function localName(name) {
    const index = String(name).indexOf(':');
    return index === -1 ? String(name) : String(name).slice(index + 1);
  }

  // Minimal, dependency-free XML parser: enough for well-formed RSS/Atom
  // documents (elements, attributes, text, CDATA, comments, declarations).
  function parseXml(xml) {
    let i = 0;
    const len = xml.length;
    const fail = (message) => { throw new Error(`Malformed XML: ${message}`); };

    function skipMisc() {
      for (;;) {
        while (i < len && /\s/.test(xml[i])) i += 1;
        if (xml.startsWith('<?', i)) {
          const end = xml.indexOf('?>', i);
          if (end === -1) fail('unterminated processing instruction');
          i = end + 2;
        } else if (xml.startsWith('<!--', i)) {
          const end = xml.indexOf('-->', i);
          if (end === -1) fail('unterminated comment');
          i = end + 3;
        } else if (xml.startsWith('<!', i)) {
          let j = i + 2;
          let depth = 0;
          let quote = null;
          while (j < len) {
            const c = xml[j];
            if (quote) {
              if (c === quote) quote = null;
            } else if (c === '"' || c === "'") quote = c;
            else if (c === '[') depth += 1;
            else if (c === ']') depth -= 1;
            else if (c === '>' && depth <= 0) break;
            j += 1;
          }
          if (j >= len) fail('unterminated declaration');
          i = j + 1;
        } else {
          return;
        }
      }
    }

    function parseElement() {
      i += 1; // consume '<'
      const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(xml.slice(i));
      if (!nameMatch) fail('expected an element name');
      const name = nameMatch[0];
      i += name.length;
      const attributes = {};
      for (;;) {
        while (i < len && /\s/.test(xml[i])) i += 1;
        if (xml.startsWith('/>', i)) {
          i += 2;
          return { name, attributes, children: [], text: '' };
        }
        if (xml[i] === '>') {
          i += 1;
          break;
        }
        const attrMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(xml.slice(i));
        if (!attrMatch) fail('expected an attribute name');
        const attrName = attrMatch[0];
        i += attrName.length;
        while (i < len && /\s/.test(xml[i])) i += 1;
        if (xml[i] !== '=') fail('expected = after an attribute name');
        i += 1;
        while (i < len && /\s/.test(xml[i])) i += 1;
        const quote = xml[i];
        if (quote !== '"' && quote !== "'") fail('expected a quoted attribute value');
        i += 1;
        const end = xml.indexOf(quote, i);
        if (end === -1) fail('unterminated attribute value');
        attributes[attrName] = decodeEntities(xml.slice(i, end));
        i = end + 1;
      }
      const children = [];
      let text = '';
      for (;;) {
        if (i >= len) fail(`unterminated element ${name}`);
        if (xml.startsWith('</', i)) {
          const end = xml.indexOf('>', i);
          if (end === -1) fail('unterminated close tag');
          const closeName = xml.slice(i + 2, end).trim();
          if (closeName !== name) fail(`mismatched close tag ${closeName}`);
          i = end + 1;
          return { name, attributes, children, text: decodeEntities(text) };
        }
        if (xml.startsWith('<![CDATA[', i)) {
          const end = xml.indexOf(']]>', i);
          if (end === -1) fail('unterminated CDATA section');
          text += xml.slice(i + 9, end);
          i = end + 3;
          continue;
        }
        if (xml.startsWith('<!--', i)) {
          const end = xml.indexOf('-->', i);
          if (end === -1) fail('unterminated comment');
          i = end + 3;
          continue;
        }
        if (xml.startsWith('<?', i)) {
          const end = xml.indexOf('?>', i);
          if (end === -1) fail('unterminated processing instruction');
          i = end + 2;
          continue;
        }
        if (xml[i] === '<') {
          children.push(parseElement());
          continue;
        }
        const next = xml.indexOf('<', i);
        text += next === -1 ? xml.slice(i) : xml.slice(i, next);
        i = next === -1 ? len : next;
      }
    }

    skipMisc();
    if (i >= len || xml[i] !== '<') fail('no root element');
    const root = parseElement();
    skipMisc();
    if (i < len) fail('trailing content after the root element');
    return root;
  }

  function childElements(node, name) {
    return node.children.filter((child) => localName(child.name).toLowerCase() === name);
  }

  function firstChild(node, name) {
    return childElements(node, name)[0] || null;
  }

  function childText(node, name) {
    const child = firstChild(node, name);
    return child ? child.text.trim() : '';
  }

  function stripHtml(value) {
    return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseDateValue(value) {
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
  }

  function isValidWebLink(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      if (url.username || url.password) return false;
      return Boolean(url.hostname);
    } catch (error) {
      return false;
    }
  }

  function isValidFeedUrl(value) {
    if (!isValidWebLink(value)) return false;
    const { hostname } = new URL(value.trim());
    return hostname.includes('.') || hostname === 'localhost';
  }

  function pickLink(links) {
    const alternate = links.find((link) => !link.attributes.rel || link.attributes.rel === 'alternate');
    const chosen = alternate || links[0] || null;
    return chosen && chosen.attributes.href ? chosen.attributes.href : '';
  }

  function normalizeFeed(feed) {
    if (!feed || typeof feed !== 'object') throw new Error('The feed is malformed.');
    const items = (Array.isArray(feed.items) ? feed.items : []).slice(0, MAX_ITEMS).map((item, index) => {
      const title = String(item.title || '').trim().slice(0, MAX_ITEM_TITLE_CHARS) || 'Untitled';
      const link = isValidWebLink(item.link) ? String(item.link).trim() : null;
      return {
        id: String(item.id || link || title || `item-${index}`).slice(0, 240),
        title,
        link,
        publishedAt: parseDateValue(item.publishedAt),
        summary: String(item.summary || '').trim().slice(0, MAX_SUMMARY_CHARS)
      };
    });
    if (!items.length) throw new Error('The feed has no readable items.');
    return {
      format: feed.format === 'atom' ? 'atom' : 'rss',
      title: String(feed.title || '').trim().slice(0, MAX_FEED_TITLE_CHARS) || 'Untitled feed',
      link: isValidWebLink(feed.link) ? String(feed.link).trim() : null,
      items
    };
  }

  function parseFeed(xml) {
    if (typeof xml !== 'string' || !xml.trim()) throw new Error('The feed response was empty.');
    if (xml.length > MAX_XML_CHARS) throw new Error('The feed response was too large to parse safely.');
    const root = parseXml(xml);
    const rootName = localName(root.name).toLowerCase();
    if (rootName === 'rss' || rootName === 'rdf') {
      const channel = rootName === 'rss' ? firstChild(root, 'channel') : root;
      if (!channel) throw new Error('The RSS feed has no channel.');
      const itemNodes = rootName === 'rss' ? childElements(channel, 'item') : childElements(root, 'item');
      const items = itemNodes.map((item) => ({
        id: childText(item, 'guid') || childText(item, 'link') || childText(item, 'title'),
        title: childText(item, 'title'),
        link: childText(item, 'link'),
        publishedAt: childText(item, 'pubDate') || childText(item, 'date'),
        summary: stripHtml(childText(item, 'description') || childText(item, 'encoded'))
      }));
      return normalizeFeed({
        format: 'rss',
        title: childText(channel, 'title'),
        link: childText(channel, 'link'),
        items
      });
    }
    if (rootName === 'feed') {
      const entries = childElements(root, 'entry').map((entry) => ({
        id: childText(entry, 'id') || pickLink(childElements(entry, 'link')) || childText(entry, 'title'),
        title: childText(entry, 'title'),
        link: pickLink(childElements(entry, 'link')),
        publishedAt: childText(entry, 'published') || childText(entry, 'updated'),
        summary: stripHtml(childText(entry, 'summary') || childText(entry, 'content'))
      }));
      return normalizeFeed({
        format: 'atom',
        title: childText(root, 'title'),
        link: pickLink(childElements(root, 'link')),
        items: entries
      });
    }
    throw new Error('The response is not an RSS or Atom feed.');
  }

  function isValidFeedItem(item) {
    return Boolean(item && typeof item === 'object'
      && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 240
      && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= MAX_ITEM_TITLE_CHARS
      && (item.link === null || isValidWebLink(item.link))
      && (item.publishedAt === null || (typeof item.publishedAt === 'string' && !Number.isNaN(Date.parse(item.publishedAt))))
      && typeof item.summary === 'string' && item.summary.length <= MAX_SUMMARY_CHARS);
  }

  function isValidFeed(feed) {
    return Boolean(feed && typeof feed === 'object'
      && (feed.format === 'rss' || feed.format === 'atom')
      && typeof feed.title === 'string' && feed.title.length > 0 && feed.title.length <= MAX_FEED_TITLE_CHARS
      && (feed.link === null || isValidWebLink(feed.link))
      && Array.isArray(feed.items) && feed.items.length > 0 && feed.items.length <= MAX_ITEMS
      && feed.items.every(isValidFeedItem));
  }

  function validateFeedCache(value) {
    return Boolean(value && typeof value === 'object'
      && value.version === 1
      && isValidFeedUrl(value.url)
      && typeof value.fetchedAt === 'string' && !Number.isNaN(Date.parse(value.fetchedAt))
      && isValidFeed(value.feed));
  }

  const api = {
    parseFeed,
    isValidFeedUrl,
    isValidWebLink,
    isValidFeed,
    isValidFeedItem,
    validateFeedCache,
    stripHtml,
    MAX_ITEMS,
    MAX_FEED_TITLE_CHARS,
    MAX_ITEM_TITLE_CHARS,
    MAX_SUMMARY_CHARS,
    MAX_XML_CHARS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DaymarkFeed = api;
})(globalThis);
