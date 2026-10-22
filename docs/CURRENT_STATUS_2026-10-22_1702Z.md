# Daymark status snapshot — 2026-10-22 1702 UTC

Checked against live GitHub at `2026-10-22T17:02:50Z`. Every claim below was re-verified live; where the previous snapshot (`2026-10-16 0510 UTC`) disagrees, live evidence wins and the difference is recorded under **Drift from the previous snapshot**.

## Current repository and build identity

- Repository: [`AbrarulHaque8541/daymark`](https://github.com/AbrarulHaque8541/daymark).
- Current `main`: `6d757e40d5a673c50f7a1b6b7940b6306c662f1f` (merge of PR #331, the attachment reliable-pipe fix). The previous `main` at the start of this check was `cc264e8967e318a742673da29ccc61bd22c61378` (merge of PR #324).
- Android Gradle namespace / application ID: `com.abrar.daymark`.
- Android source baseline: `versionName=1.4`, `versionCode=11`, `compileSdk=36`, `targetSdk=36`, `minSdk=26`.
- Recent `main` merges: #324 (backup domain exclusions), #326 (platform parity contract), #327 (shared browser policy contract tests), #328 (desktop UI spike), #329 (Android WebView state and CI), #330 (arena / AI task assistant).

## Release state

- Latest **published** release: [v1.3](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.3), published `2026-10-16T13:50:55Z`, asset `Daymark-v1.3-githubSideload.apk`. It targets API 35 and is not an API-36 production build.
- [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.4) exists as a **draft only** (created `2026-10-17T06:49:13Z`) with asset `Daymark-v1.4-githubSideload.apk`. It has never been published. Per `AGENTS.md` and the README, a draft must be cold-launched and accepted by the owner on the physical phone before it is manually published.
- **No release, tag, APK delivery, or publication was performed during this check.** Do not infer v1.4 availability from the draft asset.

## Open pull requests (5)

| PR | Head SHA | Branch | Subject |
|---|---|---|---|
| [#331](https://github.com/AbrarulHaque8541/daymark/pull/331) | `eaadcb414688` | `fix/android-attachment-streaming-error-propagation-…` | Fix Android attachment streaming error propagation via reliable pipe |
| [#332](https://github.com/AbrarulHaque8541/daymark/pull/332) | `526489ac` | `ci/lock-attachment-reliable-pipe-guard-20261022` | Prove the attachment reliable-pipe guard actually fails closed (stacked on #331) |
| [#333](https://github.com/AbrarulHaque8541/daymark/pull/333) | `c515df7d` | `vibe/stale-reminder-notification-cleanup-20261022` | Cancel stale posted task-reminder notifications |
| [#334](https://github.com/AbrarulHaque8541/daymark/pull/334) | `caa10f80` | `fix/webextension-import-rule-caps-20261022` | Reject over-limit WebExtension import scopes |
| [#335](https://github.com/AbrarulHaque8541/daymark/pull/335) | `9bde8340` | `docs/status-snapshot-2026-10-22` | Add this status snapshot |

**#331 was merged by the owner at `2026-10-22T17:03:43Z`** (merge commit `6d757e40d5a6`) after its head was reconciled and its exact-head checks passed. The remaining four were `mergeable_state = CLEAN` at the time of this check. The branch heads are moving while this snapshot is written — re-read the live PR state rather than relying on the SHAs above.

### #331 — attachment streaming error propagation — MERGED

**Merged** `2026-10-22T17:03:43Z` by the owner as `6d757e40d5a673c50f7a1b6b7940b6306c662f1f`. The content below is the state at the moment of merge.

- The provider previously used `ContentProvider.openPipeHelper`, whose plain pipe reports a decryption failure as a **clean EOF** — a truncated or corrupt attachment could reach the reader with no signal. The change moves to `ParcelFileDescriptor.createReliablePipe()` with `closeWithError("Attachment streaming failed")` on failure, leaving the read-only check, safe-type check, URI/task binding, and sharing-grant behaviour unchanged. No crypto-format or data migration.
- **PR-head desync — resolved.** The PR head had been left at the pre-correction commit `6373812a0daf` while the branch already carried the correction `701d0aa2a63d`: `pulls/331.head.sha` and `refs/pull/331/head` both reported `6373812`, the PR timeline had no `synchronize` event (only a `head_ref_force_pushed` event at `2026-10-22T16:26:40Z`), and the green checks therefore covered the pre-correction tree only. A lease-protected force-push round trip on the same branch (no commit created, rewritten, or dropped) produced the missing `synchronize` event and re-pointed `refs/pull/331/head` at the correction. The three refs — branch tip, `pulls/331.head.sha`, `refs/pull/331/head` — now agree at `eaadcb4146881dce276c95d0699b1d1115afb752`.
- Branch history at this check: `eaadcb41` (Jules) → `f77e107` (coherent test pair before cold launch) → `a3b5a735` (Cue: guard + CI regression) → `701d0aa` (Cue: harness correction) → `6373812` (Jules: reliable pipe) → `cc264e8` (main). The correction and the guard commit are both ancestors of the head — verified with `git merge-base --is-ancestor`.
- Exact-head checks on `eaadcb414688`: `build` (Android CI) **PASS**; `Build and verify device-test APK` **PASS**; `Shared contracts (ubuntu-24.04)` **PASS**; `Shared contracts (windows-2025)` **PASS**; `Publish and verify GitHub Release APK asset` **skipped** (untagged PR, correct).
- The corrected fixture and provider tree passed five assertions on a scratch API-29 x86_64 emulator, and the identical test against unchanged `main` `cc264e8` failed as expected (truncated ciphertext received as clean EOF). That is **Cue's** reported evidence; it was not independently reproduced in this check.
- **NOT TESTED:** physical device. The API-36 cold-launch and release-integrity acceptance remain separate evidence (see #160, #299).

### #332 — guard self-test

- Tooling only: `android-app/tools/run-check-guard-tests.sh`. No production source, workflow, or release change.
- `a3b5a735` added the guard assertions, but nothing proved they still fire. #332 adds the missing meta cases so the reliable-pipe contract is verified **by removal**, per the issue #196 pattern already used by this harness. It also adds the optional checker argument that `check-attachment-source.py` needs (it takes a root path, so invoking it without one exits non-zero on an `IndexError` and would have produced a false pass), and restores the provider file alongside `MainActivity.java` on early exit.
- Host verification on `96b88aa4` (rebased onto `main` @ `6d757e4`): `sh android-app/tools/check-v1-source.sh` **PASS** (94 PASS lines, exit 0); `npm test` **PASS** (32/32); `run-check-guard-tests.sh` **PASS**. **NOT TESTED:** no Android build, emulator, or device.

### #333 and #334

- #333 touches `TaskReminderReceiver.java`, `TaskReminderScheduler.java`, `check-reminder-lifecycle.py`, and a new `TaskReminderSchedulerSmoke.java`. No file overlap with #331 or #332.
- #334 addresses WebExtension import scope caps. Its changed files were not inspected in this check.
- Five PRs are open concurrently across attachment streaming, reminder lifecycle, extension import rules, source-guard tooling, and this snapshot. They touch different files, but **no `MainActivity.java` change may be proposed in more than one of them at a time** (AGENTS.md §5).

## Open issues

| Issue | State | Subject |
|---|---|---|
| [#325](https://github.com/AbrarulHaque8541/daymark/issues/325) | OPEN | Cross-platform Daymark architecture: Windows, Linux, Android, HarmonyOS + browser engine spike |
| [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) | OPEN / device FAIL recorded | Browser: search/page never loads — white viewport, status stuck at "Opening page" |
| [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) | OPEN | Current-main Android runtime acceptance matrix: browser, Reader Mode, extensions, SAF and update |

## CI on `main`

- `main` @ `cc264e8967e3`: `Android CI` [run 39799402988](https://github.com/AbrarulHaque8541/daymark/actions/runs/39799402988) **PASS**; `Cross-platform contract tests` [run 39799403026](https://github.com/AbrarulHaque8541/daymark/actions/runs/39799403026) **PASS**.
- Earlier `main` push runs for #326–#330 were cancelled by GitHub's concurrency group, not failed. A cancelled run is not a passing run; the merged-PR results above are the ones that count for `cc264e8`.

## Drift from the previous snapshot (2026-10-16 0510 UTC)

The previous snapshot recorded `main` as `9be0b7753de3`, `versionName=1.2` / `versionCode=9`, `targetSdk=35`, and **0 open PRs**. Live state at this check: `main` is `6d757e40d5a6` (`cc264e8967e3` at the start of this check, then #331 merged), `versionName=1.4` / `versionCode=11` / `targetSdk=36`, and **4 open PRs** (#331 was merged during this check). Issues #221 and #160 remain open, and #325 was opened `2026-10-22T04:44Z`. The previous snapshot's `#299` / `#257` / `#306` entries were not individually re-verified in this check — verify before relying on their state.

## Evidence boundaries

- Source inspection, host tests, Android CI, signed-artifact verification, and physical-device/emulator testing are distinct. A green CI run does not prove device behaviour.
- The workflow results above apply to the exact commits named. A branch that moves after CI runs is not covered until its own checks complete.
- Published release/tag state must be checked live before any release action. Nothing was published in this check.
- No merge, tag, release, APK delivery, or deployment was performed **by this check**. PR #331 was merged by the repository owner at `2026-10-22T17:03:43Z`, independently of this snapshot.

## Suggested next steps

1. Merge #332 into `main` so the reliable-pipe guard that shipped in #331 is covered by a self-test.
2. Owner action for v1.4: cold-launch the exact draft APK on the physical phone, record device model, API level, WebView provider/version, build SHA and APK SHA, then publish or discard the draft explicitly.
3. Physical-device acceptance under #160 remains the gating evidence for #221, #299, and the v1.4 release decision.
4. #325 is the canonical meta issue for cross-cutting work; route browser-engine and desktop-spike questions there rather than into the Android PRs above.

---
Work by: Mavis (MiniMax Agent)
Model: minimax-M2.5
Tooling: GitHub CLI (gh), git, bash, Python 3.11, Node.js 22 (node --test), OpenJDK 17, AOSP source (android.googlesource.com)
Timestamp (UTC): 2026-10-22T17:02:50Z
