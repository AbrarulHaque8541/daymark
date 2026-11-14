# Daymark engineering status — 20261114T181151Z

## Android browser saved-bookmark shortcuts (branch feat/android-bookmark-newtab-20261114)

PR [#779](https://github.com/AbrarulHaque8541/daymark/pull/779) is OPEN and unmerged. It is based on `main` SHA `83bc05f48030f351099f55e3f2ac012b36b94bcd`, at head `0e137da77650d5a5c3f94461b25ecbf1a6bb6448`.

The change adds an optional, hidden-when-empty native Saved sites rail to Android browser blank tabs. It shows up to four newest origins from the existing saved-bookmark preference, keeps origin-only persistence unchanged, labels HTTP shortcuts as not encrypted, and refreshes on blank-tab creation/switch, return home, and bookmark clearing. No browser history is used to infer shortcuts. No URI-scheme routing changes are included; existing HTTP/HTTPS behavior remains unchanged while the owner’s per-scheme routing instruction is unresolved.

### Verification at head 0e137da77650d5a5c3f94461b25ecbf1a6bb6448

- `sh android-app/tools/run-core-tests.sh` — PASS, including the 9-assertion bookmark-shortcut smoke and source integration guard.
- `sh android-app/tools/check-v1-source.sh` — PASS.
- `npm test` — PASS, 1,194 tests.
- GitHub checks at 2026-11-14T18:11:31Z — 8 successful, 3 pending, 0 failing. The `Android CI/build` and `Android device acceptance` checks are successful; no blanket claim is made about the remaining pending checks.
- Local APK build/size comparison — NOT RUN because this sandbox has no configured Android SDK. Manual physical-device/TalkBack acceptance — NOT TESTED. No production APK was created.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, Git, OpenJDK 21 host tests, Python source guards, Node.js test suite; Gradle build attempted (Android SDK unavailable)
Timestamp (UTC): 2026-11-14T18:11:51Z
