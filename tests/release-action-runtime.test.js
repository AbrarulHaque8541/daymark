const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const PINNED_NODE24_ACTIONS = {
  'actions/checkout': {
    sha: '9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
    version: 'v7.0.0'
  },
  'actions/setup-java': {
    sha: 'dd06d9cba3e5552c54d9f8ea23572deb30010f7c',
    version: 'v6.0.0'
  },
  'android-actions/setup-android': {
    sha: 'be39fa834029ff78f1a44aa3bb0819b8fc2bd8fd',
    version: 'v4.0.4'
  },
  'actions/upload-artifact': {
    sha: 'b7c566a772e6b6bfb58ed0dc250532a479d7789f',
    version: 'v6.0.0'
  },
  'actions/download-artifact': {
    sha: '37930b1c2abaa49bbe596cd826c3c89aef350131',
    version: 'v7.0.0'
  }
};

const WORKFLOWS = {
  '.github/workflows/android-release-assets.yml': [
    'actions/checkout',
    'actions/setup-java',
    'android-actions/setup-android',
    'actions/upload-artifact',
    'actions/download-artifact'
  ],
  '.github/workflows/android-production-release.yml': [
    'actions/checkout',
    'actions/setup-java',
    'android-actions/setup-android',
    'actions/upload-artifact'
  ],
  '.github/workflows/generator-generic-ossf-slsa3-publish.yml': [
    'actions/checkout',
    'actions/setup-java'
  ],
  '.github/workflows/android-private-main-test-apk.yml': [
    'actions/upload-artifact'
  ]
};

test('release and provenance build workflows pin Node 24 actions to immutable commits', () => {
  for (const [workflowPath, expectedActions] of Object.entries(WORKFLOWS)) {
    const content = fs.readFileSync(path.join(__dirname, '..', workflowPath), 'utf8');
    const uses = content.split(/\r?\n/)
      .map((line) => line.match(/^\s*uses:\s*([^\s#]+)(?:\s+#\s*(.*))?$/))
      .filter(Boolean)
      .map((match) => ({ reference: match[1], comment: match[2] || '' }));

    for (const actionName of expectedActions) {
      const matches = uses.filter((item) => item.reference.startsWith(actionName + '@'));
      assert.equal(matches.length, 1, workflowPath + ' must use ' + actionName + ' exactly once');
      const expected = PINNED_NODE24_ACTIONS[actionName];
      assert.match(expected.sha, /^[a-f0-9]{40}$/, actionName + ' pin must be a full immutable commit SHA');
      assert.equal(matches[0].reference, actionName + '@' + expected.sha,
        workflowPath + ' must pin ' + actionName + ' to ' + expected.version);
      assert.equal(matches[0].comment, expected.version,
        workflowPath + ' must document the pinned release version');
    }
  }
});


test('pull-request device-test builds never receive production signing secrets', () => {
  const workflowPath = '.github/workflows/android-release-assets.yml';
  const content = fs.readFileSync(path.join(__dirname, '..', workflowPath), 'utf8');
  const lines = content.split(/\r?\n/);

  function stepBlock(name) {
    const start = lines.findIndex((line) => line.trim() === '- name: ' + name);
    assert.equal(start >= 0, true, 'missing workflow step: ' + name);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^      - name: /.test(lines[index])) {
        end = index;
        break;
      }
    }
    return { start, end, text: lines.slice(start, end).join('\n') };
  }

  const validation = stepBlock('Validate required release secrets');
  const debug = stepBlock('Build and check both unsigned debug flavors');
  const signed = stepBlock('Build and check both signed release flavors');

  assert.match(validation.text, /if: github.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
  assert.match(debug.text, /if: \$\{\{ github\.event_name != 'push' \|\| !startsWith\(github\.ref, 'refs\/tags\/'\) \}\}/);
  assert.equal(debug.text.includes('secrets.'), false,
    'the pull-request debug step must not receive production secrets');
  assert.match(debug.text, /assembleGithubSideloadDebug/);
  assert.match(debug.text, /assemblePlayDebug/);

  assert.match(signed.text, /if: \$\{\{ github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\) \}\}/);
  assert.equal(signed.text.includes('secrets.KEYSTORE_BASE64'), true);
  assert.match(signed.text, /trap .*release\.keystore.* EXIT/);
  const cleanupTrap = signed.text.indexOf("trap 'rm -f");
  const keystoreDecode = signed.text.indexOf('base64 -d > "$RUNNER_TEMP/release.keystore"');
  assert.ok(cleanupTrap >= 0 && cleanupTrap < keystoreDecode,
    'the EXIT cleanup trap must be installed before keystore decoding can create a partial file');
  assert.match(signed.text, /assembleGithubSideloadRelease/);
  assert.match(signed.text, /assemblePlayRelease/);

  const allowedSecretBlocks = new Set();
  for (let index = validation.start; index < validation.end; index += 1) allowedSecretBlocks.add(index);
  for (let index = signed.start; index < signed.end; index += 1) allowedSecretBlocks.add(index);
  const secretLines = lines.map((line, index) => line.includes('${{ secrets.') ? index : -1).filter((index) => index >= 0);
  assert.equal(secretLines.length, 8, 'only the two tag-gated steps may reference the four signing secrets');
  for (const index of secretLines) {
    assert.equal(allowedSecretBlocks.has(index), true,
      'signing secret reference outside a tag-gated step at line ' + (index + 1));
  }

  const publishStart = lines.findIndex((line) => line.trim() === 'publish-release:');
  assert.equal(publishStart >= 0, true, 'missing publish-release job');
  assert.match(lines.slice(publishStart, publishStart + 8).join('\n'),
    /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);
});
