# Daymark status snapshot — 2026-10-31T03:41:00Z

Live refresh after PR #400 merged. This supersedes the 03:40 snapshot for current status; preserve prior snapshots as historical evidence.

## Current main

- Current `main`: `081c1c473f39ec0b7694888e20e3ec18ecf95621` (verified from `branches/main`).
- [Android CI #1113](https://github.com/AbrarulHaque8541/daymark/actions/runs/41165272712): **PASS** on exact main SHA `081c1c...`.
- [Cross-platform contracts #353](https://github.com/AbrarulHaque8541/daymark/actions/runs/41165272719): **PASS** on exact main SHA `081c1c...` (Ubuntu + Windows).
- Main workflow jobs completed successfully: Android `build` finished debug variants; Ubuntu and Windows contract jobs finished.
- Gradle source verified: applicationId/namespace `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`. No app identity/version/signing changes.

## PR #400 — OAuth PKCE rebase

- **CLOSED, MERGED by repository owner** at `2026-10-31T03:38:50Z`.
- Exact head: `60c8298aaaf2271520855e3a05fd86c4f388d719`; merge commit/current main `081c1c473f39ec0b7694888e20e3ec18ecf95621`.
- Exact-head required checks all **PASS**: Android CI #1112; Ubuntu/Windows contracts #351; Focus UI #71; Live Update adapter #69; API 29/36 focus lifecycle #36; device APK #777; non-publishing acceptance artifact #3.
- #388 closed as superseded by this rebase.

## PR #351 — Expanded reminder actions

- **CLOSED, NOT MERGED**, superseded by #353.
- Exact head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Android CI #852 **PASS**; contracts #91 (Ubuntu + Windows) **PASS**; device APK #552 **PASS**. Production publish skipped as expected for PR.
- Current reminder actions are on main via #353 merge commit `c39127c6eada931407324a301a14dc8d385772b0`.

## PR #352 — Monotonic focus timer core

- **CLOSED, MERGED**; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Exact head `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`.
- Android CI #920 **FAIL**; cross-platform #159 (Ubuntu + Windows) **PASS**; device APK #613 **FAIL**.
- Android failing job `build` ID `124057316204`, step `Run Android host regression checks`; device APK failing job ID `124057315620`, step `Run web and Android host/source checks`.
- Exact logs fail on stale `TaskReminderScheduler.java` guard marker `alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,`. Current scheduler uses `snoozeFire.toEpochMilli()` / `nextFire.toEpochMilli()`. Node, Gradle and API 29/36 emulator steps were skipped downstream. Historical failure remains; it is not evidence that current-main timer integration fails.

## Focus integration #382

- Merged by owner; exact head `f912d4a94a887c05f41a8340d4324ad9bb185101`.
- Recorded exact-head checks passed: Android CI #1051; contracts #290; Focus UI #48; Live Update adapter #46; API 29/36 instrumentation #13; device APK #726.
- Main includes task-linked monotonic Stopwatch/Countdown, independent AES-GCM/AtomicFile persistence, explicit user Start/Pause/Resume/Finish, notification Pause/Finish actions, adaptive Tasks Home and Android 16.1+ gated Live Update with ordinary native-notification fallback.
- Physical-device OEM promotion, hardware notification fallback, reboot/Keystore, accessibility/adaptive acceptance remain **NOT TESTED**. No universal Dynamic Island claim.

## PR #397 — Non-publishing device acceptance workflow

- **CLOSED, MERGED**; exact PR head `7bd729bfc307c877ec09d67b98a1bd309c36ca09`, merge commit `96e7c59351e5de42cb6f92a6214b7716cde97312`.
- Exact-head acceptance workflow #3, Android CI #1106, contracts #345, device APK #774 all **PASS**.
- [Artifact #13028149107](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116115) exists; SHA-256 `bd9c7a2adcff59a00c54400f0039ece7641519f49512fc7cf05368590eda5919`; expires 2026-11-07T03:24:11Z.
- Artifact source is `7bd729b...`, older than current main `081c1c...`, and debug-signed. It cannot update a production-signed install in place. Do not uninstall production app or risk encrypted task data. Manual dispatch on current main is available; no current-main artifact was dispatched in this audit.

## Current open PRs and ownership

Live open PR list:

| PR | Head SHA | Base SHA | Changed-file ownership / status |
|---|---|---|---|
| #402 | (this documentation PR; exact head intentionally not self-referenced) | `081c1c...` | This docs-only status refresh. Exact-head Actions runs **NOT RUN yet** after branch refresh; its head moves as snapshot/index commits are updated. |
| #401 | `1fd44cd39e375ee535c3b73ddc9821defd5746eb` | `081c1c...` | Calendar handoff rebased replacement for #389. Adds adapter/tests and edits shared `check-v1-source.sh` + `run-core-tests.sh`. No exact-head workflow runs returned: **NOT VERIFIED**. |
| #393 | `83cb7d701d994d46aae336e5ed813e1c5f1b9756` | `ca639bdd...` | OAuth token vault; shared guard/core runner. |
| #392 | `f906f62c2b502b0ee8219f103178814afa947ae6` | `ca639bdd...` | Task webhook; shared guard/core runner. |
| #390 | `027602d65f30362659187b7cfcedb6e375604c9c` | `ca639bdd...` | GitHub public issues; shared guard/core runner. |
| #389 | `7e2e4eaf8978d39c60eceabdedc7e9fae3777809` | `ca639bdd...` | Older calendar branch; same changed files as #401, superseded duplicate. |

- #393/#392/#390/#389 remain based on old `ca639bdd...` (before #397/#398/#399/#400). Exact heads have no workflow runs returned by the queried Actions endpoint: **NOT VERIFIED**, not green.
- Shared source guard/core runner ownership is active across #401/#393/#392/#390/#389. Do not edit those files until the current owner lands or explicit coordination resolves overlap.
- Original #333/#346/#349/#350 ownership is stale: #333 closed/superseded; #346/#349/#350 merged. #353 and #382 merged.

## Releases and tags

- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag SHA `ca6453374c46a1449c8bbec09a27a218d127d8e4`, signed APK asset attached.
- v1.4 remains draft/untagged; no v1.6 production release or `v1.6` tag found.
- No tag, version bump, signing or publication performed.

## Relevant issue state

- [#160 — physical-device acceptance matrix](https://github.com/AbrarulHaque8541/daymark/issues/160): **OPEN**.
- [#221 — blank browser viewport](https://github.com/AbrarulHaque8541/daymark/issues/221): **OPEN**, owner-reported physical-device blocker.
- [#226 — reminder workflow](https://github.com/AbrarulHaque8541/daymark/issues/226): **CLOSED**.
- [#187 — API 36 / Play target qualification](https://github.com/AbrarulHaque8541/daymark/issues/187): **CLOSED**.

## NOT TESTED — physical device

- Android 16.1+ OEM Live Update promotion; no universal Dynamic Island claim.
- Android 16.0 and API 26–35 native notification fallback on hardware.
- Reminder Snooze/Dismiss; focus Pause/Finish notification actions.
- Process death/reboot recovery and Keystore round-trip.
- Battery saver/OEM background restrictions.
- Tablet/foldable adaptive layout, large font, RTL, TalkBack.
- Existing task-data preservation during production-signed upgrade.

## Next safe step

The requested focus timer, persistence, notification actions, gated Live Update and adaptive Tasks Home are already integrated in main. Do not duplicate. Current main CI is green after #400. Keep shared source-guard/core-runner files untouched while #401/#393/#392/#390/#389 remain open. Release gate is physical-device acceptance against a build from exact current main. Use a spare device or manually dispatch the non-publishing workflow on current main; do not install the older debug artifact over production.

No merge, tag, version bump, production release, signing change or task-data modification was performed in this audit.

---
Work by: ChatGPT (live state verification and documentation refresh)
Model: GPT-6
Tooling: GitHub connector (PR/head/Actions/job-log/source/release/tag/issue audit)
Timestamp (UTC): 2026-10-31T03:41:00Z
