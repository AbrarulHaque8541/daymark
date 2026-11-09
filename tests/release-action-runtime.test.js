const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const PINNED_NODE24_ACTIONS = {
  'actions/checkout': {
    sha: '08c6903cd8c0fde910a37f88322edcfb5dd907a8',
    version: 'v5.0.0'
  },
  'actions/setup-java': {
    sha: 'dded0888837ed1f317902acf8a20df0ad188d165',
    version: 'v5.0.0'
  },
  'android-actions/setup-android': {
    sha: '651bceb6f9ca583f16b8d75b62c36ded2ae6fc9c',
    version: 'v4.0.0'
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
