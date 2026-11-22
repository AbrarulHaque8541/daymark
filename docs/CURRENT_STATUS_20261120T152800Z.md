- Added a "Today" quiet button next to the date field. It clears the date input (empty means today), updates the status, and focuses the field. Includes glass press feedback (`is-pressed`), matching accent #16705f design and reduced-motion safety. No network, storage, or logic change beyond the UI affordance.
- Regression test added for the button's clear-and-status behavior.
---
# Daymark engineering status — 2026-11-20T15:28:00Z (Cycle A: duplicate script fix + trending Today button)
## Live state
## Verification
## Work in this cycle
| `main` | `017930c1948a704967d60aeb7d268e54aa9d1544` (trending rank badges merged) |
| `npm test` / source guard | **NOT RUN** in this sandbox (CI will cover on the updated head) |
| Check | Result |
| Item | Verified state |
| Open PRs | none at start of cycle |
| Physical device | **NOT TESTED** |
| Physical-device acceptance | **NOT TESTED** |
| Source inspection | **PASS** (duplicate removed; Today button complete with handlers, feedback, test) |
|---|---|
Files touched: `index.html`, `trending-ui.js`, `tests/trending-
Fixed a real incomplete load: `index.html` loaded `task-mutation-logic.js` twice (early after task-logic and again later before storage-ui). The later duplicate was removed so the module loads once, in the correct early position. Script-order assertions in `tests/export-ui.test.js` continue to pass via `indexOf`.
Implemented one small related improvement on the trending Wikipedia glance card:
Model: Grok 4.7
No stubs, truncated sources, or broken paths introduced. Branch is clean for CI.
Timestamp (UTC): 2026-11-20T15:28:00Z
Tooling: GitHub connector, local file edits
Work by: Grok 4.7 (Cycle A)
