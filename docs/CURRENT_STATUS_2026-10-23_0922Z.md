# Daymark status snapshot — 2026-10-23 0922 UTC

Checked against live GitHub and the local release candidate at `2026-10-23T09:22:00Z`. Live evidence wins over older snapshots.

## Current repository and build identity

- Repository: [`AbrarulHaque8541/daymark`](https://github.com/AbrarulHaque8541/daymark).
- `main` before this status commit: `eb2c1af08997ae4011f1d15757f5a7f76c1938fc` (merge of PR #335).
- Android Gradle namespace / application ID: `com.abrar.daymark`.
- Release candidate in source: `versionName=1.5`, `versionCode=12`, `compileSdk=36`, `targetSdk=36`, `minSdk=26`.
- Production signer pin remains `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580`.

## Merged during this check

| PR | Merge commit | Subject |
|---|---|---|
| [#332](https://github.com/AbrarulHaque8541/daymark/pull/332) | `84633a77fa38109fd54350dc9eee82d66355c5ac` | Prove the attachment reliable-pipe guard fails closed |
| [#334](https://github.com/AbrarulHaque8541/daymark/pull/334) | `5473844ff7c6d5c3595002ad403d67dcfd3e8685` | Reject over-limit WebExtension import scopes |
| [#335](https://github.com/AbrarulHaque8541/daymark/pull/335) | `eb2c1af08997ae4011f1d15757f5a7f76c1938fc` | 2026-10-22 1702 UTC status snapshot |

All three were open, non-draft, `MERGEABLE`, and had four successful checks plus the expected skipped release-asset job on their exact heads before merge.

## Release-candidate changes in this cycle

- **Internationalized domains in the browser.** `BrowserAddress` now converts Unicode hosts to IDNA ASCII before validation, so `münchen.de`, `例え.jp`, and `मेरा-साइट.in` navigate over HTTPS instead of being rejected. Embedded credentials are still rejected with a distinct error. Covered by new `BrowserAddressSmoke` assertions.
- **Natural-language quick add.** Supports `in N days/weeks`, `day after tomorrow`, and a distinct `next <weekday>` meaning one week beyond the nearest upcoming weekday. A date/time token that leaves a boundary preposition (`at`, `on`, `by`, `for`) no longer pollutes the title, while inner prepositions and date-free text are unchanged. Covered by `NaturalLanguageTaskParseSmoke` (32 assertions).
- **Version bump and guard.** Source is now `versionName=1.5` / `versionCode=12`; `check-release-identity.sh` now requires `versionCode >= 12`.

## Verification actually run

| Check | Result |
|---|---|
| `sh android-app/tools/check-v1-source.sh` | **PASS** (rc=0; final summary 5 assertions) |
| `npm test` | **PASS** (32/32) |
| `bash android-app/tools/run-core-tests.sh` | **PASS** (150 core assertions plus all listed suites) |
| All other `tools/run-*.sh` host suites (12 scripts) | **PASS** |
| `tools/run-attachment-streaming-instrumentation.sh` | **NOT RUN** — requires an adb device/emulator |
| `bash android-app/tools/check-release-identity.sh` | **PASS** (versionName 1.5, versionCode 12, signer pin and workflow gates) |
| `assembleGithubSideloadDebug` (JDK 17) | **PASS**; APK 322,200 bytes |
| Physical-device acceptance | **NOT TESTED** — no phone or `/dev/kvm` in this environment |
| Signed release build, API-29/API-36 cold launch | delegated to the tag-triggered GitHub workflow; verify its exact-tag run before publishing |

## Release state

- Latest **published** release at check time: [v1.3](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.3).
- [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.4) remains an unpublished **draft** (`versionCode=11`) and must not be confused with this candidate.
- The owner explicitly instructed a release for this cycle. Tag `v1.5` must point at a commit on `main` whose Gradle `versionName` is `1.5`; the production workflow creates a signed draft and runs API-29/API-36 emulator gates. Publication requires those gates to pass, the draft APK's SHA-256/package/version/signer to match, and the draft metadata to be present. Physical-device acceptance remains separately **NOT TESTED** and must be recorded honestly.

## Open PRs and issues

- Open PR [#333](https://github.com/AbrarulHaque8541/daymark/pull/333) is still a **draft** and conflicting with `main`; it was not merged or modified in this cycle.
- Open issues: [#325](https://github.com/AbrarulHaque8541/daymark/issues/325) (cross-platform architecture), [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) (browser white viewport on device), [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) (runtime acceptance matrix). #221 and #160 still require physical-device evidence; a green host/CI suite does not close them.

## Evidence boundaries

- Host tests and a debug build do not prove signed-artifact integrity or device behaviour.
- Store, reminder, browser, and UI device scenarios remain unverified until performed on a phone and recorded with device model, API level, WebView provider/version, build SHA, and APK SHA.
- This snapshot was written before the tag-triggered workflow completed; the live Actions run and Releases page are authoritative for that outcome.

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, GitHub CLI (gh), OpenJDK 17, Gradle 8.13/AGP 8.12.2, Android SDK API 36, Node.js
Timestamp (UTC): 2026-10-23T09:22:00Z
