# Daymark status snapshot — 2026-10-31T19:03:35Z

Autonomous engineering iteration 4: preserve literal plus in intent:// fallback URI metadata.

## Current main at startup
- Default branch: `main`
- Exact SHA: `287c38bbf427af7e0c9b9658e447cfaf113015ff`
- Latest commit: [`287c38b`](https://github.com/AbrarulHaque8541/daymark/commit/287c38bbf427af7e0c9b9658e447cfaf113015ff), Grok-authored status-index update; no runtime code in that commit.
- Open PRs at startup: **none**.
- Latest merged implementation PR audited: [#449](https://github.com/AbrarulHaque8541/daymark/pull/449), fallback-port validation.

## Engineering finding and change
- `BrowserIntentLinkPolicy` used `URLDecoder.decode()`, which applies HTML form semantics and converts a raw `+` to a space.
- Android Intent URI string metadata uses percent decoding; a literal plus should remain plus. A fallback like `https://example.com/a+b?q=x+y` could be silently altered to `https://example.com/a b?q=x y`.
- Fix protects literal plus before percent-decoding `S.browser_fallback_url`; percent-encoded values still decode normally.
- Added a host regression covering plus in both path and query.
- Added a source guard assertion to prevent reverting the plus-preserving decoder.
- PR: [#450](https://github.com/AbrarulHaque8541/daymark/pull/450)
- Exact latest PR head: `HEAD_SHA_TO_BE_FILLED` (source + test + guard + status evidence).

## Focused validation
- Local Java 21 JShell reproduction of the exact decoder expression: **PASS**. Confirmed old expression changes `a+b?q=x+y` into `a b?q=x y`, while the fix preserves plus.
- Regression test is wired into `android-app/tools/run-core-tests.sh` via `BrowserIntentLinkPolicySmoke`.
- Canonical local `sh android-app/tools/check-v1-source.sh`: **NOT RUN** (connector runtime has no repo checkout/shell).
- Local `npm test`: **NOT RUN** (same environment limitation).
- Physical-device test: **NOT REQUIRED** for this pure-Java parser change; overall #160 remains NOT TESTED.

## CI
- Initial code/test head `0e9b078c120e609ce0d1e1a0d25f40e61cd22a48`: all four workflows were started; at last check Android build, Windows/Ubuntu contracts, non-publishing QA APK and device-test APK were **IN PROGRESS/QUEUED**.
- Source guard was added afterward so CI covers the complete regression contract on the next head.
- Exact latest-head checks: **PENDING** until workflows are discovered and complete.

## Cross-agent audit evidence
- Inspected PR #449 actual diff: `BrowserIntentLinkPolicy.java`, `BrowserIntentLinkPolicySmoke.java`, `check-browser-intent-links.py`, `run-core-tests.sh`, and status docs.
- PR #449 exact head `4ee23a28625e35ece01561e08a82f3471461ad88`: Android build **PASS**; Ubuntu/Windows contracts **PASS**; device-test APK **PASS**; debug QA APK **PASS**; release workflow **SKIPPED**.
- Review threads/reviews on #449: none.
- The implementation correctly centralizes fallback validation through `BrowserAddress.requireAllowedWebUrl()`; no omission found there. This iteration fixes the separate form-decoding defect in the same parser.

## Shared durable backlog
### P0 — [Issue #160: current-main Android runtime acceptance](https://github.com/AbrarulHaque8541/daymark/issues/160)
- Owner: repository owner/device tester.
- Status: **NOT TESTED** (physical-device matrix required).
- Next: API 26 + current API device scenarios; record model, Android API, WebView provider, build SHA/APK SHA, PASS/FAIL/NOT TESTED.

### P1 — [Issue #348: browser UX, downloads, compatibility](https://github.com/AbrarulHaque8541/daymark/issues/348)
- Owner: shared engineering + device tester.
- Completed: HTTP/HTTPS policy, updater HTTPS guard, intent fallback port validation, filename sanitizer and diagnostics URL redaction.
- Next: real journey coverage for redirects, cookie/form behavior, target=_blank, renderer recovery, DownloadManager/SAF cancellation/retry, keyboard/insets and accessibility.

### P2 — [Issue #325: cross-platform architecture](https://github.com/AbrarulHaque8541/daymark/issues/325)
- Owner: shared engineering.
- Next: evidence-backed Linux/Windows shared-core + GUI test feasibility; separate HarmonyOS/OpenHarmony validation; no production rewrite before spike.

## Evidence and limits
- No release/tag/version/signing/package-identity change or user-data mutation.
- Physical Android device acceptance: **NOT TESTED**.

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP (live GitHub source/PR/check/branch/tree/blob/commit/ref operations)
Timestamp (UTC): 2026-10-31T19:03:35Z
