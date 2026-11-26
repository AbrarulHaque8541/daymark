# Current status snapshot — 20261126T163500Z

Daymark web prototype: keyless advice-of-the-day glance card.

- Source: advice-logic.js (DaymarkAdvice) + advice-ui.js (DaymarkAdviceUi), stateless, keyless.
- Endpoint: https://api.adviceslip.com/advice (random) and https://api.adviceslip.com/advice/{id} (id 1 to 99999, fail-closed normalization).
- Safety: HTTPS-only fetch with cache no-store, 256KB bounded read via response-body-logic readBoundedText, 400-character honest truncation of the advice text, classified error taxonomy (403/404/4xx/5xx/timeout/malformed/too large/unrecognized id/unavailable fetch), UI busy guard.
- Placement: self-injecting #advice-card after #xkcd-card, falling back to #hijri-card, #prayer-times-card, #space-news-card, #iss-card, #earthquake-card, #country-card, #weather-card, then the page body.
- Offline behavior: nothing is fetched at boot, no timers, no polling, nothing saved on the device; Check with no network shows a plain-language failure.
- Constraints honored: accent #16705f untouched, no new manifest permissions, no new service components, no storage keys, MainActivity.java untouched, no maintainer-paid backend.
- Tests: tests/advice-logic.test.js (15) + tests/advice-ui.test.js (15), registered in tests/REQUIRED_NODE_TEST_FILES.txt; local sandbox harness 30/30 PASS on the exact authored bytes.
- Locally NOT RUN (no toolchain in the automation environment): npm test, sh android-app/tools/check-v1-source.sh, sh android-app/tools/run-core-tests.sh, Gradle assembleGithubSideloadDebug. NOT TESTED: live adviceslip.com round trip in a real browser, physical device.
