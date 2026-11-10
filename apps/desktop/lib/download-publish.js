'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveDownloadPaths(downloadDirectory, stagingPath, finalPath) {
  if (typeof downloadDirectory !== 'string' || !downloadDirectory.trim()) {
    throw new TypeError('download-directory-required');
  }
  const directory = path.resolve(downloadDirectory);
  const target = path.resolve(finalPath);
  const stage = path.resolve(stagingPath);
  const stageDirectory = path.dirname(stage);
  if (path.dirname(target) !== directory || path.basename(target) !== path.basename(finalPath)) {
    throw new Error('unsafe-download-publication-target');
  }
  if (path.dirname(stageDirectory) !== directory
    || !path.basename(stageDirectory).startsWith('.daymark-download-')
    || path.basename(stage) !== path.basename(target)) {
    throw new Error('unsafe-download-staging-path');
  }
  return { directory, target, stage, stageDirectory };
}

function createStagingPath(downloadDirectory, finalPath, fsImpl = fs) {
  if (typeof downloadDirectory !== 'string' || !downloadDirectory.trim()) {
    throw new TypeError('download-directory-required');
  }
  const directory = path.resolve(downloadDirectory);
  const target = path.resolve(finalPath);
  if (path.dirname(target) !== directory) throw new Error('unsafe-download-publication-target');

  const stageDirectory = fsImpl.mkdtempSync(path.join(directory, '.daymark-download-'));
  try {
    if (process.platform !== 'win32' && typeof fsImpl.chmodSync === 'function') {
      fsImpl.chmodSync(stageDirectory, 0o700);
    }
  } catch (error) {
    try { fsImpl.rmSync(stageDirectory, { recursive: true, force: true }); } catch { /* Best effort. */ }
    throw error;
  }
  return path.join(stageDirectory, path.basename(target));
}

function publishStagedFile(downloadDirectory, stagingPath, finalPath, fsImpl = fs) {
  const paths = resolveDownloadPaths(downloadDirectory, stagingPath, finalPath);
  const directoryStat = fsImpl.lstatSync(paths.stageDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('unsafe-download-staging-directory');
  }
  const stagedStat = fsImpl.lstatSync(paths.stage);
  if (!stagedStat.isFile() || stagedStat.isSymbolicLink()) {
    throw new Error('unsafe-download-staging-file');
  }

  fsImpl.linkSync(paths.stage, paths.target);
  const publishedStat = fsImpl.lstatSync(paths.target);
  if (!publishedStat.isFile() || publishedStat.isSymbolicLink()
    || (stagedStat.ino && publishedStat.ino
      && (stagedStat.ino !== publishedStat.ino || stagedStat.dev !== publishedStat.dev))) {
    throw new Error('download-publication-verification-failed');
  }
  return paths.target;
}

function cleanupStaging(downloadDirectory, stagingPath, fsImpl = fs) {
  if (typeof downloadDirectory !== 'string' || !downloadDirectory.trim()
    || typeof stagingPath !== 'string' || !path.isAbsolute(stagingPath)) {
    throw new TypeError('download-staging-path-required');
  }
  const directory = path.resolve(downloadDirectory);
  const stageDirectory = path.resolve(path.dirname(stagingPath));
  if (path.dirname(stageDirectory) !== directory
    || !path.basename(stageDirectory).startsWith('.daymark-download-')) {
    throw new Error('unsafe-download-staging-cleanup');
  }
  try {
    const stat = fsImpl.lstatSync(stageDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe-download-staging-directory');
    fsImpl.rmSync(stageDirectory, { recursive: true, force: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
}

module.exports = { createStagingPath, publishStagedFile, cleanupStaging };
