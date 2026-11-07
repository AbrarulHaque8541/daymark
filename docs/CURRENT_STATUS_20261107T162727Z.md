# Daymark engineering status — 2026-11-07T16:27:27Z (browser download safety card)

## What shipped on this run

- **feat(web): browser download safety planning card** on branch
  `feat/browser-download-safety-vibe-20261107` (branch cut from main 1e624281).
  - `browser-download-logic.js` (new): pure, dependency-free download planning engine
    (`window.DaymarkBrowserDownload`). RFC 6266/RFC 5987 Content-Disposition filename
    parsing (UTF-8 `filename*` wins, quoted/bare fallback, non-UTF-8 ignored),
    filename sanitization (control chars, bidi/format spoofs such as U+202E, path
    separators, quotes, leading dots, length caps) with an honest "characters were
    removed" disclosure, last-segment URL filenames (http(s) URLs only, percent-decoded
    fail-closed), known/unknown MIME classification with an explicit installable-APK
    caution (SVG deliberately unknown), redirect-chain analysis (hop cap 12, cross-origin
    detection, unverifiable hops make the whole chain untrusted), honest retry advice
    (expired 404/410 and refused 401/403 are never presented as retryable), duplicate-tap
    coalescing (1.5 s window; unverifiable keys ignore, never start), and fail-closed
    `planDownload`/`planScenario` entry points with seven fixed sample journeys.
  - `browser-download-ui.js` (new): "Downloads, planned safely" card next to the error
    taxonomy card. Fully injectable `attachBrowserDownloadUi(env)`, honest degradation
    when the engine is missing, no new CSS classes, no network, no storage.
  - `index.html`: additive card markup after the browser-error card plus two deferred
    script tags. No other markup changed.
  - Tests: `tests/browser-download-logic.test.js` (15 tests) and
    `tests/browser-download-ui.test.js` (8 tests). All additive; nothing weakened.

## Tracking

- Progresses issue #348 (P0 "Downloads and link journeys": downloads after multiple
  redirects, cross-origin redirects, content-disposition filenames; and the adjacent
  unknown-MIME / duplicate-tap slice). Physical-device download verification remains
  open under #160 / #348.

## Constraints respected

- Web prototype only: no Android changes, no `MainActivity.java` changes, no new
  manifest permissions or services; app identity and signer pin untouched; no
  maintainer backend; fully offline; accent #16705f untouched.

## Checks run on this run

- Sandboxed TypeScript verification of the exact module sources against a
  node:test-compatible harness: **PASS** (23/23 tests, both suites).
- `npm test`, `sh android-app/tools/check-v1-source.sh`,
  `sh android-app/tools/run-core-tests.sh`, Gradle `assembleGithubSideloadDebug`:
  **NOT RUN** locally (no Node/Android toolchain in this environment). Relied on
  exact-head PR CI; results recorded in the PR.
- On-browser manual planning of the card, real redirect chains, real
  Content-Disposition headers: **NOT TESTED** (no browser/device in this environment).

Work by: Vibe
Model: GLM 5.3
Tooling: GitHub connector (branch, push_files, PR), sandboxed TypeScript verification
Timestamp (UTC): 2026-11-07T16:27:27Z
