# Daymark engineering status — 2026-11-25T13:26:47Z

Glance-card consistency pass landed; release-readiness audit of `v1.6` (the failed production run) completed.

## Current state (verify live before acting)

- `main` = `27c0c65cb52d55af1bf9240aeda1df4faf663e16`.
- App identity/version in source (`android-app/app/build.gradle.kts`): `applicationId`/`namespace` = `com.abrar.daymark`, `versionName` = `1.6`, `versionCode` = `13`, `targetSdk` = 36.
- Open PRs: **0**. Open issues: **15** (all QA/verification or platform-spike trackers, e.g. #160 Android runtime acceptance, #613 emulator lifecycle, #646 branch protection — none are unmerged code).
- Published release: **v1.5** (2026-10-23). Tag `v1.6` exists at `3c9ad3aa` (2026-11-23) but **no GitHub Release for v1.6** was ever published.

## What landed this session

- #955 `fix(web): single busy spinner + drop verified-dead CSS` → squash `d12b671c`. Removed the duplicate `::after` button spinner layer + `button-spin` keyframes; removed 15 verified-dead CSS classes; added a CSS regression asserting exactly one busy spinner layer.
- #956 `feat(web): air quality glance success flash` → squash `08203e55`. Air-quality card now uses the shared `.feed-status.is-success` flash.
- #957 `feat(web): shared success flash across the remaining glance cards` → squash `27c0c65c`. Added the shared success flash to currency, holidays, wiki, dictionary, onthisday, daylight, launch, releases. All 19 network-fetch glance cards now signal success consistently. Each status helper keeps its idle/error/cached/cleared lines non-success (`toggle(name, !!undefined)` clears).

All 44 `*-ui.js` glance/browser modules are wired in `index.html` on `main`.

## Release readiness — v1.6 failure root cause (resolved on main)

The one production run for `v1.6` (workflow run `45133059064`, 2026-11-23) **FAILED** at step "Verify package, version, and signing identity" with:

```
##[error]APK does not expose the expected launcher Activity
```

Diagnosis (verified in the run log and git history):

- The APK was signed (APK Signature Scheme v2, 1 signer), `Package ID com.abrar.daymark`, `versionName 1.6`, `versionCode 13`, `targetSdk 36` — all correct.
- The workflow at that tag hardcoded the launcher gate as `com.abrar.daymark.MainActivity`. The app's launcher activity is `.SplashActivity`, so the gate failed.
- Fix already on `main`: commit `5571a511` "fix(ci): derive release launcher-activity gate from the manifest (#944)" derives the expected launcher activity from `AndroidManifest.xml` instead of hardcoding it. `git merge-base --is-ancestor 3c9ad3aa 5571a511` confirms the `v1.6` tag predates the fix, i.e. the failed run used the old gate and current `main` uses the corrected one.

## Decision required before a new release (owner approval — AGENTS.md §6)

No production tag or release is created by an agent without explicit owner approval. To produce a new installable APK from current `main`:

- The production workflow (`.github/workflows/android-production-release.yml`) triggers on a `v*` tag, requires the tag commit to be an ancestor of `main`, `GITHUB_REF_NAME == v${versionName}` (i.e. `v1.6`), and actor `AbrarulHaque8541`; it builds the signed APK/AAB, runs the identity/version/signer gates plus API 29 and API 36 cold-launch gates, and opens a **draft** release for owner-device acceptance.
- The tag `v1.6` already exists at the stale `3c9ad3aa`, so publishing the current `main` requires either (a) force-moving `v1.6` to `main` (destructive on the old tag), or (b) bumping `versionName`/`versionCode` on `main` (e.g. 1.7 / 14) and tagging `v1.7`. Decision is the owner's.

## Verification labels

- Host tests: **PASS** — `npm test` 1987/1987 on the merged heads; `sh android-app/tools/check-v1-source.sh` exit 0.
- Android CI: **PASS** — all 6 checks green on #955/#956/#957 heads and on `main`.
- Signed-artifact verification: **NOT RUN** this session (last attempt, `v1.6`, failed on the now-fixed launcher gate).
- Physical-device / emulator acceptance: **NOT TESTED** this session; the release workflow's API 29 + API 36 cold-launch gates run only when a release tag is pushed.

---
Work by: TraeCode agent
Model: DeepSeek-V4.1-Flash
Tooling: git, gh CLI, node --test, sh android-app/tools/check-v1-source.sh
Timestamp (UTC): 2026-11-25T13:26:47Z
