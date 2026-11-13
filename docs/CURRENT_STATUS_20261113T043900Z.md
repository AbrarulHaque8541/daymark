# Daymark engineering status — 2026-11-13T04:39:18Z (keyless GitHub release radar card)

Branch: `feat/release-radar-vibe-20261113`, cut from main `09fde10451381e3247e323b455ac41ba62a7ddb3`.

## What was built

One complete feature: a keyless **GitHub release radar card** for the web prototype.

- `releases-logic.js` — pure functions: `parseRepoSlug` (accepts `owner/repo` and `https://github.com/owner/repo`, fail-closed), `buildReleasesUrl`, `parseRelease` (tag/name/url validation, 400-char notes truncation flag), `classifyReleaseError` (plain words for 403 quota / 404 / 4xx / 5xx / timeout), `fetchJson` with AbortController timeout guard and bounded read, `fetchLatestRelease` returning a stateless record.
- `releases-ui.js` — self-injecting `#releases-card` placed after `#wiki-card` (fallback `#currency-card`, then body), `attachReleasesUi(env)` fully injectable, busy guard, `role="status"` feedback, honest degradation when fetch or the API module is missing. Stateless: nothing saved on the device, no storage key.
- Network: HTTPS-only `api.github.com/repos/{owner}/{repo}/releases/latest`, no API key, no account, no maintainer backend. Reads go through the shared `response-body-logic.js` bounded reader (256 KB cap). No new permissions; no new Android components.
- `index.html` — two `defer` script tags added after `wiki-ui.js` (script-tag wiring kept explicit).
- `tests/REQUIRED_NODE_TEST_FILES.txt` — two entries added alphabetically; no lines removed.
- New tests: `tests/releases-logic.test.js` (14) and `tests/releases-ui.test.js` (17).

## Check results (honest labels)

- Sandbox harness (node:test emulation in the Vibe sandbox, modules loaded from source): **PASS 31/31** (14 logic + 17 UI).
- `npm test` locally: **NOT RUN** (no Node toolchain in this environment; PR CI is the authoritative gate).
- `sh android-app/tools/check-v1-source.sh` locally: **NOT RUN** (no shell/Gradle toolchain here; PR CI runs it).
- `sh android-app/tools/run-core-tests.sh` locally: **NOT RUN**.
- Gradle `assembleGithubSideloadDebug`: **NOT RUN** (no toolchain; no Android code touched).
- On-browser manual check of the card: **NOT TESTED** (no browser here).
- Live repo state verified before acting: main `09fde104`, open PRs #675, #648, #656, #676 (none touch the files changed here).

## Risks / notes

- The anonymous GitHub API quota is 60 requests/hour per address; the card explains 403 in plain words instead of hiding it.
- The card is stateless by design: no storage key, no boot-time reads, Clear only empties the view.

Work by: Vibe
Model: GLM 5.3 Flash (served on Mistral AI infrastructure)
Tooling: Vibe Work (GitHub connector, sandboxed TypeScript harness)
Timestamp (UTC): 2026-11-13T04:39:18Z
