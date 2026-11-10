# Daymark — repository-wide engineering status

**Snapshot:** 2026-11-10T03:50:47.878Z  
**Repository:** AbrarulHaque8541/daymark  
**Default branch:** `main`  
**Main SHA:** `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`  
**Root AGENTS.md blob:** `492ed21e2219a8d1b80c7d6e63575525c98a5a91`  
**Latest merged PR:** #688  
**Open PRs:** 13  
**Open issues:** 23

This is an engineering snapshot, not a merge or release claim. PRs remain delivery mechanisms; the backlog spans the whole app.

## Governance and mainline

- Main Android CI and Ubuntu/Windows cross-platform contracts are green on the recorded main SHA.
- Branch metadata reports `protected=false`; repository rulesets API returned an empty list.
- Detailed branch-protection endpoint returned HTTP 403 to the connected integration; required-check/approval configuration could not be inspected.
- All 13 open PRs were inspected. Requested reviewer lists are empty. Review records inspected show no independent `APPROVED` state.
- No merge or protection change was attempted.
- No physical Android, WebView, desktop GUI or installer acceptance is claimed.

## Engineering delivered in this run

### PR #665 — signing-secret trust boundary

Base: `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`  
Current head: `34308022a6e8fd9dac4a7bec3f19bda375d90c1d` (21 ahead / 0 behind).

- `.github/workflows/android-release-assets.yml` is PR-only, unsigned/debug-only, contains no repository secret references and has no release-publishing job.
- New `.github/workflows/android-signed-device-test-release.yml` is tag-push-only for `v*-device-test.*`; it retains signing validation, signer/manifest checks, main ancestry validation, cleanup and existing device-test prerelease publication.
- Signing secrets are step-scoped. Tag-only secret validation now occurs after the repository test/source suite.
- `tests/release-action-runtime.test.js` checks all current PR workflows for secret references/signed Gradle variants, tag-only separation, immutable action pins, cleanup order, SLSA and private-main transfer.
- `android-app/tools/check-release-identity.sh` guards the split.

Exact-head checks:
- Android CI #42751620160: PASS — Node 690/690, source guards PASS, Gradle BUILD SUCCESSFUL.
- Cross-platform contracts #42751620351: PASS — Ubuntu and Windows.
- Non-publishing device acceptance artifact #42751620220: PASS.
- Android PR device-test validation #42751620234: IN PROGRESS at snapshot time; unsigned debug build/lint/instrumentation compilation running.

No secret value was read/printed/rotated. No tag/release was created. Owner-level Actions settings for secrets sent to same-repository PR workflows remain unverified; current PR workflows are guarded, but the repository setting is a separate durable boundary. PR remains draft/unmerged pending final exact-head check and independent security review.

### PR #694 — Node test-integrity AST guard

Base: `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`  
Current head: `acc64c267d68e54089f2d01780b3939d75f3fc29` (30 ahead / 0 behind).

- Rejects any `WithStatement` because dynamic object environments are not modeled by the lexical resolver.
- Invalidates the root imported `node:test` binding on any computed/static member write, including `nodeTest['te' + 'st'] = () => {}`.
- Added two permanent regression tests; no existing tests or inventory entries were removed.
- Added a locked root Acorn dependency and a temporary pretest bootstrap for legacy workflows that do not yet run explicit `npm ci`.

Exact-head checks all PASS:
- Android CI #42751019339.
- Ubuntu/Windows contracts #42751019289.
- Browser cookie import safety #42751019454.
- Device acceptance artifact #42751019743.
- Android device-test release assets #42751019654; PR-event release-secret/publishing steps skipped.

The code head `a9e34c2` passed Node 692/692 and all five workflows; current documentation head `acc64c2` also passed all five. PR remains draft/unmerged pending independent review.

### PR #692 — desktop download and CI hardening

Base: `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`  
Current head: `33d5bf95b2d3c25a717f96b172c509f553b07a8b` (16 ahead / 0 behind).

- Desktop download filename policy/handler and failure-path coverage remain in the PR.
- Desktop CI now pins checkout v7.0.0 and setup-node v6.0.0 to immutable Node 24 action-runtime commits while retaining Node 20 as the Electron test runtime.
- Added `apps/desktop/test/workflow-contract.test.js`; registered it in `tests/REQUIRED_NODE_TEST_FILES.txt`.
- The first workflow-contract head failed because the new test was missing from the canonical inventory; corrected in `33d5bf9`.

Exact-head checks all PASS:
- Desktop CI #42751675537: 43/43 on Ubuntu, Windows and macOS.
- Cross-platform contracts #42751675450: PASS.
- Android CI #42751675524: Node 697/697, Gradle BUILD SUCCESSFUL.
- Device-test APK #42751675799: Node 697/697, APK verified; GitHub Release publication skipped.

The desktop package has no `apps/desktop/package-lock.json`; it still uses `npm install`, not `npm ci`. Issue #696 tracks lockfile generation and deterministic install. External local-process path replacement remains a documented residual threat-model boundary. PR remains open/unmerged; physical GUI/installer testing NOT DONE.

### PR #675 — task, webhook and Focus coordination

Current head: `c28b549bdb8647631a8bff80f78ebd7e60e57e64`, based on current main, 177 ahead / 0 behind.

The integration branch contains:
- Origin-wide task Web Locks, locked reread and three-way merge.
- Task completion awaits webhook enqueue while the task lock is held; queue append/clear use delivery and queue locks.
- Global order: task → webhook delivery → webhook queue → Focus.
- Focus Web Lock and monotonic generation; stale session/preset/recovery writes fail closed after clear.
- Focus/category/backup/preset/Clear All clear paths coordinate with generation and same-/cross-tab invalidation.
- Post-commit Focus reconciliation adopts the committed merged snapshot before releasing the lock.

Regression inventory: `tests/focus-storage.test.js` 16 cases; `tests/storage-ui.test.js` 31 cases; broader code head Node 831/831. Android CI, Ubuntu/Windows contracts and device APK passed on the recorded code/docs heads. Physical two-tab WebView acceptance remains NOT TESTED. PR remains draft/unmerged pending independent scope/security review. Issues #683, #689 and #690 were updated with exact branch-level evidence.

## Open PR inventory

| PR | Base | Head | Latest recorded state |
|---|---|---|---|
| #695 | `557af31` | `c2262009` | Android/contracts/device APK PASS; docs-only support matrix |
| #694 | `557af31` | `acc64c2` | Five exact-head workflows PASS; AST bypasses fixed |
| #692 | `557af31` | `33d5bf9` | Desktop 43/43 all OS; contracts, Android 697/697 and device APK PASS |
| #686 | `557af31` | `155d00d8` | Runtime API 26/36 checks PASS; Online Service Worker restriction remains |
| #682 | `1532838` | `0e6d73f1` | Android/contracts/device APK PASS |
| #678 | `1532838` | `b27f8bab` | Redirect-policy/Android/contracts/device checks PASS; full secure transport incomplete |
| #677 | `557af31` | `b328a863` | API 29 PASS; API 36 horizontal swipe fails |
| #676 | `1532838` | `e68e0d35` | Android/contracts/device checks PASS; physical WebView acceptance pending |
| #675 | `557af31` | `c28b549b` | Task/webhook/Focus integration present; independent review required |
| #665 | `557af31` | `34308022` | Android CI/contracts/device artifact PASS; dedicated PR debug validation still running |
| #659 | `1532838` | `7b123a1f` | Android/contracts/device acceptance/APK PASS; accessible recovery UI incomplete |
| #656 | `557af31` | `33b05759` | Android/contracts/device APK PASS; RFC 5545 review pending |
| #648 | `1532838` | `8abf8424` | API 29 PASS; API 36 paused notification title/lifecycle failure |

Older-base PRs #682, #678, #676, #659 and #648 require owner-aware synchronization. Do not overwrite concurrently owned files or force-update branches.

## Open issue inventory and priorities

There are 23 open issues. Current priority:

| Priority | Issue | Work |
|---|---|---|
| P0 | #646 | Required main checks and independent review governance |
| P0 | #160 | Physical Android/WebView acceptance |
| P0 | #613 | API 36 Focus notification and Task Editor failures |
| P1 | #683 | Cross-tab task/import/recovery/clear/undo race matrix |
| P1 | #689 | Webhook delivery/queue serialization |
| P1 | #690 | Focus generation/clear multi-tab lifecycle |
| P1 | #671 | Complete secure Android download transport |
| P1 | #84 | Signing/action-runtime security and provenance |
| P1 | #687 | Accessible malformed-extension recovery/removal UI |
| P1 | #685 | Service Worker Offline enforcement and Online compatibility |
| P1 | #684 / #476 | Android/web recurrence validation and scheduling parity |
| P1 | #636 / #639 | Webhook endpoint privacy and cross-tab queue correctness |
| P1 | #640 / #603 | Recovery backup and storage-health integrity |
| P1 | #691 | Desktop download local-process race threat-model boundary |
| P2 | #696 | Commit Electron desktop lockfile and switch CI to npm ci |
| P2 | #348 / #325 | Browser UX and cross-platform architecture |

Other open issues include #680 (SPA match/exclude reevaluation), #679 (application identity reconciliation), #693 (test-integrity guard implemented in #694), and the related items above.

## Owner decisions and safety

- Root AGENTS.md and Gradle specify the owner-approved installed application identity; the run-level directive conflicts. No applicationId, namespace, manifest identity or data migration was changed. Issue #679 remains an owner decision.
- Main protection is disabled; detailed protection API returned 403. No settings changed.
- Repository-level Actions secret-to-PR settings were not inspectable through the available integration. Current PR workflows are guarded; owner-level setting still needs verification.
- No production release/tag/version bump, signing-key/secret change, destructive migration or user-data operation occurred.
- CI-built APKs are artifacts only; no physical-device install/acceptance is claimed.

## Next execution order

1. Finish #665 exact-head PR debug validation; obtain independent security review and owner-level Actions secret setting.
2. Complete API 36 Focus/Task Editor acceptance for #648/#677 without weakening assertions.
3. Run real two-tab browser/WebView race matrix for #683/#689/#690.
4. Implement complete secure Android download transport (#671/#678); complete desktop lockfile (#696) and resolve the #691 local-process threat boundary.
5. Complete extension recovery UI (#659/#687), Service Worker compatibility (#685/#686), recurrence parity (#684/#476), and import/export review (#656).
6. Establish main required checks/independent review and physical device qualification (#646/#160).
7. Continue recovery, webhook privacy/concurrency and architecture backlog (#640/#603/#636/#639/#348/#325).

**Delivery state:** code committed/pushed on #665, #694 and #692; exact-head checks are green as recorded above, except #665's dedicated PR debug build remains in progress at snapshot time. All PRs remain unmerged. No project completion or release is claimed.
