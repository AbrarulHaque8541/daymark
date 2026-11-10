# Daymark engineering status — 2026-11-10T01:00:00Z (high-priority filter)

## Item

Small task UX improvement: add a "High priority" filter to the task list so users can quickly see open high-priority tasks.

## Changes

- task-logic.js: getFilteredTasks now supports filter === 'high' (open high-priority tasks only).
- index.html: new filter button with count.
- app.js: counts open high-priority tasks.
- tests/task-logic.test.js: regression coverage.

## Verification

- Local node --test tests/task-logic.test.js: 13/13 PASS.
- Full npm test / Android CI: NOT RUN in this environment (to be verified by GitHub Actions on the PR).
- Physical-device testing: NOT TESTED.

## Constraints

No MainActivity change, no package identity change, no storage key change, offline-only.

Work by: Grok 4.7
Model: Grok 4.7
Tooling: local git, node test runner
Timestamp (UTC): 2026-11-10T01:00:00Z
