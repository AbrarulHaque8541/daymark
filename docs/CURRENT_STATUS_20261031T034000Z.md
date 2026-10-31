# Daymark status snapshot — 2026-10-31T03:40:00Z

Live refresh after owner merged PR #400. The previous snapshot at 03:39 UTC was already superseded by this main update; preserve it as history.

## Current main and identity

- Current `main`: `081c1c473f39ec0b7694888e20e3ec18ecf95621` (verified through `branches/main`).
- This is merge commit for PR #400 (OAuth PKCE). PR #400's exact head `60c8298aaaf2271520855e3a05fd86c4f388d719` passed its exact-head checks and was merged by the repository owner at 2026-10-31T03:38:50Z.
- **Current-main push workflows are still IN PROGRESS; do not call main green yet:**
  - [Android CI #1113](https://github.com/AbrarulHaque8541/daymark/actions/runs/41165272712), job `build` ID `124431374229`: host regression checks and repository Node tests **PASS**; `Build and verify debug variants` is **IN PROGRESS**.
  - [Cross-platform contracts #353](https://github.com/AbrarulHaque8541/daymark/actions/runs/41165272719): Ubuntu job **PASS**; Windows job ID `124431374154` is **IN PROGRESS** at `Run Android production core host tests against shared fixtures`; platform-neutral compile step pending.
- Gradle identity/version from source: `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`. No identity/version/signing edits.
- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag SHA `ca6453374c46a1449c8bbec09a27a218d127d8e4`, APK attached. v1.4 remains draft with an untagged draft ref; no v1.6 production release or tag found.

## PR #351 — expanded reminder quick actions

- CLOSED, NOT MERGED; superseded by #353.
- Exact head `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Exact-head: [Android CI #852](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531388) **PASS**; [Ubuntu/Windows contracts #91](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531511) **PASS**; [device APK #552](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531533) **PASS**. Production publish skipped as expected.
- Reminder implementation is on main via #353 merge commit `c39127c6eada931407324a301a14dc8d385772b0`.

## PR #352 — monotonic focus timer core

- CLOSED, MERGED; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Exact head `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`.
- [Android CI #920](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151218) **FAIL**; [Ubuntu/Windows contracts #159](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151188) **PASS**; [device APK #613](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151193) **FAIL**.
- Android CI failing job `build` ID `124057316204`, step `Run Android host regression checks`; device APK failing job ID `124057315620`, step `Run web and Android host/source checks`.
- Both logs contain stale required-marker mismatch in `TaskReminderScheduler.java`: `alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,`. Current scheduler uses `snoozeFire.toEpochMilli()` / `nextFire.toEpochMilli()`. Downstream Node, Gradle and emulator steps were **SKIPPED**. This historical PR failure is not evidence that current-main focus integration fails.

## Focus integration #382

- Merged by repository owner; exact integration head `f912d4a94a887c05f41a8340d4324ad9bb185101`.
- Recorded exact-head checks passed: Android CI #1051, Ubuntu/Windows #290, Focus UI #48, Live Update adapter #46, API 29/36 focus instrumentation #13, device APK #726.
- Main includes task-linked monotonic Stopwatch/Countdown, separate AES-GCM/AtomicFile persistence, explicit user Start/Pause/Resume/Finish, notification Pause/Finish actions, adaptive Tasks Home and Android 16.1+ gated Live Update request with ordinary notification fallback.
- Actual physical-device behavior and OEM/Dynamic Island promotion remain NOT TESTED; no universal promotion claim.

## PR #397 — non-publishing device acceptance APK

- CLOSED, MERGED; merge commit `96e7c59351e5de42cb6f92a6214b7716cde97312`; exact head `7bd729bfc307c877ec09d67b98a1bd309c36ca09`.
- Exact-head: [acceptance workflow #3](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116115), [Android CI #1106](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116145), [contracts #345](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116155), [device APK #774](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116173): **PASS**.
- Artifact [#13028149107](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116115) exists; SHA-256 `bd9c7a2adcff59a00c54400f0039ece7641519f49512fc7cf05368590eda5919`, expiry 2026-11-07T03:24:11Z.
- It is debug-signed from `7bd729b...`, which is older than current main `081c1c...`. It cannot update production-signed install in place. Do not uninstall owner production app or risk encrypted task data. Workflow supports manual dispatch from current main; no current-main artifact dispatched in this audit.

## Current open PRs and ownership

Live `pulls?state=open`:

| PR | Head | Base | Files / ownership |
|---|---|---|---|
| #402 | `f0b3c4e23c6f6be12e5ded5233a8913d0338053d` | `081c1c...` | This documentation refresh; snapshot index and status files. Head is behind main because #400 merged after it was created. Exact-head Android CI #1114, contracts #353 and device APK #778 are **IN PROGRESS**. |
| #401 | `1fd44cd39e375ee535c3b73ddc9821defd5746eb` | current main `081c1c...` | Clean calendar-handoff rebase replacing #389; adds adapter/test/guard and touches shared `check-v1-source.sh` + `run-core-tests.sh`. No exact-head Actions runs returned yet: **NOT VERIFIED**. |
| #393 | `83cb7d701d994d46aae336e5ed813e1c5f1b9756` | `ca639bdd...` | OAuth token vault; shared guard/core runner. |
| #392 | `f906f62c2b502b0ee8219f103178814afa947ae6` | `ca639bdd...` | Task webhook; shared guard/core runner. |
| #390 | `027602d65f30362659187b7cfcedb6e375604c9c` | `ca639bdd...` | Public GitHub issues adapter; shared guard/core runner. |
| #389 | `7e2e4eaf8978d39c60eceabdedc7e9fae3777809` | `ca639bdd...` | Older calendar branch; same files as #401, superseded rebase duplicate. |

- #400 is now **CLOSED, MERGED**. Exact-head checks before merge all passed: Android CI #1112; contracts #351 (Ubuntu/Windows); Focus UI #71; Live Update adapter #69; focus API 29/36 lifecycle #36; device APK #777; acceptance artifact #3.
- #388 was closed by #400. #389/#390/#392/#393 remain open on old base `ca639bdd...` (before #397/#398/#399/#400). Their exact heads have no Actions runs returned by the queried endpoint: **NOT VERIFIED**, not green.
- These open branches overlap shared `check-v1-source.sh` / `run-core-tests.sh`. Do not edit those files until their current owner lands or explicit coordination resolves the overlap.
- Original prompt's #333/#346/#349/#350 owners are no longer active: #333 closed/superseded; #346/#349/#350 merged. #353 and #382 merged.

## Relevant issue state

- [#160 — physical-device acceptance matrix](https://github.com/AbrarulHaque8541/daymark/issues/160): OPEN. CI/APK is not physical-device proof.
- [#221 — blank browser viewport](https://github.com/AbrarulHaque8541/daymark/issues/221): OPEN, owner-reported physical device blocker.
- [#226 — reminders](https://github.com/AbrarulHaque8541/daymark/issues/226): CLOSED.
- [#187 — API 36 / Play target qualification](https://github.com/AbrarulHaque8541/daymark/issues/187): CLOSED.

## NOT TESTED — physical device

- Android 16.1+ OEM Live Update promotion (no universal Dynamic Island claim).
- Android 16.0 and API 26–35 notification fallback on hardware.
- Reminder Snooze/Dismiss; focus Pause/Finish notification actions.
- Process death/reboot, Keystore persistence round-trip.
- Battery saver/OEM restrictions.
- Tablet/foldable adaptive layout, large font, RTL, TalkBack.
- Existing task-data preservation during production-signed upgrade.

## Next safe step

The requested task timer, persistence, notification actions, gated Live Update and adaptive Tasks Home are already integrated in main. Do not duplicate. First let current-main Android CI #1113 and contracts #350 finish; keep shared source-guard/core runner ownership intact while #401/#393/#392/#390/#389 are open. Release gate remains physical-device acceptance against a current-main artifact. Use a spare device or manually dispatch the non-publishing workflow on exact current main; do not install the older debug artifact over production.

No merge, tag, version bump, production release, signing change or task-data modification was performed in this audit.

---
Work by: ChatGPT (live state verification and documentation refresh)
Model: GPT-6
Tooling: GitHub connector (PR/head/Actions/job-log/source/release/tag/issue audit)
Timestamp (UTC): 2026-10-31T03:40:00Z
