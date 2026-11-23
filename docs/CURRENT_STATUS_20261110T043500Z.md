# Daymark engineering status — 2026-11-10T04:35:00Z (persist last task filter)

## Item

Small related improvement after verifying current-main health: remember the last selected task filter (All / Today / Upcoming / Overdue / Completed) across browser sessions via localStorage, matching the existing offline-first pattern used by weather place and focus preset.

## Baseline

- Branch cut from main `91f57d79ab3d344d4d78df116ecf3ed4afe81087` (docs-only, green Android CI and contracts).
- No open P1 storage/concurrency blockers were completed in this cycle; this is a self-contained UX polish.

## Shipped

- `app.js`: added `FILTER_KEY = 'daymark.filter.v1'`, `ALLOWED_FILTERS` set, `loadTaskFilter()`, `persistTaskFilter()`, and `setTaskFilter()`.
- `setUp()` restores the saved filter (invalid/missing values fall back to `'all'`).
- Filter-button clicks and the two existing `'all'` resets (add-task success, reminder toast action) now go through `setTaskFilter` so the preference is written.
- Fail-closed: storage errors are logged and ignored; only the five known filter ids are accepted.
- Source-pin tests in `tests/task-filter-persistence.test.js` verify the key, helpers, load site, and call sites.

## Verification

- Local source inspection and the new test file: PASS (static).
- Canonical `npm test` / Android CI / contracts: pending exact-head workflow runs on the PR.
- Physical device / WebView: **NOT TESTED**.

## Constraints

- No new storage keys beyond the preference string, no schema change, no permissions, no package/version/signer change, offline-only.
- Existing task, Focus, and recovery paths untouched.

Work by: Cycle A (Grok)
Model: Grok 4.7 (xAI)
Tooling: local source edit + GitHub connector
Timestamp (UTC): 2026-11-10T04:35:00Z
Physical device: NOT TESTED.
