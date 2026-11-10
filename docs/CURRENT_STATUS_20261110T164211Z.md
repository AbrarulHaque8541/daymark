# Daymark engineering status — 20261110T164211Z (offline app-link and intent handoff planner card)

Work by: Vibe
Model: GLM 5.3
Tooling: GitHub connector via Code Mode
Timestamp (UTC): 2026-11-10T16:42:11.635Z

## What landed in this run

- Branch: feat/intent-handoff-vibe-20261110 (base: main 41fda91fbb15d2bf9634fd7576cf842fe9bdacbc).
- Item: issue #348, "Safe intent handling: malformed/unsupported schemes, no installed app, chooser behavior, fallback and return path", plus the tg:// deep-link and app-not-installed fallback bullet under "P0 — Downloads and link journeys".
- Shipped (web prototype only, offline, no new permissions, no new service components, no CSS changes, no storage keys, no MainActivity changes):
  - browser-intent-logic.js: DaymarkBrowserIntent engine. classifyLink sorts a pasted link into web / external-handoff (mailto, tel, sms) / telegram-deep-link (tg://) / android-intent (intent://) / blocked / unknown-scheme / malformed / no-scheme / none. parseIntentUri reads intent://host/path#Intent;...;end, extracting scheme, package, S.browser_fallback_url (percent-decoded, honored only when http(s), otherwise disclosed as ignored) and counts extra parameters. planIntentHandoff turns any classification into plain-words lines: target, chooser when no package is pinned, app-not-installed behavior (nothing opens, no store redirect), explicit user-tap trigger, return path, and a network note. Fail-closed: oversized (2048 limit), control-character, and unknown input never produce a handoff verdict. Embedded credentials in web links are refused and disclosed, never echoed. Long targets are truncated before echo.
  - browser-intent-ui.js: stateless attachBrowserIntentUi(env) card, injectable env, no localStorage reads at boot, sr-only-labeled input, status role=status, honest degradation when the engine is missing, clear button scoped to the plan only.
  - index.html: new briefing-card #browser-intent-card after the clear-action card, plus the two script tags. Nothing else changed.
  - tests/browser-intent-logic.test.js (15 tests) and tests/browser-intent-ui.test.js (11 tests, including an index.html source pin and a boot-with-blocked-storage VM regression), registered in tests/REQUIRED_NODE_TEST_FILES.txt.
- docs/AGENT_STATUS.md: this snapshot linked at the top of the latest reviewed list.

## Verification

- Pre-push sandbox harness against the pushed logic content: 15/15 PASS (web verdict, credential refusal without echo, tg handoff, full intent parse with encoded fallback, chooser disclosure, non-http fallback ignored, malformed/unknown/blocked/no-scheme/control-char fail-closed, truncation).
- CI on the exact branch head: see the PR checks; statuses are reported in the tracking-issue comment with honest labels.
- npm test / check-v1-source.sh / run-core-tests.sh / Gradle locally: NOT RUN (no Node or Android toolchain in this environment; relied on CI which runs them).
- On-browser manual planning, real Telegram handoff, real Android intent resolution, app-not-installed behavior on a device: NOT TESTED (no browser/device in this environment). The card explains intended behavior; it does not prove device behavior.

## Guard compliance

- No Android manifest change, no new <service>, no MainActivity.java edit, no package id or signer change, accent color untouched, no maintainer-paid backend, no new storage keys, no CSS changes.
