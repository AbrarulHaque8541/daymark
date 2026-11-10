# Daymark — Repository-wide engineering status

Snapshot time (UTC): 2026-11-10T01:15:04.580Z

Repository: `AbrarulHaque8541/daymark`  
Default branch: `main`  
Main SHA: `1532838c78ab350b18f95e96a2c547ba384f0831`  
Root `AGENTS.md` blob: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`

This snapshot is an evidence ledger, not a claim that any open PR is complete. The integration/status branch is not main.

## Repository baseline

- Open PRs: 11.
- Open issues: 20.
- Main Android CI: PASS, run `42654200287`.
- Main cross-platform contracts: PASS, run `42654200808`.
- Main branch protection: disabled (`protected=false`).
- Repository rulesets: none.
- Detailed branch-protection endpoint: HTTP 403 to the connected integration.
- CODEOWNERS: no root or `.github/CODEOWNERS` file found.
- Independent APPROVED reviews in the inspected open-PR review records: none.
- PRs merged by this run: 0.
- Production releases/tags created: 0.
- Physical-device tests performed: 0.

## Engineering delivered in this run

### PR #675 — task, webhook and Focus storage coordination

Current exact code head: `001a4adfe2ddf0981af1627fb2fe76251d4fb5a7`.

Commits delivered:
- `b602a5e77816b94ff62af6e7eb49baf294559bfc` — rebase all Focus state after a shared-generation clear.
- `254236cc55f248f43fa54e0fdb87cd254652029b` — same-tab and cross-tab pending-session-write regressions.
- `651144818617c030c0fef0296267ed8ab0c2db78` — preserve explicit Focus-backup clear semantics.
- `001a4adfe2ddf0981af1627fb2fe76251d4fb5a7` — same-tab/cross-tab regression coverage proving a cleared backup is not recreated from a malformed primary.

Files changed in the recent Focus work:
- `app.js`
- `tests/focus-storage.test.js`

Behavior:
- Any Focus generation change rebases the in-memory Focus domain.
- A pending writer interrupted by a preset/backup clear cannot leave a phantom paused session.
- Explicit backup clear suppresses/cancels automatic backup recreation while preserving the malformed primary bytes.
- Cross-tab generation and backup-removal events are handled separately so the app does not recreate a backup the user explicitly removed.

Existing task/webhook transaction work on this branch retains the task → Focus → webhook lock order for Clear All and task → webhook for completion notification append/queue clear. Network delivery is deferred until after the mutation transaction.

Exact-head verification for `001a4ad`:
- Android CI run `42732994387`: PASS.
- Cross-platform contracts run `42732994432`: PASS.
- Device-test APK verification run `42732994371`: PASS; release publication skipped.
- Canonical Node suite: 824/824 PASS, 0 failures.
- Focus generation/rebase and explicit backup-clear regression cases passed.

No physical device was tested. PR #675 remains open/draft/unmerged; independent data-integrity review is still required.

### PR #659 — extension-store no-follow atomic staging

Current exact head: `7b123a1f7581d39ec69f47bdcc0b66560cc7bcd8`.

Recent commits:
- `bb6159b3c0a2b7c1e8f9a9d2e3f0f8a7b6c5d4e3` — temporary-file no-follow staging implementation.
- `fc8a36fa1f87d7f1ea8013e50aaafc53f4aeb313` — filesystem regression coverage.
- `7b123a1f7581d39ec69f47bdcc0b66560cc7bcd8` — source guard updated to assert the stronger writer contract.

The implementation uses `FileChannel.open(CREATE_NEW, WRITE, NOFOLLOW_LINKS)`, flushes staged bytes with `force(true)`, replaces the destination, and cleans up only a temporary path created by the current write. The regression proves an existing temporary symlink is not followed/deleted and its external target bytes remain unchanged.

Exact-head verification:
- Android CI run `42732488772`: PASS.
- Cross-platform contracts run `42732488946`: PASS.
- Device acceptance artifact run `42732488777`: PASS.
- Device-test APK run `42732488774`: PASS.
- `ExtensionStoreSmoke`: 52 assertions PASS.
- Extension source-guard mutation tests: 16 rejected mutations; unchanged source accepted.
- Release publication skipped.

No physical device was tested. PR #659 remains draft/open/unmerged pending independent security review.

Attribution correction: two earlier commit-message timestamp trailers on this branch used planned times later than the actual runtime clock. A follow-up PR comment records the authoritative actual timestamp; commit hashes and code are unaffected.

### PR #656 — iCalendar empty-parameter validation

Current exact head: `6899cf868f62e6f6135f75208d085a337c5363cb`.

Recent commits:
- `dafe731ba92f4a76e356a3d22ca1791c0b7add1f` — reject explicitly empty VALUE and TZID parameters.
- `6899cf868f62e6f6135f75208d085a337c5363cb` — regression coverage.

The importer now distinguishes an omitted parameter from an explicitly empty one. Empty `VALUE=` is not silently treated as the default DATE-TIME type; UTC `COMPLETED` rejects any TZID parameter, including an empty TZID. This prevents malformed completion metadata from silently marking a VTODO completed.

Exact-head verification:
- Android CI run `42733133341`: PASS.
- Cross-platform contracts run `42733133311`: PASS.
- Device-test release-assets run `42733133007`: PASS; release publication skipped.
- Canonical Node suite: 729/729 PASS, 0 failures.

No physical device or production release was performed. PR #656 remains open/unmerged pending independent RFC/data-integrity review.

### PR #648 — canonical Android Focus/Task Editor and source-guard integration

Current exact head: `8abf842450e113680dbc3c713b8b24ba35af96cc`.

The branch already contains the Task Editor API 30+ dialog IME inset handler; API 26–29 retains resize behavior. The prior exact head `a25b4226a284f4051cd3ee7d2e89d4f576d52b3a` passed TaskEditorIme instrumentation:
- API 29: 373 assertions PASS.
- API 36: 10/10 consecutive runs PASS, 376 assertions each.

New commit `8abf842450e113680dbc3c713b8b24ba35af96cc` updates the shared source guard to allow only the reminder receiver's boot broadcasts plus the explicit `TIME_SET` and `TIMEZONE_CHANGED` actions. All other receiver actions remain rejected.

At snapshot time:
- Android CI run `42734047344`: PASS.
- Cross-platform contracts run `42734047351`: PASS.
- Focus UI/sound run `42734047838`: PASS.
- Live update run `42734047361`: PASS.
- Focus emulator lifecycle and device-test release-assets workflows: still running/pending.

No physical-device test or merge is claimed.

### PR #677 — reminders and system-time rescheduling

Current exact head: `e5a3274083754d9352b9fd36539a308be06e6f16`.

A temporary attempt to port the #648 MainActivity IME helper into this branch was reverted after re-reading the root AGENTS shared-file ownership rule. Current `MainActivity.java` is byte-identical to main; no competing MainActivity edit remains on #677.

The current #677 Focus emulator lifecycle workflow passed:
- API 29: 290 assertions PASS.
- API 36: 293 assertions PASS.
- `DaymarkPlatformInstrumentation` invokes `TaskEditorImeInstrumentation.run(this)`.

The current Android CI and device artifact workflows fail at the source guard because #677's manifest adds `TIME_SET` and `TIMEZONE_CHANGED`, while main's guard allowed only boot broadcasts. The narrow allowlist correction is on the #648-owned branch at `8abf842`; #677 must integrate/rebase after #648 is independently reviewed/integrated. No test was weakened.

### Other open PRs — independently checked

All 11 open PRs target main SHA `1532838c78ab350b18f95e96a2c547ba384f0831`. No independent APPROVED review was found.

| PR | Exact head | Latest finding |
|---|---|---|
| #675 | `001a4ad` | Android, contracts, device APK and 824 Node tests PASS |
| #659 | `7b123a1` | Android, contracts, device artifacts and 52 ExtensionStoreSmoke assertions PASS |
| #688 | `f01e3e8` | Android, contracts and device artifact PASS |
| #665 | `9ab50cb` | Android, contracts and device artifact PASS; signing/provenance review pending |
| #656 | `6899cf8` | Android, contracts, device artifact and 729 Node tests PASS |
| #677 | `e5a3274` | API 29/36 lifecycle PASS; Android/device source guard fails pending #648 allowlist integration |
| #648 | `8abf842` | Android, contracts, Focus UI and Live Update PASS; emulator/device artifact pending at snapshot time |
| #686 | `707b915` | Runtime checks PASS; service-worker network remains blocked even while Online |
| #676 | `e68e0d3` | Android, contracts and device artifacts PASS |
| #682 | `0e6d73f` | Android, contracts and device artifact PASS |
| #678 | `b27f8ba` | Redirect-policy checks PASS; actual secure download transport is incomplete |

## Cross-project risks and owner blockers

- **#646 governance:** main is unprotected; no rulesets or CODEOWNERS were found; detailed protection endpoint returns HTTP 403. No protection settings were changed. Last main Android/contract workflows are green, but there is no enforced required-check/approval policy.
- **#679 application identity:** root AGENTS and live Gradle/source guard enforce the repository's current application identity, while the run-level safety instruction requires a different identity. No applicationId, namespace, signing or data migration was performed. This remains an owner-level continuity decision.
- **#160 physical acceptance:** CI artifacts/emulators are not physical-device tests. Real Android/WebView acceptance remains NOT TESTED.
- **#685/#686 Service Worker compatibility:** current PR deliberately blocks Service Worker HTTP/HTTPS network requests even in Online mode. This is fail-closed but materially stricter than the Online/Offline browser contract; a product decision or Online-consent-aware policy is required before merge.
- **#671/#678 downloads:** redirect validation exists, but the Daymark-owned transport, DNS-pinned socket connection, bounded streaming, cancellation, temporary-file cleanup and final-file publication remain incomplete.
- **#665/#84 signing:** secret isolation branch is green but independent release-security/provenance review remains pending.
- **#687 extensions:** malformed-pack storage recovery is implemented, but accessible extension-manager recovery UI remains outstanding.
- **#684 recurrence:** Android/web recurrence validation and scheduling parity remain incomplete; the iCalendar parameter validation work is separate.

## Prioritized repo-wide backlog

1. **P0 — #646:** establish main required checks and independent review/ownership enforcement; current integration cannot inspect/change protection settings.
2. **P0 — #160:** physical Android/WebView acceptance for browser, Focus, reminders, extension import and download paths.
3. **P0 — #675/#683/#690:** finish independent review of cross-tab task mutation, task/webhook transaction ordering, Focus generation/recovery and category-clear semantics.
4. **P0 — #648/#677/#613:** complete the source-guard integration and retest reminder lifecycle on the combined exact head.
5. **P1 — #671/#678:** implement the actual secure browser-download transport; keep downloads fail-closed until complete.
6. **P1 — #665/#84:** complete signing-secret isolation and provenance/action-runtime security review.
7. **P1 — #659/#687:** integrate accessible malformed-extension recovery UI and independently review filesystem/trust behavior.
8. **P1 — #685/#686:** resolve Service Worker Online-mode compatibility without weakening Offline enforcement.
9. **P1 — #656/#684/#476:** complete RFC 5545 review and Android/web recurrence validation/scheduling parity.
10. **P1 — #636/#639/#640:** complete webhook privacy, queue concurrency and recovery integrity review.
11. **P2 — #325/#348:** continue cross-platform architecture and browser UX improvements.

## Safety and delivery accounting

- Code changed/committed/pushed on #675, #659, #656 and #648 branches.
- PR #677 temporary shared-file changes were reverted; no overlapping MainActivity edit remains.
- Exact-head CI is green for #675, #659 and #656 as listed above.
- #648's new guard head has partial green checks; emulator/device artifact were pending at snapshot time.
- #677's current Android/device source guard checks fail for the known broadcast allowlist mismatch; API 29/36 lifecycle passes.
- No PR merged by this run.
- No release/tag/version bump.
- No signing-key change.
- No applicationId/namespace change.
- No destructive migration or user-data modification.
- No physical-device test.

Next run must refresh all live state and this backlog before selecting work.