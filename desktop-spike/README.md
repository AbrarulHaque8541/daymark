# Daymark desktop UI spike

Status: **EXPERIMENTAL UI prototype only** — not a native desktop application and not a production data store.

This spike tests whether a small, dependency-free task workspace can share deterministic task behavior across Windows/Linux browsers before choosing Flutter or Tauri. It deliberately does not select a framework or change the production Android app.

## Run

Open `index.html` in a modern browser, or serve this directory with any static HTTP server. No network requests or third-party libraries are required.

## Scope

- Add, complete/reopen, filter, and delete synthetic tasks.
- Responsive layout, keyboard-friendly controls, visible status announcements, and reduced-motion support.
- Shared pure task-core logic exercised by Node's test runner.
- In-memory state only: refresh clears all prototype tasks. Do not enter real/personal data.
- No account, sync, analytics, telemetry, encryption, browser engine, native APIs, or platform integration.

## Acceptance and limitations

- The shared task-core unit tests must pass under the repository's `npm test` command on Linux and Windows.
- Manual GUI review on each OS remains **NOT TESTED** until performed and recorded.
- This is not evidence of native Windows/Linux packaging, encrypted persistence, Android compatibility, or OpenHarmony support.
- A framework decision requires a separate native-shell prototype and measured build/startup/memory/package/accessibility results.

## Next measurable step

Run this same UI flow in candidate Flutter and Tauri shells, compare the same synthetic task scenarios, and keep the winning choice provisional until clean builds and security/privacy gates pass.

---

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools; repository instruction and source review
Timestamp (UTC): 2026-10-22T19:00:00Z
