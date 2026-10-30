# Web prototype v1.2.0 — full feature audit and completion

## Scope

Web prototype at repository root (`index.html`, `app.js`, `styles.css`, `package.json`). No Android source, identity, signing, or release changes. `task-logic.js` intentionally unchanged: all new behavior lives in `app.js` and composes with the shared, tested logic API.

## Audit findings (written but not working, or missing)

1. **Reminders existed in the data model only.** `task-logic.js` validates `reminderLeadMinutes` (leads 0/30/60/1440) and `reminderShownFire`, but the web UI never exposed a reminder option and had no firing code. Fixed: reminder selects in the composer and edit dialog (enabled only with a due date), a 30-second reminder check loop, on-page reminder toasts with a "View list" action, dedupe via `reminderShownFire`, and a reminder bell chip on task rows. Reminders are honestly scoped: on-page messages while the tab is open, not OS notifications.
2. **No Overdue filter.** Overdue tasks were visible inline but could not be isolated. Added an Overdue filter tab with its own count and a dedicated empty state.
3. **No portable backup.** The Android app has encrypted backup/restore; the web prototype had only an internal recovery key. Added Export (JSON download, data-URI based, no cloud) and Import (FileReader, validated through `validateStoredTasks`, duplicate-safe merge, explicit restore/skip/duplicate counts in the toast).
4. **No bulk cleanup.** Added "Clear completed" with an Undo toast.
5. **Quick tags missing.** The Android app supports `#tag` quick add; the web composer did not. Added `#tag` parsing in the composer title (tags stripped from the title, normalized through `normalizeTags`; malformed or over-limit input keeps the title exactly as typed). Hint text updated.
6. **Search ignored subtask titles.** Search now also matches step titles, layered on top of the shared logic search without touching it.
7. **Esc did not close the edit dialog on the fallback path.** Added Escape handling for the open dialog.

## Verification

- PASS: 17 sandbox checks covering quick-tag parsing (extraction, punctuation boundaries, invalid tags, 6-tag fallback), reminder lead validation, and reminder fire-time math (lead subtraction, midnight crossover, default 09:00, completed/absent-lead guards).
- PASS: app.js boot compatibility with `tests/app-storage.test.js`'s vm harness — new code uses only existing mock-DOM surfaces; the reminder loop is guarded behind `typeof setInterval === 'function'` and stays inert in the test vm.
- NOT RUN: `npm test` in this session (no Node.js in the authoring runtime); CI runs it on the PR.
- NOT TESTED: real-browser reminder timing, export download, and import flows — verified by code review and sandbox logic tests only.

## Attribution

- Work by: Vibe (agent), authored for Abrar Bhai (repo owner)
- Model: GLM 5.3
- Tooling: Mistral Vibe Work runtime, GitHub connector
- Timestamp (UTC): 2026-10-29
