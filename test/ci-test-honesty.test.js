"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const guard = path.join(root, "android-app", "tools", "check-ci-test-honesty.py");
const python = process.platform === "win32" ? "python" : "python3";

const cleanWorkflows = {
  ".github/workflows/android.yml": "run: sh ./tools/check-v1-source.sh\n",
  ".github/workflows/android-production-release.yml":
    "run: sh ./tools/check-v1-source.sh\nKEYSTORE_BASE64: configured-secret\n",
  ".github/workflows/android-release-assets.yml": "run: npm test\n",
};

function runGuard(overrides = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "daymark-ci-honesty-"));
  try {
    for (const [relativePath, content] of Object.entries({
      ...cleanWorkflows,
      ...overrides,
    })) {
      const target = path.join(fixture, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    }
    return spawnSync(python, [guard, fixture], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    });
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

test("CI honesty guard accepts workflows with real host checks and no vacuous unit tasks", () => {
  const result = runGuard();
  assert.equal(result.status, 0,
    `guard rejected a valid workflow set (status=${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`);
  assert.match(result.stdout, /PASS ci-test-honesty:/);
});

test("CI honesty guard rejects vacuous Gradle unit-test tasks in any workflow", () => {
  const result = runGuard({
    ".github/workflows/android-release-assets.yml":
      "run: ./gradlew testGithubSideloadReleaseUnitTest\n",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /android-release-assets\.yml:1: vacuous unit-test task reference/);
});

test("CI honesty guard requires main host checks and production checks before signing", () => {
  const result = runGuard({
    ".github/workflows/android.yml": "run: npm test\n",
    ".github/workflows/android-production-release.yml":
      "KEYSTORE_BASE64: configured-secret\nrun: sh ./tools/check-v1-source.sh\n",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /android-production-release\.yml: source checks must run BEFORE keystore restore.*signing/);
  assert.match(result.stderr, /android\.yml: missing check-v1-source\.sh host regression checks/);
});

// Keep mutation cases isolated so failures identify the exact CI policy regression.
