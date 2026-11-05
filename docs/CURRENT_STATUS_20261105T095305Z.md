# Daymark engineering status — 2026-11-05T09:53:05Z (repository and CI postmortem)

## Current project state

- Live `main`: `afb2103cf4c7906b161d5e9e479441f9dd90b1f1` (PR #542 merge commit).
- Source version: `1.6`, version code 13. Latest published release remains `v1.5` (2026-10-23); no release was created in this work.
- One open PR at verification: [#561, “Allow changing Focus task while timer is paused”](https://github.com/AbrarulHaque8541/daymark/pull/561), head `378e67d40b44a99cbdc8dc16ad72af170d14e545`, based on this `main`. It touches `MainActivity.java` and its focus-timer UI guard; its API 29/API 36 and other checks were still running. Do not edit that shared Activity until the PR lands or is otherwise coordinated.
- GitHub currently lists issues [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) and [#222](https://github.com/AbrarulHaque8541/daymark/issues/222) as closed. Closure is not physical-device acceptance evidence.

## What caused repeated Android/device CI failures

The “device test” reports grouped together two different workflows and two different root causes. Neither should be fixed by weakening checks or by forcing a green status.

### Emulator instrumentation: a real keyboard-layout bug plus a brittle locator

On PR #542’s earlier heads, the emulator installed the APK and launched instrumentation; this was not an emulator boot or Gradle-build failure. API 29 and API 36 runs then failed inside the real Add Task dialog checks. Early assertions found dialog Cancel/Add Task actions missing or with no visible touch target. Later diagnostics exposed two cases: a system `CANCEL` label did not match the test’s case-sensitive `Cancel` lookup, and on API 36 the dialog button could sit below the screen with the keyboard open. For example, run [41993296249](https://github.com/AbrarulHaque8541/daymark/actions/runs/41993296249) recorded the off-screen API 36 action; runs [41984745160](https://github.com/AbrarulHaque8541/daymark/actions/runs/41984745160) and [41985318128](https://github.com/AbrarulHaque8541/daymark/actions/runs/41985318128) repeatedly failed the visible-touch-target assertion. Several later runs were cancelled after instrumentation had already reported these failures; those cancellations are not proof of emulator infrastructure failure.

The production fix in PR [#542](https://github.com/AbrarulHaque8541/daymark/pull/542) applies inset/decor fitting and `ADJUST_RESIZE` only to the task-editor dialog before it is shown, while preserving Activity edge-to-edge behavior. Instrumentation now trims and compares stock dialog labels case-insensitively; it still requires visible/tappable controls, checks IME overlap where a software keyboard window is available, exercises cancel/save, and cleans up its fixture. The runner captures phase diagnostics and caps a hung instrumentation invocation at five minutes instead of consuming the full workflow timeout.

On exact PR head `e946612b496a7be994b3ec2d627d675181f3836e`, [run 42003226262](https://github.com/AbrarulHaque8541/daymark/actions/runs/42003226262) passed the complete API 29 and API 36 matrix: 241 and 244 assertions respectively; both reported `result=passed` and `main_activity_tabs_transition=passed`. The repository owner merged it as `afb2103cf4c7906b161d5e9e479441f9dd90b1f1`. The merge commit itself subsequently passed [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/42004021054) and [Ubuntu/Windows shared contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42004021070).

### Device-test APK/artifact builds: a bad source commit was correctly stopped early

Two separate artifact workflows failed at PR head `ddf5a9426e36da69ef686b41e34dc6ad0114c662` before APK compilation or upload: [acceptance APK run 41982144022](https://github.com/AbrarulHaque8541/daymark/actions/runs/41982144022) and [device-test release-assets run 41982144018](https://github.com/AbrarulHaque8541/daymark/actions/runs/41982144018). In that commit, `DaymarkPlatformInstrumentation.java` was only 74 bytes and literally contained `PLACEHOLDER_FOR_FULL_CONTENT_FROM_/tmp/DaymarkPlatformInstrumentation.java`. The existing package-identity/source guard rejected it before build, so these were incomplete-source failures—not emulator assertions, artifact-upload failures, or broken workflow configuration. The correct response was to restore the full instrumentation source, not bypass the guard. On PR #542’s complete tested head, [acceptance APK run 42003226282](https://github.com/AbrarulHaque8541/daymark/actions/runs/42003226282) and [device-test APK run 42003226358](https://github.com/AbrarulHaque8541/daymark/actions/runs/42003226358) both passed build/verification; the release-publication job was correctly skipped for a PR.

These changes address the observed causes and add faster diagnostic bounds, but no CI setup can promise every future run will always pass: a genuine future product regression should still fail. The 5-minute bound is for the instrumentation command after emulator provisioning; it does not shorten the matrix’s overall 60-minute job timeout.

## Other validation and evidence limits

- Local checks on the tested PR head: `npm test` **315/315 PASS**; Android source guards **PASS**; runner shell syntax/executable bit and `git diff --check` **PASS**.
- Physical-device acceptance: **NOT TESTED** in this review. API 29/36 CI emulator success is not represented as owner-device acceptance. Software-keyboard viewport assertions may be reported as not testable if a runner does not expose a software IME window; the other strict dialog and persistence assertions remain active.
- No production tag, signed APK/AAB, or GitHub release was created.

## Remote branch review

The inventory in [the branch audit](/workspace/daymark-remote-branch-audit.md) was measured against then-current baseline `c74b2df9e886d15618529e3158541ef9de4b17a1`, before PRs #559, #560 and #542: 447 remote refs, 96 already merged/redundant, 351 then containing commits not in main, and 287 merge-tree simulations reporting textual conflicts. A clean textual merge simulation is not proof that code is safe.

Seventeen selected lower-conflict candidates received independent deeper review; none was safe to merge as-is. Feed URL preferences, browser loading progress and card press feedback were hold-for-focused-port ideas only; the others were duplicates, stale/mixed-scope, unsupported, corrupted or had policy/regression risk. This is not a claim that all 351 divergent branches were semantically validated. Old branches must be freshly compared with current `main`; do not batch-merge or discard them based only on mergeability.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, Git, Node tests, Android source guards, GitHub Actions API/emulator logs
Timestamp (UTC): 2026-11-05T09:53:05Z
