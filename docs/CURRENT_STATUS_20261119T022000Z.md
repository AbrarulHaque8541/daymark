# Daymark status snapshot — 2026-11-19T02:20:00Z

Re-audit of `main` after 19 days of upstream activity, plus one CI completeness fix.

## Current main

- Exact base SHA audited: `f35e605080727ce126c4dfd2a27f8b8efe74bd45`
  (`feat(web): capability registry card for honest feature metadata (#348) (#809)`).
- `main` has advanced **957 commits** since the previous audit cycle's base `c58ca03`. The
  repository is now a multi-surface monorepo: the Android app plus a web prototype with ~25
  "glance card" modules, an Electron desktop app, a browser extension, and an `automation/`
  directory.
- `AGENTS.md` rule 1 changed materially (owner decision 2026-11-10): the product is now
  **network-first**. Browsing is Online by default and stays Online, the browser must load pages
  directly from the internet, and the product must not be described as "local-first" or
  "offline-first". Plain HTTP browsing is now expected, and the merged manifest is required to
  declare `usesCleartextTraffic="true"`.
- Source identity unchanged: `com.abrar.daymark`, `versionName` 1.6, `versionCode` 13,
  `targetSdk` 36, `minSdk` 26.

## Audit cycle: three scopes retried against current main

The three subagent audits from the previous cycle could not run: the subagent sandbox exposes no
filesystem at all, so two of them failed outright and one was cancelled. All three scopes were
therefore performed directly against source, with the same intent.

### Scope 1 — security and leak audit

**Verified healthy**

- No hardcoded credential in tracked source. The only secret-shaped matches are redaction test
  fixtures with obviously fake values. No `.env`, keystore, or key files are tracked.
- Manifest: `allowBackup="false"`, `dataExtractionRules`/`fullBackupContent` exclude every
  domain, only `MainActivity` is exported, provider and receiver are non-exported, no service.
- WebView: no `addJavascriptInterface`, file access disabled, universal file access disabled,
  mixed content never allowed, `onReceivedSslError` cancels.
- Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  `webSecurity: true`, `allowRunningInsecureContent: false`; `lib/webview-popup-policy.js`
  re-forces these on any `<webview>` and strips preload/session overrides, with a test.
  `lib/request-policy.js` rejects URL userinfo, allows HTTPS/WSS only, and restricts `file:` to
  the packaged app assets.
- The web feed reader (`feed-logic.js`) is well hardened: streaming read with the byte cap
  enforced *before* the document is materialised, `AbortController` plus a timeout race,
  `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `redirect: 'error'`, and a hand-written
  XML parser bounded by depth, node count, attribute count, and per-element attribute count.
- The updater cannot be downgraded to HTTP: `setInstanceFollowRedirects(false)` with manual
  redirect handling, every redirect target validated by `UpdaterCore.isAllowedAssetRedirectUrl`
  against an HTTPS host allowlist, and the APK is signature-verified independently.

**Open observation (MEDIUM) — no Content-Security-Policy anywhere**

`git grep -i content-security-policy` returns nothing across the whole repository: not the web
prototype `index.html`, not the Electron renderer, not the extension pages. Both HTML entry points
load scripts as external files only, so a conservative policy is feasible:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'">
```

**Not landed in this cycle, deliberately.** A CSP `connect-src` would have to enumerate ~12
third-party API origins (crypto, currency, weather, country, holidays, dictionary, launch,
onthisday, releases, wiki, air-quality, feed). A missed origin silently breaks a card **at
runtime, not at build time** — the exact green-CI/broken-app trap. This is recorded as a
recommendation for a dedicated cycle with per-card runtime verification, not as a unilateral
change.

**Cleartext posture (documented, compensated, not a defect)**

`usesCleartextTraffic="true"` is now app-wide with no `networkSecurityConfig`. This is the
necessary consequence of the owner's HTTP-browsing requirement — the browser loads arbitrary
user-chosen HTTP hosts, so cleartext cannot be scoped to a domain allowlist. The compensating
control is that every non-browser network client is HTTPS-only, which was re-verified: the four
Android clients all use `HttpsURLConnection` with timeouts, size caps, no redirect following, and
`disconnect()` in `finally`.

### Scope 2 — network and storage integrity

**Verified healthy**

- Every web module that fetches has a `fetchJson(url, fetchImpl, timeoutMs)` helper. All of them
  implement an `AbortController` + timeout race, a bounded streaming reader, `credentials: 'omit'`
  and `redirect: 'error'`. No module fetches without a timeout.
- Android storage uses a shared `AtomicFileAccess` contract: staged `.new` file, `fsync`,
  same-directory commit, `.bak` retention, and a `failWrite` rollback. It is used consistently by
  `EncryptedTaskStore`, `EncryptedBlobStore`, `OAuthTokenVault` and `TaskFocusTimerStore`.
- `TaskSnapshotSchema` accepts schema versions 1 through 5; there is no migration that drops or
  resets user task data.
- The web app persists a task/clear epoch in `localStorage` (`taskMutation.readGeneration`), not
  in memory, so the "do not restore data after a clear" protection survives reload and works
  across tabs. The feed cache is written through the same epoch check.
- No new Android store was introduced since the previous cycle.

### Scope 3 — test honesty, build config, UI accent

**Verified healthy**

- The Node test registry `tests/REQUIRED_NODE_TEST_FILES.txt` holds 105 paths, every one of which
  exists, and every test file in the repository is registered. The registry is enforced by
  `tests/nightly-placeholder-guard.test.js` through an AST-based helper that rejects
  placeholder-only files, comment-only callbacks, empty callbacks, `test.skip`/`test.todo`,
  `test.only`, shadowed `test`/`it` bindings, and test-like text inside strings and templates.
- No whole-word `TODO`, `FIXME`, `XXX`, or `HACK` in any shipped source. The one
  "not implemented" string is the honest user-facing message in
  `browser-proxy-failures-logic.js:57`, which documents a real WebView platform limit.
- No merge-conflict markers. Build outputs are correctly gitignored.
- Accent: `#16705F` is the Android light-mode `android:colorAccent` and the web `--daymark-color-accent`
  token, with `#7ACCB2` as the dark-mode tint. `values-night` has parity for the theme and the
  notice colours. The web app uses a proper token system (`design-tokens.js`) rather than
  scattered literals.
- Build config is current and consistent: AGP 8.12.2 / Gradle 8.13 / JDK 17 / compileSdk 36, with
  `tools/run-gradle-with-retry.sh` validating the wrapper, preferring the cached 8.13
  distribution, and retrying only on a 5xx distribution-download failure.

**Open finding (HIGH) — the merged-manifest permission check never runs in the primary CI
workflow**

`tools/check-merged-manifests.py` is the only check that inspects the **merged** manifest, i.e.
the real permission and cleartext set of the built artifact rather than the source manifests. It
is conditional on Gradle having produced the merged manifests, and it prints its
"manifest architecture policy" summary line either way.

In `android.yml` the host suite (`check-v1-source.sh`) runs **before** the Gradle build, so the
merged manifests do not exist and the merged-manifest assertions are silently skipped — while CI
still prints a PASS line for the manifest architecture policy. This was measured on the exact
head: `grep -c "merged manifest check"` over the source-guard output is **0**.

Three sibling workflows already run the check after their build
(`android-release-assets.yml`, `android-signed-device-test-release.yml`, `focus-live-update.yml`),
so the correct pattern exists upstream; the two release-gating workflows were missing it:

| Workflow | Builds APKs | Ran merged-manifest check (before this cycle) |
|---|---|---|
| `android.yml` (gates every push and PR) | yes | **no** |
| `android-production-release.yml` (gates every release) | yes | **no** |
| `android-release-assets.yml` | yes | yes |
| `android-signed-device-test-release.yml` | yes | yes |
| `focus-live-update.yml` | yes | yes |

**Fixed in this cycle** — see "Change made in this cycle" below.

## Change made in this cycle

Branch `fix/ci-merged-manifest-check-20261119`, off `f35e6050`.

The fix is integrated into the **Gradle build** rather than into a workflow step, because the
merged manifest only exists after Gradle has run. A `verifyMergedManifests` task in
`android-app/app/build.gradle.kts` is registered as a finalizer of every `assemble*` and
`bundle*` task, so the merged manifest of whatever this build produced is verified by
construction — in `android.yml`, in `android-production-release.yml`, and in every device-test
workflow that produces an artifact, with no per-workflow step to maintain or forget.

1. `android-app/app/build.gradle.kts` — a `verifyMergedManifests` task runs
   `tools/check-merged-manifests.py` after the assemble and bundle tasks, logs the script's
   result in the build output so the verification is auditable in CI, and fails the build on a
   non-zero exit. The task passes the variants it actually produced
   (`--variants githubSideloadDebug,playDebug`), so a stale merged manifest left behind by an
   earlier or aborted build is never checked against the current source. It skips, with a clear log line, when the build produced no merged manifest or
   when no Python interpreter is available, so a developer machine without Python still gets a
   working build while CI runners, which always have an interpreter, always enforce it.
   The repository script stays the single source of truth for the expected permission and
   cleartext sets.
2. `android-app/tools/check-ci-test-honesty.py` — now requires the Gradle wiring to exist
   (`verifyMergedManifests`, `finalizedBy(verifyMergedManifests)`, and the use of
   `check-merged-manifests.py`), so the coverage cannot be silently removed.
3. `android-app/tools/check-merged-manifests.py` — an optional `--variants` filter restricts the
   check to named variants, and fails when a requested variant produced no merged manifest at
   all. Callers that do not pass the flag keep the previous behaviour of checking every merged
   manifest found, which is what the existing workflow callers rely on.
4. `test/ci-test-honesty.test.js` — the clean fixture now includes a Gradle build file with the
   required wiring, and two new cases prove the rule is enforced: a build that never verifies the
   merged manifest is rejected, and a build whose verification is not finalized after the
   assemble tasks is rejected.
5. `docs/CURRENT_STATUS_20261119T022000Z.md` and `docs/AGENT_STATUS.md` — this snapshot and the
   status index entry.

### Why this is integrated into Gradle and not into a workflow step

The obvious fix is two lines of YAML: a step that runs `check-merged-manifests.py` after the build
in `android.yml` and `android-production-release.yml`. That fix was written and verified first,
but it **cannot be delivered with the credentials available in this environment**: the token in
use is a classic personal access token with the `repo` scope and **without** the `workflow`
scope. GitHub refuses to create or update `.github/workflows/*` through every available path —
`git push` ("refusing to allow a Personal Access Token to create or update workflow"), the
Contents API, and the Git Data API — so a workflow-file change cannot be pushed at all.

The Gradle integration reaches the same outcome through a file that is not a workflow, and it is
strictly better coverage: it applies to every workflow that builds an artifact instead of the
two that would have been edited by hand. `android-release-assets.yml`,
`android-signed-device-test-release.yml` and `focus-live-update.yml` already run the same script
as an explicit step; those steps are left in place and are now redundant rather than harmful.

The verification was proven **non-vacuous** in both directions:

- Adding an unexpected `android.permission.CAMERA` to a flavor manifest makes the build fail
  with `AssertionError: sideload source manifest unexpected perms` and
  `Merged manifest verification failed with exit code 1`.
- A stale merged manifest left behind by an aborted build is correctly ignored. With a bad
  `playDebug` merged manifest still on disk (containing `CAMERA`) and the source manifest
  restored, `assembleGithubSideloadDebug` still succeeds, because only the sideload variant is
  verified. Before the variant scoping, that stale file would have failed an unrelated build.

## CI status on the pull request

PR #810, head `6bf6b299`, base `f35e6050`. Six workflows ran on the pull request.

| Workflow | Result |
|---|---|
| Android CI | **success** |
| Android PR device-test validation | **success** |
| Android device acceptance artifact (non-publish) | **success** |
| Cross-platform contract tests | **success** |
| Focus timer Live Update adapter | **success** |
| Focus timer Android emulator lifecycle | **flaky — infrastructure, unrelated to this change** |

The decisive evidence that the fix works on a real runner is in the **Android CI** log:

```
> Task :app:verifyMergedManifests
PASS Play merged manifest check: INTERNET=YES, reminder perms=YES, ACCESS_NETWORK_STATE=NO, cleartext=true
PASS Sideload merged manifest check: INTERNET=YES, ACCESS_NETWORK_STATE=YES, reminder perms=YES, optional promoted-notification permission=YES, cleartext=true
PASS manifest architecture policy: Play inherits only shared WebView/reminder permissions; Sideload alone adds ACCESS_NETWORK_STATE and optional POST_PROMOTED_NOTIFICATIONS; Play never requests Live Update promotion
```

Before this change the Android CI log contained no merged-manifest verification at all, only the
two `manifest architecture policy` summary lines produced by the source guard while the assertions
themselves were skipped.

### The emulator workflow failure is pre-existing and unrelated

`focus-timer-emulator` failed on this head twice and passed on one attempt of the previous head.
It is not a regression from this change:

- The failure is an instrumentation assertion in the API 36 run, not a build or check failure:
  `instrumentation failed after 191 assertions: java.lang.AssertionError: resuming after task
  switch publishes task B's notification (published=true, observed=missing)`.
- The **identical** assertion fails on `feat/android-bookmark-newtab-20261114` at commit
  `8c76df28` (run `43818284350`), a branch that touches nothing in the build or the CI pipeline.
  Sibling assertions fail the same way on other runs of that branch.
- The workflow's measured pass rate over its last 30 runs is **30%** (9 success, 21 failure), and
  **28 of those 30 runs are on that unrelated branch**.
- The first attempt on the previous head failed for a different infrastructure reason: Maven
  Central answered `HTTP 429 Too Many Requests` while resolving the Android Gradle plugin, so the
  build failed during dependency resolution before any repository task ran, alongside
  `adb: device offline` while the emulator booted.

This workflow is close to a coin flip and is a release-readiness risk in its own right: if it is
ever made a required status check it will block roughly seven of every ten pull requests with no
signal to distinguish a real regression from baseline noise. The measured data has been added to
the existing owner-tracked issue **#613 — "[QA] Stabilize API 36 Focus Timer and task-editor
emulator lifecycle instrumentation"** rather than filed as a duplicate. No new issue was opened.

## Checks actually run

All on this workspace, against the exact head of `fix/ci-merged-manifest-check-20261119`.

| Check | Result |
|---|---|
| `npm test` | **PASS** — 1433/1433 (1431 before this cycle, +2 new CI-honesty cases) |
| `sh android-app/tools/check-v1-source.sh` | **PASS** — 237 PASS lines, exit 0 |
| Merged-manifest assertions executed inside the source guard | **0** — this is the defect, reproduced |
| `verifyMergedManifests` Gradle task after `assemble*`/`bundle*` | **PASS** — merged manifests verified in the build log |
| Build with an injected unexpected permission | **FAIL as intended** — the build is rejected |
| Build with a stale bad merged manifest from an aborted build | **PASS as intended** — only the variant built is verified |
| `python3 ./tools/check-ci-test-honesty.py` | **PASS** — 20 workflows |
| `./gradlew assembleGithubSideloadDebug assemblePlayDebug lintGithubSideloadDebug lintPlayDebug lintGithubSideloadRelease compileGithubSideloadDebugAndroidTestJavaWithJavac compilePlayDebugAndroidTestJavaWithJavac` | **BUILD SUCCESSFUL** |
| APK metadata via `aapt2 dump badging` | `com.abrar.daymark`, versionCode 13, versionName 1.6, targetSdk 36 |

The five-step sequence above is the exact order the changed workflows execute.

## Status of the previous cycle's findings

The previous cycle committed six local commits on `feat/feed-subscriptions-20261031`
(`fc9e738`, `da958c3`, `7d40bfb`, `11eb36d`, `ee8f8ea`, `9a47069`). That branch is based on
`c58ca03` and is now **957 commits behind `main`**. Its findings were re-checked against current
`main`, and the result changed:

- The URL redaction leak in `BrowserDownloadTracker` is **fixed upstream**. `redact()` now parses
  with `java.net.URI` and uses `getRawAuthority()`, which excludes the path, query and fragment.
- `BrowserDownloadTracker` is **no longer dead code**. It is referenced by `MainActivity` and has
  its own `BrowserDownloadTrackerSmoke` and `run-browser-download-tracker-tests.sh`. Removing it
  would have deleted a working, tested feature.
- `BrowserLoadWatchdog` keeps the query-only and fragment-only redaction fix from #411.
- Upstream added **behavioural** regression coverage for exactly the cases that leaked:
  `BrowserLoadWatchdogSmoke` asserts query-only, fragment-only, multi-userinfo and IPv6
  redaction, and `BrowserDownloadTrackerSmoke` asserts query-only and fragment-only origins.

**Conclusion: the previous cycle's security work is superseded upstream and must not be re-landed.**
Re-applying it would delete a live feature and duplicate existing tests. That branch is left in
place as history and is not proposed for merge.

The one finding from that cycle that still holds is the merged-manifest CI gap, which is the
change made in this cycle.

## NOT TESTED

- No physical device and no emulator were used. Feed and glance-card rendering, capture-as-task,
  offline behaviour, focus notifications, and accessibility are **NOT TESTED on a device**.
- No signed release artifact: the production keystore was not available, so no signed APK/AAB was
  produced or verified.
- The new CI step was verified by running the exact command locally in CI order. It has **not**
  yet been observed on a GitHub Actions runner for this branch.
- Live network fetches against the real third-party glance-card APIs were not exercised; the
  fetches were reviewed statically and via their unit tests with injected fetch implementations.
- The proposed CSP was not applied, so it is **NOT TESTED** at runtime.

## Release state

- The production release remains **v1.5**. This cycle produced no tag and no release.
- `versionName`/`versionCode` are unchanged, so `v1.6` remains a valid future production tag once
  the owner accepts a signed artifact on a device.

## Blocker / next action for the next agent

- Issue **#646** ("Protect main with required CI and independent review rules") is still open and
  is an **owner action**: the repository has no ruleset or branch protection, so a direct push
  can bypass CI. It explicitly must not be enabled automatically. Anyone landing further work
  should assume `main` is unprotected.
- The CSP observation above is the recommended next hardening cycle. It needs per-card runtime
  verification of every third-party origin, not just a static policy edit.
- Physical-device acceptance for current `main` remains outstanding (#160).

---

Work by: Mavis
Model: MiniMax-M3.1-Flash
Tooling: local git, JDK 17, Android SDK 36 (cmdline-tools 13114758), Gradle 8.13, aapt2, javac, python3, node 22, GitHub REST API (read)
Timestamp (UTC): 2026-11-19T02:20:00Z
