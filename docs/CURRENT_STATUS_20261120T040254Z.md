# Daymark engineering status — 2026-11-20T04:02:54Z (web high-priority filter merged)

## Live state

| Item | Verified state |
|---|---|
| `main` | `abc550f4cf87898d5ced2a0de225f6adbc37c615` |
| PR #824 | Merged at `abc550f4`; exact PR head `98934d395e7279deea7716d2959094bf9f4fad12`; 6/6 checks successful |
| Main Actions | Android CI and Cross-platform contract tests both passed on `abc550f4` |
| Open PRs | #822, #823, #825; none is the high-priority filter PR |
| Physical device | **NOT TESTED** |

## Work in this cycle

Added a web task filter for high-priority tasks. It shows a live count and empty state, composes with search, includes completed high-priority tasks consistently with existing views, persists the selected view, and is reachable with shortcut `6`. Web filter patterns were checked against the official [Todoist priority guide](https://www.todoist.com/help/todoist/features/set-a-priority-in-todoist-Wy82Jp), [TickTick help](https://help.ticktick.com/articles/7055782240994721792), and [Apple Reminders Smart Lists guide](https://support.apple.com/guide/iphone/use-smart-lists-iphe882772ed/ios).

The native Android counterpart is **not merged or published**. PR #822 is still open and changes the shared `MainActivity.java`; its latest head `83a9d38c3484425ad5103cd3d40f8163c9f3e81f` has failing Focus runtime checks on API 29 and API 36. Do not open a second `MainActivity.java` PR until #822 is resolved. The Android implementation was kept separate rather than overlapping that active branch.

Other active Android work at this snapshot: PR #823 (`5c20bfe`) has Focus runtime API 29 failing and API 36 in progress; PR #825 (`59302ec`) has build/device-artifact checks in progress. Neither changes `MainActivity.java`.

## Verification

- `npm ci --ignore-scripts --no-audit --no-fund --include=dev` — **PASS**
- `npm test` — **PASS**, 1,512/1,512
- `sh android-app/tools/check-v1-source.sh` — **PASS**, exit 0; updated task-filter smoke: 23 assertions
- `git diff --check` — **PASS**
- PR #824 exact-head checks — **PASS**, 6/6; independent read-only review — no blocking findings
- Main Actions on `abc550f` — **PASS**: [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/44671357610) and [Cross-platform contract tests](https://github.com/AbrarulHaque8541/daymark/actions/runs/44671357432)
- Android Gradle build in this sandbox — **NOT RUN** (no Android SDK configured); physical-device/TalkBack verification — **NOT TESTED**

---
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, Git, Node.js 24.22, npm, Android source-check suite
Timestamp (UTC): 2026-11-20T04:02:54Z
