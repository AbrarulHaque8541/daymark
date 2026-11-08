# Daymark whole-project engineering snapshot — 2026-11-08T15:10:00Z

## Baseline

- Repository: `AbrarulHaque8541/daymark`, default branch `main`.
- Main SHA at contribution branch creation: `1d86a8a06cf6a1c02c37391d63400100fcfc6200`.
- Root `AGENTS.md`, `docs/AGENT_STATUS.md`, indexed snapshot `docs/CURRENT_STATUS_20261108T092000Z.md`, and `docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md` read. The status index is stale versus live GitHub state and is owned by PR #604; this branch uses dated snapshots only.
- `tests/AGENTS.md` and `docs/AGENTS.md` are absent (404).
- Live Gradle identity: `com.abrar.daymark`, versionName `1.6`, versionCode `13`; no identity/version/signing/manifest/schema/release change.

## Canonical contribution — PR #628

PR: https://github.com/AbrarulHaque8541/daymark/pull/628  
Branch: `fix/holidays-storage-fail-closed-20261108-1457`  
Base: `1d86a8a06cf6a1c02c37391d63400100fcfc6200`  
Latest code commit: `eeeac60b21e8b58c46da55171d279a0904cf53e8`  
Latest test commit: `180113c8d8323416804a644ddc6e432eb8ae3fa2`  
Branch head before this snapshot: `180113c8d8323416804a644ddc6e432eb8ae3fa2`.

### Implementation

The public-holidays card previously accessed `window.localStorage` eagerly in its boot callback. A throwing getter could stop the card from attaching. Unguarded storage methods could crash initialization/handlers, treat unreadable or corrupt data as absent, misreport successful network refresh as failure when only persistence failed, or leave a partial two-key Clear while resetting visible state.

`holidays-ui.js` now:
- guards storage acquisition and removes eager boot evaluation;
- distinguishes absent, valid, corrupt, unreadable, and conflicted records;
- preserves corrupt/unreadable raw values;
- compares raw values before writes and Clear to protect changes made by another tab;
- keeps fresh API results visible on persistence failure with an honest storage warning;
- verifies both keys before Clear, removes only present keys, and attempts rollback on partial removal failure;
- reports removal failures separately from write failures;
- catches validator exceptions and retries successful writes without retaining a stale write warning.

`tests/holidays-ui.test.js` now covers blocked getter, refresh while storage is blocked, failed reads, refresh while storage is unreadable, quota/write failures, country-preference write failure, partial Clear rollback, corrupt cache preservation, cross-tab conflict, and guarded auto-boot. Its API fetch fixture exposes a stream reader so it remains compatible with PR #624's shared bounded reader.

### Validation

- Code Mode V8 syntax compilation: **PASS**.
- Focused source-equivalent V8 behavior smoke before the latest two added tests: **PASS — 6 scenarios**.
- First exact-head Node run: 495/496; the only failure was the pre-existing corrupt-cache exact status assertion, now corrected to require the preservation notice. No tests were removed/weakened.
- Exact-head run on intermediate head `fe81eb06c9ed3734130e3d28f03e48a5375b866e`: Ubuntu contracts **PASS**; Windows contracts, Android CI, and device-test APK were still running at last poll. Those results do not validate the later source/test commits.
- Latest source/test commits were pushed after that run. Exact-head Actions for the final head must be rechecked after this snapshot commit.
- Full local `npm test`, `sh android-app/tools/check-v1-source.sh`, and Gradle builds: **NOT RUN locally** (no complete repository checkout in this connector runtime).
- Physical-device testing: **NOT TESTED**.

## Duplicate PR coordination

PR #629 independently edits the same `holidays-ui.js` and `tests/holidays-ui.test.js` for the same root cause. I compared both branches and posted a coordination comment on #629. PR #628 is the canonical candidate because it adds compare-before-write and Clear conflict checks. Unique useful #629 work (streaming fetch fixture and country-preference write-failure test) has been ported; two more #629 regressions (blocked getter refresh and unreadable-store refresh) are now also covered here. PR #629 should not merge independently and should be closed as superseded after its owner confirms no further unique behavior needs retention.

## Cross-agent findings

- PR #618 latest source `0c6a49a208201979a7ed1f27a80deae6d956f9ad`: verified malformed/duplicate existing task records fail import before file read/merge/write; raw task bytes remain unchanged. Exact-head Android/contracts/device-test APK were green. Follow-up confirmation comment posted.
- PR #624 latest inspected head `f47913f58952c9d629e72a32c52d2b192a0e4024`: review comment [#6723032435](https://github.com/AbrarulHaque8541/daymark/pull/624#issuecomment-6723032435) flags the `response.text()` fallback that checks byte limits only after full materialization.
- PR #627 latest inspected head `4424a91286617099895011a5602ac0a1189c4785`: review comment [#6723121556](https://github.com/AbrarulHaque8541/daymark/pull/627#issuecomment-6723121556) asks for total XML-node/attribute budgets because byte/depth limits alone still allow a large AST.
- PR #626 exact inspected head `28e6e814f55181f6e7331b2293832f8619373cb2`: Android, contracts, device-test APK green.
- PR #604 owns `docs/AGENT_STATUS.md`; PR #610 owns shared `MainActivity.java`; no edits to either shared ownership area.

## Ranked whole-project backlog

1. **P0 — #160 physical Android/WebView acceptance:** **NOT TESTED**; requires actual device/model/API, WebView provider/version, exact build/APK SHA, scenario-level evidence.
2. **P1 — #624 shared bounded JSON reader:** eliminate post-allocation text fallback or use a genuinely incremental bounded path; timeout/cancel tests.
3. **P1 — #627 RSS/Atom parser:** add total node and attribute budgets with adversarial shallow-tree tests.
4. **P1 — #616 / #613 API 36 lifecycle:** fix task-editor IME visibility and Focus repeatability without weakening the ten-run gate.
5. **P1 — #610 / #348 browser reliability:** keep downloads fail-closed until redirect-safe transport is verified; renderer recovery, navigation, cookies/site data, keyboard/insets/accessibility.
6. **P1 — #604/#607/#617/#618/#619/#620/#621/#623:** independent review, main synchronization, exact-head integration checks; avoid shared-file collisions.
7. **P1 — #476 recurrence/reminders:** arithmetic/weekday/DST fixes are on main; physical AlarmManager/Doze/OEM delivery remains **NOT TESTED**.
8. **P2 — #325 architecture:** evidence-based compatibility/prototype work; no speculative rewrite.

## Safety

No releases/tags, version changes, identity/signing/manifest changes, destructive migrations, or task-data operations. PR #628 is open; this snapshot does not claim latest exact-head CI or merge.

Work by: ChatGPT  
Model: GPT-6  
Tooling: GitHub connector (live repository/source/PR/Actions and branch/file writes); Code Mode V8 syntax and focused behavior smoke  
Timestamp (UTC): 2026-11-08T15:10:00Z


## Live verification addendum — 2026-11-08T15:20:00Z

### PR #628 exact-head result

The code/test branch head `cb250dca69f51e84baba5981e71fac6276652209` completed all required workflows:
- Android CI run [42493455366](https://github.com/AbrarulHaque8541/daymark/actions/runs/42493455366): **PASS**; canonical source guard and Android host checks passed; `npm test` **499/499**; both Android debug variants and lint/build passed.
- Cross-platform contracts [42493455571](https://github.com/AbrarulHaque8541/daymark/actions/runs/42493455571): **PASS** on Ubuntu 24.04 and Windows 2025.
- Device-test APK [42493455468](https://github.com/AbrarulHaque8541/daymark/actions/runs/42493455468): **PASS**; source checks, both flavor builds, merged manifests and APK verification passed; release-publication job skipped.
- Re-ran the modified `holidays-ui.js` from the current branch in Code Mode V8: syntax **PASS**, focused behavior smoke **8/8**.
- PR #628 remains **OPEN / NOT MERGED** pending independent review. Its current head at the time of this addendum is the verified `cb250dca...`; the documentation-only update that contains this addendum will produce a new PR head and therefore needs fresh exact-head Actions.

### Duplicate PR consolidation

PR #629 was closed as superseded after comparing its final diff/commits. Its unique streaming-response test fixture, country-preference write failure, blocked-getter refresh, unreadable-store refresh, and removal-failure coverage were ported into #628. #628 retains additional compare-before-write and compare-before-Clear checks to protect cross-tab changes. No #629 code was merged separately.

### Cross-agent follow-up

- PR #618's latest source/test verifies malformed existing task records fail import before file read/merge/write; original raw task data remains unchanged. Exact-head Android/contracts/device-test APK passed; confirmation comment posted.
- PR #627 now enforces XML node limit 5,000, aggregate attributes 10,000, and 32 attributes per element, with shallow-node/attribute exhaustion tests. Exact-head Android, Ubuntu/Windows contracts and device-test APK all passed on `45f7ba394c15fe1d8501da3a44406d6866b7fc57`; earlier AST amplification finding resolved.
- PR #626 now routes both AI and Quick Translate through bounded streaming JSON, checks exact HTTPS origin permissions, rejects redirects, omits credentials, and documents caps. Exact-head Android, contracts and device-test APK passed on `fdfb00e2cbfd26b90e6ca17f1bbe6c1144d6f437`; earlier extension `response.json()` gap resolved.
- PR #624 still retains a text-only `response.text()` fallback that checks the cap after materialization. A follow-up review comment was posted against latest inspected head `cb05ad4396d023c0f4aeae3bff08fe4631900ae9`; the current exact-head Android/contracts/device APK runs were still in progress at last poll. Do not merge this resource-bound helper while the fallback remains.
- PR #610 / #616 still have an unresolved Focus emulator repeatability failure: API 29 rightward mode swipe and API 36 task-editor Cancel visibility have not met the required repeat gate. Keep Issue #613 open; do not weaken the ten-run assertions.
- Issue #476's code/host-test gaps are now superseded on main: long-gap arithmetic, Feb-29 anchor recovery, named New York spring/fall elapsed-lead tests, and reminder policy cases are present. Issue remains open because physical AlarmManager/notification, reboot/Doze/OEM, and physical timezone acceptance are **NOT TESTED**.

### Current whole-project priorities

1. **P0 #160:** physical Android/WebView acceptance with exact device/API/provider/build/APK evidence — **NOT TESTED**.
2. **P1 #624:** remove or genuinely bound the JSON reader text fallback; exact-head CI pending.
3. **P1 #610/#616/#613:** resolve API 29/36 Focus emulator repeat failures without weakening assertions.
4. **P1 #348:** browser reliability and secure downloads; keep fail-closed until redirect-safe transport is validated.
5. **P1 #628:** obtain independent review; final docs-integrated head requires fresh exact-head CI.
6. **P1 #604/#607/#617/#618/#619/#620/#621/#623:** independent review and integration checks, avoiding shared-file collisions.
7. **P1 #476:** physical reminder delivery remains open/not tested.
8. **P2 #325:** evidence-based cross-platform feasibility work only.

Work by: ChatGPT  
Model: GPT-6  
Tooling: GitHub connector (live PR/source/issue/Actions logs and status snapshot update); Code Mode V8 behavior smoke  
Timestamp (UTC): 2026-11-08T15:20:00Z


## Additional Clear rollback regression — 2026-11-08T15:21:00Z

Added a failure-injection case where the first key removal succeeds, the second removal fails, and restoring the first key also fails. The test asserts that the visible list remains available, the untouched original key is restored, the missing key is not falsely reported as restored, and status explicitly reports both the failed removal and partially changed storage. The existing successful-rollback test now also asserts that a removal failure is not mislabeled as a write failure.

Test commit: `cbfb89c8db59fd3c2a44e918c41a094d4c786e04`. This is a meaningful test-only change; no test was removed or weakened. New exact-head Actions must validate the final docs-integrated branch head before merge.

Work by: ChatGPT  
Model: GPT-6  
Tooling: GitHub connector (test update and source-level regression review)  
Timestamp (UTC): 2026-11-08T15:21:00Z
