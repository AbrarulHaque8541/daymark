# Daymark engineering status — 2026-11-10T20:37:02Z (relative near-term due labels)

Work by: Grok
Model: Grok 4.7 (xAI)
Tooling: GitHub connector; local Node test run on cloned main
Timestamp (UTC): 2026-11-10T20:37:02Z

## What landed

Small, complete UX improvement for the task list on the web prototype (and shared logic):

- `task-logic.js`: added pure `relativeDueLabel(dueDate, today)` and `daysBetween`. Returns “Due today”, “Due tomorrow”, “Due in N days” (2–7), “Overdue by 1 day”, “Overdue by N days” (2–7). Returns `null` for invalid dates or dates more than 7 days away so the existing absolute formatter remains the fallback.
- `app.js`: `getDueText` now prefers the relative label when available, then appends any due-time suffix. Existing absolute “Overdue · date” / “Due date” paths stay for distant dates.
- `tests/task-logic.test.js`: 13/13 pass, including the new relative-label cases.

No Android/MainActivity changes, no new storage keys, no CSS, no permissions, no network.

## Verification

- Local `npm test -- tests/task-logic.test.js`: **PASS** (13/13).
- Full `npm test`, `check-v1-source.sh`, Android CI: **NOT RUN** in this environment (expected to be covered by PR CI).
- Physical device / WebView rendering of the new labels: **NOT TESTED**.

## Base

Cut from current main `e69d30190ba72aba5b95a97cead2e585db1e89a5` (export-renderer wiring; Android CI and contracts green).
