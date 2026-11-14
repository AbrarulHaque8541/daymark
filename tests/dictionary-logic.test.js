'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof window === 'undefined' && typeof globalThis.DaymarkDictionary === 'undefined') {
  try { logic = require('../dictionary-logic.js'); } catch (error) { logic = null; }
}
if (!logic) logic = globalThis.DaymarkDictionary;

test('normalizeWord trims and collapses inner whitespace', () => {
  assert.strictEqual(logic.normalizeWord('  serendipity  '), 'serendipity');
  assert.strictEqual(logic.normalizeWord('ice   cream'), 'ice cream');
});

test('normalizeWord rejects control characters, empties and junk', () => {
  assert.strictEqual(logic.normalizeWord(''), null);
  assert.strictEqual(logic.normalizeWord('   '), null);
  assert.strictEqual(logic.normalizeWord(null), null);
  assert.strictEqual(logic.normalizeWord(42), null);
  assert.strictEqual(logic.normalizeWord('bad\u0007bell'), null);
  assert.strictEqual(logic.normalizeWord('a'.repeat(logic.MAX_WORD_LENGTH + 1)), null);
  assert.strictEqual(logic.normalizeWord('<script>'), null);
  assert.strictEqual(logic.normalizeWord('two;words'), null);
});

test('buildDictionaryUrl targets the public HTTPS endpoint and encodes the word', () => {
  const url = logic.buildDictionaryUrl('ice cream');
  assert.ok(url.indexOf('https://api.dictionaryapi.dev/') === 0);
  assert.strictEqual(url, logic.DICTIONARY_ENDPOINT + encodeURIComponent('ice cream'));
});

test('buildDictionaryUrl throws on an invalid word', () => {
  assert.throws(() => logic.buildDictionaryUrl('   '), /single word/);
  assert.throws(() => logic.buildDictionaryUrl(null), /single word/);
});

test('parseEntry maps a full dictionary payload', () => {
  const entry = logic.parseEntry([
    {
      word: 'serendipity',
      phonetic: '\u02ccs\u025br\u0259n\u02c8d\u026ap\u0259ti',
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'The occurrence of events by chance in a happy way.', example: 'A fortunate stroke of serendipity.' }
          ]
        }
      ]
    }
  ]);
  assert.strictEqual(entry.word, 'serendipity');
  assert.ok(entry.phonetic.length > 0);
  assert.strictEqual(entry.definitions.length, 1);
  assert.strictEqual(entry.definitions[0].partOfSpeech, 'noun');
  assert.strictEqual(entry.definitions[0].definition, 'The occurrence of events by chance in a happy way.');
  assert.strictEqual(entry.definitions[0].example, 'A fortunate stroke of serendipity.');
  assert.strictEqual(entry.definitions[0].definitionTruncated, false);
  assert.strictEqual(entry.definitions[0].exampleTruncated, false);
});

test('parseEntry caps definitions at MAX_DEFINITIONS', () => {
  const def = { definition: 'A meaning.' };
  const payload = [{ word: 'w', meanings: [{ partOfSpeech: 'noun', definitions: [def, def, def, def, def, def, def, def] }] }];
  const entry = logic.parseEntry(payload);
  assert.strictEqual(entry.definitions.length, logic.MAX_DEFINITIONS);
});

test('parseEntry throws when the payload is not a non-empty array', () => {
  assert.throws(() => logic.parseEntry(null), /malformed/);
  assert.throws(() => logic.parseEntry({}), /malformed/);
  assert.throws(() => logic.parseEntry([]), /malformed/);
});

test('parseEntry throws when no definitions are readable', () => {
  assert.throws(
    () => logic.parseEntry([{ word: 'w', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: '   ' }] }] }]),
    /definitions/
  );
});

test('parseEntry truncates long text and flags it', () => {
  const entry = logic.parseEntry([
    {
      word: 'w',
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'x'.repeat(400), example: 'y'.repeat(300) }
          ]
        }
      ]
    }
  ]);
  assert.strictEqual(entry.definitions[0].definition.length, logic.MAX_DEFINITION_CHARS);
  assert.strictEqual(entry.definitions[0].definitionTruncated, true);
  assert.strictEqual(entry.definitions[0].example.length, logic.MAX_EXAMPLE_CHARS);
  assert.strictEqual(entry.definitions[0].exampleTruncated, true);
});

test('classifyDictionaryError explains misses, rejections, outages and timeouts', () => {
  assert.ok(logic.classifyDictionaryError(new Error('HTTP 404')).includes('No definition found'));
  assert.ok(logic.classifyDictionaryError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifyDictionaryError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifyDictionaryError(new Error('The dictionary request timed out.')).includes('timed out'));
  assert.strictEqual(logic.classifyDictionaryError(new Error('something odd')), null);
});

test('fetchEntry returns a stateless record from the public API', async () => {
  let requested = null;
  const payload = [
    {
      word: 'serendipity',
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'Happy chance.' }] }]
    }
  ];
  const fetchImpl = async (url) => {
    requested = url;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader() {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: new TextEncoder().encode(JSON.stringify(payload)) };
            },
            cancel: async () => {},
            releaseLock: () => {}
          };
        }
      }
    };
  };
  const record = await logic.fetchEntry('  serendipity  ', fetchImpl, {
    now: () => '2026-11-14T05:00:00.000Z'
  });
  assert.strictEqual(requested, logic.DICTIONARY_ENDPOINT + 'serendipity');
  assert.strictEqual(record.asked, 'serendipity');
  assert.strictEqual(record.entry.word, 'serendipity');
  assert.strictEqual(record.entry.definitions[0].definition, 'Happy chance.');
  assert.strictEqual(record.fetchedAt, '2026-11-14T05:00:00.000Z');
});

test('fetchEntry rejects an invalid word before any network call', async () => {
  let called = false;
  await assert.rejects(
    () => logic.fetchEntry('!!!', async () => { called = true; }),
    /single word/
  );
  assert.strictEqual(called, false);
});

test('fetchEntry surfaces HTTP errors from the service', async () => {
  const notFound = async () => ({ ok: false, status: 404, headers: { get: () => null }, body: null });
  await assert.rejects(() => logic.fetchEntry('zzzzzzzq', notFound), /HTTP 404/);
});

test('the endpoint is HTTPS-only by construction', () => {
  assert.ok(logic.DICTIONARY_ENDPOINT.indexOf('https://') === 0);
  assert.ok(logic.DICTIONARY_ENDPOINT.indexOf('http://') !== 0);
});
