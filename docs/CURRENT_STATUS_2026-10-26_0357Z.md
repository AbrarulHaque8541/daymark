# Daymark status snapshot — 2026-10-26 0357 UTC

Verified against live GitHub at `2026-10-26T03:57:57Z`.

## Current source

- `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`.
- Android source uses application ID/namespace `com.abrar.daymark`, versionName `1.5`, versionCode `12`, compile/target SDK 36, Android Gradle Plugin 8.12.2, and Gradle 8.13.
- Current-main [Android CI run 39934982721](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982721) and [cross-platform contract run 39934982786](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982786) completed successfully on this exact SHA.

## Published release

- [Daymark v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5) is published, not a draft or prerelease, and is the latest release. It was published `2026-10-23T09:42:55Z`.
- Tag `v1.5` points to `ca6453374c46a1449c8bbec09a27a218d127d8e4`, an earlier `main` commit than the current source.
- The sole asset is `Daymark-v1.5-githubSideload.apk`, 253,936 bytes, with SHA-256 `496280987fc910d3a9dde9e4ecac79c5f9286b6c2a88f2f18df75e45d9702bc8`. Release metadata reports package `com.abrar.daymark`, versionName 1.5, versionCode 12, minSdk 26, targetSdk 36, and the pinned production signer SHA-256 `ad6be60bd89c076c2d3985ec20c30533dd9ff10e07418d64ad1d825418030580`.
- The v1.4 release remains an unpublished draft; it is not the latest release.
- Android developer verification began 2026-09-30 for participating stores in Brazil, Indonesia, Singapore, and Thailand on certified Android 7+ devices. Google's [FAQ](https://developer.android.com/developer-verification/guides/faq) says direct sideloads are outside that initial phase and global rollout is planned for 2027. Before broad distribution, review registration of `com.abrar.daymark` and the existing production signing key via the [Android Developer Console](https://developer.android.com/developer-verification/guides/android-developer-console); no code/signing change or account registration was made here.

## Workflow evidence and limits

- Production workflow [run 39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) ended **FAIL** during its last draft-release verification after the draft was created. The artifact was independently verified and v1.5 was published separately; merged [PR #337](https://github.com/AbrarulHaque8541/daymark/pull/337) fixes draft lookup for future runs. Do not report this overall workflow run as passing.
- Emulator/CI evidence and physical-device acceptance are distinct. Owner physical-device behavior for install/update, Android 16 UI, WebView provider/rendering, Keystore/backup, accessibility, reminders, and process-death recovery remains **NOT TESTED** in the evidence reviewed here.

## Open pull requests and issues

Open pull requests at verification time:
- [#333](https://github.com/AbrarulHaque8541/daymark/pull/333), head `9b860535e2c48e64c193f1e5c614ee1af74b3aa0`: reminder lifecycle and attachment instrumentation; also changes `.github/workflows/android.yml`.
- [#338](https://github.com/AbrarulHaque8541/daymark/pull/338), head `735d74b45096ee9b104eca54b5276a89975592c0`: native palette alignment.
- [#339](https://github.com/AbrarulHaque8541/daymark/pull/339), head `a2b13fe68b617a241c6795ef9fb5fecaec8385ce`: task-list scroll/composer behavior; edits `MainActivity.java`.

Open issues relevant to this review:
- [#160](https://github.com/AbrarulHaque8541/daymark/issues/160): current-main Android runtime acceptance matrix.
- [#221](https://github.com/AbrarulHaque8541/daymark/issues/221): reported blank browser viewport.
- [#325](https://github.com/AbrarulHaque8541/daymark/issues/325): cross-platform architecture.
- [#340](https://github.com/AbrarulHaque8541/daymark/issues/340): `test*UnitTest` tasks have no app `src/test` sources and can pass without tests. This is an open tracked CI issue; PR #333 also changes the Android workflow, so any fix should coordinate with that active PR.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: Git, GitHub CLI, official Android documentation, repository source inspection
Timestamp (UTC): 2026-10-26T03:57:57Z
