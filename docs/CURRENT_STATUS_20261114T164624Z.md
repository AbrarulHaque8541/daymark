# Daymark engineering status — 20261114T164624Z

## Permission-lifecycle planner card (branch feat/permission-lifecycle-vibe-20261114)

Item: #348 P1 "Permission lifecycle: deny, ask again, permanently deny, revoke in Android settings and per-site reset", delivered as an offline, plain-words planner card for the web prototype.

Shipped (web-only, stateless, no new permissions/services/CSS/storage keys, MainActivity untouched):
- permission-lifecycle-logic.js: DaymarkPermissionLifecycle catalog of 5 states (granted, denied-once, denied-permanent, revoked-settings, site-reset) with stillWorks/lost/promptsAgain/recovery/userAction/scope/network; fail-closed unknown entry; planRecoveryPath with dedupe, unknown rejection and site-data warning.
- permission-lifecycle-ui.js: stateless attachPermissionLifecycleUi(env), injectable env, no boot localStorage reads, role=status, honest degradation, press feedback.
- index.html: card #permission-lifecycle-card before #browser-intent-card + 2 defer script tags.
- tests/permission-lifecycle-logic.test.js (15 tests) + tests/permission-lifecycle-ui.test.js (11 tests incl. index.html wiring pin + blocked-storage boot).
- tests/REQUIRED_NODE_TEST_FILES.txt: +2 lines, nothing dropped.

Verification: sandbox node:test emulation 37/37 PASS pre-push, re-run against the patched index.html; pushed bytes re-verified against the branch after push.
npm test, sh android-app/tools/check-v1-source.sh, sh android-app/tools/run-core-tests.sh, Gradle assembleGithubSideloadDebug locally: NOT RUN (no Node/Android toolchain in this environment; PR CI runs them).
On-browser manual card, real Android Settings/WebView permission flows: NOT TESTED (no device/emulator).

---

Work by: Vibe
Model: GLM 5.3 Flash
Tooling: GitHub MCP connector (github_app) + run_typescript sandbox harness
Timestamp (UTC): 2026-11-14T16:46:24Z
