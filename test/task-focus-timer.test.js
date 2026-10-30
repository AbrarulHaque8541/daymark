"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

test("Android task focus timer state engine", () => {
  const root = path.resolve(__dirname, "..");
  const runner = path.join(root, "android-app", "tools", "run-focus-timer-tests.sh");
  const result = spawnSync("sh", [runner], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(
    result.status,
    0,
    `focus timer host test failed (status=${result.status})\n${result.stdout || ""}\n${result.stderr || ""}`
  );
  assert.match(result.stdout, /PASS task focus timer smoke tests:/);
});
