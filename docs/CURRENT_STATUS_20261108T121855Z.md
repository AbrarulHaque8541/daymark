# Daymark whole-project engineering snapshot — 2026-11-08T12:18:55.588Z

## Repository and instruction state

- Repository: `AbrarulHaque8541/daymark`
- Current main at snapshot: `f9e505604718beae5ef14e274fc96879e34fdfdb`
- Root `AGENTS.md` fetched and read in full. It requires evidence-backed, repo-wide work, exact-head CI, device-test honesty, no release/version/signing/identity/destructive changes, and independent review for security/data-integrity changes.
- No scoped `android-app/AGENTS.md` or `android-app/app/src/androidTest/AGENTS.md` exists (404).
- The current main package identity was inspected; no package/application identity was changed.
- `docs/AGENT_STATUS.md` is owned by open PR #604, so this branch does not edit it.

## Merges verified this run

### PR #614 — Focus mode gesture interception
- Merged as `c919aee88d7fc453c9c7c460fe980954afc7d79f`.
- Exact-head Android CI, cross-platform contracts, non-publishing acceptance artifact, device-test APK, Focus UI/Sound, Focus Live Update, and one API 29/36 emulator lifecycle run passed.
- This is one lifecycle pass, not the 10-consecutive API 36 target in #613.

### PR #615 — Reminder 24-hour elapsed lead across DST
- Merged as `f9e505604718beae5ef14e274fc96879e34fdfdb`.
- Added spring-forward/fall-back named-zone tests for elapsed 24-hour reminder leads, one-second-before/at-trigger recurrence advancement, and 30/1440-minute base-fire instants.
- Synchronized exact-head Android CI, Ubuntu/Windows contracts, non-publishing acceptance APK and device-test APK passed.
- Physical AlarmManager/notification delivery remains **NOT TESTED**.

## PR #616 — API 36 ten-run stability gate

Branch: `qa/focus-api36-repeatability-20261108`

### First exact-head result

Head before the diagnostic follow-up: `b2c9a1c01d0e1067a4dd01a2f585bd316f041ef2`.

- API 29 full lifecycle: **PASS**.
- API 36 run 1/10: **PASS**, 293 assertions.
- API 36 run 2/10: **FAIL** after 201 assertions:
  `a real tap selects Countdown: exactly the expected mode is selected (actual Stopwatch=true, Countdown=false, idle=false)`.
- The sequence stopped immediately at run 2; no retry was attempted. This is an actual repeatability failure, not a green result.
- The 10-run job therefore correctly prevented issue #613 from being marked complete.

### Root-cause investigation and follow-up change

The focus-mode instrumentation created MotionEvents without setting an explicit input source/tool type. The task-editor instrumentation already sets `InputDevice.SOURCE_TOUCHSCREEN`, while the Focus mode gesture test did not. The Focus test also tapped immediately after obtaining a visible rectangle without requiring several stable layout samples. The failure log did not contain enough target geometry to conclusively identify whether the injected touch was misrouted or the target moved; this is recorded as a hypothesis, not a proven product defect.

Follow-up implementation commit: `c830f5590d0eb20e669ad87fe12c8463db50de54`.

Changes:
- Explicitly mark injected Focus gesture events as `SOURCE_TOUCHSCREEN` and `TOOL_TYPE_FINGER`.
- Require three consecutive stable visible-bounds samples before tap/swipe injection.
- Record target label, visible bounds, screen location, shown/enabled/clickable state and tap coordinates in assertion messages.
- Add a canonical source guard for explicit touch source/tool and stable-bound diagnostics.
- Keep the existing real tap/swipe assertions and all phase checks intact; no `performClick` fallback or success-on-retry was added.

The focused repeat-policy shell regression had passed before this follow-up (default one run, ten runs/nine app-data resets, fail-fast/no retry, invalid-count rejection, reset-failure propagation). Android compilation and the updated API 29/36 emulator matrix must validate this follow-up on its exact head.

The workflow runs the full lifecycle once on API 29 and ten sequentially on API 36 on one disposable emulator, clearing only the app package between successful runs. The job timeout is 90 minutes. Physical-device acceptance remains **NOT TESTED**.

## Cross-agent integration and active PR state

### PR #610 — Browser download fail-closed mitigation
- Synchronized branch includes main through `f9e505604718beae5ef14e274fc96879e34fdfdb` via a non-force merge commit; latest branch head before this snapshot: `2ae435dfeef5efff7c84d19da6d48be4f96f8dc9`.
- Previous exact-head run after the #614 sync had a TaskEditor IME Cancel-button visibility failure on API 36. The #616 repeated run passed the task-editor phase on its first full lifecycle, showing the issue is intermittent; keep the #613 gate open until all ten runs pass.
- Current PR review record is a COMMENTED review by the PR owner, not independent approval. Keep the security PR open until a different reviewer approves and exact-head checks pass.
- New browser downloads remain fail-closed until an app-owned redirect-validating transport is implemented and reviewed.

### PR #601 — Browser address parsing
- Synchronized with current main through `f9e505604718beae5ef14e274fc96879e34fdfdb`; latest branch head before this snapshot: `1c65a67e4077fa6a38a914a34462d963fa93ddb6`.
- Non-canonical numeric IPv4 and IPv6 authority cases remain part of security review; independent approval is required.

### PR #604 / #607 — Storage resilience
- PR #604 synchronized with current main; latest head before this snapshot: `de8b089cc9d08a513aad534e7f6dca5a5b1ae3a9`.
- PR #607 synchronized with current main; latest head before this snapshot: `8ae4ff391d35c802f2b0e547cab6c5bd312b8ad4`.
- PR #607's setItem-only adapter review thread was answered with exact source/test evidence and marked resolved; the PR still needs exact-head CI and an independent reviewer.
- PR #604 owns `docs/AGENT_STATUS.md`; avoid competing edits to that shared index.

## Ranked repo-wide backlog

1. **P0 — #160 physical Android/WebView acceptance:** still **NOT TESTED**; needs a real device, API level, WebView provider/version, build SHA, APK SHA and scenario evidence.
2. **P1 — #613 API 36 lifecycle stability:** rerun the exact-head ten-pass gate after explicit touchscreen source/stable bounds diagnostics; fix the first remaining failure at its root cause.
3. **P1 — #610 secure browser downloads:** fresh exact-head CI and independent security review; keep new downloads disabled until safe redirect/header handling exists.
4. **P1 — #601 browser URL authority policy:** verify legacy IPv4 aliases, IDN normalization, IPv6 and encoded authority edge cases; independent security review.
5. **P1 — #604/#607 storage resilience:** preserve unreadable-versus-absent state across localStorage consumers; never overwrite unreadable saved data or report false clears.
6. **P1 — #348 browser reliability:** navigation, renderer recovery, downloads/SAF, cookies/site data, permissions, keyboard/insets and accessibility.
7. **P1 — #476 recurrence/reminder correctness:** PR #615 DST coverage is merged; remaining semantics and physical alarm delivery are not complete.
8. **P2 — #325 cross-platform architecture:** evidence-based prototypes and compatibility measurements; no speculative rewrite.

## Safety and attribution

No release/tag publication, version bump, signing change, manifest permission change, package/application identity change, schema migration, or destructive user-data operation was performed.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector (live PR/issue/branch/commit/tree/Actions APIs) and local shell regression harness  
Timestamp (UTC): 2026-11-08T12:18:55.588Z

Physical-device acceptance: **NOT TESTED**.  
PR #616 ten-run acceptance: **FAILED at run 2/10 on its first exact head; follow-up fix awaits fresh exact-head CI**.
