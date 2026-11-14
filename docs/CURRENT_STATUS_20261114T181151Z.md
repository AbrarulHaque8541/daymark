# Daymark engineering status — 20261114T181151Z

## Android browser saved-bookmark shortcuts (branch feat/android-bookmark-newtab-20261114)

At `2026-11-14T18:11:51Z`, PR [#779](https://github.com/AbrarulHaque8541/daymark/pull/779) was OPEN and unmerged on branch `feat/android-bookmark-newtab-20261114`, based on `83bc05f48030f351099f55e3f2ac012b36b94bcd` at head `0e137da77650d5a5c3f94461b25ecbf1a6bb6448`. Its current state is documented in the latest snapshot and live PR.

The bookmark-only change at this timestamp added an optional, hidden-when-empty native Saved sites rail to Android browser blank tabs. It showed up to four newest origins from the existing saved-bookmark preference, kept origin-only persistence unchanged, labeled HTTP shortcuts as not encrypted, and refreshed on blank-tab creation/switch, return home, and bookmark clearing. No browser history was used to infer shortcuts. The later owner-approved URI-routing work was added to this same branch and PR; the earlier routing description is historical only.

> **Historical snapshot, superseded:** The details below describe bookmark-only state at `2026-11-14T18:11:51Z`, when PR #779 was at `0e137da77650d5a5c3f94461b25ecbf1a6bb6448`. URI routing was subsequently implemented on the same branch/PR. See [the latest status snapshot](./CURRENT_STATUS_20261114T193525Z.md) for the current routing, verification, and blocker state. The SHA and check counts below are historical, not live.

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
