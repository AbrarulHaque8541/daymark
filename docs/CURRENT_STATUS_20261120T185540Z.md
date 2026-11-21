# DayMark engineering status — 2026-11-20T18:55:40Z (R&D: task search and render isolation)

## Live state at snapshot time

| Item | Verified state |
|---|---|
| `main` | `17e5796fea710486709ba3dd0a00467fce4b007e` |
| Feature branch | `perf/web-task-view-render-isolation-20261121` |
| Code commit | `a961482c223e31f7f308b980b53f66bc685f4e65` |
| PR #835 | [Open and mergeable](https://github.com/AbrarulHaque8541/daymark/pull/835); base `17e5796fea710486709ba3dd0a00467fce4b007e`, head `a961482c223e31f7f308b980b53f66bc685f4e65` |
| Other open PRs | #831 (`8fd3aaab9aea000cd262f424aeb4e4b7a66256a3`), #832 (`0fd25eac2c0deaa5fa81fe22efd35ed5d266f56b`), #834 (`9ac6ef512ee2a31c2eed8ecbcdcc679b9b253855`) |
| Latest published release | v1.5; no release action in this cycle |
| Physical-device acceptance | **NOT TESTED** |

## Work in this cycle

The web task search now coalesces rapid input over 120 ms, then persists one final preference and renders the task list once. Blur and backgrounding flush the pending work; pagehide persists without rendering a hidden page, and a back/forward-cache restore reapplies the current view. Search, sort, filter, reset, and tag-chip search use the task-view-only render path. It skips unchanged overview counts, completion statistics, suggestions, Focus, and feed; date-derived overview data is refreshed if the page crossed local midnight. Tag-chip query preferences are persisted.

Screen-reader behavior is preserved: an active query immediately quiets the full task list, while the concise result-count status changes together with the debounced list render. Regression tests cover the debounce, storage-write coalescing, render isolation, clear/filter/sort behavior, lifecycle flushes, bfcache restore, tag persistence, and search announcements.

Files changed: `app.js`, `tests/app-background-timers.test.js`, `tests/search-announcement.test.js`.

## Verification

| Check | Result |
|---|---|
| `npm test` | **PASS** — 1,595/1,595 |
| Focused search/accessibility/lifecycle tests | **PASS** — 15/15 |
| `sh android-app/tools/check-v1-source.sh` | **PASS** |
| `git diff --check` | **PASS** |
| Independent read-only review | Accessibility timing, bfcache restoration, and tag persistence findings were addressed; final focused regressions pass |
| Android WebView runtime / physical device | **NOT TESTED** |
| Windows/Linux/native desktop runtime | **NOT TESTED** |
| `npm ci` | **NOT RUN**; dependency manifests were unchanged |

At snapshot time, PR #835's checks on code head `a961482c223e31f7f308b980b53f66bc685f4e65` were **IN PROGRESS**: [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/44797298474), [Android PR device-test validation](https://github.com/AbrarulHaque8541/daymark/actions/runs/44797298480), [Android device-acceptance artifact](https://github.com/AbrarulHaque8541/daymark/actions/runs/44797298671), and [cross-platform contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/44797298577). Adding this status snapshot moves the PR head and causes checks to run again; the resulting exact head and statuses must be verified separately. No merge, signing, publication, or release was performed.

---
Work by: Cue Agent (DayMark R&D)
Model: not disclosed by runtime
Tooling: GitHub connector CLI, git, Node.js `node:test`, Android source-contract scripts
Timestamp (UTC): 2026-11-20T18:55:40Z
