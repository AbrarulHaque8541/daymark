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

test('rollback compares file identity when the filesystem device id is zero', () => {
  const downloads = path.join(os.tmpdir(), 'daymark-download-zero-device');
  const stagingDirectory = path.join(downloads, '.daymark-download-zero-device');
  const stagingPath = path.join(stagingDirectory, 'report.txt');
  const finalPath = path.join(downloads, 'report.txt');
  const directoryStat = { isDirectory: () => true, isSymbolicLink: () => false };
  const stagedStat = { isFile: () => true, isSymbolicLink: () => false, dev: 0, ino: 11 };
  const publishedStat = { isFile: () => true, isSymbolicLink: () => false, dev: 0, ino: 22 };
  let targetReads = 0;
  let removed = false;
  const fsImpl = {
    lstatSync(candidate) {
      if (candidate === stagingDirectory) return directoryStat;
      if (candidate === stagingPath) return stagedStat;
      if (candidate === finalPath) {
        targetReads += 1;
        return publishedStat;
      }
      throw new Error('unexpected-path');
    },
    linkSync(source, target) {
      assert.equal(source, stagingPath);
      assert.equal(target, finalPath);
    },
    unlinkSync(target) {
      assert.equal(target, finalPath);
      removed = true;
    }
  };

  assert.throws(() => publishStagedFile(downloads, stagingPath, finalPath, fsImpl),
    /download-publication-verification-failed/);
  assert.equal(targetReads, 2, 'the just-created destination identity is rechecked before rollback');
  assert.equal(removed, true, 'zero is a valid device id when inode identity is available');
});

test('failed post-link verification removes a hard link from a swapped staging directory', {
  skip: process.platform === 'win32',
}, (t) => {
  const downloads = makeDownloads(t);
  const outside = path.join(path.dirname(downloads), 'outside');
  fs.mkdirSync(outside);
  const outsideFile = path.join(outside, 'report.txt');
  fs.writeFileSync(outsideFile, 'outside payload');

  const finalPath = path.join(downloads, 'report.txt');
  const stagingPath = createStagingPath(downloads, finalPath);
  const stagingDirectory = path.dirname(stagingPath);
  fs.writeFileSync(stagingPath, 'expected download payload');

  let swapped = false;
  const fsImpl = Object.create(fs);
  fsImpl.lstatSync = (candidate) => {
    const stat = fs.lstatSync(candidate);
    if (!swapped && candidate === stagingPath) {
      swapped = true;
      fs.renameSync(stagingDirectory, stagingDirectory + '.original');
      fs.symlinkSync(outside, stagingDirectory, 'dir');
    }
    return stat;
  };

  assert.throws(() => publishStagedFile(downloads, stagingPath, finalPath, fsImpl),
    /download-publication-verification-failed/);
  assert.equal(swapped, true, 'the test replaced the staging directory after source validation');
  assert.equal(fs.existsSync(finalPath), false,
    'a failed publication must not leave an unexpected hard link in Downloads');
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'outside payload',
    'the external source file remains untouched');
});

test('cleanup refuses a staging directory outside Downloads', (t) => {
  const downloads = makeDownloads(t);
  const outside = path.join(path.dirname(downloads), '.daymark-download-outside', 'report.txt');
  assert.throws(() => cleanupStaging(downloads, outside), /unsafe-download-staging-cleanup/);
});
