# Daymark whole-project engineering status — 2026-11-10T05:07:00Z

## Live baseline

- Default branch `main`, exact SHA `91f57d79ab3d344d4d78df116ecf3ed4afe81087`.
- Root `AGENTS.md` blob `492ed21e2219a8d1b80c7d6e63575525c98a5a91`.
- 12 open PRs / 23 open issues.
- Recent merged PRs: #695 (cross-platform desktop-browser support matrix) and #688 (AST-aware test-registration guard).
- Current-main push checks on exact SHA: Android CI #42753807924 PASS; cross-platform contracts #42753807949 PASS.
- Latest published release v1.5 (2026-10-23); v1.4 is draft. No release/tag created.
- Current Gradle identity `com.abrar.daymark`, versionName `1.6`, versionCode `13`; no identity/version change made.

## Governance / safety

- GitHub branch API reports `main.protected=false`; rulesets endpoint returned an empty array.
- Detailed branch protection endpoint returns HTTP 403 `Resource not accessible by integration`; settings cannot be inspected in detail. No settings changed.
- No independent APPROVED review found across the 12 open PRs; requested reviewer lists are empty.
- Source-approved application identity remains `com.abrar.daymark`. The run-level instruction requests a different identifier; unresolved owner conflict. No applicationId/namespace change.
- No signer, secret, version, tag, release, destructive migration or user-data deletion.

## Engineering delivered this run

### #694 — test-registration guard hardening

Current head `ef936eb1e3c905571547980a048dabd9032c85e2`:
- Fails closed on computed literal `skip`/`todo`, dynamic values/keys, spreads, opaque options bindings, and `__proto__` prototype inheritance.
- Keeps explicit false/null/empty flags and ordinary static options accepted.
- Adds regression matrix; no tests removed/weakened.
- Exact-head workflows all PASS: Android CI #42757275161; Ubuntu/Windows contracts #42757275154; cookie-import safety #42757275202; device acceptance artifact #42757275281; device-test APK #42757275230.
- Open/unmerged; independent approval still absent.

### #648 — Focus storage/runtime and notification replacement

Current head `073879a41a7c9323ae6851808f59381f66432662`:
- Prior API 36 failure showed stale Task A notification title after paused switch to Task B.
- Reworked runtime restore to load one durable Focus record, resolve task ID/title against that snapshot, and make lifecycle reconciliation reload storage rather than reuse a cached coordinator snapshot.
- Cancel old notification identity before publishing when task ID/title changes; same-task/same-title refresh avoids cancellation/flicker.
- Added stale-runtime host and Android instrumentation coverage plus source-guard ordering checks.
- First attempt exposed a smoke helper arity compile error; helper is now varargs. No assertions weakened.
- Fresh exact-head workflows #42757918782 (Focus API 29/36 lifecycle), #42757918906 (Android CI), #42757918714 (contracts), #42757918654 (Live Update), #42757918668 (device acceptance), #42757918701 (device-test assets) and #42757918835 (Focus UI/Sound) were in progress/queued at snapshot time. No PASS claimed for this head yet. Physical device NOT TESTED.

### #677 — Focus swipe test harness correction

Current head `ae0cbe901ea7df433acc334ff7270928357d4ef5`:
- Exact comparison proved #648/#677 `TaskFocusTimerPanel.java` and gesture policy are byte-identical.
- Root cause of #677's right-swipe failure was the instrumentation injecting directly into the inner `modeRow`, bypassing the parent `ModeSelector.onInterceptTouchEvent()`; #648 injects into the actual ModeSelector and verifies parent Tasks ScrollView behavior.
- Ported the complete Focus gesture instrumentation/helper block and added source guards requiring ModeSelector targeting and real vertical parent-scroll coverage. Reminder-specific lifecycle tests were preserved.
- Focus UI/Sound #42757843489 and contracts #42757843820 PASS; Android CI #42757843709 and API 29/36 lifecycle #42757843602 in progress; device artifacts pending. No full exact-head PASS yet.

### #675 — task/Focus/webhook integration

Current head `4b33c04b7c131458c19649a45229e4461208d01b`:
- Status snapshot, status index and PROJECT_PLAN refreshed on this branch.
- Android CI #42757087387 PASS; contracts #42757087155 PASS; device-test APK #42757087138 PASS.
- Branch is 178 commits ahead / one behind main; remains draft and requires independent scope/security review.
- First docs head failed source guard because a retired package identifier was written literally in docs; wording was corrected without changing Gradle/manifest identity.

### #656 / #675 shared task mutation and recurrence

- #656 head `a5d6262f0f8952490cbec154792666bfdcf6bd27`; current-main based; seven recorded workflows pass, including a single API29/36 Focus lifecycle run (not the ten-run #648 gate).
- #656 and #675 `task-mutation-logic.js` / `tests/task-mutation-logic.test.js` are byte-identical (blobs `0e4282a277a88cadaae07951da05256babe9f5c2` / `e441d783ec6fe644d993d00db2b7e7647e0c1294`).
- `task-logic.js` differs: #656 adds recurrence metadata validation; #675 retains tag validation. Integration must preserve both.
- #675 normal saves, import path (#656), recovery and clear paths use the same task mutation lock/merge contract; Focus and webhook clear ordering is documented and tested. Not on main yet.

## Other active PRs and issues

| PR | Head | Current evidence / blocker |
|---|---|---|
| #692 | `98797a7ffafa8148ace00555962e56e59f0545d9` | Desktop private staging + atomic no-replace publication; four desktop/Android/contracts workflows PASS. No lockfile; issue #696. |
| #665 | `34308022a6e8fd9dac4a7bec3f19bda375d90c1d` | Four workflows PASS. PR build workflow has no secrets; tag-only release workflows verify main ancestry. Independent security/provenance review still required. |
| #686 | `155d00d80256937adc20b132100b150159164fb4` | Multi-origin/multi-tab Service Worker checks pass; SW network still fail-closed when ordinary browsing is Online. |
| #678 | `b27f8bab753ac621fe95a7481b4708c4c0b40e10` | Redirect policy passes; actual pinned-connection/bounded-stream transport incomplete. |
| #682 | `0e6d73f1535184553c7e2891f15fcb438f1dca27` | Browser clear/export lifecycle checks pass. |
| #676 | `e68e0d35a8a71e6874a8c4448383b4b4224c5b04` | SPA extension match/exclude checks pass; physical WebView acceptance pending. |
| #659 | `7b123a1f7581d39ec69f47bdcc0b66560cc7bcd8` | Extension store/recovery tests pass; accessible malformed-pack recovery UI incomplete. |

### Issue #696 lockfile blocker

- `apps/desktop/package-lock.json` is absent on #692.
- Node 22.16.0/npm 10.9.2 `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --lockfile-version=3` timed out after 120 seconds and created no lockfile.
- Issue #696 records the evidence. Do not fabricate lock data or switch to `npm ci` until a network-enabled Node 20/22 runner generates and verifies the lock against the exact package.json on Ubuntu/Windows/macOS.

## Prioritized backlog

1. **P0 #648/#613:** complete latest Focus exact-head CI and ten consecutive API 36 lifecycle runs; verify cancel-before-publish fixes stale notification title.
2. **P0 #677:** finish API 29/36 gesture + lifecycle tests using actual ModeSelector instrumentation; preserve strict swipe/scroll assertions.
3. **P0 #683:** complete save/import/recovery/clear/undo race matrix with shared Web Locks helper.
4. **P0 #646:** owner-side required checks and independent review enforcement; no bypass.
5. **P0 #160:** physical Android/WebView/OEM acceptance with exact device/API/WebView/build/APK hashes.
6. **P1 #665/#84:** independent signing/provenance review; PR secret boundary is corrected in branch, not main.
7. **P1 #671/#678:** complete secure Android download transport (redirect validation, pinned addresses, bounded streaming, cancellation, atomic publication).
8. **P1 #692/#696:** generate exact desktop lockfile on network-enabled Node 20/22 and verify immutable npm ci across OSes.
9. **P1 #690/#689:** complete Focus/webhook lock ordering and same-tab invalidation; preserve opaque recovery bytes.
10. **P1 #659/#687 / #676:** expose safe extension recovery UI and finish trust/injection security review.
11. **P1 #685/#686:** preserve fail-closed Service Worker behavior until reviewed Online-compatible origin/network contract exists.
12. **P1 #684/#656/#675:** integrate recurrence and tag validation without whole-file overwrite; keep RFC 5545 parity.

## Delivery accounting

- #694 dynamic/prototype skip guard: committed/pushed, five exact-head workflows PASS, not merged.
- #648 Focus runtime/notification correction: committed/pushed, latest exact-head workflows in progress at snapshot time.
- #677 instrumentation target correction: committed/pushed, Focus UI and contracts PASS; Android/API29/36 still in progress.
- #675 durable status refresh: committed/pushed, Android/contracts/device APK PASS.
- No PR merged in this run; #695 was already merged into main before this run.
- No release/tag/version/signer/application identity change.
- No destructive migration or physical-device test.

---

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector via Code Mode; GitHub REST branch/Actions/releases APIs; exact PR source, test, review and job-log inspection
Timestamp (UTC): 2026-11-10T05:07:00Z
