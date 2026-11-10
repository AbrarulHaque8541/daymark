# Daymark engineering status — 2026-11-10T05:15:00Z (user-owned Telegram task-digest card)

## Item

Super-app feature expansion, one end-to-end capability: a web-prototype card that sends the completed-tasks digest to the user's own Telegram bot. The user provides their own @BotFather bot token and a chat target (numeric chat id or @username); Daymark never stores the token and never depends on a maintainer backend.

## Baseline

- Branch cut from main 91f57d79ab3d344d4d78df116ecf3ed4afe81087 (docs commit, 2026-11-10T04:07Z).
- Main was green at audit start; 12 open PRs from other agents were left untouched (no merges of foreign PRs).

## Shipped (web prototype only)

- telegram-logic.js: DaymarkTelegram engine — strict bot-token and chat-target validation, buildCompletedDigest (completed tasks only, due dates included, honest truncation at the 4096-char Telegram limit with an omitted-count note), classifySendOutcome plain-word error taxonomy (401/403/404/429/other 4xx/5xx/body ok:false/offline/timeout), and sendTelegramMessage (HTTPS-only POST to api.telegram.org with an 8-second AbortController timeout; the token is never echoed in any reason string and nothing is persisted).
- telegram-ui.js: stateless injectable attachTelegramUi(env) card. The token input is type="password"; the token is never written to any storage and is emptied by the Clear button. Storage is read lazily only on an explicit Send; boot never touches localStorage. Offline, malformed-storage, empty-digest, busy and engine-missing states all degrade with honest plain-word status lines.
- index.html: new briefing card #telegram-card after the webhook card plus two script tags; no new CSS (existing briefing-card/feed classes reused).
- tests/telegram-logic.test.js (16 tests) and tests/telegram-ui.test.js (16 tests), including a source pin that index.html wires the exact card ids with a masked token input; both registered in tests/REQUIRED_NODE_TEST_FILES.txt.

## Verification

- Sandbox harness against the exact pushed module/test sources: 31/31 tests PASS.
- npm test / check-v1-source.sh / run-core-tests.sh / Gradle assembleGithubSideloadDebug locally: NOT RUN (no Node or Android toolchain in this environment); relying on PR CI, which runs these.
- Exact-head PR CI status: to be verified on the pull request after this snapshot is pushed.
- Real Telegram delivery and on-browser manual render: NOT TESTED (no browser or live bot token in this environment).

## Constraints respected

- No new manifest permissions, no <service> components, no MainActivity change, package id com.abrar.daymark and signer pin untouched, no new storage key (reads daymark.tasks.v1 only, on explicit Send), no maintainer backend, zero central cloud cost, no weakened tests or guards.

Work by: Vibe
Model: GLM 5.3
Tooling: GitHub MCP tools, TypeScript sandbox harness
Timestamp (UTC): 2026-11-10T05:15:00Z
