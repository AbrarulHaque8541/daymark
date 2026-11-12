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
  },
  'actions/attest': {
    sha: '1e69f48acb82d1966a394da916b4c1698aa569d6',
    version: 'v4.2.2 (Node 24)'
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
    'actions/download-artifact',
    'actions/attest'
  ],
  '.github/workflows/android-production-release.yml': [
    'actions/checkout',
    'actions/setup-java',
    'android-actions/setup-android',
    'actions/upload-artifact'
  ],
  '.github/workflows/device-test-apk-manual-build.yml': [
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

function stripYamlComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && line[index + 1] === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed[0] === "'" && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

function scanFlowState(value) {
  const stack = [];
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && value[index + 1] === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') stack.push(character);
    else if (character === ']' || character === '}') {
      const expected = character === ']' ? '[' : '{';
      if (stack.pop() !== expected) throw new Error('Malformed flow-style workflow trigger.');
    }
  }
  return { stack, quote };
}

function splitFlowEntries(value) {
  const entries = [];
  let start = 0;
  const stack = [];
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && value[index + 1] === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') stack.push(character);
    else if (character === ']' || character === '}') stack.pop();
    else if (character === ',' && stack.length === 0) {
      entries.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) entries.push(tail);
  return entries;
}

function findFlowColon(value) {
  const stack = [];
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote === "'") {
      if (character === "'" && value[index + 1] === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') stack.push(character);
    else if (character === ']' || character === '}') stack.pop();
    else if (character === ':' && stack.length === 0) return index;
  }
  return -1;
}

function hasPullRequestTrigger(content) {
  const lines = String(content).split(/\r?\n/);
  const rootOnLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index]);
    const match = line.match(/^(?:on|['"]on['"])\s*:(.*)$/);
    if (match) rootOnLines.push({ index, value: match[1].trim() });
  }
  if (rootOnLines.length === 0) return false;
  if (rootOnLines.length !== 1) throw new Error('Duplicate top-level on key in workflow.');
  const root = rootOnLines[0];
  const isPullRequest = (name) => name === 'pull_request' || name === 'pull_request_target';

  if (root.value.startsWith('[') || root.value.startsWith('{')) {
    let flow = root.value;
    let state = scanFlowState(flow);
    for (let index = root.index + 1; state.stack.length > 0 && index < lines.length; index += 1) {
      flow += '\n' + stripYamlComment(lines[index]);
      state = scanFlowState(flow);
    }
    if (state.stack.length > 0 || state.quote) {
      throw new Error('Unterminated flow-style workflow trigger.');
    }
    const trimmed = flow.trim();
    const opening = trimmed[0];
    const closing = opening === '[' ? ']' : '}';
    if (!trimmed.endsWith(closing)) throw new Error('Malformed flow-style workflow trigger.');
    const entries = splitFlowEntries(trimmed.slice(1, -1));
    if (opening === '[') {
      return entries.some((entry) => isPullRequest(unquoteYamlScalar(entry)));
    }
    return entries.some((entry) => {
      const colon = findFlowColon(entry);
      if (colon < 0) throw new Error('Malformed flow-style workflow event mapping.');
      return isPullRequest(unquoteYamlScalar(entry.slice(0, colon)));
    });
  }

  if (root.value) {
    const scalar = unquoteYamlScalar(root.value);
    if (!/^[A-Za-z0-9_-]+$/.test(scalar)) {
      throw new Error('Unsupported top-level on syntax; refusing to skip workflow trigger inspection.');
    }
    return isPullRequest(scalar);
  }

  let directIndent = null;
  let found = false;
  for (let index = root.index + 1; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index]);
    if (!line.trim()) continue;
    const indentation = line.match(/^\s*/)[0].length;
    if (indentation === 0) break;
    if (directIndent === null) directIndent = indentation;
    if (indentation < directIndent) break;
    if (indentation !== directIndent) continue;
    const item = line.trim();
    if (item.startsWith('-')) {
      if (isPullRequest(unquoteYamlScalar(item.slice(1)))) found = true;
      continue;
    }
    const key = item.match(/^([A-Za-z0-9_-]+|'(?:[^']|'')+'|"(?:[^"]|\\")+")\s*:/);
    if (key && isPullRequest(unquoteYamlScalar(key[1]))) found = true;
  }
  return found;
}
test('PR trigger detection recognizes block, sequence and flow-style YAML declarations', () => {
  assert.equal(hasPullRequestTrigger('on:\n  pull_request:\n    branches: [main]\n'), true);
  assert.equal(hasPullRequestTrigger('on:\n  pull_request_target:\n    types: [opened]\n'), true);
  assert.equal(hasPullRequestTrigger('on:\n  - push\n  - pull_request\n'), true);
  assert.equal(hasPullRequestTrigger('on: [push, pull_request]'), true);
  assert.equal(hasPullRequestTrigger('on: [push, "pull_request_target"]'), true);
  assert.equal(hasPullRequestTrigger('on: { push: {}, pull_request: { types: [opened] } }'), true);
  assert.equal(hasPullRequestTrigger('on: {\n  workflow_dispatch: {},\n  pull_request_target: { types: [opened] }\n}'), true);
  assert.equal(hasPullRequestTrigger('"on": [push, pull_request]'), true);
  assert.equal(hasPullRequestTrigger('on: workflow_dispatch'), false);
  assert.equal(hasPullRequestTrigger('on: [push, workflow_dispatch]'), false);
  assert.equal(hasPullRequestTrigger('# on: [pull_request]\non:\n  push:\n    branches: [main]\n'), false);
});

test('PR trigger detection fails closed for ambiguous or unsupported YAML declarations', () => {
  assert.throws(() => hasPullRequestTrigger('on: *shared-events'), /Unsupported top-level on syntax/);
  assert.throws(() => hasPullRequestTrigger('on: [pull_request'), /Unterminated flow-style workflow trigger/);
  assert.throws(() => hasPullRequestTrigger('on:\n  push:\non:\n  pull_request:\n'), /Duplicate top-level on key/);
});

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
  const releaseDownloadCurlLines = tagWorkflow.split(String.fromCharCode(10))
    .filter(line => line.includes('curl '));
  assert.equal(releaseDownloadCurlLines.length, 2,
    'the signed release workflow must keep exactly its two public-asset download verification calls');
  for (const line of releaseDownloadCurlLines) {
    assert.ok(line.includes("--proto '=https' --proto-redir '=https' --tlsv1.2"),
      'every release asset download must constrain initial and redirected protocols to HTTPS');
  }
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

test('device-test provenance is generated only for verified production-signed release tags', () => {
  const workflowPath = '.github/workflows/android-signed-device-test-release.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const manualPath = '.github/workflows/device-test-apk-manual-build.yml';
  const manual = fs.readFileSync(path.join(root, manualPath), 'utf8');
  const verificationStart = content.indexOf('      - name: Verify exact tag commit is on main');
  const releaseBuildStart = content.indexOf('      - name: Build and check both signed release flavors');
  const payloadStart = content.indexOf('      - name: Verify APK and prepare release payload');
  const releaseAssetVerification = content.indexOf('      - name: Verify uploaded Release asset and browser download');
  const attestationStart = content.indexOf('      - name: Generate provenance for the exact signed APK');
  assert.ok(verificationStart >= 0 && releaseBuildStart > verificationStart
    && payloadStart > releaseBuildStart && releaseAssetVerification > payloadStart
    && attestationStart > releaseAssetVerification,
  'the tag must be verified before signing, payload validation and provenance generation');
  const verification = content.slice(verificationStart, releaseBuildStart);
  assert.match(verification, /git tag --points-at HEAD/,
    'the checked-out commit must be the exact pushed tag');
  assert.match(verification, /git merge-base --is-ancestor "\$GITHUB_SHA" refs\/remotes\/origin\/main/,
    'a pushed device-test tag must point to a commit reachable from main');
  assert.match(content, /assembleGithubSideloadRelease/);
  assert.match(content, /app-githubSideload-release\.apk/);
  assert.match(content, /Daymark-device-test-\$\{tag\}\.apk/);

  assert.match(manual, /^on:\s*\n\s+workflow_dispatch:/m,
    'manual dispatch remains available for a non-publishing build check');
  assert.doesNotMatch(manual, /^\s+(?:push|pull_request):/m);
  assert.match(manual, /assembleGithubSideloadDebug/);
  assert.doesNotMatch(manual, /actions\/attest|attestations:\s*write|id-token:\s*write|contents:\s*write|gh release/,
    'manual dispatch must remain build-only with no provenance or release-write permission');
  assert.equal(fs.existsSync(path.join(root,
    '.github/workflows/generator-generic-ossf-slsa3-publish.yml')), false,
  'the obsolete generic generator workflow must be removed');
});

test('native attestation binds the signed APK and publishes a verified non-overwriting bundle', () => {
  const workflowPath = '.github/workflows/android-signed-device-test-release.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const publishStart = content.indexOf('  publish-release:');
  assert.ok(publishStart >= 0, 'missing owner-gated release publisher');
  const publish = content.slice(publishStart);
  const attestationStart = publish.indexOf('      - name: Generate provenance for the exact signed APK');
  const uploadStart = publish.indexOf('      - name: Publish and independently verify the provenance bundle');
  assert.ok(attestationStart >= 0 && uploadStart > attestationStart,
    'the attestation must be generated before its release bundle is published');
  const attestation = publish.slice(attestationStart, uploadStart);
  assert.match(attestation, /uses: actions\/attest@1e69f48acb82d1966a394da916b4c1698aa569d6/);
  assert.match(attestation, /v4\.2\.2 \(Node 24\)/);
  assert.match(attestation, /subject-path: \$\{\{ steps\.payload\.outputs\.apk_path \}\}/,
    'attestation must use the exact payload already hashed and verified for release');
  assert.doesNotMatch(attestation, /app-githubSideload-debug\.apk/);

  assert.match(publish, /attestations: write/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /environment: production-signing/);
  assert.match(publish, /github\.actor == 'AbrarulHaque8541' && github\.triggering_actor == 'AbrarulHaque8541'/);
  assert.match(publish, /bundle_name="\$\{APK_NAME\}\.sigstore\.json"/);
  assert.match(publish, /gh release upload "\$TAG" "\$bundle_source"/);
  assert.doesNotMatch(publish, /gh release upload[^\n]*--clobber/,
    'a retry must never overwrite a release provenance bundle');
  assert.match(publish, /gh attestation verify "\$APK_PATH"/);
  assert.match(publish, /--bundle "\$downloaded_bundle"/);
  assert.match(publish, /--signer-workflow "\$SIGNER_WORKFLOW"/);
  assert.match(publish, /--source-ref "\$GITHUB_REF"/);
  assert.match(publish, /gh attestation verify "\$APK_PATH"[\s\S]*?api_verified=true/,
    'both the release bundle and GitHub-hosted attestation record must verify');
  assert.match(publish, /Preflight an existing release provenance bundle[\s\S]*?refusing to overwrite it/,
    'an existing bundle must be downloaded and verified, not replaced');
});

test('final release APK is re-downloaded and digest-checked after provenance verification', () => {
  const workflowPath = '.github/workflows/android-signed-device-test-release.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  const publish = content.slice(content.indexOf('  publish-release:'));
  const finalCheckStart = publish.indexOf('      - name: Re-download and verify the final release APK after provenance');
  assert.ok(finalCheckStart > publish.indexOf('api_verified=true'),
    'the final release APK check must run after bundle and hosted-attestation verification');
  const finalCheck = publish.slice(finalCheckStart);
  assert.match(finalCheck, /gh api "repos\/\$GITHUB_REPOSITORY\/releases\/tags\/\$TAG"/);
  assert.match(finalCheck, /\.prerelease == true/);
  assert.match(finalCheck, /asset_state.*uploaded/);
  assert.match(finalCheck, /"\$asset_size" == "\$EXPECTED_SIZE"/);
  assert.match(finalCheck, /\[\[ "\$asset_url" == "\$expected_asset_url" \]\]/);
  assert.ok(finalCheck.includes("curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location --retry 3 --retry-delay 2"),
    'the check must download the public release asset again after provenance publication with HTTPS-only redirects');
  assert.match(finalCheck, /downloaded_size.*EXPECTED_SIZE/);
  assert.match(finalCheck, /sha256sum "\$final_apk"/);
  assert.match(finalCheck, /\[\[ "\$downloaded_sha256" == "\$EXPECTED_SHA256" \]\]/);
  assert.match(finalCheck, /cmp -s "\$APK_PATH" "\$final_apk"/,
    'the final downloaded release asset must be identical to the attested subject');
});


test('release source guard enforces HTTPS-only redirects for both public APK downloads', () => {
  const guard = fs.readFileSync(path.join(root, 'android-app/tools/check-slsa-workflow.py'), 'utf8');
  assert.ok(guard.includes('release_download_curl_lines = ['));
  assert.ok(guard.includes("--proto '=https' --proto-redir '=https' --tlsv1.2"));
  assert.ok(guard.includes('both public release APK downloads must restrict initial and redirected protocols to HTTPS'));
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

test('every privileged signing and provenance job requires the production-signing environment', () => {
  const cases = [
    ['.github/workflows/android-production-release.yml', 'build-verify-draft'],
    ['.github/workflows/android-signed-device-test-release.yml', 'build-and-verify'],
    ['.github/workflows/android-signed-device-test-release.yml', 'publish-release'],
    ['.github/workflows/android-private-main-test-apk.yml', 'private-main-test']
  ];

  for (const [workflowPath, jobName] of cases) {
    const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
    const header = `  ${jobName}:`;
    const start = content.indexOf(header);
    assert.ok(start >= 0, workflowPath + ' is missing job ' + jobName);
    const nextJobPattern = /^  [a-z][a-z0-9-]*:/gm;
    nextJobPattern.lastIndex = start + header.length;
    const nextJob = nextJobPattern.exec(content);
    const block = content.slice(start, nextJob ? nextJob.index : content.length);
    assert.match(block, /^    environment: production-signing$/m,
      workflowPath + ' job ' + jobName + ' must wait for the protected environment');
  }
});

test('production release signing is tag-push-only and cannot be manually dispatched', () => {
  const workflowPath = '.github/workflows/android-production-release.yml';
  const content = fs.readFileSync(path.join(root, workflowPath), 'utf8');
  assert.match(content, /^on:\s*\n\s+push:/m);
  assert.match(content, /tags:\s*\['v\*'\]/);
  assert.doesNotMatch(content, /^\s+workflow_dispatch:/m);
  const jobStart = content.indexOf('  build-verify-draft:');
  const runnerStart = content.indexOf('    runs-on:', jobStart);
  assert.ok(jobStart >= 0 && runnerStart > jobStart, 'missing production release job');
  const guard = content.slice(jobStart, runnerStart);
  assert.match(guard, /github\.repository == 'AbrarulHaque8541\/daymark'/);
  assert.match(guard, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(guard, /github\.actor == 'AbrarulHaque8541'/);
  assert.match(guard, /github\.triggering_actor == 'AbrarulHaque8541'/);
});
