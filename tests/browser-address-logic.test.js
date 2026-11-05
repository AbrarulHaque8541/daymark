const test = require('node:test');
const assert = require('node:assert/strict');
const address = require('../browser-address-logic.js');

test('bare domains resolve to https without rewriting an explicit http scheme', () => {
  const bare = address.parseAddressInput('example.com');
  assert.equal(bare.kind, 'navigate');
  assert.equal(bare.url, 'https://example.com');
  assert.equal(bare.security, 'encrypted');

  const explicit = address.parseAddressInput('http://example.com');
  assert.equal(explicit.url, 'http://example.com');
  assert.equal(explicit.security, 'not-encrypted');

  const https = address.parseAddressInput('https://example.com/page?q=1#frag');
  assert.equal(https.url, 'https://example.com/page?q=1#frag');
  assert.equal(https.security, 'encrypted');
});

test('a bare host with only a query or fragment still builds a valid URL', () => {
  assert.equal(address.parseAddressInput('example.com?q=1').url, 'https://example.com/?q=1');
  assert.equal(address.parseAddressInput('example.com#top').url, 'https://example.com/#top');
  assert.equal(address.parseAddressInput('example.com/a/b?x=1').url, 'https://example.com/a/b?x=1');
  assert.equal(address.parseAddressInput('EXAMPLE.com').host, 'example.com');
  assert.equal(address.parseAddressInput('example.com./x').host, 'example.com');
});

test('Unicode/IDN hosts are punycode-encoded per RFC 3492', () => {
  assert.equal(address.punycodeEncodeLabel('bücher'), 'xn--bcher-kva');
  assert.equal(address.punycodeEncodeLabel('münchen'), 'xn--mnchen-3ya');
  assert.equal(address.punycodeEncodeLabel('mañana'), 'xn--maana-pta');
  assert.equal(address.punycodeEncodeLabel('ASCII'), null);

  const idn = address.parseAddressInput('münchen.de');
  assert.equal(idn.kind, 'navigate');
  assert.equal(idn.idn, true);
  assert.equal(idn.url, 'https://xn--mnchen-3ya.de');

  assert.equal(address.parseAddressInput('https://日本語.jp/').host, 'xn--wgv71a119e.jp');
  assert.equal(address.parseAddressInput('https://例え.テスト/').host, 'xn--r8jz45g.xn--zckzah');

  // Mixed ASCII + Unicode labels encode only the Unicode label.
  assert.equal(address.parseAddressInput('café.example.com').host, 'xn--caf-dma.example.com');
});

test('ports are validated in the 1..65535 range and default ports are normalized away', () => {
  assert.equal(address.parseAddressInput('example.com:8080').port, 8080);
  assert.equal(address.parseAddressInput('example.com:8080').url, 'https://example.com:8080');
  assert.equal(address.parseAddressInput('https://example.com:443').port, null);
  assert.equal(address.parseAddressInput('http://example.com:80').port, null);
  assert.equal(address.parseAddressInput('example.com:').url, 'https://example.com');

  assert.equal(address.parseAddressInput('example.com:0').kind, 'search');
  assert.equal(address.parseAddressInput('example.com:65536').kind, 'search');
  assert.equal(address.parseAddressInput('example.com:abc').kind, 'search');
  assert.equal(address.parseAddressInput('https://example.com:8o0/').kind, 'search');
});

test('IPv4 literals validate octets and reject partial numeric hosts', () => {
  const ip = address.parseAddressInput('http://192.168.1.1/admin');
  assert.equal(ip.kind, 'navigate');
  assert.equal(ip.host, '192.168.1.1');
  assert.equal(ip.hostLiteral, 'ipv4');
  assert.equal(address.parseAddressInput('http://999.1.1.1/').kind, 'search');
  assert.equal(address.parseAddressInput('http://1.2.3/').kind, 'search');
  assert.equal(address.parseAddressInput('http://1.2.3.4.5/').kind, 'search');
});

test('bracketed IPv6 literals validate with and without ports', () => {
  assert.equal(address.parseAddressInput('[::1]/').url, 'https://[::1]/');
  assert.equal(address.parseAddressInput('https://[2001:db8::1]:8443/x').port, 8443);
  assert.equal(address.parseAddressInput('https://[fe80::1ff:fe23:4567:890a]/').host,
    '[fe80::1ff:fe23:4567:890a]');
  assert.equal(address.parseAddressInput('https://[1:2:3:4:5:6:7:8]').kind, 'navigate');
  assert.equal(address.parseAddressInput('https://[::ffff:192.0.2.128]/').kind, 'navigate');

  assert.equal(address.parseAddressInput('https://[1:2:xyz/').kind, 'search');
  assert.equal(address.parseAddressInput('https://[1:2:3:4:5:6:7:8:9]').kind, 'search');
  assert.equal(address.parseAddressInput('https://[::1::2]/').kind, 'search');
  assert.equal(address.parseAddressInput('https://[2001:db8::1]garbage/').kind, 'search');
});

test('malformed URLs fall back to an explicit search, never a guessed navigation', () => {
  assert.equal(address.parseAddressInput('https://exa mple.com').kind, 'search');
  assert.equal(address.parseAddressInput('https://exa mple.com').searchQuery, 'https://exa mple.com');
  assert.equal(address.parseAddressInput('https://').kind, 'search');
  assert.equal(address.parseAddressInput('https:///path').kind, 'search');
  assert.equal(address.parseAddressInput('http:example.com').kind, 'search');
  assert.equal(address.parseAddressInput('example').kind, 'search');
  assert.equal(address.parseAddressInput('https://user:pass@example.com').kind, 'search');
  assert.equal(address.parseAddressInput('https://user:pass@example.com').reason,
    'embedded credentials are refused in the address bar; treated as a search');
  assert.equal(address.parseAddressInput('null').kind, 'search');
  assert.equal(address.parseAddressInput('a b c').kind, 'search');
});

test('localhost stays a valid navigation host', () => {
  const local = address.parseAddressInput('localhost:3000/api');
  assert.equal(local.kind, 'navigate');
  assert.equal(local.url, 'https://localhost:3000/api');
});

test('search-provider switching never loses or double-encodes the query', () => {
  const query = 'daymark task manager';
  const google = address.parseAddressInput(query, { provider: 'google' });
  assert.equal(google.kind, 'search');
  assert.equal(google.url, 'https://www.google.com/search?q=daymark%20task%20manager');

  const bing = address.switchSearchProvider(query, 'bing');
  assert.equal(bing.searchQuery, query);
  assert.equal(bing.url, 'https://www.bing.com/search?q=daymark%20task%20manager');

  const wiki = address.switchSearchProvider(query, 'wikipedia');
  assert.equal(wiki.searchQuery, query);
  assert.equal(wiki.url, 'https://en.wikipedia.org/w/index.php?search=daymark%20task%20manager');

  const ddg = address.switchSearchProvider(query, 'duckduckgo');
  assert.equal(ddg.searchQuery, query);
  assert.equal(ddg.url, 'https://duckduckgo.com/?q=daymark%20task%20manager');

  assert.equal(address.parseAddressInput('cats & dogs 100%').url,
    'https://duckduckgo.com/?q=cats%20%26%20dogs%20100%25');
  assert.equal(address.parseAddressInput('hello', { provider: 'does-not-exist' }).provider,
    address.DEFAULT_SEARCH_PROVIDER);
  assert.equal(address.isKnownProvider('google'), true);
  assert.equal(address.isKnownProvider('nope'), false);
  assert.throws(() => address.buildSearchUrl('   '), /required/);
});

test('only http(s) navigation, mailto/tel/sms handoff, and blocked schemes exist', () => {
  assert.equal(address.parseAddressInput('mailto:someone@example.com').kind, 'external');
  assert.equal(address.parseAddressInput('mailto:someone@example.com').url, 'mailto:someone@example.com');
  assert.equal(address.parseAddressInput('tel:+911234567890').kind, 'external');
  assert.equal(address.parseAddressInput('sms:+911234567890?body=hi').kind, 'external');
  assert.equal(address.parseAddressInput('mailto:some one@example.com').kind, 'search');

  assert.equal(address.parseAddressInput('javascript:alert(1)').kind, 'blocked');
  assert.equal(address.parseAddressInput('data:text/html,<b>x</b>').kind, 'blocked');
  assert.equal(address.parseAddressInput('intent://example.com/#Intent;end').kind, 'blocked');
  assert.equal(address.parseAddressInput('ftp://example.com/file').kind, 'blocked');
  assert.equal(address.parseAddressInput('about:blank').kind, 'blocked');

  // Unknown schemes are never guessed at; they search instead.
  assert.equal(address.parseAddressInput('foo://bar/baz').kind, 'search');
  assert.equal(address.parseAddressInput('foo://bar/baz').reason,
    'unknown scheme foo; searching instead of guessing');
});

test('empty, whitespace, and oversized inputs are handled honestly', () => {
  assert.equal(address.parseAddressInput('').kind, 'none');
  assert.equal(address.parseAddressInput('   ').kind, 'none');
  assert.equal(address.parseAddressInput(null).kind, 'none');
  assert.equal(address.parseAddressInput(42).kind, 'none');
  assert.equal(address.parseAddressInput('  example.com  ').url, 'https://example.com');
  assert.equal(address.parseAddressInput('x'.repeat(address.MAX_INPUT_CHARS + 1)).kind, 'search');
  assert.equal(address.parseAddressInput('x'.repeat(address.MAX_INPUT_CHARS + 1)).searchQuery.length,
    address.MAX_INPUT_CHARS);
});

test('the module exposes its API and constants', () => {
  assert.equal(typeof address.parseAddressInput, 'function');
  assert.equal(typeof address.switchSearchProvider, 'function');
  assert.deepEqual(address.ALLOWED_WEB_SCHEMES, ['http', 'https']);
  assert.deepEqual(address.EXTERNAL_SCHEMES, ['mailto', 'tel', 'sms']);
  assert.equal(address.DEFAULT_SEARCH_PROVIDER, 'duckduckgo');
  assert.equal(typeof globalThis.DaymarkBrowserAddress, 'object');
});
