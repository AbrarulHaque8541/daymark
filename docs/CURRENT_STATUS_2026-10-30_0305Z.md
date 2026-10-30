# Web prototype v1.3.0 — recurring tasks, quick dates, progress stats, sort, duplicate

## Scope

Web prototype at repository root only (`index.html`, `app.js`, `styles.css`, `package.json`, new `repeat-logic.js`, new `tests/repeat-logic.test.js`). No Android source, identity, signing, or release changes. `task-logic.js` remains intentionally unchanged; all new behavior composes with the shared, tested logic API.

## Audit basis

Live branch `web/prototype-ux-20261029` at head a9a4aa8 (PR #343). README documents daily/weekly/monthly repeat rules and templates for the Android app; the web prototype had neither, and it had no progress feedback beyond a single open-count. Third-party reviews of to-do apps (Zapier, Efficient App, Any.do comparisons, 2026) list recurring tasks, quick capture, subtasks, tags, reminders, and progress/streak feedback as the core personal-task feature set; the prototype now covers that list within a static local-first page.

## Added in v1.3.0

1. **Recurring tasks** — daily/weekly/monthly repeat select in composer and edit dialog (enabled only with a due date). Completing a repeating task schedules the next occurrence automatically: anchored to the task's own due date (completing early keeps the rhythm), skipped forward when overdue, subtask checkboxes reset, reminder lead copied, `reminderShownFire` not carried over. Monthly occurrences clamp from the ORIGINAL day (a "31st" task does not degrade to the 28th forever).
2. **`repeat-logic.js`** — new shared pure-logic module (task-logic.js style) with 9 unit tests in `tests/repeat-logic.test.js`; runs in `npm test` via `node --test`.
3. **Quick due dates** — Today/Tomorrow chips in the composer.
4. **Progress stats** — done today / done this week / day-streak strip (hidden until the first completion; derived from task `updatedAt` timestamps — honest limitation: any edit refreshes the timestamp).
5. **Duplicate task** — one-click clone as a new open task (subtasks reset, reminder-fire state dropped); a lightweight stand-in for the Android app's templates.
6. **Sort toggle** — Smart (due date/time → priority) or A–Z.
7. **Cleanup** — reminder chip no longer shows on completed tasks.

## Verification

- PASS: 18 sandbox checks on nextDueDate covering daily/weekly/monthly advance, month-end clamping, early completion anchoring, overdue skipping, and invalid inputs (null for bad dates/rules).
- PASS: all 24 anchor-based edits applied exactly once against the live branch head; marker counts verified after patching.
- PASS: new render-path code uses only existing mock-DOM surfaces in `tests/app-storage.test.js`'s vm harness (element stubs accept any selector; no new top-level APIs; `window.DaymarkRepeat` absence is guarded so the vm boot still works).
- NOT RUN: `npm test` in this session (no Node.js in the authoring runtime); CI runs it on the PR.
- NOT TESTED: real-browser flows (repeat completion scheduling, stats rendering, date chips, sort toggle) — verified by code review and sandbox logic tests only.

## Attribution

- Work by: Vibe (agent), authored for Abrar Bhai (repo owner)
- Model: GLM 5.3
- Tooling: Mistral Vibe Work runtime, GitHub connector
- Timestamp (UTC): 2026-10-30T03:05:00Z
