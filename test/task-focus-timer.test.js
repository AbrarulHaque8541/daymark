"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

test("Android task focus timer state engine", () => {
  const root = path.resolve(__dirname, "..");
  const runner = "android-app/tools/run-focus-timer-tests.sh";
  const result = spawnSync(process.platform === "win32" ? "bash" : "sh", [runner], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    `focus timer host test failed (status=${result.status}, signal=${result.signal || "none"}, error=${result.error ? `${result.error.code || "spawn-error"}: ${result.error.message}` : "none"})\n${result.stdout || ""}\n${result.stderr || ""}`
  );
  assert.match(result.stdout, /PASS task focus timer smoke tests:/);
});
