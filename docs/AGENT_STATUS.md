# Daymark — agent status index

**Latest snapshot:** [docs/CURRENT_STATUS_20261108T235500Z.md](CURRENT_STATUS_20261108T235500Z.md)

Before acting: verify live GitHub (`main` SHA, open PRs/issues, Actions) — snapshots can lag.

## Open work (re-check live)

- PR #585 (draft): ci: gate device acceptance APK artifacts
- PR #582 (draft): feat(browser): add history and tab-store groundwork
- Issues: #348 (browser UX / downloads), #160 (QA matrix), #476 (repeat scheduling), #325 (cross-platform)

## Last agent action (this cycle)

- Fixed failing clipboard unit test on modern Node (`navigator` is not assignable).
- Added Escape-to-clear on the offline download safety form (keyboard parity with Clear).
- `npm test` 445/445 PASS. Physical device: **NOT TESTED**.

