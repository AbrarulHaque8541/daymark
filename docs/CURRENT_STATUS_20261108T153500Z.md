# Daymark whole-project engineering snapshot — 2026-11-08T15:37:40.809Z

## Verified baseline
- Repository: `AbrarulHaque8541/daymark`; live `main`: `1d86a8a06cf6a1c02c37391d63400100fcfc6200` (tree `ed51292f2ba633c00fd68dc332aaf43393c55e08`).
- Root `AGENTS.md`, `docs/AGENT_STATUS.md`, its linked 09:20Z snapshot, and `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md` were read. The status index is stale relative to live GitHub; this dated snapshot records current evidence. `tests/AGENTS.md` and `docs/AGENTS.md` are absent (404).
- Gradle source identity remains `com.abrar.daymark`, versionName `1.6`, versionCode `13`. A conflicting legacy identifier appears in the run instruction; no identity change was made.
- No release, tag, version, signing, manifest permission, schema, or destructive data operation.

## Independent implementation — recovery-backup data integrity
- Branch: `fix/retain-nonredundant-recovery-backups-20261108-1535`; base SHA: `1d86a8a06cf6a1c02c37391d63400100fcfc6200`.
- Root cause: `app.js` treated any valid task-array backup as stale whenever the primary task array was valid, without comparing contents. It also deleted raw malformed and unknown-format backup payloads on healthy-primary load. A backup can contain older tasks absent from the current primary, so validity alone does not prove redundancy.
- Changed `app.js`: a backup is now cleared only when its exact bytes match the current primary payload (or every payload in a recovery bundle is exactly the current primary). Malformed, unknown-format, distinct valid arrays, and distinct bundle payloads remain available for manual recovery. Both load and later-save paths pass the exact primary payload to this policy.
- Changed `tests/app-storage.test.js`: replaced the unsafe “valid backup is stale” assumption with regressions for distinct valid backup retention across a later task save, byte-identical backup cleanup, malformed/unknown-format preservation, and a recovery bundle containing a distinct valid array.
- Focused V8 source-level policy smoke: **PASS — 6 scenarios** (distinct/identical array, malformed bytes, unknown JSON, distinct/redundant recovery bundle).
- Full `npm test` and `sh android-app/tools/check-v1-source.sh`: **NOT RUN locally** in the connector runtime. Exact-head GitHub Actions must validate the repository tree.
- Physical-device testing: **NOT APPLICABLE** to this web storage policy; actual browser storage quota/privacy-mode behavior remains **NOT TESTED** on device.

## Cross-agent integration audit
- PR #618 task import/export storage: current head `0c6a49a208201979a7ed1f27a80deae6d956f9ad`; mixed valid/malformed existing-task overwrite guard is present, no-write/no-event regression is present, Android CI/contracts/device APK **PASS**. PR remains open for independent review and main synchronization.
- PR #624 shared API response reader: current head `3b8dd378dcc8b36aad69d92af217744311893ac4`; Android CI, Ubuntu/Windows contracts, device-test APK **PASS**. Fatal UTF-8 decoding is now implemented. A separate text-only `response.text()` fallback still materializes the full body before checking its size; this remains an unresolved peak-memory bound and should be fixed before merge.
- PR #627 RSS/Atom: current head `45f7ba394c15fe1d8501da3a44406d6866b7fc57`; streaming is required, node/attribute budgets are enforced before AST allocation, exact-head Android/contracts/device APK **PASS**. Physical feed/WebView testing **NOT TESTED**.
- PR #626 extension network: current head `591099eb2ab1daeb5c895a802e810ac8ede7a821`; bounded HTTPS-only requests, redirect rejection, omitted credentials, fatal UTF-8 and optional host permissions are covered; Android/contracts/device APK **PASS**. Independent security review remains outstanding.
- PR #610 / #616 API 36 lifecycle: Android CI, cross-platform contracts and APK workflows **PASS**, but Focus emulator lifecycle remains **FAIL**. The editor Cancel action is still obscured by the IME; issue #613 remains open. PR #610 owns shared `MainActivity.java`; no competing edit was made.
- PR #604 storage health: Android CI/contracts/device APK **PASS**; it owns `docs/AGENT_STATUS.md`, which this branch does not modify.
- PR #607 world-clock storage: Android CI/contracts/device APK **PASS**; independent review remains pending.
- PR #601 browser address validation: current head `1c65a67e4077fa6a38a914a34462d963fa93ddb6`; exact-head Android/contracts/acceptance-artifact/device APK **PASS** on that head; one main commit behind, independent security approval and physical WebView acceptance still pending.
- PRs #620/#621/#623/#628 (Wikipedia/weather/currency/holiday storage) remain open; their branch synchronization and independent data-integrity review must be completed before merge. No files in those PRs are changed here.
- Open PRs were scanned for overlapping files. No active PR changes `app.js` or `tests/app-storage.test.js`; PR #627 changes the separate `tests/app-recovery-backup.test.js`.

## Ranked whole-project backlog
1. **P0 — #160 physical Android/WebView acceptance:** actual device/model/API/WebView provider/build SHA/APK SHA and scenario evidence required; APK build/CI is not physical-device acceptance.
2. **P1 — #613 / #610 / #616:** fix API 36 editor/IME reachability and complete ten consecutive lifecycle runs without weakening assertions.
3. **P1 — #624:** remove the unbounded text-only compatibility fallback from the shared network response reader; retain the strict streaming byte cap.
4. **P1 — this recovery-backup fix / #618:** validate exact-head CI, independent data-integrity review, and synchronize #618 with current main.
5. **P1 — #620/#621/#623/#628/#604/#607:** complete independent reviews and combined exact-head validation for storage failure handling.
6. **P1 — #601/#348:** finish browser URL/download redirect security and physical navigation acceptance.
7. **P1 — #476:** verify recurrence/reminder behavior, including real AlarmManager/Doze/OEM delivery (NOT TESTED).
8. **P2 — #325:** measured cross-platform compatibility/prototype work; no speculative rewrite.

## Delivery state
- Code/test changes are in this branch; commit and PR creation are the next delivery steps.
- Exact-head CI: **PENDING**.
- Merge: **NOT MERGED**.
- No releases/tags/version/signing/identity/permission/schema/data-destructive changes.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector (source/PR/issue/Actions inspection and Git blob/tree/commit/ref operations); V8 runtime (focused source-level policy smoke)
Timestamp (UTC): 2026-11-08T15:37:40.809Z
