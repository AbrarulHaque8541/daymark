# Daymark status snapshot — 2026-10-31T06:36:57Z

Live audit against GitHub API and exact workflow heads. This snapshot supersedes earlier 2026-10-31 snapshots for current status; preserve historical snapshots unchanged.

## Current main

- Exact main SHA: `bcfb713fe45011746ae4ed2551f42d1054c95518`.
- [Android CI run #41167505333](https://github.com/AbrarulHaque8541/daymark/actions/runs/41167505333), job #124438144174: **PASS** (debug variants and lint; `BUILD SUCCESSFUL`).
- [Cross-platform contract run #41167505322](https://github.com/AbrarulHaque8541/daymark/actions/runs/41167505322): Ubuntu job #124438144070 **PASS**; Windows job #124438143937 **PASS**.
- Exact check-runs API returned 3 completed-success checks for this SHA. Legacy commit-status endpoint is `pending` with zero statuses (`total_count: 0`); this is an empty legacy status, not a failing workflow. Report explicit Check Runs as CI evidence.
- Source identity: `com.abrar.daymark`, `versionName=1.6`, `versionCode=13`, min SDK 26, target SDK 36. No identity/version/signing changes.

## PR #351 — Expanded reminder quick actions

- **CLOSED, NOT MERGED**, superseded by PR #353; exact head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- [Android CI #41028531388](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531388): **PASS**.
- [Cross-platform contracts #41028531511](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531511): **PASS** (Ubuntu + Windows).
- [Android device-test release assets #41028531533](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531533): **PASS**; production publishing skipped as expected for PR.
- Notification action delta is present on main through PR #353 merge commit `c39127c6eada931407324a301a14dc8d385772b0`. No separate merge of #351 is needed.

## PR #352 — Monotonic focus timer core

- **CLOSED, MERGED**; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Actual current GitHub PR head: `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`. PR body cites an older validation SHA `c9eeeac2...`; checks below are for the API-reported current head.
- [Android CI #41054151218](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151218): **FAIL**. Job #124057316204; failing step: `Run Android host regression checks`.
- [Cross-platform contracts #41054151188](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151188): **PASS** (Ubuntu + Windows).
- [Device-test release assets #41054151193](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151193): **FAIL**. Job #124057315620; failing step: `Run web and Android host/source checks`.
- Precise blocker in both failing runs: source guard expects stale marker `alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,` in `TaskReminderScheduler.java`; current scheduler uses `snoozeFire.toEpochMilli()` and `nextFire.toEpochMilli()`. Downstream Node/Gradle/API 29/36 emulator steps were skipped. Historical failure is not evidence of current-main failure.

## Integrated focus/reminder/UI work on main

- [PR #382 — task focus timer integration](https://github.com/AbrarulHaque8541/daymark/pull/382) is **CLOSED, MERGED** at merge commit `67d08db5b13fc4da73c2c0dfbe59a1c574dd69c2`.
- Main source contains task-linked Stopwatch/Countdown UI, explicit Start/Pause/Resume/Finish lifecycle, AES-GCM/AtomicFile focus-session persistence separate from task completion, notification actions, and responsive Tasks Home.
- Host regressions on current audited source include: focus timer engine **34 assertions**, session coordinator **54**, encrypted snapshot codec **21**, adaptive Tasks Home policy **8**. PR #408's exact-head Live Update adapter workflow also **PASS**.
- Android 16+ Live Update promotion is gated to a genuinely user-started ongoing focus session and retains ordinary native notification fallback. Do not claim universal Dynamic Island/OEM behavior.

## Open PRs and file ownership

Live open PR search returns **#408 and #409**:

### PR #408 — browser recovery / issue #221
- **OPEN**; exact head `1f1626db8f22f4e26923f6bb451ee948990a4bbd`; base main `bcfb713fe45011746ae4ed2551f42d1054c95518`.
- Changes `BrowserLoadWatchdog.java`, `BrowserWorkspaceController.java`, `DaymarkWebView.java`, and shared `MainActivity.java`. Treat MainActivity/browser flow as actively owned; do not edit those files in another PR.
- Exact-head workflows all **PASS**: Android CI #41169566253; cross-platform contracts #41169566125 (Ubuntu + Windows); Focus Timer UI #41169565982; Live Update adapter #41169566256; Android device-test assets #41169566002; non-publishing device acceptance #41169566120.
- Physical browser repro remains owner/device-dependent; CI does not close issue #221.

### PR #409 — this documentation refresh
- **OPEN, DRAFT**; current pre-refresh head `0eadc019ee1d2e411ddc84502395fd5d5a191a93`.
- Documentation-only; no Android source or workflow/task-data changes.
- Exact-head checks all completed: Android build job #124457728171 **PASS** (canonical `sh ./tools/check-v1-source.sh` and host tests, including focus timer/session/adaptive tests); cross-platform Ubuntu #124457555352 **PASS**, Windows #124457555305 **PASS**; device-test APK #124457868961 **PASS**; non-publishing artifact check #124458256107 **SKIPPED** (expected PR publish gate).
- This PR's prior snapshot incorrectly described #408 as the sole open PR and its index had a malformed splice at the top. This new snapshot/index corrects that discrepancy; revalidate checks on the new PR head before calling the updated docs PR green.

### Older ownership constraints
- #333/#346/#349/#350 are closed/superseded/merged; no longer active ownership by those PRs.
- #401/#393/#392/#390/#389 are not in the current live open-PR list. Do not revive their stale ownership from old snapshots without rechecking.
- #408 is the active shared `MainActivity.java`/browser owner. Avoid overlapping edits.

## Releases and tags

- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5) (published 2026-10-23).
- [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/untagged-77a0ed471ede5c065f10) remains a draft/untagged release.
- Live tag refs include through `v1.5`; **no v1.6 tag or production release** found.
- No tag, version bump, signing change, or production publication performed.

## Relevant issue state

- [#160 — current-main Android runtime acceptance matrix](https://github.com/AbrarulHaque8541/daymark/issues/160): **OPEN**.
- [#221 — blank browser viewport / page never loads](https://github.com/AbrarulHaque8541/daymark/issues/221): **OPEN**, owner-reported physical-device failure; #408 source changes await real-device reproduction.
- [#226 — task reminder workflow](https://github.com/AbrarulHaque8541/daymark/issues/226): **CLOSED**.
- [#187 — API 36 / Play target qualification](https://github.com/AbrarulHaque8541/daymark/issues/187): **CLOSED**.

## NOT TESTED — physical device

- API 16.1+ OEM Live Update presentation and native fallback across hardware/API 26–35.
- Reminder Snooze/Dismiss and focus Pause/Finish from notification shade.
- Process-death/reboot recovery, Keystore persistence, battery restrictions.
- Tablet/foldable adaptive Tasks Home, large font, RTL, TalkBack.
- Browser white-viewport recovery on owner's device.
- Production-signed upgrade preserving existing encrypted tasks/attachments.

## Safest next increment

Requested focus timer, persistence, gated Live Update/fallback, reminder quick actions, and adaptive Tasks Home are already integrated in current main. A duplicate feature PR is not justified. Keep #408's owned shared UI/browser files untouched.

Next release-critical work is **physical-device acceptance using an APK built from exact current main SHA `bcfb713fe45011746ae4ed2551f42d1054c95518`**, then record evidence in #160 and reproduce/resolve #221 on-device. The connector used here cannot manually dispatch the non-publishing acceptance workflow; no current-main QA APK was generated in this run.

No merge, tag, version bump, signing change, production publish, or task-data modification performed.

---
Work by: ChatGPT (live GitHub audit and docs refresh)
Model: GPT-6
Tooling: GitHub connector (PR/head/Actions/job logs/source/releases/tags/issues)
Timestamp (UTC): 2026-10-31T06:36:57Z
