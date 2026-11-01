const test = require('node:test');
const assert = require('node:assert/strict');
const feed = require('../feed-logic.js');

const RSS = ['<?xml version="1.0" encoding="UTF-8"?>',
'<rss version="2.0">',
'  <channel>',
'    <title>Example News</title>',
'    <link>https://example.com/</link>',
'    <description>Example description</description>',
'    <item>',
'      <title>First &amp; foremost</title>',
'      <link>https://example.com/first</link>',
'      <pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate>',
'      <guid>urn:example:first</guid>',
'      <description><![CDATA[<p>Breaking <b>story</b> here.</p>]]></description>',
'    </item>',
'    <item>',
'      <title>Second item</title>',
'      <link>https://example.com/second</link>',
'      <pubDate>not a date</pubDate>',
'      <description>Plain &lt;em&gt;text&lt;/em&gt; summary</description>',
'    </item>',
'  </channel>',
'</rss>'].join('\n');

const ATOM = ['<?xml version="1.0" encoding="utf-8"?>',
'<feed xmlns="http://www.w3.org/2005/Atom">',
'  <title>Example Atom</title>',
'  <link rel="self" href="https://example.com/atom.xml"/>',
'  <link rel="alternate" href="https://example.com/"/>',
'  <updated>2026-10-27T08:30:00Z</updated>',
'  <entry>',
'    <title type="html">Atom &quot;entry&quot;</title>',
'    <link rel="alternate" href="https://example.com/a1"/>',
'    <id>tag:example.com,2026:a1</id>',
'    <published>2026-10-27T08:00:00Z</published>',
'    <updated>2026-10-27T08:30:00Z</updated>',
'    <summary>Short summary</summary>',
'  </entry>',
'  <entry>',
'    <title>Entry with content only</title>',
'    <link href="https://example.com/a2"/>',
'    <id>tag:example.com,2026:a2</id>',
'    <updated>2026-10-26T12:00:00Z</updated>',
'    <content type="html">&lt;p&gt;Full &amp;amp; complete&lt;/p&gt;</content>',
'  </entry>',
'</feed>'].join('\n');

test('RSS 2.0 feeds parse channel metadata and items with CDATA and entities', () => {
  const parsed = feed.parseFeed(RSS);
  assert.equal(parsed.format, 'rss');
  assert.equal(parsed.title, 'Example News');
  assert.equal(parsed.link, 'https://example.com/');
  assert.equal(parsed.items.length, 2);
  const first = parsed.items[0];
  const second = parsed.items[1];
  assert.equal(first.title, 'First & foremost');
  assert.equal(first.link, 'https://example.com/first');
  assert.equal(first.publishedAt, '2026-10-26T10:00:00.000Z');
  assert.equal(first.id, 'urn:example:first');
  assert.equal(first.summary, 'Breaking story here.');
  assert.equal(second.publishedAt, null, 'unparseable dates become null instead of breaking the feed');
  assert.equal(second.summary, 'Plain <em>text</em> summary');
});

test('Atom feeds parse entries, prefer rel=alternate links, and strip HTML content', () => {
  const parsed = feed.parseFeed(ATOM);
  assert.equal(parsed.format, 'atom');
  assert.equal(parsed.title, 'Example Atom');
  assert.equal(parsed.link, 'https://example.com/', 'alternate link wins over rel=self');
  assert.equal(parsed.items.length, 2);
  const first = parsed.items[0];
  const second = parsed.items[1];
  assert.equal(first.title, 'Atom "entry"');
  assert.equal(first.link, 'https://example.com/a1');
  assert.equal(first.publishedAt, '2026-10-27T08:00:00.000Z');
  assert.equal(first.summary, 'Short summary');
  assert.equal(second.link, 'https://example.com/a2');
  assert.equal(second.publishedAt, '2026-10-26T12:00:00.000Z', 'updated is the fallback date');
  assert.equal(second.summary, 'Full & complete');
});

test('non-feed XML and malformed XML are rejected with clear errors', () => {
  assert.throws(() => feed.parseFeed('<html><body>nope</body></html>'), /not an RSS or Atom feed/);
  assert.throws(() => feed.parseFeed('<rss><channel><title>broken</title>'), /Malformed XML/);
  assert.throws(() => feed.parseFeed('   '), /empty/);
  assert.throws(() => feed.parseFeed('<rss version="2.0"><channel><title>Empty</title></channel></rss>'), /no readable items/);
  assert.throws(() => feed.parseFeed('<feed><entry><title>x</title></entry>'), /Malformed XML/);
});

test('feed URLs must be plain http(s) URLs without credentials', () => {
  assert.equal(feed.isValidFeedUrl('https://example.com/feed.xml'), true);
  assert.equal(feed.isValidFeedUrl('http://news.example.org/rss'), true);
  assert.equal(feed.isValidFeedUrl('https://user:pass@example.com/feed'), false);
  assert.equal(feed.isValidFeedUrl('ftp://example.com/feed'), false);
  assert.equal(feed.isValidFeedUrl('javascript:alert(1)'), false);
  assert.equal(feed.isValidFeedUrl('not a url'), false);
  assert.equal(feed.isValidFeedUrl(null), false);
  assert.equal(feed.isValidFeedUrl(42), false);
});

test('normalized feeds cap items and truncate overlong fields', () => {
  const itemsXml = Array.from({ length: 30 }, (_, i) =>
    '<item><title>Item ' + i + '</title><link>https://example.com/' + i + '</link></item>').join('');
  const xml = '<rss version="2.0"><channel><title>Big</title>' + itemsXml + '</channel></rss>';
  const parsed = feed.parseFeed(xml);
  assert.equal(parsed.items.length, feed.MAX_ITEMS);
  assert.equal(parsed.items[0].title, 'Item 0');
  const longTitle = feed.parseFeed('<rss version="2.0"><channel><title>t</title><item><title>' + 'x'.repeat(500) + '</title></item></channel></rss>');
  assert.equal(longTitle.items[0].title.length, feed.MAX_ITEM_TITLE_CHARS);
});

test('item links that are not web links are dropped, titles stay required', () => {
  const parsed = feed.parseFeed('<rss version="2.0"><channel><title>t</title>' +
    '<item><title>ok</title><link>javascript:alert(1)</link></item>' +
    '<item><link>https://example.com/only-link</link></item></channel></rss>');
  assert.equal(parsed.items[0].link, null);
  assert.equal(parsed.items[1].title, 'Untitled');
  assert.equal(parsed.items[1].link, 'https://example.com/only-link');
});

test('feed cache validation accepts only well-formed cached snapshots', () => {
  const parsed = feed.parseFeed(RSS);
  const good = { version: 1, url: 'https://example.com/feed.xml', fetchedAt: '2026-10-27T09:00:00.000Z', feed: parsed };
  assert.equal(feed.validateFeedCache(good), true);
  assert.equal(feed.validateFeedCache(null), false);
  assert.equal(feed.validateFeedCache(Object.assign({}, good, { version: 2 })), false);
  assert.equal(feed.validateFeedCache(Object.assign({}, good, { url: 'ftp://example.com/x' })), false);
  assert.equal(feed.validateFeedCache(Object.assign({}, good, { fetchedAt: 'nope' })), false);
  assert.equal(feed.validateFeedCache(Object.assign({}, good, { feed: Object.assign({}, parsed, { items: [] }) })), false);
  assert.equal(feed.validateFeedCache(Object.assign({}, good, { feed: Object.assign({}, parsed, { format: 'json' }) })), false);
  assert.equal(feed.isValidFeed(parsed), true);
  assert.equal(feed.isValidFeed(Object.assign({}, parsed, { items: [Object.assign({}, parsed.items[0], { title: '' })] })), false);
});
