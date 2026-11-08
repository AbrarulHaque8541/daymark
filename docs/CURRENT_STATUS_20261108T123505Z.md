# Daymark whole-project engineering snapshot — 2026-11-08T12:36:06.937Z

## Verified repository state

- Repository: `AbrarulHaque8541/daymark`; default branch: `main`.
- Live `main` SHA: `f9e505604718beae5ef14e274fc96879e34fdfdb`.
- Root `AGENTS.md` was read in full. Canonical commands remain `sh android-app/tools/check-v1-source.sh` and `npm test`; tests must not be weakened, and shared `MainActivity.java` edits must be serialized.
- Live build identity in `android-app/app/build.gradle.kts` and `AGENTS.md`: `com.abrar.daymark`. The run-level safety instruction says `com.cue.daymark`. This discrepancy is unresolved. No namespace/applicationId/manifest identity change was made.
- Branch-protection endpoint returned HTTP 403 (resource not accessible); rulesets endpoint returned an empty list. This does not establish that merge protection is absent. No merge was attempted.

## Recent main integrations

Current main includes:
- PR #615 — explicit 24-hour reminder lead tests across spring/fall DST transitions.
- PR #614 — Focus Timer gesture parent-interception release.
- PR #612 — device capability policy requires a usable title-entry path for task capture.
- PR #611 — Windows subprocess-backed Node test reliability.
- PR #609 — cross-platform support evidence refresh.
- PR #606 — reminder lead subtraction from zone-resolved due instants.
- PR #608 — HTTP/HTTPS note-link parity.
- PR #605 — edit-form style-coverage correction.
- PR #599 — weekday recurrence before the reminder trigger.
- PR #600 — world-clock export and Gradle CI reliability.
- PR #602's task-editor post-show resize fix was merged into PR #600's branch and is present on current main.

## All live open PRs

All six open PR heads compare ahead of current main with **0 commits behind**. The listed review comments are from the repository owner; no independent submitted approval was observed. Do not merge based on green CI alone.

| PR | Exact head | Ahead / behind current main | Exact-head status |
|---|---|---:|---|
| #601 browser bare IP/localhost | `1c65a67e4077fa6a38a914a34462d963fa93ddb6` | 13 / 0 | Android CI, Ubuntu/Windows contracts, QA APK and device-test APK PASS; release job SKIPPED |
| #604 storage unknown/unreadable state | `de8b089cc9d08a513aad534e7f6dca5a5b1ae3a9` | 16 / 0 | Android CI, Ubuntu/Windows contracts and device-test APK PASS; release job SKIPPED |
| #607 world-clock storage fail-closed | `8ae4ff391d35c802f2b0e547cab6c5bd312b8ad4` | 11 / 0 | Android CI, Ubuntu/Windows contracts and device-test APK PASS; release job SKIPPED |
| #610 browser download security containment | `2ae435dfeef5efff7c84d19da6d48be4f96f8dc9` | 14 / 0 | Android CI, contracts, QA APK, device-test APK, Focus UI and Live Update PASS; API 29 emulator PASS; API 36 task-editor IME FAIL |
| #616 Focus API 36 repeatability | `c22f5d328c01b89327c22a11f2ac3166e414cc13` | 8 / 0 | Android CI, contracts, QA APK and device-test APK PASS; API 29 emulator PASS; API 36 FAIL on repeat 6/10 |
| #617 browser-error UI storage-independent boot | `74ffda15fb642c99f1ec1b391cffc0f48bcd829a` | 4 / 0 | Android CI, Ubuntu/Windows contracts and device-test APK PASS; production release job SKIPPED |

### PR #617 — additive test restoration

- Commit `74ffda15` restored all six original browser-error UI behavior tests that had been removed in the earlier PR revision.
- Added two VM boot tests for immediate and deferred DOMContentLoaded boot with a throwing `window.localStorage` getter.
- Corrected the regression helper to expose a live getter-backed read counter; a copied numeric snapshot would not detect a later accidental storage access.
- Exact-head Android CI: **PASS**; its Node suite reports **491/491 PASS**.
- Exact-head Ubuntu and Windows shared contracts: **PASS**.
- Exact-head device-test APK and manifest verification: **PASS**; production release job: **SKIPPED**.
- No physical browser/WebView test was performed.
- This snapshot is being added as a documentation-only follow-up on PR #617; the checks above are for the implementation/test head `74ffda15`, and the new documentation head must receive its own exact-head checks.

## API 36 task-editor IME blocker

Issue #613 remains open.

- Current main already contains the PR #602 fix: `Api30Window.setDecorFits(dialogWindow, true)`, plus `SOFT_INPUT_STATE_ALWAYS_VISIBLE | SOFT_INPUT_ADJUST_RESIZE` before show and a second application after the dialog window attaches.
- Despite that fix, PR #610 head `2ae435dfeef5efff7c84d19da6d48be4f96f8dc9` fails API 36 while API 29 passes.
- PR #616 head `c22f5d328c01b89327c22a11f2ac3166e414cc13` fails on repeat 6/10 after five complete API 36 passes.
- Exact failure: task-editor Cancel accessibility node exists, but is not a visible touch target (`dialog=1,button=1,label=1,touch=0`); IME bounds `[0,1048][1080,1920]`; dialog window bounds `[28,63][1052,1857]`.
- Do not remove visibility assertions, skip the IME phase, add blind retries, or merely increase timeouts. PR #610 currently owns an open `MainActivity.java` edit; no second branch should modify that shared file until ownership is released.

## Corrected recurrence status

Issue #476's original defect description is stale relative to current main:

- Android catch-up uses arithmetic jumps for daily, weekly, monthly and yearly rules; weekday catch-up is bounded to the next weekday window.
- Monthly and yearly occurrences retain `repeatDayOfMonth` anchors, including Feb-29 recovery in leap years.
- Web recurrence uses period-aware arithmetic.
- Shared `contracts/task-recurrence.tsv` has 12 cases, including year-0001 daily and Feb-29 yearly cases.
- PR #599, #606 and #615 are merged.
- Physical AlarmManager/notification delivery (permission, Doze, reboot, OEM power policy and timezone changes) remains **NOT TESTED**; keep #476 open for device acceptance under #160.

## Storage integrity

- Issue #603 tracks PR #604's unreadable-key state and fail-closed clear retry.
- PR #607 independently hardens the world-clock storage getter/read/write/refresh/clear paths.
- Both exact current heads are 0 commits behind main and their Android CI, Ubuntu/Windows contracts and device-test APK workflows pass; production release jobs are skipped.
- No independent review is recorded. These changes affect web localStorage prototypes, not Android encrypted task storage.

## Prioritized whole-project backlog

1. **P0 — #160 physical Android acceptance:** obtain a real device/model/API, WebView provider/version, installed APK SHA and scenario results. CI/emulator/APK evidence is not physical acceptance.
2. **P1 — #613 API 36 IME repeatability:** inspect dialog-window insets/soft-input mode and real Cancel/Add bounds after repeated Activity creation; preserve all assertions.
3. **P1 — #348 browser downloads:** keep new downloads fail-closed until app-owned transport validates every redirect and scopes credentials; then complete SAF destination/resume/cancel behavior.
4. **P1 — #601/#604/#607/#610/#616/#617 integration:** independent review, current-head check verification and protected merge requirements.
5. **P1 — #476 reminders:** physical AlarmManager/notification/Doze/reboot/timezone acceptance.
6. **P2 — #325 cross-platform architecture:** measured desktop vertical slice and encrypted local persistence/GUI feasibility; no framework rewrite or support claim without evidence.

## Safety and completion boundaries

- No production release/tag, version bump, signing-key change, applicationId change, destructive migration or user-data reset was performed.
- No PR was merged in this run.
- Physical Android device acceptance remains **NOT TESTED**.
- The stable `docs/AGENT_STATUS.md` index currently points to a 09:20Z snapshot and is stale. PR #604 has an active edit to that shared index, so this run did not overwrite it. The index should be repointed to a current reviewed snapshot after that ownership conflict is resolved.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector (live source, PR, compare, issue, Actions job/log, Git tree/commit/ref APIs)
Timestamp (UTC): 2026-11-08T12:36:06.937Z
