# Daymark engineering status — 2026-11-14T19:35:25Z

## Android URI routing correction on PR #779

PR [#779](https://github.com/AbrarulHaque8541/daymark/pull/779) remains OPEN and unmerged on branch `feat/android-bookmark-newtab-20261114`, based on `83bc05f48030f351099f55e3f2ac012b36b94bcd`. Immediately before this correction, its remote head was `97e3a5f58cea5da775100d58053c682111c698da`. The URI fix and status updates are prepared together as one direct child commit for a normal push; after pushing, verify the exact live PR head and its checks. Keep the PR open and unmerged.

HTTP and HTTPS, including verified App Links, remain in Daymark; plain HTTP keeps its “Not encrypted” warning. `javascript:`, `data:`, `file:`, and `content:` stay in WebView. `blob:` and `about:` preserve their existing WebView-local behavior. File/content attempts now reach WebView with file/content access and file-URL cross-origin access still disabled; visible notices explain attempts and platform refusals. No picker or broad local access was added.

`mailto:`, `tel:`, `sms:`, `geo:`, and `intent:` keep their existing Android handoff flow: in-page routes require a main-frame user gesture, and an explicit confirmation displays a sanitized destination and resolved handler. `intent:` continues through the strict parser and a freshly constructed browsable `ACTION_VIEW` intent. The excluded `vbscript:`, `chrome:`, `chrome-extension:`, `devtools:`, and `view-source:` schemes are never sent to other apps; attempts/refusals are visible. While Offline, only the existing local WebView schemes (`javascript:`, `data:`, `blob:`, `about:`, `file:`, `content:`) bypass remote-network unblocking. HTTP(S) remains Online-gated; unlisted and excluded schemes are visibly refused Offline.

### Verification

- `sh android-app/tools/run-core-tests.sh` — PASS, including URI classification, typed and in-page routing, confirmation/gesture, excluded-scheme, and Offline allowlist regressions.
- `sh android-app/tools/check-v1-source.sh` — PASS, including unchanged file/content isolation and handoff ordering guards.
- `npm test` — PASS, 1,194 tests.
- `git diff --check` — PASS.
- Android Gradle Java compile — NOT RUN: attempted but stopped before compilation because no Android SDK is configured (`ANDROID_HOME`/`sdk.dir` missing).
- Android WebView scheme behavior on an emulator or physical device — NOT TESTED: no `adb`/device is available. Host/source tests do not prove platform runtime behavior.

### Outstanding CI gate

On the prior exact head `97e3a5f58cea5da775100d58053c682111c698da`, Watchdog’s latest read reported 14 checks green, 0 failing, and `Focus runtime API 36` pending. Its available log tail showed emulator shutdown warnings but did not establish a test failure cause. This URI-only correction changes no Focus code or checks. The new pushed head’s checks must be read once from live PR #779; keep the PR unmerged while API 36 remains unresolved.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, Git, OpenJDK 17 host tests, Python source guards, Node.js test suite, Gradle wrapper (Android SDK unavailable)
Timestamp (UTC): 2026-11-14T19:35:25Z
