# Daymark whole-project engineering status — 2026-11-01T17:05:00Z

## Live baseline and repo-wide review
- Verified root `AGENTS.md`, `docs/AGENT_STATUS.md`, and latest linked status snapshot before acting.
- Current `main`: `b4d721e45c5dd0f84fc19d8aa50f8381b0fd0c2e` (PR #495 merge).
- Only open PR observed: [#475 recurrence parity](https://github.com/AbrarulHaque8541/daymark/pull/475).
- Current PR #475 head: `ad0fbe5399ce509e861850178fc0d5d949c0b06c`; stored base `bbc2cd43bc1a23eb2bfdc68ab50d689ebdc37d68`.
- Compare live `main`...#475 head: **DIVERGED, 31 ahead / 3 behind**.
- #475 exact-head Android CI [41327492874](https://github.com/AbrarulHaque8541/daymark/actions/runs/41327492874) IN PROGRESS; QA APK [41327492834](https://github.com/AbrarulHaque8541/daymark/actions/runs/41327492834) IN PROGRESS; device-test APK [41327492895](https://github.com/AbrarulHaque8541/daymark/actions/runs/41327492895) IN PROGRESS; cross-platform contracts [41327492862](https://github.com/AbrarulHaque8541/daymark/actions/runs/41327492862) CANCELLED. Focus UI, Live Update and emulator lifecycle checks PASS.
- Current main SHA `b4d721e...`: Android CI [41329034378](https://github.com/AbrarulHaque8541/daymark/actions/runs/41329034378) PASS; cross-platform contracts [41329034356](https://github.com/AbrarulHaque8541/daymark/actions/runs/41329034356) PASS.
- Recent merged work verified: #492 dark-mode contrast; #494 bidi/null Android download metadata smoke; #495 origin-only BrowserHistory host regression smoke.
- #493 was closed as superseded (NOT merged); its origin-redaction behavior is already in main and missing bidi/null coverage moved to #494.

## Completed in this iteration — IDN-safe, privacy-preserving site history
- Root cause: Java `URI.getHost()` returns null for valid Unicode DNS hostnames, so BrowserHistory silently omitted IDN visits. Unicode and punycode representations also could not deduplicate.
- Branch: `fix/browser-history-idn-origin-20261101-1705`.
- Base: current main `b4d721e45c5dd0f84fc19d8aa50f8381b0fd0c2e`.
- Latest branch head: `0e728c701f482f29aa64bb55f980d06dcd9ae912` (6 commits ahead, 0 behind).
- Changed files:
  - `android-app/app/src/main/java/com/abrar/daymark/BrowserHistory.java`
  - `android-app/tools/BrowserHistorySmoke.java`
  - `android-app/tools/check-browser-history.py`
- Implementation: parse raw authority without retaining userinfo; canonicalize Unicode DNS names with Java IDN/STD3 to lowercase punycode; normalize one trailing DNS root dot and default ports; reject empty/interior labels, >63-character labels, invalid/empty/out-of-range ports, malformed/unbracketed IPv6, and hosts >253 chars. Preserve bracketed IPv6. History continues to store **only HTTP(S) origin**—never path, query, fragment, userinfo or title.
- Regression tests added: Unicode ↔ punycode equivalence, userinfo stripping with non-default port, root-dot/default-port canonicalization, duplicate root dot, empty interior label, overlong ASCII/IDN labels, invalid ports, and IDN/punycode visit dedup.
- Canonical runner already compiles/runs `BrowserHistorySmoke` via `android-app/tools/run-core-tests.sh`; source guard now explicitly checks IDN normalization and the correct history smoke wiring.
- Local focused validation: JDK 21 compiling with `--release 17`, then **14 focused assertions PASS** against the copied BrowserHistory implementation.
- Full repository `sh android-app/tools/check-v1-source.sh`, `npm test`, Gradle/Android build: **NOT RUN locally** (no repository checkout/toolchain orchestration from GitHub connector runtime). Exact-head Actions pending.
- Physical-device acceptance: **NOT TESTED**.

## Next ranked backlog
1. **P0 #160 — Current-main Android/WebView physical acceptance matrix.** Requires actual device, Android API, WebView provider/version, exact build SHA/APK SHA, scenario and outcome. No CI substitute.
2. **P1 #475 / #476 — Cross-platform recurrence correctness.** Reconcile current main (31 ahead/3 behind), preserve recurrence and Focus/data integrity changes, resolve cancellation/mergeability, run exact-head Android + Node + Ubuntu/Windows contracts + APK workflows, then merge only when eligible.
3. **P1 #348 — Browser reliability / Advanced Browser Toolkit.** Continue universal app-link UX and safe resolver coverage, navigation/redirect/renderer recovery, DownloadManager/SAF/provider races, site-data/cookie controls with platform-accurate semantics, keyboard/insets/RTL/accessibility and truthful networking/proxy feasibility. IDN site-history normalization delivered in this branch.
4. **P2 #325 — Cross-platform architecture.** Evidence-first prototypes/compatibility matrix/benchmarks; no speculative rewrite.

## Safety and delivery
- No releases/tags, version bump, package identity change, signing changes, manifest permissions, schema migration, or destructive user-data operation.
- No MainActivity.java edits; no overlap with PR #475 recurrence files or #495 merged history smoke work.
- PR not yet opened at snapshot creation; exact-head CI not yet available.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub MCP repository/branch/contents/PR/Actions APIs; local JDK 21 (source-compatible release 17)
Timestamp (UTC): 2026-11-01T17:05:00Z
