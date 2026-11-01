# Daymark whole-project engineering status

Verified: 2026-11-01T08:44:33Z. Source of truth: live GitHub state, current main, PR heads, Actions, AGENTS.md and actual source diffs.

## Baseline
- Main SHA: `fdec854bfa6edc8ca1cf04eec446f9ee1a84e943`
- `main` reports `protected:false`; classic protection API is 403 to this integration. Recheck rulesets/protection before any merge.
- Open PRs: [#474](https://github.com/AbrarulHaque8541/daymark/pull/474), [#475](https://github.com/AbrarulHaque8541/daymark/pull/475).
- Open issues: [#160](https://github.com/AbrarulHaque8541/daymark/issues/160), [#348](https://github.com/AbrarulHaque8541/daymark/issues/348), [#325](https://github.com/AbrarulHaque8541/daymark/issues/325), [#476](https://github.com/AbrarulHaque8541/daymark/issues/476).
- Recent merged PRs: [#470](https://github.com/AbrarulHaque8541/daymark/pull/470)–[#473](https://github.com/AbrarulHaque8541/daymark/pull/473).

## Main CI
On `fdec854bfa6edc8ca1cf04eec446f9ee1a84e943`: Android CI [#41289037067](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289037067) **PASS**; cross-platform [#41289037000](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289037000) **PASS**.

## Active engineering
### PR #474 — Android repeat reminder timing
Head `4bf49199cf9fe52898c28eaae92938a8d08582b3`; files: `TaskLogic.java`, `TaskLogicSmoke.java`. Root cause: `advanceRepeat()` checked due moment rather than reminder fire moment. Host tests cover 30-minute and 24-hour triggers. Exact-head Android CI [#41289584946](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289584946), cross-platform [#41289584938](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289584938), non-publishing APK [#41289584979](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289584979), device-test APK [#41289584935](https://github.com/AbrarulHaque8541/daymark/actions/runs/41289584935): **ALL PASS**. **Merge held** until physical alarm/notification acceptance under [#160](https://github.com/AbrarulHaque8541/daymark/issues/160).

### PR #475 — Web repeat scheduling
Code/test head before this snapshot commit: `8fec42ff2b299dd782fc48b1e901fb930a1140c4`; files: `app.js`, `repeat-logic.js`, `tests/repeat-logic.test.js`, `tests/app-storage.test.js`. Fixes same-day/past completion, 3,660-step catch-up limit, monthly/yearly anchor degradation, and years 0001–0099. V8 syntax: **PASS**; direct pure-logic cases **11/11 PASS**; app-storage integration test added. Exact-head Android CI [#41290037038](https://github.com/AbrarulHaque8541/daymark/actions/runs/41290037038), cross-platform [#41290037056](https://github.com/AbrarulHaque8541/daymark/actions/runs/41290037056), device-test assets [#41290037076](https://github.com/AbrarulHaque8541/daymark/actions/runs/41290037076): **PENDING**. Local `npm test` **NOT RUN**: container DNS could not resolve GitHub for clone. Web-only; physical-device acceptance not required.

## Cross-agent audit
- #470: tracker bound/sanitization correct, but helper **not wired into MainActivity/DownloadManager**; follow-up on [#348](https://github.com/AbrarulHaque8541/daymark/issues/348).
- #471: cancellation integrated; warning discloses DownloadManager.remove may delete completed files.
- #472: task import preview/confirmation/size limit/non-destructive tests verified.
- #473: combined task + Focus Timer recovery and streaming verified.
- No unresolved reviews/inline threads on #470–#475; no shared-file conflict between #474 and #475.

## Prioritized backlog
- **P0:** [#160 Android/WebView physical-device matrix](https://github.com/AbrarulHaque8541/daymark/issues/160) — owner/device tester.
- **P1:** [#348 browser reliability/download integration](https://github.com/AbrarulHaque8541/daymark/issues/348) — shared engineering + device tester.
- **P1:** [#476 recurrence parity, Android long-gap catch-up and yearly leap anchor](https://github.com/AbrarulHaque8541/daymark/issues/476) — shared engineering; TaskLogic currently owned by open #474.
- **P2:** [#325 cross-platform architecture feasibility](https://github.com/AbrarulHaque8541/daymark/issues/325) — evidence-first spike.

No release/tag/version bump, signing/identity/manifest change, schema migration, destructive data operation, or device-acceptance claim.
  
Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub MCP, V8 syntax + pure-logic checks  
Timestamp (UTC): 2026-11-01T08:44:33Z
