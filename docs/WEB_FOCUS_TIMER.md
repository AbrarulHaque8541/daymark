# Daymark web prototype — Focus timer

A local-first focus timer (Pomodoro-style) for the root web prototype, mirroring the Android app's `TaskFocusTimer` so the plan item "focus mode" works end to end on the web too. Everything runs in the page: no network, no account, no analytics.

## What it does

- **Presets**: Focus 25 min · Short break 5 min · Long break 15 min (chips in the focus card; locked while a session runs).
- **Link to a task** (optional): the timer icon on any task row starts a focus session linked to that task; a dropdown in the card links a session to any open task. Linked sessions mention the task in the completion toast.
- **Countdown UI**: large tabular clock (`role="timer"`), state label (`aria-live="polite"`: Ready / Focusing / On break / Paused), and a progress bar in the accent color `#16705f`.
- **Controls**: Start · Pause/Resume · Stop. Stop logs the elapsed time as a partial session; natural expiry logs a completed one.
- **Survives reloads**: the active session is persisted under `daymark.focus.v1` in `localStorage`. A running session keeps counting on wall-clock time across a reload (honest tab-timer behavior); a session whose budget ran out while the page was closed is completed at its exact expiry moment, never shown as negative. Paused sessions resume frozen.
- **Daily total**: "N min focused today" totals focus-kind log entries started on the current local date. Breaks are never counted as focus time.
- **Bounded log**: finished sessions are appended to a log capped at 200 entries (oldest dropped first), validated and de-duplicated on load.
- **Corrupt-data safety**: an unreadable focus payload is copied to `daymark.focus.v1.backup` before being discarded, mirroring the task-store recovery backup; a healthy save clears the backup.
- **Graceful degradation**: if `focus-logic.js` fails to load, the card shows `—` and the app works exactly as before.

## Where the code lives

| Area | Files |
|------|-------|
| Pure logic (UMD, no DOM/storage) | `focus-logic.js` (`window.DaymarkFocus`) |
| UI wiring + persistence | `app.js` (`renderFocus`, `loadFocusState`/`persistFocusState`, `startFocus`/`toggleFocusPause`/`endFocusSession`, `tickFocus` on a 1 s interval + on window focus/visibility) |
| Markup | `index.html` (focus card in the side column, timer action on task rows) |
| Styling | `styles.css` (`.focus-card`, accent `#16705f`, dark-scheme block) |
| Tests | `tests/focus-logic.test.js` (state machine, serialize/restore, log, clock), `tests/app-focus.test.js` (boots `app.js` in a VM: revived/paused sessions, today total, corrupt-payload backup, missing-module fallback) |

## Honest limitations

- The timer ticks only while the tab is open (1 s interval, refreshed on tab focus/visibility). Closing the tab does not stop a running session — wall-clock time still accrues on reload, but no completion toast fires until the page is open again.
- The log lives only in this browser's `localStorage`; it is not part of the JSON task export and never leaves the device.
- No OS notifications from the web page; completion is announced in-page.
- Physical-device/emulator testing was **not** performed for this web change; coverage is host `npm test` (CI: `node --test` on ubuntu + windows) plus source inspection.

---
Work by: Vibe
Model: Mistral Large 4
Tooling: GitHub connector (get_file_contents, create_branch, push_files, create_pull_request)
Timestamp (UTC): 2026-10-31T13:45:00Z
