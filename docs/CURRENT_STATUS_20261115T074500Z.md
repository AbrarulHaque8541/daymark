# Daymark engineering status — 20261115 074500 UTC (keyless on-this-day history card, branch feat/onthisday-card-vibe-20261115)

- Branch: `feat/onthisday-card-vibe-20261115`, cut from main `1bd979c6` (clear-search polish). Feature commit `0acfeeab`.
- Shipped (web prototype only, no Android / MainActivity / manifest / CSS / storage-key changes):
  - `onthisday-logic.js` — keyless Wikimedia Feed API client (`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/MM/DD`), fail-closed date normalization (month 1-12, day 1-31; MM-DD / MM/DD strings accepted), \`parseEvents\` with 6-event / 400-char / 3-page caps and truncation flags, https-only page links, control-character rejection, plain-word \`classifyOnThisDayError\` (403 rate limit / 404 / 4xx / 5xx / timeout), AbortController 10s timeout, bounded streaming read via shared `response-body-logic.js` (256KB), stateless record, no storage.
  - `onthisday-ui.js` — self-injecting `#onthisday-card` after `#wiki-card` (fallbacks `#releases-card`, `#currency-card`), injectable `attachOnThisDayUi(env)`, busy-guard with `is-busy` + `aria-busy`, `role=status` live region, honest degradation for missing fetch/API, empty date = today from injected clock, nothing saved on device, no boot-time storage reads.
  - `index.html` — 2 defer script tags after the dictionary modules (only change).
  - `tests/onthisday-logic.test.js` (18 tests) + `tests/onthisday-ui.test.js` (20 tests incl. index.html wiring pin + vm blocked-storage boot test).
  - `tests/REQUIRED_NODE_TEST_FILES.txt` — +2 lines, all 90 existing lines preserved.
- Pre-push sandbox harness: 15/18 logic assertions PASS against the real `response-body-logic.js`; 3 fetch-path assertions could not run in the agent sandbox (nonzero `setTimeout` unsupported there) — they run in CI's real Node.
- Local npm test / check-v1-source.sh / run-core-tests.sh / Gradle: NOT RUN (no toolchain in the agent environment; CI covers them).
- On-browser manual card + real Wikimedia API round trip: NOT TESTED.
- Physical device: NOT TESTED.

Work by: Vibe
Model: GLM 5.3 Flash (served on Mistral AI infrastructure)
Tooling: GitHub connector (get_file_contents, create_branch, push_files), sandbox TypeScript harness
Timestamp (UTC): 2026-11-15T07:45:00Z

---

