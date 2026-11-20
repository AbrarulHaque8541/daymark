# Daymark engineering status — 2026-11-20T03:18:49Z (PR #821: release-compatibility guidance)

## Live state

| Item | Verified state at this snapshot |
|---|---|
| `main` | `83752d5102a3a8179f1269e42103176457c50bfc` |
| Follow-up PR #821 | Open; head `eb6dd34c475313b5b041713f3950cbfedbe089da`, based on the `main` SHA above; GitHub reported `MERGEABLE`. At that exact head, 1 check passed and 5 were pending. |
| PR #820 | Merged by the repository owner on 2026-11-19 at 17:17Z; head `4d12f00ce519983a59be30e480f2ecc333b4caac`, merge commit `4780bb7fa3d0e4e48a7282af5cd26f15fb614f0d`; all six exact-head checks passed. |
| Related issue #348 | Open. |
| Published Android release | [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), published 2026-10-23. |
| Current main source | `applicationId` `com.abrar.daymark`, `versionName` `1.6`, `versionCode` `13`; source values do not mean v1.6 is published. |

## What PR #821 corrects

The web-prototype card is a fixed source guide and topic checklist. It does not inspect an installed app or APK, calculate a version-to-version update path, test a migration, or perform an install or rollback. The current Gradle file and signing configuration are source facts, not guarantees about every future build or an arbitrary APK. Android uses `versionCode` to protect against downgrades, so an APK with a lower code can be blocked over a newer install.

The current `TaskSnapshotCodec` reads task snapshot schemas v1–v5 and writes v5. That describes supported current source formats; it is not a guarantee that every future version, field, or device will retain all data. CI/emulator evidence is distinct from physical-device acceptance. Physical-device behavior remains **NOT TESTED**.

## Status clarification

The preserved [2026-11-19 17:05:46Z snapshot](./CURRENT_STATUS_20261119T170546Z.md) was written before PR #820 merged. Its “Shipped in this slice” wording is historical and was not proof of an Android release; PR #820 later merged the web-prototype card. The latest Android production release remains v1.5, and PR #821 does not change Android release artifacts or runtime code.

## Verification on the follow-up branch

| Check | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund --include=dev` | **PASS** |
| `npm test` | **PASS**, 1,510/1,510 |
| `sh android-app/tools/check-v1-source.sh` | **PASS**, exit 0 |
| `git diff --check` | **PASS** |
| Physical-device acceptance | **NOT TESTED** |

The PR #821 check count above records GitHub's status at this snapshot time; its later exact-head status must be checked on GitHub. No merge or release was performed.

## Sources

- [PR #821](https://github.com/AbrarulHaque8541/daymark/pull/821), [merged PR #820](https://github.com/AbrarulHaque8541/daymark/pull/820), and [issue #348](https://github.com/AbrarulHaque8541/daymark/issues/348).
- [Android versioning documentation](https://developer.android.com/studio/publish/versioning) (version-code downgrade protection).
- Current source: `android-app/app/build.gradle.kts`, `android-app/app/src/main/java/com/abrar/daymark/EncryptedTaskStore.java`, and `android-app/app/src/main/java/com/abrar/daymark/TaskSnapshotCodec.java`.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, Node.js 24.19.0, repository source guard
Timestamp (UTC): 2026-11-20T03:18:49Z
