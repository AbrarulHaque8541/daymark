  - Advance the generation after a successful primary write.
  - In `persistTasks`, compare current generation; if another tab advanced it, refuse the write, toast, and reload.
  - Storage event listener now also reacts to the generation key.
  - Track `state.taskGeneration` loaded from storage on successful task load.
- Added managed key `daymark.tasks.generation.v1` under a new `task-generation` category in `storage-logic.js`.
- Full `npm test` / Android CI: NOT RUN in this environment (CI is the authoritative gate).
- In `app.js`:
- Local syntax check (`node --check`) on the three modified files: PASS.
- Physical device / multi-tab browser: NOT TESTED.
- Updated `tests/storage-logic.test.js` expected-key inventory.
**Base main:** `09fde10451381e3247e323b455ac41ba62a7ddb3`
**Branch:** `feat/task-generation-stale-write-protection-20261113`
**Model:** Grok 4.7
**Repository:** https://github.com/AbrarulHaque8541/daymark
**Timestamp (UTC):** 2026-11-13T02:37:00Z
**Tooling:** GitHub connector, local clone + node --check, file edits
**Verification timestamp:** 2026-11-13T02:37:00Z
**Work by:** Grok 4.7
# Daymark engineering status — task generation counter for stale-write protection
## Verification state
## What shipped
Physical device testing = NOT TESTED (no hardware available).
This is a concrete step toward issue #683 (prevent stale cross-tab task writes). No Android, manifest, MainActivity, signing, or release changes.
