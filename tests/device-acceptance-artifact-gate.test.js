"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "android-device-acceptance.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const owner = "AbrarulHaque8541";

const dispatchStart = workflow.indexOf("  workflow_dispatch:\n");
const pullRequestStart = workflow.indexOf("  pull_request:", dispatchStart);
assert.notEqual(dispatchStart, -1, "manual dispatch trigger must remain present");
assert.notEqual(pullRequestStart, -1, "pull-request trigger must remain present");
const dispatchBlock = workflow.slice(dispatchStart, pullRequestStart);

const jobsStart = workflow.indexOf("\njobs:\n");
const buildStart = workflow.indexOf("\n  build:\n", jobsStart);
assert.notEqual(jobsStart, -1, "workflow jobs section must remain present");
assert.notEqual(buildStart, -1, "device-acceptance build job must remain present");
const buildJob = workflow.slice(buildStart + 1);
const conditionHeader = "    if: >-\n";
const conditionStart = buildJob.indexOf(conditionHeader);
const runsOnStart = buildJob.indexOf("    runs-on:", conditionStart);
assert.notEqual(conditionStart, -1, "APK-producing job must have a job-level condition");
assert.notEqual(runsOnStart, -1, "job condition must precede the runner and all steps");
const actualCondition = buildJob
  .slice(conditionStart + conditionHeader.length, runsOnStart)
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join(" ")
  .replace(/\s+/g, " ");
const expectedCondition =
  "${{ github.event_name == 'workflow_dispatch' && " +
  `github.actor == '${owner}' && ` +
  "inputs.request_test_apk == true }}";

function shouldRunArtifactJob(eventName, actor, requestTestApk) {
  // Mirror the workflow expression exactly; this function never dispatches CI.
  return eventName === "workflow_dispatch" && actor === owner && requestTestApk === true;
}

test("device-acceptance APK artifact job is statically gated before build and upload", () => {
  assert.match(dispatchBlock, /^  workflow_dispatch:\n/m);
  assert.match(dispatchBlock, /^      request_test_apk:\s*$/m);
  assert.match(dispatchBlock, /^        type: boolean\s*$/m);
  assert.match(dispatchBlock, /^        required: true\s*$/m);
  assert.match(dispatchBlock, /^        default: false\s*$/m);
  assert.equal(actualCondition, expectedCondition);
  assert.match(buildJob, /Pull requests \(including forks\) always skip it\./);
  assert.match(buildJob, /Manual dispatch is owner-only and requires the explicit, default-false input\./);
  assert.match(buildJob, /name: Build sideload debug APK and compile instrumentation sources/);
  assert.match(buildJob, /name: Upload non-production APK and exact build metadata/);
  assert.equal((workflow.match(/uses: actions\/upload-artifact@v4/g) || []).length, 1);
});

test("all pull-request events skip the artifact job, including fork PRs", () => {
  const pullRequestCases = [
    ["same-repository PR with owner actor and true input", owner, true],
    ["fork PR with a fork actor and true input", "fork-contributor", true],
    ["fork PR with another actor and no input", "outside-collaborator", undefined],
  ];
  for (const [label, actor, input] of pullRequestCases) {
    assert.equal(shouldRunArtifactJob("pull_request", actor, input), false, label);
  }
});

test("manual dispatch requires the owner actor and explicit true opt-in", () => {
  const dispatchCases = [
    ["owner omitted/default-false input", owner, undefined, false],
    ["owner explicit false input", owner, false, false],
    ["other actor explicit true input", "fork-contributor", true, false],
    ["owner explicit true input", owner, true, true],
  ];
  for (const [label, actor, input, expected] of dispatchCases) {
    assert.equal(shouldRunArtifactJob("workflow_dispatch", actor, input), expected, label);
  }
  assert.equal(shouldRunArtifactJob("push", owner, true), false, "non-dispatch event must not run the artifact job");
});
