# Daymark status snapshot — 2026-10-31T03:39:00Z

Live refresh after #397's non-publishing device-acceptance workflow merged and #398/#399 advanced `main`. Historical snapshots remain unchanged.

## Current main and source identity

- Current `main`: `0766ef9979d56e53738aff2d2bda069110b4e633` (verified via GitHub `branches/main`).
- Exact-main Actions: [Android CI #1111](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164825070) **PASS**; [Cross-platform contracts #350](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164825071) **PASS** (Ubuntu + Windows).
- Gradle identity/version verified from main source: applicationId/namespace `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`.
- Latest published production release: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), tag SHA `ca6453374c46a1449c8bbec09a27a218d127d8e4`, APK attached. [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/untagged-77a0ed471ede5c065f10) is still draft/untagged. No v1.6 release or `v1.6` tag was found.
- Production signer pin remains governed by root `AGENTS.md`; no signing changes were made.

## Reminder PR #351 — expanded quick actions

- **CLOSED, NOT MERGED**; superseded by #353.
- Exact head: `2a033402d64425eb0fe6a9fb32d186dd9a4d97e9`.
- Exact-head checks: [Android CI #852](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531388) **PASS**; [Ubuntu + Windows contracts #91](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531511) **PASS**; [device-test APK #552](https://github.com/AbrarulHaque8541/daymark/actions/runs/41028531533) **PASS**. Production publishing was skipped as expected for a PR.
- Current implementation is represented by merged #353 (merge commit `c39127c6eada931407324a301a14dc8d385772b0`). No reopening or duplicate merge is needed.

## Focus timer core PR #352

- **CLOSED, MERGED**; merge commit `14957ca7e24ddb1f4ed07ad66c7e8c9522615659`.
- Exact head: `3ab455d2ca030de8b3969ddaf3b26905b4c369bf`.
- [Android CI #920](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151218) **FAIL**; [Cross-platform #159](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151188) **PASS** (Ubuntu + Windows); [device-test APK #613](https://github.com/AbrarulHaque8541/daymark/actions/runs/41054151193) **FAIL**.
- Failed Android job: `build`, ID `124057316204`, step `Run Android host regression checks`.
- Failed device APK job: ID `124057315620`, step `Run web and Android host/source checks`.
- Both logs report stale marker expectation in `TaskReminderScheduler.java`: `alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt,`. Current scheduler expressions use `snoozeFire.toEpochMilli()` / `nextFire.toEpochMilli()`. Android host guard fails before Node tests, Gradle build and API 29/36 emulator steps; those downstream steps are **SKIPPED**. Cross-platform checks pass.
- This is historical exact-head validation failure; it is not proof that current-main focus timer code fails. Do not relabel the failed runs green.

## Focus integration PR #382

- Merged by repository owner; integration head `f912d4a94a887c05f41a8340d4324ad9bb185101`.
- Exact-head evidence previously recorded in its merge/status thread: Android CI #1051, Ubuntu/Windows contracts #290, Focus UI #48, Live Update adapter #46, API 29/36 lifecycle instrumentation #13, device APK #726 — all **PASS** at that head.
- Merged scope includes task-linked monotonic Stopwatch/Countdown, independent AES-GCM/AtomicFile persistence, explicit Start/Pause/Resume/Finish, notification Pause/Finish actions, responsive Tasks Home and gated Android 16.1+ Live Update request with standard native-notification fallback.
- Do not claim physical-device or universal Dynamic Island/OEM promotion acceptance.

## Device acceptance workflow PR #397

- **CLOSED, MERGED**; merge commit `96e7c59351e5de42cb6f92a6214b7716cde97312`; exact PR head `7bd729bfc307c877ec09d67b98a1bd309c36ca09`.
- Exact-head [non-publishing device acceptance workflow #3](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116115), [Android CI #1106](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116145), [cross-platform #345](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116155), [device-test APK #774](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116173): **PASS**.
- Artifact exists: [Actions artifact #13028149107](https://github.com/AbrarulHaque8541/daymark/actions/runs/41164116115). SHA-256 `bd9c7a2adcff59a00c54400f0039ece7641519f49512fc7cf05368590eda5919`; expires 2026-11-07T03:24:11Z.
- **Artifact source is the PR head `7bd729b...`, not current main `0766ef9...`.** It is debug-signed and cannot update a production-signed install in place. It is for manual QA only. Do not uninstall the owner's production app or risk encrypted task data to install it.
- The new workflow supports manual dispatch from main; no current-main artifact has been dispatched/downloaded in this audit.

## Current open PRs and file ownership

Live `pulls?state=open` returned:

| PR | Exact head | Base | Scope / blocker |
|---|---|---|---|
| #400 | `60c8298aaaf2271520855e3a05fd86c4f388d719` | current main `0766ef9...` | Clean rebased OAuth PKCE replacement for #388; touches `check-v1-source.sh` and `run-core-tests.sh` |
| #393 | `83cb7d701d994d46aae336e5ed813e1c5f1b9756` | `ca639bdd...` | OAuth token vault; shared guard/core runner |
| #392 | `f906f62c2b502b0ee8219f103178814afa947ae6` | `ca639bdd...` | Task webhook; shared guard/core runner |
| #390 | `027602d65f30362659187b7cfcedb6e375604c9c` | `ca639bdd...` | GitHub public issues adapter; shared guard/core runner |
| #389 | `7e2e4eaf8978d39c60eceabdedc7e9fae3777809` | `ca639bdd...` | Calendar handoff; shared guard/core runner |
| #388 | `bb54b66c0758b90c6e6eca897070e12b137b1ac0` | `ca639bdd...` | Older OAuth PKCE branch; same changed files as #400, superseded/rebase duplicate |

- #400 exact-head workflows all **PASS**: Android CI #1112; Ubuntu/Windows contracts #351; Focus UI #71; Live Update adapter #69; API 29/36 focus lifecycle #36; device APK #777; non-publishing acceptance artifact #3. The artifact workflow did not publish a Release.
- #388/#389/#390/#392/#393 are based on older `ca639bdd...` (pre-#397/#398/#399) and have **no workflow runs returned for their exact current heads** in the queried Actions endpoint. Treat them as **NOT VERIFIED**, not green. They also overlap the shared source guard/core test runner; rebase and coordinate before landing.
- Current ownership differs from the original prompt: #333 is closed/superseded; #346/#349/#350 are merged; #353 and #382 are merged. #400 is the active green rebase for the OAuth PKCE slice; #393/#392/#390/#389 remain overlapping owners of shared test infrastructure.

## Relevant issues

- [#160 — Current-main physical-device acceptance matrix](https://github.com/AbrarulHaque8541/daymark/issues/160): **OPEN**. CI/APK is not physical-device proof; must record model/API/build SHA/APK SHA and PASS/FAIL/NOT TESTED per scenario.
- [#221 — Blank browser viewport](https://github.com/AbrarulHaque8541/daymark/issues/221): **OPEN**, owner-reported physical-device blocker separate from timer work.
- [#226 — Task reminders](https://github.com/AbrarulHaque8541/daymark/issues/226): **CLOSED**.
- [#187 — API 36 / Play target qualification](https://github.com/AbrarulHaque8541/daymark/issues/187): **CLOSED**.

## NOT TESTED — physical device

- Android 16.1+ actual OEM Live Update promotion; no universal Dynamic Island claim.
- Android 16.0 and API 26–35 notification fallback on hardware.
- Reminder Snooze/Dismiss; Focus Pause/Finish notification actions.
- Process death/reboot recovery and Keystore round-trip on hardware.
- Battery saver/OEM background restrictions.
- Tablet/foldable adaptive layout, large font, RTL, TalkBack.
- Existing task-data preservation during production-signed upgrade.

## Next safe step

The feature implementation is already in current main; do not duplicate it. Keep shared source-guard/core-runner files untouched while #400 and #388–#393 are open. The release gate is physical-device acceptance against a build from exact current main. The available #397 artifact is from an older source SHA and debug signer; use a spare device or manually dispatch the merged non-publishing workflow from current main. No merge, tag, version bump, production release, signing change, or task-data modification was performed in this audit.

---
Work by: ChatGPT (status verification and documentation update)
Model: GPT-6
Tooling: GitHub connector (live PR/head/Actions/job-log/source/release/tag/issue audit)
Timestamp (UTC): 2026-10-31T03:39:00Z
