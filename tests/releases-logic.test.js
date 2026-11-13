'use strict';

const test = require('node:test');
const assert = require('node:assert');

let logic;
if (typeof window === 'undefined' && typeof globalThis.DaymarkReleases === 'undefined') {
  try { logic = require('../releases-logic.js'); } catch (error) { logic = null; }
}
if (!logic) logic = globalThis.DaymarkReleases;

test('parseRepoSlug accepts owner/repo', () => {
  const parsed = logic.parseRepoSlug('octocat/Hello-World');
  assert.ok(parsed);
  assert.strictEqual(parsed.owner, 'octocat');
  assert.strictEqual(parsed.repo, 'Hello-World');
  assert.strictEqual(parsed.slug, 'octocat/Hello-World');
});

test('parseRepoSlug accepts a full https GitHub URL', () => {
  const parsed = logic.parseRepoSlug('https://github.com/octocat/Hello-World');
  assert.ok(parsed);
  assert.strictEqual(parsed.slug, 'octocat/Hello-World');
});

test('parseRepoSlug rejects empty input', () => {
  assert.strictEqual(logic.parseRepoSlug('   '), null);
  assert.strictEqual(logic.parseRepoSlug(''), null);
  assert.strictEqual(logic.parseRepoSlug(null), null);
});

test('parseRepoSlug rejects paths with more than two parts', () => {
  assert.strictEqual(logic.parseRepoSlug('a/b/c'), null);
});

test('parseRepoSlug rejects non-https URLs', () => {
  assert.strictEqual(logic.parseRepoSlug('http://github.com/a/b'), null);
  assert.strictEqual(logic.parseRepoSlug('https://evil.example/a/b'), null);
});

test('parseRepoSlug rejects dot and dotdot repos', () => {
  assert.strictEqual(logic.parseRepoSlug('owner/.'), null);
  assert.strictEqual(logic.parseRepoSlug('owner/..'), null);
});

test('buildReleasesUrl targets the public releases endpoint', () => {
  assert.strictEqual(
    logic.buildReleasesUrl('octocat/Hello-World'),
    'https://api.github.com/repos/octocat/Hello-World/releases/latest'
  );
});

test('buildReleasesUrl throws on an invalid slug', () => {
  assert.throws(() => logic.buildReleasesUrl('not-a-slug'), /owner\/repo/);
});

test('parseRelease maps a full GitHub release payload', () => {
  const release = logic.parseRelease({
    tag_name: 'v1.2.3',
    name: 'Daymark 1.2.3',
    html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.2.3',
    body: 'Fixes and improvements.',
    prerelease: false,
    published_at: '2026-11-01T09:30:00Z'
  });
  assert.strictEqual(release.tag, 'v1.2.3');
  assert.strictEqual(release.name, 'Daymark 1.2.3');
  assert.strictEqual(release.notes, 'Fixes and improvements.');
  assert.strictEqual(release.notesTruncated, false);
  assert.strictEqual(release.prerelease, false);
  assert.strictEqual(release.publishedAt, '2026-11-01T09:30:00Z');
});

test('parseRelease throws when the tag is missing', () => {
  assert.throws(
    () => logic.parseRelease({ html_url: 'https://github.com/a/b/releases/tag/v1' }),
    /tag/
  );
});

test('parseRelease throws on a non-GitHub link', () => {
  assert.throws(
    () => logic.parseRelease({ tag_name: 'v1', html_url: 'https://evil.example/x' }),
    /link/
  );
});

test('parseRelease truncates long notes and flags it', () => {
  const release = logic.parseRelease({
    tag_name: 'v1',
    html_url: 'https://github.com/a/b/releases/tag/v1',
    body: 'x'.repeat(500)
  });
  assert.strictEqual(release.notes.length, logic.MAX_BODY_CHARS);
  assert.strictEqual(release.notesTruncated, true);
});

test('classifyReleaseError explains quota, misses and outages in plain words', () => {
  assert.ok(logic.classifyReleaseError(new Error('HTTP 403')).includes('60 checks per hour'));
  assert.ok(logic.classifyReleaseError(new Error('HTTP 404')).includes('No release found'));
  assert.ok(logic.classifyReleaseError(new Error('HTTP 400')).includes('rejected'));
  assert.ok(logic.classifyReleaseError(new Error('HTTP 502')).includes('server problem'));
  assert.ok(logic.classifyReleaseError(new Error('The release request timed out.')).includes('timed out'));
  assert.strictEqual(logic.classifyReleaseError(new Error('something odd')), null);
});

test('fetchLatestRelease returns a stateless record from the public API', async () => {
  let requested = null;
  const payload = {
    tag_name: 'v1.2.3',
    html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.2.3'
  };
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
  const record = await logic.fetchLatestRelease('octocat/Hello-World', fetchImpl, {
    now: () => '2026-11-13T10:00:00.000Z'
  });
  assert.strictEqual(requested, 'https://api.github.com/repos/octocat/Hello-World/releases/latest');
  assert.strictEqual(record.slug, 'octocat/Hello-World');
  assert.strictEqual(record.release.tag, 'v1.2.3');
  assert.strictEqual(record.fetchedAt, '2026-11-13T10:00:00.000Z');
});
