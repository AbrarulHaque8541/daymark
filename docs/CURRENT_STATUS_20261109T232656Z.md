# Daymark repository-wide engineering status
**Recorded:** 2026-11-09T23:26:56Z  
**Repository:** AbrarulHaque8541/daymark  
**Default branch:** main  
**Latest main SHA:** `1532838c78ab350b18f95e96a2c547ba384f0831`  
**Root AGENTS.md blob:** `492ed21e2219a8d1b80c7d6e63575525c98a5a91`

## Executive state

- Main Android CI: PASS on `1532838` (run [42654200287](https://github.com/AbrarulHaque8541/daymark/actions/runs/42654200287)).
- Main cross-platform contracts: PASS on `1532838` (run [42654200808](https://github.com/AbrarulHaque8541/daymark/actions/runs/42654200808)).
- Latest mainline integration: PR #681, browser clear-action lifecycle and browser-error-card wiring.
- Open PRs: 11. Open issues: 20.
- Main branch protection: `protected=false`; repository rulesets: none. Detailed protection inspection returned HTTP 403. No governance settings were changed.
- No independent APPROVED review was present in the inspected open-PR review records. Requested reviewer lists were empty.
- No PR was merged in this run. No release/tag was created. No version, signing key, application identity, or user-data migration was changed.
- Physical-device acceptance: NOT TESTED.

## Current delivery: task mutation + webhook queue transaction

PR [#675](https://github.com/AbrarulHaque8541/daymark/pull/675) remains open and draft, targeting main SHA `1532838c78ab350b18f95e96a2c547ba384f0831`.

- Exact code head: `f0983019e0764b2fd85effece83e3c651bc501bf`.
- Base SHA: `1532838c78ab350b18f95e96a2c547ba384f0831`.
- GitHub reports the branch mergeable; this is not merge authorization. Independent approval and branch governance remain absent.
- Changed source/test files: `task-mutation-logic.js`, `app.js`, `webhook-ui.js`, `storage-ui.js`, `index.html`, `tests/task-mutation-logic.test.js`, `tests/app-storage.test.js`, `tests/webhook-ui.test.js`, `tests/storage-ui.test.js`.

### Implementation

The shared lock order is **task mutation → webhook delivery → webhook queue**.

Rationale:
- A task-completion mutation holds the task lock through its awaited `afterCommit` callback.
- The callback appends the webhook event under the queue lock only when the locked merge reports an actual open→completed change.
- Network delivery is scheduled asynchronously after the durable queue append; it is not awaited while the task lock is held.
- Clear Queue, storage-card webhook-queue clear, and Clear All acquire the same task→delivery→queue order.
- The delivery lock waits for an in-flight POST before queue removal.
- Any lock failure aborts before the destructive callback.
- Same-tab memory-only pending events are reset inside the same lock scope after a successful queue clear.
- `task-mutation-logic.js` now loads before `webhook-ui.js` so the deferred-script auto-boot sees the shared lock contract; the webhook API forwards the deferred-delivery option.

This order is intentionally different from delivery→queue→task: task completion itself holds task before queue. No current delivery/reconciliation path acquires task after holding delivery/queue; no reverse lock acquisition was found in the inspected paths.

### Exact-head verification

All three workflows below completed successfully on code head `f098301`:

| Workflow | Run | Result |
|---|---:|---|
| Android CI | [42722383913](https://github.com/AbrarulHaque8541/daymark/actions/runs/42722383913) | PASS |
| Cross-platform contracts (Ubuntu + Windows) | [42722384357](https://github.com/AbrarulHaque8541/daymark/actions/runs/42722384357) | PASS |
| Device-test APK verification | [42722384101](https://github.com/AbrarulHaque8541/daymark/actions/runs/42722384101) | PASS; release publication skipped |

Verified logs include 804/804 Node tests, Android debug build and both flavor lint, plus Android core smoke/contract checks. The device-test APK was built and verified as an artifact; it was NOT installed or physically tested on a user's device.

The first implementation head `1c00e498` had two test-only failures (cross-realm object deep equality and an obsolete source-string assertion). Those assertions were corrected in `6340949`; the later exact head `f098301` passed all three workflows.

Commit chain for this change:
- `e2640feb` — shared ordered locks, task-commit callback, webhook/clear integration and regression tests.
- `90580eac` — empty tree-preserving follow-up commit; no source delta.
- `66001ddc` — script order and webhook API option forwarding.
- `6340949d` — corrected the two failing test assertions.
- `f0983019` — reset the same-tab memory queue while the clear locks are still held.

## Important scope boundaries and remaining defects

### #689 — webhook queue clear race

The task/delivery/queue ordering and delayed completion append race are implemented on #675 and exact-head CI is green. Do not close #689 until the Focus-domain dependency in #690 is integrated and the combined Clear All behavior is tested.

### #690 — Focus storage race (still OPEN)

Not fixed by this run:
- `persistFocusState()` does not yet use a Focus mutation lock.
- Focus and Focus-backup category clears do not acquire a Focus lock.
- Clear All currently coordinates task + webhook delivery + webhook queue, but not Focus writers.
- Same-tab Focus session/timer invalidation after external clear remains outstanding.

### #683 — cross-tab task mutation (PARTIAL)

The shared Web Locks/locked reread/three-way merge contract is present on #675. The #656 import path uses the same mutation helper. The completion webhook now commits under the task lock. Still required: deterministic import-vs-normal-save, clear-completed, and recovery-merge race tests on the combined integration.

### #677 / #613 — API 36 Task Editor

API 36 emulator job [42682273638](https://github.com/AbrarulHaque8541/daymark/actions/runs/42682273638) fails the Task Editor Cancel interaction while the IME is visible; API 29 passes. The dialog bounds extend below the keyboard-safe region. The failure was documented on #677. `MainActivity.java` was not edited because #648 currently owns overlapping MainActivity work. Preserve the strict test.

### #684 — recurrence parity

An additional web validation gap was recorded: web `task-logic.js` does not validate recurrence fields as strictly as Android `TaskLogic.isValid()`. The web app may retain malformed recurrence metadata and silently treat an unknown rule as non-repeating or substitute a due-date anchor. A shared validation fixture is recommended. No recurrence behavior or stored data was changed.

### Other major unresolved work

- #646: required CI and independent review governance; main is unprotected.
- #160: physical Android/WebView acceptance matrix.
- #671/#678: redirect policy exists, but complete pinned-address, bounded, cancellable secure download transport is not finished.
- #665/#84: signing-secret isolation and provenance review; no merge.
- #687/#659: malformed extension recovery storage exists; accessible manager UI integration remains.
- #685/#686: Service Worker policy is fail-closed but restricts Service Worker network use while Online; compatibility/owner decision remains.
- #656: import/export RFC and data-integrity review remains.
- #636/#639: webhook secret handling and queue concurrency review remains.
- #640/#603: recovery discovery and storage-health reporting remain under review.

## Open PR inventory (all target main SHA `1532838`)

| PR | Head SHA (short) | Current recorded state |
|---|---|---|
| #675 | `f098301` | Exact-head Android, contracts and device APK PASS; open draft |
| #677 | `9376bce` | API 36 Task Editor/IME failure; API 29 PASS |
| #665 | `9ab50cb` | Reported Android/contracts/device checks PASS; independent security/provenance review pending |
| #688 | `f01e3e8` | Reported Android/contracts/device checks PASS; ready for review |
| #656 | `2538b6f` | Reported Android/contracts/device checks PASS; RFC/data-integrity review pending |
| #648 | `a25b422` | Reported Android/contracts/Focus API 29+36/device artifact PASS; physical device pending |
| #659 | `5d3f983` | Reported Android/contracts/ExtensionStoreSmoke/device artifact PASS; UI/security review pending |
| #686 | `707b915` | Multi-origin/multi-tab Service Worker API 26+36 checks PASS; compatibility review pending |
| #676 | `e68e0d3` | Reported Android/contracts/device checks PASS; physical WebView acceptance pending |
| #682 | `0e6d73f` | Reported Android/contracts/device checks PASS; independent review pending |
| #678 | `b27f8ba` | Redirect-policy/Android/device checks PASS; actual secure transport incomplete |

No independent approval was found in the inspected PR review records. Green CI does not authorize merging.

## Open issue inventory (20)

- #684 Align Android and web repeat-task completion semantics.
- #690 Coordinate Focus state writes with storage clear and cross-tab lifecycle.
- #683 Serialize cross-tab task mutations to prevent silent lost updates.
- #689 Serialize storage clear actions with webhook delivery and queue locks.
- #84 Remove stale GitHub Actions action-version deprecation warnings.
- #685 Enforce Offline network policy for WebView Service Workers.
- #613 Stabilize API 36 Focus Timer and task-editor emulator lifecycle instrumentation.
- #671 Implement redirect-validating browser download transport.
- #603 Distinguish unreadable storage keys from absent data.
- #640 Surface recovery backups when the primary task key is unreadable.
- #639 Serialize webhook queue across tabs.
- #636 Avoid persisting secret-bearing webhook endpoint URLs.
- #646 Protect main with required CI and independent review rules.
- #687 Expose explicit recovery/removal for malformed stored extension packs.
- #680 Re-evaluate extension match/exclude rules on same-document SPA navigation.
- #679 Reconcile application identity before any applicationId change.
- #476 Align Android/web repeat scheduling, anchors and long-gap catch-up.
- #348 Browser UX compatibility, downloads, app links, proxy options and performance.
- #160 Current-main Android runtime acceptance matrix.
- #325 Cross-platform Daymark architecture spike.

## Safety and next priorities

No release/tag, version bump, signing-key change, application identity change, or destructive migration was performed. The current repository identity still conflicts with the run-level required identity; this was left unchanged pending explicit owner reconciliation.

Next order:
1. Implement Focus writer/clear lock and same-tab invalidation under #690; then extend the global order and retest #689.
2. Add combined import-vs-normal-save, clear-completed and recovery-merge race tests under #683/#656.
3. Coordinate the API 36 Task Editor IME fix with the #648 MainActivity owner; rerun API 29/36.
4. Advance main protection/independent review under #646.
5. Continue physical-device acceptance under #160.
6. Continue secure download transport under #671, signing/provenance under #665, extension recovery UI under #687, and recurrence validation/semantics under #684/#476.

This snapshot is an engineering handoff, not a merge or release declaration.
