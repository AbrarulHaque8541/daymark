# Daymark whole-project engineering snapshot — 2026-11-08T16:40:34Z

## Verified repository baseline

- Repository: AbrarulHaque8541/daymark
- Live main SHA: `1d86a8a06cf6a1c02c37391d63400100fcfc6200`
- Root `AGENTS.md` read in full; no `apps/AGENTS.md` exists (GitHub contents API returned 404).
- Approved source/build identity remains `com.abrar.daymark`; no identity change.
- PR #630 branch: `fix/retain-nonredundant-recovery-backups-20261108-1535`.
- Parent/head before this change: `40e5d5925dc6a7ac6e7bbfe04c9d8c9fdf19e166`.
- PR #630 is open, mergeable, and has no submitted independent reviews or inline review threads.
- Exact-head Android CI, Ubuntu/Windows contracts, and device-test APK workflows passed on the previous head `40e5d5925dc6a7ac6e7bbfe04c9d8c9fdf19e166`; this new commit requires fresh exact-head runs.

## Whole-repository review and selected task

The highest-value independent task in this run was user-task recovery integrity. The current PR #630 implementation preserved malformed/unknown backups and empty payloads, but a recognized recovery-bundle envelope with additional top-level fields was still parsed as if the known schema were complete. Its unknown metadata could be discarded during a merge, and a bundle could be auto-cleared when its payload strings matched the primary despite unrecognized metadata.

## Implementation on PR #630

Changed:
- `app.js`
- `tests/app-recovery-backup.test.js`
- this dated snapshot

The new `isKnownRecoveryBundle()` requires the exact supported envelope key set (`format`, `payloads`), a non-empty array, and string payload members. Only that exact schema is unpacked or considered for automatic redundancy cleanup. Any extra top-level field makes the original outer JSON bytes opaque; when a new damaged primary is backed up, the complete prior envelope is retained as an exact string inside the new recovery bundle.

Added regressions:
1. A bundle with `legacyMetadata` remains untouched on healthy-primary startup even when its payload matches the primary.
2. A bundle with unknown metadata survives a merge with a newly rejected primary, including byte-exact retention of the old envelope.

## Validation

- Source-extracted V8 smoke against the modified production functions: **PASS — 7 scenarios** (unknown envelope opaque, no cleanup, exact prior bytes retained on merge, known exact schema unpacking, known exact schema redundancy, unknown metadata blocks cleanup, and merged bundle parse).
- Canonical `sh android-app/tools/check-v1-source.sh`: **NOT RUN locally**.
- Canonical `npm test`: **NOT RUN locally**.
- Android/Ubuntu/Windows exact-head CI: **PENDING** for the new commit.
- Physical browser storage/quota/privacy-mode acceptance: **NOT TESTED**.

## Other live blockers reviewed

- PR #624: shared response reader still has a non-streaming `response.text()` fallback that materializes the full response before enforcing the cap; fix must fail closed or use an incremental bounded fallback.
- PR #631: desktop Electron security hardening is active; review must retain strict document-vs-subresource scheme policy and validate host/guest navigation boundaries. Desktop GUI/packaging acceptance remains untested.
- PR #616: API 36 lifecycle acceptance still requires actual consecutive emulator passes; source/CI instrumentation is not physical-device evidence.
- Issue #160: physical Android/WebView acceptance remains **NOT TESTED**.

## Next ranked backlog

1. **P0 — Issue #160:** run the actual Android/WebView/DownloadManager/Offline/Reader/notification acceptance matrix on a physical device and record device, API, WebView provider/version, build SHA, APK SHA, scenario, and result.
2. **P1 — PR #624:** enforce a true peak-memory response-body bound; do not permit a `response.text()` compatibility path that allocates before checking.
3. **P1 — PR #616 / Issue #613:** fix and repeatedly validate the API 36 task-editor/IME and Focus lifecycle regressions; retain all instrumentation assertions.
4. **P1 — PR #631:** finish the independent Electron security review, then add GUI launch/package acceptance before calling the desktop prototype supported.
5. **P1 — PR #630:** obtain independent data-integrity review and rerun all exact-head checks before merge.
6. **P1 — PRs #620/#623/#621/#628:** reconcile API-card clients with the bounded shared response reader without weakening streaming tests.
7. **P2 — Issue #325:** maintain an evidence-based cross-platform compatibility matrix and prototype plan; no speculative rewrite.

## Safety

No release/tag publication, version bump, package identity change, signer change, manifest permission change, schema migration, or destructive user-data operation. The production release job must remain skipped for this PR. A green APK build is not physical-device acceptance.

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub connector (live GitHub source/PR/Actions inspection, Git data APIs); V8 source-extracted policy smoke
Timestamp (UTC): 2026-11-08T16:40:34Z
