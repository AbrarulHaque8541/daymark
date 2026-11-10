'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

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
    'android-actions/setup-android'
  ],
  '.github/workflows/android-signed-device-test-release.yml': [
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

function listWorkflowFiles() {
  const directory = path.join(root, '.github', 'workflows');
  return fs.readdirSync(directory)
    .filter((name) => /\.(?:yml|yaml)$/i.test(name))
    .sort()
    .map((name) => ({
      path: '.github/workflows/' + name,
      content: fs.readFileSync(path.join(directory, name), 'utf8')
    }));
}

function hasPullRequestTrigger(content) {
  return /^\s*pull_request(?:_target)?:\s*(?:#.*)?$/m.test(content);
}

test('release and provenance workflows pin Node 24 actions to immutable commits', () => {
  for (const [workflowPath, expectedActions] of Object.entries(WORKFLOWS)) {
    const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
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

test('every pull-request workflow is free of repository secrets and signed Gradle variants', () => {
  const workflows = listWorkflowFiles().filter((item) => hasPullRequestTrigger(item.content));
  assert.ok(workflows.length > 0, 'the repository must retain pull-request CI workflows');
  assert.ok(workflows.some((item) => item.path === '.github/workflows/android-release-assets.yml'),
    'the unsigned Android PR validation workflow must remain registered');

  for (const workflow of workflows) {
    assert.doesNotMatch(workflow.content, /\$\{\{\s*secrets\./,
      workflow.path + ' must not expose repository secrets to pull-request-controlled code');
    assert.doesNotMatch(workflow.content, /\b(?:assemble|bundle)[A-Za-z0-9]*Release\b/,
      workflow.path + ' must not build signed/release Gradle variants');
  }
});

test('Android PR validation is debug-only and signed device-test assets are tag-only', () => {
  const prPath = '.github/workflows/android-release-assets.yml';
  const tagPath = '.github/workflows/android-signed-device-test-release.yml';
  const prWorkflow = fs.readFileSync(path.join(root, prPath), 'utf8');
  const tagWorkflow = fs.readFileSync(path.join(root, tagPath), 'utf8');

  assert.match(prWorkflow, /^\s*pull_request:/m);
  assert.doesNotMatch(prWorkflow, /^\s*push:/m);
  assert.doesNotMatch(prWorkflow, /\$\{\{\s*secrets\./);
  assert.match(prWorkflow, /assembleGithubSideloadDebug/);
  assert.match(prWorkflow, /assemblePlayDebug/);
  assert.doesNotMatch(prWorkflow, /\b(?:assemble|bundle)[A-Za-z0-9]*Release\b/);

  assert.match(tagWorkflow, /^\s*push:/m);
  assert.match(tagWorkflow, /tags:\s*\n\s+- ['"]v\*-device-test\.\*['"]/);
  assert.doesNotMatch(tagWorkflow, /^\s*pull_request:/m);
  assert.doesNotMatch(tagWorkflow, /^\s*workflow_dispatch:/m);
  assert.match(tagWorkflow, /\$\{\{\s*secrets\.KEYSTORE_BASE64\s*\}\}/);
  assert.match(tagWorkflow, /\$\{\{\s*secrets\.KEYSTORE_PASSWORD\s*\}\}/);
  assert.match(tagWorkflow, /\$\{\{\s*secrets\.KEY_ALIAS\s*\}\}/);
  assert.match(tagWorkflow, /\$\{\{\s*secrets\.KEY_PASSWORD\s*\}\}/);
  assert.match(tagWorkflow, /Verify exact tag commit is on main/);
  assert.match(tagWorkflow, /git merge-base --is-ancestor "\$GITHUB_SHA" refs\/remotes\/origin\/main/);
  assert.match(tagWorkflow, /Build and check both signed release flavors/);
  assert.match(tagWorkflow, /assembleGithubSideloadRelease/);
  assert.match(tagWorkflow, /assemblePlayRelease/);
  assert.match(tagWorkflow, /publish-release:/);
  assert.match(tagWorkflow, /if: github\.event_name == 'push' && startsWith\(github\.ref, 'refs\/tags\/'\)/);

  const cleanupTrap = tagWorkflow.indexOf("trap 'rm -f");
  const keystoreDecode = tagWorkflow.indexOf('base64 -d > "$RUNNER_TEMP/release.keystore"');
  assert.ok(cleanupTrap >= 0 && cleanupTrap < keystoreDecode,
    'the EXIT cleanup trap must be installed before keystore decoding can create a partial file');
});

test('production signing workflows run repository tests before accessing signing secrets', () => {
  const paths = [
    '.github/workflows/android-signed-device-test-release.yml',
    '.github/workflows/android-private-main-test-apk.yml',
    '.github/workflows/android-production-release.yml'
  ];
  for (const workflowPath of paths) {
    const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
    const tests = content.indexOf('npm test');
    const secrets = content.indexOf('secrets.KEYSTORE_BASE64');
    assert.ok(tests >= 0, workflowPath + ' must run the repository test suite');
    assert.ok(secrets > tests, workflowPath + ' must complete repository tests before any signing secret is referenced');
  }
});

test('SLSA provenance uploads are restricted to mainline device-test tag pushes', () => {
  const workflowPath = '.github/workflows/generator-generic-ossf-slsa3-publish.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const verificationStart = content.indexOf('      - name: Verify device-test tag is on main');
  const setupJavaStart = content.indexOf('      - name: Set up JDK 17');
  const provenanceStart = content.indexOf('  provenance:');
  assert.ok(verificationStart >= 0 && setupJavaStart > verificationStart,
    'tag ancestry must be verified before building the provenance subject');
  const verification = content.slice(verificationStart, setupJavaStart);
  assert.match(verification, /if: github\.event_name == 'push'/);
  assert.match(verification, /git merge-base --is-ancestor "\$GITHUB_SHA" refs\/remotes\/origin\/main/,
    'a pushed device-test tag must point to a commit reachable from main');

  assert.match(content, /workflow_dispatch:/,
    'manual dispatch remains available for a non-publishing build check');
  const provenance = content.slice(provenanceStart);
  assert.match(provenance, /if: github\.event_name == 'push' && github\.ref_type == 'tag'/,
    'the reusable provenance publisher must be skipped for workflow_dispatch');
  assert.match(provenance, /contents: write/);
  assert.match(provenance, /upload-assets: true/);
});

test('private main test APK remains owner-gated and ciphertext-only', () => {
  const workflowPath = '.github/workflows/android-private-main-test-apk.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const jobStart = content.indexOf('  private-main-test:');
  const runnerStart = content.indexOf('    runs-on:', jobStart);
  assert.ok(jobStart >= 0 && runnerStart > jobStart, 'missing private main test job');
  const guard = content.slice(jobStart, runnerStart);
  assert.match(guard, /github\.repository == 'AbrarulHaque8541\/daymark'/);
  assert.match(guard, /github\.ref == 'refs\/heads\/main'/);
  assert.match(guard, /github\.actor == 'AbrarulHaque8541'/);
  assert.match(guard, /github\.triggering_actor == 'AbrarulHaque8541'/);

  assert.match(content, /on:\s*\n\s+workflow_dispatch:/);
  assert.doesNotMatch(content, /pull_request:/,
    'private signing workflow must not be triggerable by pull requests');
  assert.equal(content.includes('[[ "$AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]]'), true,
    'the one-time age recipient must be validated before any encryption or signing');
  assert.match(content, /age --encrypt --recipient "\$AGE_RECIPIENT"/);

  const uploadStart = content.indexOf('      - name: Upload only the short-lived encrypted transfer');
  const cleanupStart = content.indexOf('      - name: Remove the keystore and local transfer material', uploadStart);
  assert.ok(uploadStart >= 0 && cleanupStart > uploadStart, 'missing encrypted upload/cleanup steps');
  const upload = content.slice(uploadStart, cleanupStart);
  assert.match(upload, /path:.*\.apk\.age/);
  assert.match(upload, /retention-days: 1/);
  assert.doesNotMatch(upload, /app-githubSideload-release\.apk/,
    'the plaintext production APK must never be uploaded by the private workflow');

  assert.match(content, /rm -f "\$RUNNER_TEMP\/daymark-release\.keystore"/);
  assert.match(content, /rm -rf "\$GITHUB_WORKSPACE\/android-app\/app\/build"/);
  assert.match(content, /rm -rf "\$RUNNER_TEMP\/daymark-private-gradle" "\$RUNNER_TEMP\/private-test-transfer"/);
  assert.doesNotMatch(content, /id-token:\s*write/,
    'private APK transfer does not need an OIDC provenance token');
});
