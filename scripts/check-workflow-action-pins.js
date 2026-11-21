'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_PATTERN = /\.(?:yml|yaml)$/;
const USES_LINE = /^\s*(?:-\s*)?uses\s*:\s*(.*?)\s*$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const IMAGE_DIGEST = /@sha256:[0-9a-f]{64}$/;

function unquote(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] &&
      (value[0] === '"' || value[0] === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function scanWorkflowText(contents, file = '<workflow>') {
  const violations = [];
  let references = 0;
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(USES_LINE);
    if (!match) continue;

    const reference = unquote(match[1].replace(/\s+#.*$/, '').trim());
    if (!reference) {
      violations.push({ file, line: index + 1, reference, message: 'uses reference must not be empty' });
      continue;
    }
    if (reference.startsWith('./') || reference.startsWith('../')) continue;
    references += 1;

    const pinned = reference.startsWith('docker://')
      ? IMAGE_DIGEST.test(reference)
      : COMMIT_SHA.test(reference.slice(reference.lastIndexOf('@') + 1)) && reference.includes('@');
    if (!pinned) {
      violations.push({
        file,
        line: index + 1,
        reference,
        message: 'external uses reference must end in a full immutable commit SHA (or container SHA-256 digest)',
      });
    }
  }

  return { references, violations };
}

function scanWorkflowDirectory(directory) {
  const resolvedDirectory = path.resolve(directory);
  if (!fs.existsSync(resolvedDirectory) || !fs.statSync(resolvedDirectory).isDirectory()) {
    throw new Error(`Workflow directory does not exist: ${resolvedDirectory}`);
  }

  const files = fs.readdirSync(resolvedDirectory)
    .filter((name) => WORKFLOW_PATTERN.test(name))
    .sort();
  if (files.length === 0) throw new Error(`No workflow files found in ${resolvedDirectory}`);

  let references = 0;
  const violations = [];
  for (const name of files) {
    const result = scanWorkflowText(fs.readFileSync(path.join(resolvedDirectory, name), 'utf8'), name);
    references += result.references;
    violations.push(...result.violations);
  }
  return { files: files.length, references, violations };
}

function main() {
  const directory = process.argv[2] || path.resolve(__dirname, '../.github/workflows');
  let result;
  try {
    result = scanWorkflowDirectory(directory);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      console.error(`${violation.file}:${violation.line}: ${violation.message}: ${violation.reference}`);
    }
    console.error(`FAIL: ${result.violations.length} unpinned reference(s) across ${result.files} workflow file(s).`);
    return 1;
  }

  console.log(`PASS: all ${result.references} external action reference(s) across ${result.files} workflow file(s) use immutable pins.`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { scanWorkflowText, scanWorkflowDirectory };
