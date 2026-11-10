'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createStagingPath,
  publishStagedFile,
  cleanupStaging,
} = require('../lib/download-publish');

function makeDownloads(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-download-publish-'));
  const downloads = path.join(root, 'Downloads');
  fs.mkdirSync(downloads);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return downloads;
}

test('completed file is atomically hard-linked into Downloads without exposing a partial final path', (t) => {
  const downloads = makeDownloads(t);
  const finalPath = path.join(downloads, 'report.txt');
  const stagingPath = createStagingPath(downloads, finalPath);
  fs.writeFileSync(stagingPath, 'complete payload');
  const sourceStat = fs.lstatSync(stagingPath);

  assert.equal(publishStagedFile(downloads, stagingPath, finalPath), finalPath);
  assert.equal(fs.readFileSync(finalPath, 'utf8'), 'complete payload');
  const publishedStat = fs.lstatSync(finalPath);
  assert.equal(publishedStat.isFile(), true);
  if (sourceStat.ino && publishedStat.ino) {
    assert.equal(publishedStat.ino, sourceStat.ino, 'published file is the completed staged inode');
    assert.equal(publishedStat.dev, sourceStat.dev);
  }

  cleanupStaging(downloads, stagingPath);
  assert.equal(fs.existsSync(finalPath), true);
  assert.equal(fs.existsSync(path.dirname(stagingPath)), false);
});

test('late destination collision never overwrites an existing file', (t) => {
  const downloads = makeDownloads(t);
  const finalPath = path.join(downloads, 'report.txt');
  fs.writeFileSync(finalPath, 'original');
  const stagingPath = createStagingPath(downloads, finalPath);
  fs.writeFileSync(stagingPath, 'replacement');

  assert.throws(() => publishStagedFile(downloads, stagingPath, finalPath), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(finalPath, 'utf8'), 'original');
  cleanupStaging(downloads, stagingPath);
});

test('staging symlinks and paths outside the selected Downloads directory are rejected', (t) => {
  const downloads = makeDownloads(t);
  const finalPath = path.join(downloads, 'report.txt');
  const stagingPath = createStagingPath(downloads, finalPath);
  const outside = path.join(path.dirname(downloads), 'outside.txt');
  fs.writeFileSync(outside, 'outside');
  try {
    fs.symlinkSync(outside, stagingPath);
  } catch (error) {
    cleanupStaging(downloads, stagingPath);
    t.skip('symlink creation is unavailable on this runner: ' + error.code);
    return;
  }
  assert.throws(() => publishStagedFile(downloads, stagingPath, finalPath), /unsafe-download-staging-file/);
  cleanupStaging(downloads, stagingPath);
  assert.throws(() => createStagingPath(downloads, outside), /unsafe-download-publication-target/);
});

test('cleanup refuses a staging directory outside Downloads', (t) => {
  const downloads = makeDownloads(t);
  const outside = path.join(path.dirname(downloads), '.daymark-download-outside', 'report.txt');
  assert.throws(() => cleanupStaging(downloads, outside), /unsafe-download-staging-cleanup/);
});
