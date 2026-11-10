## Current execution queue refresh — 2026-11-10T05:07:00Z (main 91f57d7)

Latest live snapshot: [CURRENT_STATUS_20261110T050700Z.md](docs/CURRENT_STATUS_20261110T050700Z.md).

- P0: finish #648 Focus notification replacement on API 36 ten-run gate; complete #677 real ModeSelector instrumentation on API 29/36; complete #683 cross-tab save/import/recovery/clear/undo matrix; owner-side governance #646; physical acceptance #160.
- P1: integrate #665 signing boundary after independent review; complete #671/#678 secure download transport; generate #692 lockfile on network-enabled Node 20/22 (#696); finish #690/#689 Focus/webhook locking and invalidation; extension recovery UI #687; Service Worker Online compatibility #685/#686; recurrence/tag/RFC 5545 parity #684/#656/#675.
- Exact baseline: main `91f57d79ab3d344d4d78df116ecf3ed4afe81087`; 12 open PRs / 23 issues; main Android/contracts push checks pass. Main branch protection remains disabled and rulesets are empty.
- #694 latest head `ef936eb1e3c905571547980a048dabd9032c85e2` has five workflows PASS. #675 head `4b33c04b7c131458c19649a45229e4461208d01b` has Android/contracts/device APK PASS. #648 and #677 latest Focus API29/36 gates remain in progress.
- No PR merged, no release/tag/version/signer/identity change, no destructive migration. Current source identity remains owner-approved `com.abrar.daymark`; the conflicting run-level package-identity request is unresolved.

---

## Current execution queue refresh — 2026-11-10T04:42:00Z (main 91f57d7)

Latest live snapshot: [CURRENT_STATUS_20261110T044200Z.md](docs/CURRENT_STATUS_20261110T044200Z.md).

Current baseline: main `91f57d79ab3d344d4d78df116ecf3ed4afe81087`; root AGENTS blob `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; 12 open PRs / 23 open issues. Main push Android CI #42753807924 and contracts #42753807949 pass. Main protection is disabled (`protected=false`), rulesets are empty; detailed protection endpoint returns 403.

### Immediate P0
1. #648/#613: finish latest Focus single-read/stale-runtime reconciliation checks and the API 36 ten-run gate; then carry the proven correction into #677's right-swipe failure.
2. #683: complete task save/import/recovery/clear/undo race tests using the shared Web Locks mutation contract.
3. #646: owner-side required checks and independent approvals; do not bypass protection.
4. #160: physical Android/WebView/OEM acceptance; CI artifacts are not device tests.

### P1
- #665/#84: PR workflow now has no signing-secret references; tag-only workflows check main ancestry. Exact-head Android/contracts/device checks pass; independent security/provenance review still required.
- #694/#693: AST guard now rejects computed/dynamic skip/todo flags and opaque options; five exact-head workflows pass; not yet on main.
- #675/#656/#684: shared task mutation files are byte-identical, but task-logic differs. Preserve #656 recurrence validation and #675 tag validation together.
- #671/#678: finish the actual pinned-address, redirect-validating, bounded-stream Android download transport.
- #692/#696: desktop download staging/publish policy is tested; lockfile remains absent. Local npm registry resolution timed out; generate on network-enabled Node 20/22 and verify npm ci across OSes before changing CI.
- #659/#687: complete accessible extension recovery UI.
- #685/#686: retain fail-closed Service Worker policy until a reviewed Online-compatible contract is implemented.
- #690/#689: finish Focus/webhook cross-domain locking and same-tab invalidation.

No release/tag/version/signer/identity change or destructive migration was made. Current source identity remains `com.abrar.daymark`; the conflicting run-level package-identity instruction remains unresolved and requires owner approval before any identity change.

---

## Latest repo-wide engineering handoff — 2026-11-10T02:18:05Z

Main `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`; main Android CI and cross-platform contracts PASS. 11 open PRs and 21 open issues.

**Delivered:** Focus merged-snapshot adoption/conflict preservation in #675 (code head `ae4edcce`; current docs head `f776bdc`; Node 831/831, Android/contracts/device artifact PASS). Desktop remote-download path containment and injectable cancellation handler in #692 (head `d6c3dbf`; Desktop 42/42 on Ubuntu/Windows/macOS, contracts PASS, Android CI Node 696/696, device APK verification PASS). Release publishing was skipped.

**Still open:** API 36 Focus failures #648/#677; cross-tab task/import/recovery/undo races #683; governance #646; physical acceptance #160; Android secure downloads #671; desktop local-process TOCTOU boundary #691/#692; signing/provenance #665/#84; extension recovery UI #659/#687; Service Worker compatibility #685/#686; recurrence parity #684/#476. No independent PR approval found. Main protection remains disabled; detailed protection read returns 403. #675 is 176 commits ahead and requires scope review before merge consideration.

**Safety:** no merge, release, tag, version, signing-key, application identity or destructive migration change; no physical-device test. Run-level identity directive conflicts with owner-approved AGENTS/Gradle identity; no migration was performed.

See [full dated evidence snapshot](CURRENT_STATUS_20261110T021805Z.md) for exact heads, workflow IDs, blockers and next priorities.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector via Code Mode; live source, PR/issue, branch and exact-head Actions review
Timestamp (UTC): 2026-11-10T02:18:05Z

---

## Latest repo-wide engineering handoff — 2026-11-10T02:08:52Z

**Main:** `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`; exact main push Android CI and Ubuntu/Windows contracts PASS. 11 open PRs, 21 open issues.

**Delivered in this run:** PR #675 now reconciles the merged Focus snapshot into in-memory state under the Focus Web Lock before advancing its persisted baseline; conflict paths preserve local state. Exact head `ae4edcce101bf326361452067c1de643c0d30d4b`: Node 831/831, Android CI PASS, contracts PASS, device artifact pending. PR #692 adds sanitized, collision-safe desktop download paths and fail-closed Electron download setup. Exact head `3ae15ef16e33bdcad141c323fe66c536549c2621`: Desktop CI 37/37 on Ubuntu/Windows/macOS and cross-platform contracts PASS; Android CI and device APK build still in progress.

**Still open:** API 36 Focus failures #648/#677; cross-tab task/import/recovery/undo races #683; branch governance #646; physical acceptance #160; Android download transport #671; signing/provenance #665/#84; extension recovery UI #659/#687; Service Worker Online compatibility #685/#686; recurrence parity #684/#476. No independent PR approval found. Main protection remains disabled and detailed protection access returns 403.

**Safety:** no merge, release, tag, version, signing-key, application identity, or destructive migration change. No physical-device testing. Application identity directive mismatch remains unresolved between repository source/AGENTS and the run-level instruction; no identity change or migration was performed.

See [full dated evidence snapshot](docs/CURRENT_STATUS_20261110T020852Z.md) for exact PR heads, workflow IDs, blockers and next priorities.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector via Code Mode; live repository, PR, issue and Actions evidence review
Timestamp (UTC): 2026-11-10T02:08:52Z

---

## Latest repo-wide engineering handoff — 2026-11-09T23:26:56Z

**Verified code head:** PR #675 `f0983019e0764b2fd85effece83e3c651bc501bf` (base main `1532838c78ab350b18f95e96a2c547ba384f0831`). Android CI, Ubuntu/Windows contracts, and device-test APK verification all PASS on that exact code head. The APK is an artifact only; no physical-device test or release occurred.

**Delivered:** task completion now appends its webhook event inside an awaited task-lock `afterCommit`; Clear Queue, storage-card queue clear and Clear All share task→delivery→queue lock order; rejected locks fail closed; same-tab memory-only webhook events are reset inside the lock scope; script order ensures the lock helper exists before webhook auto-boot. Regression coverage verifies ordering, fail-closed behavior, after-commit timing, in-flight task-lock waiting and memory-only reset. See [full evidence snapshot](docs/CURRENT_STATUS_20261109T232656Z.md).

**Still open:** #690 Focus writer/clear lock and same-tab invalidation; #683 import-vs-normal-save/clear/recovery races; #677 API 36 Task Editor IME failure; #646 main protection; #160 physical-device acceptance; #671 secure download transport; #665 signing/provenance; #687 extension recovery UI; #684/#476 recurrence parity. Do not close #689 until the Focus dependency is integrated.

**Repository baseline:** 11 open PRs, 20 open issues; main `1532838`; no independent approvals; main protection disabled and no rulesets. No merge, release, tag, version/signing/application identity change, or destructive migration was performed.

---

## Latest verified execution — 2026-11-09T22:17:56.838Z

Main remains `1532838c78ab350b18f95e96a2c547ba384f0831`; exact-main Android CI and Ubuntu/Windows contracts PASS. Full inventory, exact PR heads, run links and device limitations: [CURRENT_STATUS_20261109T221756Z.md](docs/CURRENT_STATUS_20261109T221756Z.md).

New delivery on #688: `8e1f562ee24c2f7094d8006e980cbc4e3d3991c8` tracks the exact `node:test` imported identifier, rejecting local `test`/`it` impostors. Exact-source V8 12/12 PASS; Node 684/684 PASS; Android CI, Ubuntu/Windows contracts and both-flavor device-test APK PASS. PR remains unmerged pending independent approval.

Current P0 queue:
1. #683 — implement origin-wide Web Locks for task writes/import/recovery/recurrence/clear/undo; reread and apply mutation intent inside lock; deterministic two-tab tests. Webhook queue locks do not protect task storage.
2. #613/#677/#648 — integrate tested Focus/IME fix sequentially into reminder branch; #677 API36 still fails Cancel with IME visible.
3. #646/#160 — owner-approved branch protection and physical Android/WebView acceptance.

Next P1: #675 recovery review; #687 malformed-extension recovery UI; #685/#686 Service Worker Online compatibility; #671/#678 complete secure download transport; #684/#476 recurrence parity; #665/#84 signing/provenance; #656/#676/#682 independent data/security review.

No merge, release, tag, version, signing-key, package-identity, manifest-permission or destructive data change this cycle. Physical-device testing NOT TESTED.

Work by: ChatGPT (OpenAI) · Model: GPT-6 · Tooling: GitHub connector via Code Mode · Timestamp (UTC): 2026-11-09T22:17:56.838Z

---

## Latest verified execution — 2026-11-09T22:01:18Z

Main remains 1532838c78ab350b18f95e96a2c547ba384f0831; Android CI and Ubuntu/Windows contracts PASS. Full evidence: [CURRENT_STATUS_20261109T220118Z.md](docs/CURRENT_STATUS_20261109T220118Z.md).

Delivered on existing owner branches:
- #675: fixed the undefined Focus backup helper and stale hasPayload/hasBackup field mismatch; added four recovery regressions. Exact head d9565581d20fab7d84668ac1b7d9c61f29c0fba6 passes Android CI (768/768 Node tests), contracts and device APK.
- #688: hardened Node test registration scanning against regex/control-flow and options-object false positives; exact head 2a0e4ea27c5519c7a000ae755bfdfc468b2be3da passes Android CI (684/684), contracts and device APK; ready for review.

Current P0 queue:
1. #683 — implement a real origin-wide Web Locks mutation contract across app writes/import/recovery/clear/undo; do not merge the localStorage lease branch.
2. #613/#677/#648 — integrate the tested Task Editor IME fix sequentially; #677 API36 currently fails Cancel while IME is visible.
3. #646/#160 — owner/admin branch-protection configuration and physical Android/WebView acceptance.

Next P1 queue: #675/#636/#639 recovery/webhook review; #687 malformed extension recovery UI with #659 store APIs and #648 MainActivity ownership; #685/#686 Service Worker compatibility; #671/#678 secure download transport; #684/#476 recurrence; #665/#84 signing/provenance; #656/#676/#682 independent reviews.

Governance: all 11 open PRs target main; no independent APPROVED review and no requested reviewers found. Main reports protected=false, no rulesets, and detailed protection endpoint returns 403. No merge, release, tag, version, signer, package identity or destructive data action was taken.

Work by: ChatGPT (OpenAI) · Model: GPT-6 · Tooling: GitHub connector via Code Mode · Timestamp (UTC): 2026-11-09T22:01:18Z

---
## Latest documentation-guard correction — 2026-11-09T21:18:11.184Z

The docs-only PR #675 head `b71b8c0461a5694b2173621c333a5be8893e243b` triggered Android CI and device-test asset workflows; both failed at the package-cleanliness guard because the newly added status snapshot repeated a retired application-identity literal while describing Issue #679. This was a documentation-only failure, not a production-source/test failure.

The literal has been removed in commit `fbec70fac0eb707a6421a594ec1eb924ed1ee7a7`. That docs-only commit did not trigger a new Actions run by itself (path filtering). A fresh exact-head run is pending a workflow-relevant plan update; do not treat the older failure as current-main or production-code failure, and do not claim the corrected docs head is green until fresh checks complete.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode  
Timestamp (UTC): 2026-11-09T21:18:11.184Z

---

## Current execution queue — 2026-11-09T21:12:32.998Z (main 1532838c; #683 branch safety review; #688 test-source guard in CI)

Full live inventory and exact-head evidence: [CURRENT_STATUS_20261109T211232Z.md](docs/CURRENT_STATUS_20261109T211232Z.md).

1. **P0 #683:** reject the non-atomic localStorage lease branch; implement origin-wide Web Locks across normal writes/import/recovery/clear/undo, with fail-closed fallback and true two-context tests.
2. **P0 #613/#677/#648:** integrate the tested #648 Focus/IME implementation sequentially into #677 and rerun API 29/36; exact #677 API36 currently fails Cancel with IME visible.
3. **P0 #646/#160:** owner-side branch protection and physical Android/WebView acceptance.
4. **P1 #675/#640/#636/#639:** independent recovery/webhook data-integrity review; do not conflate queue locking with task locking.
5. **P1 #687/#659:** accessible malformed-extension recovery/export/removal UI; store-layer parent-symlink protections are already present on #659.
6. **P1 #685/#686:** decide Service Worker Online compatibility while retaining Offline fail-closed behavior.
7. **P1 #671/#678:** complete DNS-pinned/TLS-verified bounded browser download transport; keep downloads fail-closed.
8. **P1 #684/#476:** align Android/web recurrence semantics and validate alarms, Doze, reboot, timezone and OEM delivery.
9. **P1 #665/#84:** independent signing/provenance review and direct/transitive Actions runtime modernization.
10. **P1 #656/#676/#682:** independent import/export, extension and browser-data review; integrate imports with the shared task mutation contract.
11. **P1 #688:** finish exact-head CI and independent review for the Node test-source integrity guard.
12. **P2 #325/#348:** measured cross-platform, browser UX, accessibility and performance work.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode  
Timestamp (UTC): 2026-11-09T21:12:32.998Z

---

## Current execution queue — 2026-11-09T20:35:56.690Z (main 1532838c; exact-head follow-up for #675/#686/#659)

Full inventory and evidence: [CURRENT_STATUS_20261109T203556Z.md](docs/CURRENT_STATUS_20261109T203556Z.md).

1. **P0 #683:** cross-tab task mutation contract across normal saves, import, recovery, clear and undo; coordinate #675/#656.
2. **P0 #613/#677/#648:** integrate Focus/IME correction and rerun strict API 29/36 reminder lifecycle.
3. **P0 #646/#160:** owner-side branch protection/independent review and physical Android/WebView acceptance.
4. **P1 #675/#640/#636/#639:** independent recovery/webhook review and manual exact-byte recovery acceptance.
5. **P1 #687/#659:** accessible malformed-extension recovery/export/removal UI, coordinated with MainActivity ownership.
6. **P1 #685/#686:** finish multi-origin/Activity/renderer Service Worker acceptance and resolve global-block compatibility.
7. **P1 #671/#678:** complete secure app-owned download transport; keep actual downloads fail-closed.
8. **P1 #684/#476:** align Android/web recurrence semantics and validate alarms, Doze, reboot, timezone and OEM delivery.
9. **P1 #665/#84:** independent signing/provenance and Actions runtime review.
10. **P1 #656/#676/#682:** independent import/export, extension and browser-data review.
11. **P2 #325/#348:** measured cross-platform, browser UX, accessibility and performance work.

No release/tag/version/signer/application identity change, destructive migration, force push or protection bypass is authorized.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode  
Timestamp (UTC): 2026-11-09T20:35:56.690Z

---

## Current execution queue — 2026-11-09T20:35:23.409Z (main 1532838c; #686 multi-origin runtime coverage; #659 host-smoke compile fix)

Full exact-head inventory and delivery ledger: [CURRENT_STATUS_20261109T203523Z.md](docs/CURRENT_STATUS_20261109T203523Z.md).

1. **P0 #683:** shared cross-tab task mutation contract across app writes, imports, recovery, clear and undo; coordinate #675/#656.
2. **P0 #613/#677/#648:** integrate Focus/IME correction and rerun strict API 29/36 reminder lifecycle acceptance.
3. **P0 #646/#160:** owner-side required checks/independent review and physical Android/WebView acceptance.
4. **P1 #675/#640/#636/#639:** independent recovery/webhook security review and exact-byte/manual recovery acceptance.
5. **P1 #687/#659:** accessible malformed-extension recovery/export/removal UI, coordinated with MainActivity owner.
6. **P1 #685/#686:** finish multi-origin/Activity/renderer Service Worker acceptance; owner decision on global block while Online.
7. **P1 #671/#678:** complete secure app-owned browser download transport; keep downloads fail-closed until then.
8. **P1 #684/#476:** align Android/web recurrence semantics and validate reminders/Doze/reboot/timezone/OEM behavior.
9. **P1 #665/#84:** independent signing/provenance and Actions runtime review.
10. **P1 #656/#676/#682:** independent import/export, extension and browser-data reviews.
11. **P2 #325/#348:** measured cross-platform, browser UX, accessibility and performance work.

No release, tag, version, signer, application identity, destructive migration, force push or protection bypass is authorized.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode  
Timestamp (UTC): 2026-11-09T20:35:23.409Z

---

## Current execution queue — 2026-11-09T20:26:52.786Z (main 1532838c; #659 malformed-pack recovery store API CI green; #686 Service Worker API26/API36 runtime green)

Full exact-head evidence, all ten open PR heads, issue inventory and delivery ledger are in [CURRENT_STATUS_20261109T202652Z.md](docs/CURRENT_STATUS_20261109T202652Z.md).

1. **P0 — #683 task data integrity:** implement one origin-wide atomic mutation contract across normal task writes, import, recovery restore, clear/undo. The current `persistTasks()` still writes a stale snapshot; import compare-before-write is not atomic.
2. **P0 — #613/#677/#648 Android lifecycle:** integrate #648's tested dialog-insets correction into the reminder branch without overwriting reminder work; rerun strict API 29/36 acceptance. Physical-device acceptance remains NOT TESTED.
3. **P1 — #675/#640 recovery/storage:** obtain independent data-integrity/security review and manual recovery-export acceptance; preserve unknown bytes and never overwrite the only recovery copy.
4. **P1 — #687/#659 extension recovery UI:** integrate the new malformed-pack metadata, exact-byte export and fingerprint-checked removal APIs into an accessible disabled manager row; require a separate user confirmation. Coordinate the shared MainActivity edit with #648.
5. **P1 — #685/#686 Service Worker:** API 26/36 emulator runtime now passes for both app flavors, but the global block while Online remains a compatibility trade-off. Obtain owner acceptance or implement a reviewed origin-scoped grant model; add multi-origin/tab, Activity/renderer recreation and physical request tracing.
6. **P1 — #671/#678 downloads:** finish Daymark-owned redirect-by-redirect HTTPS transport, DNS/address pinning, TLS hostname verification, same-origin credentials, bounded streaming, cancellation and temp-file cleanup. Keep actual downloads fail-closed until integrated.
7. **P1 — #684/#476 recurrence/reminders:** settle Android/web completion and catch-up semantics before modifying shared task flows; validate AlarmManager, reboot, Doze, timezone and OEM delivery.
8. **P1 — #665/#84 signing/provenance:** independently review PR-build secret isolation and provenance; preserve trusted SLSA identity while resolving the transitive Node20 dependency.
9. **P1 — #656/#676/#682/#659:** complete independent RFC 5545, extension trust/SPA scope, browser-data and recovery UI reviews; preserve cross-tab import guarantees.
10. **P0 — #646/#160 governance/device:** owner/admin branch protection and independent review policy; physical Android/WebView/OEM acceptance with device/model, API, WebView version, tested SHA and APK SHA.
11. **P2 — #325/#348:** measured cross-platform architecture, browser UX, accessibility and performance work.

No PR was merged into main. No release/tag/version/signing-key/applicationId change, destructive migration, force push or protection bypass occurred.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector via Code Mode; live repository/PR/issue/Actions inventory and exact-head source/test inspection
Timestamp (UTC): 2026-11-09T20:26:52.786Z
---

## Current whole-project execution queue — 2026-11-09T15:24:39Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

The detailed exact-head inventory, CI evidence, issue list and safety limitations are in [the 15:24 status snapshot](docs/CURRENT_STATUS_20261109T152439Z.md). The #675 head recorded there is the fully green plan-refresh head before this new snapshot/index/plan documentation commits; those docs commits advance the branch and trigger another exact-head CI run.

### Live baseline
- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`; main Android CI and Ubuntu/Windows contracts PASS.
- Seven open PRs, twelve open issues; all seven PR bases equal current main. No independent approvals/requested reviewers.
- Main protection disabled, rulesets empty; detailed protection endpoint HTTP 403. No settings changed.
- No release/tag/version/signing/applicationId change; no destructive migration. Physical device acceptance NOT TESTED.

### Verified delivery gates
- **#648** `4e1199bcf4336144f04fe5c204a7aa08f2d173c9`: all Android/contracts/Focus UI/Live Update/device artifact checks PASS; API29 367 assertions PASS; API36 **10/10 runs PASS**, 370 assertions each. Physical acceptance pending; downloads remain fail-closed.
- **#656** `abc85397ebf13375238e6004acd1bd6b6e38b8d8`: Node 687/687, Android, Ubuntu/Windows and device APK PASS; independent RFC5545 review pending.
- **#659** `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd`: Android/contracts/device PASS; Node 541/541, ExtensionStore smoke 12, 16 guard mutations; independent review pending.
- **#665** `d3cf902b36e47d1eca512df095fc883bbcd4ebbd`: Android/contracts/device PASS; draft; PR/debug signing secrets isolated, tag-only signed build. SLSA v1.4.0 upstream Node20 dependency remains.
- **#675** `8fe4a143cfcae3ae546cc2bd337dcc9042296379`: Android CI #42643754741, contracts #42643754413, device APK #42643754424 **PASS**; code/test head `9bda5bf` Node 728/728 and all build/artifact checks PASS; latest docs/plan head also fully green. Draft; independent security/data-integrity review pending.
- **#676** `59830d290f023c7b0b2cf2828a10de8bedaf195a`: Android/contracts/device PASS; ExtensionInjectorSmoke 41 assertions; independent review and physical browser acceptance pending.
- **#677** `925930b88649c25017c2cd8f00af72dbf090e6fa`: Android CI/host reminder guards/Node/Gradle PASS; contracts PASS; Focus Live Update PASS; device acceptance and device APK PASS (release skipped). API29 Focus PASS; API36 Focus FAIL at known horizontal-swipe assertion because this main-based branch lacks #648's screen-coordinate correction. Do not weaken/retry away; synchronize after #648 is independently reviewed/merged and rerun.

### Prioritized backlog
1. **P0 — Independent review/integration:** #648 Focus coordinate fix; #675 webhook/storage/recovery; #665 signing-secret boundary; #656 import semantics; #659/#676 extension security; #677 reminder time-change re-arming. No merge without independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** real devices with model/API/WebView provider/version, APK SHA and evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical acceptance.
3. **P0 — Browser downloads (#671/#648):** keep downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport validates downgrade/private addresses/host, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp cleanup and cancellation/error behavior.
4. **P1 — Reminder delivery (#476/#677):** synchronize #677 with #648, rerun API36, then test actual clock/timezone transitions and reboot/Doze/OEM behavior on physical devices. Browser checks remain nominal 30s and subject to hidden-tab throttling.
5. **P0 — Governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations, no force-push/deletion.
6. **P1 — Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or separately review provenance migration.
7. **P2 — Cross-platform/browser (#325/#348):** measured compatibility and performance.

## Historical whole-project execution queue — 2026-11-09T15:20:06Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

The detailed seven-PR inventory, exact heads/checks, issue list, work log and limitations are in [the 15:20 status snapshot](docs/CURRENT_STATUS_20261109T152006Z.md). The #675 head captured there is the plan-refresh head before this snapshot/index/plan documentation commits; those docs commits advance the branch and trigger another exact-head CI run.

### Live baseline
- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`; main Android CI and Ubuntu/Windows contracts PASS.
- Seven open PRs, twelve open issues; all seven PR bases equal current main. No independent approvals/requested reviewers.
- Main protection disabled, rulesets empty; detailed protection endpoint HTTP 403. No settings changed.
- No release/tag/version/signing/applicationId change; no destructive migration. Physical device acceptance NOT TESTED.

### Verified delivery gates
- **#648** `4e1199bcf4336144f04fe5c204a7aa08f2d173c9`: all Android/contracts/Focus UI/Live Update/device artifact checks PASS; API29 367 assertions PASS; API36 **10/10 runs PASS**, 370 assertions each. Physical acceptance pending; downloads remain fail-closed.
- **#656** `abc85397ebf13375238e6004acd1bd6b6e38b8d8`: Node 687/687, Android, Ubuntu/Windows and device APK PASS; independent RFC5545 review pending.
- **#659** `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd`: Android/contracts/device PASS; Node 541/541, ExtensionStore smoke 12, 16 guard mutations; independent review pending.
- **#665** `d3cf902b36e47d1eca512df095fc883bbcd4ebbd`: Android/contracts/device PASS; draft; PR/debug signing secrets isolated, tag-only signed build. SLSA v1.4.0 upstream Node20 dependency remains.
- **#675** `804a97021e514e9ad38ba97dda66ebfdd41fd841`: previous code/test head Node 728/728 and all workflows PASS; docs-only head f55ffb Android/contracts/device PASS; current plan-refresh head contracts PASS, Android CI IN PROGRESS, device APK PENDING.
- **#676** `59830d290f023c7b0b2cf2828a10de8bedaf195a`: Android/contracts/device PASS; ExtensionInjectorSmoke 41 assertions; independent review and physical browser acceptance pending.
- **#677** `925930b88649c25017c2cd8f00af72dbf090e6fa`: Android CI/host reminder guards/Node/Gradle PASS; contracts PASS; Focus Live Update PASS; device acceptance artifact and device APK PASS (release skipped). API29 Focus PASS; API36 Focus FAIL at the known horizontal-swipe instrumentation assertion because #677 is based on main and lacks #648's screen-coordinate correction. Do not weaken/retry away; synchronize after #648 is independently reviewed/merged and rerun.

### Prioritized backlog
1. **P0 — Independent review/integration:** #648 Focus coordinate fix; #675 webhook/storage/recovery; #665 signing-secret boundary; #656 import semantics; #659/#676 extension security; #677 reminder time-change re-arming. No merge without independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** real devices with model/API/WebView provider/version, APK SHA and evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical acceptance.
3. **P0 — Browser downloads (#671/#648):** keep downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport validates downgrade/private addresses/host, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp cleanup and cancellation/error behavior.
4. **P1 — Reminder delivery (#476/#677):** synchronize #677 with #648, rerun API36, then test actual clock/timezone transitions and reboot/Doze/OEM behavior on physical devices. Browser checks remain nominal 30s and subject to hidden-tab throttling.
5. **P0 — Governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations, no force-push/deletion.
6. **P1 — Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or separately review provenance migration.
7. **P2 — Cross-platform/browser (#325/#348):** measured compatibility and performance.

## Historical whole-project execution queue — 2026-11-09T15:17:00Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

The detailed seven-PR inventory, exact heads/checks, 12 open issues, delivery log and limitations are in [the 15:17 status snapshot](docs/CURRENT_STATUS_20261109T151700Z.md). The #675 head recorded there is the green code/test head before the snapshot/index/plan documentation commits; the docs-only head is independently re-running CI.

### Live baseline
- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`; main Android CI and Ubuntu/Windows contracts PASS.
- Seven open PRs, twelve open issues; all seven PR bases equal current main. No independent approval and no requested reviewers.
- Main protection is disabled, rulesets empty; detailed protection endpoint returns HTTP 403. No settings changed.
- No release/tag/version/signing/applicationId change; no destructive migration. Physical device acceptance remains NOT TESTED.

### Verified delivery gates
- **#648** `4e1199bcf4336144f04fe5c204a7aa08f2d173c9`: Android CI, contracts, Focus UI/Sound, Live Update, device acceptance artifact and device-test APK PASS. API29 367 assertions PASS; API36 **10/10 consecutive runs PASS**, 370 assertions each. Root-to-screen coordinate conversion and actual-control viewport positioning fixed the prior injection failures. Physical device acceptance pending; downloads remain fail-closed.
- **#656** `abc85397ebf13375238e6004acd1bd6b6e38b8d8`: Node 687/687, Android, Ubuntu/Windows and device APK PASS; independent RFC5545/data-integrity review pending.
- **#659** `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd`: Android/contracts/device checks PASS; Node 541/541, ExtensionStore smoke 12 assertions, 16 guard mutations; independent extension-security review pending.
- **#665** `d3cf902b36e47d1eca512df095fc883bbcd4ebbd`: Android/contracts/device APK PASS; draft. PR/debug builds receive no signing secrets; tag-only signed build and temp-keystore cleanup. Upstream SLSA v1.4.0 still embeds a Node20 artifact action; provenance review required.
- **#675** `f55ffb2e4e96ad51245ad833a6b76030792224c0`: Android CI #42640818091, Ubuntu/Windows #42640818105 and device-test APK #42640818066 PASS; code/test head `9bda5bf` Node 728/728 and Gradle debug build PASS; release publication skipped. Draft; independent security/data-integrity review pending.
- **#676** `59830d290f023c7b0b2cf2828a10de8bedaf195a`: Android/contracts/device acceptance/device APK PASS; ExtensionInjectorSmoke 41 assertions. Page-bound CSS/JS injection and JS-only GM_addStyle bootstrap; physical browser acceptance pending.
- **#677** `925930b88649c25017c2cd8f00af72dbf090e6fa`: draft, 14 commits/9 files/0 behind. Adds TIME_SET/TIMEZONE_CHANGED receiver actions routed through the existing encrypted-task read and `rescheduleAll()`, pure policy smoke tests, manifest/source guards and mutation tests. Current exact-head Android CI, contracts, Focus emulator and device-artifact workflows are IN PROGRESS/PENDING. Previous head `b596f0` passed Android CI/contracts/device-acceptance artifact; Focus emulator/device APK had not completed. Browser docs now disclose nominal 30s in-page checks and background timer throttling.

### Prioritized whole-project backlog
1. **P0 — Independent review/integration:** #675 webhook endpoint isolation/storage/recovery; #665 signing-secret boundary; #656 import semantics; #659/#676 extension security; #648 Focus/download boundary; #677 reminder system-time re-arming. No merge without fresh independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** current-main APK on real devices with model/API/WebView provider/version, APK SHA and scenario evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical-device acceptance.
3. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
4. **P1 — Reminder delivery (#476/#677):** finish exact-head CI; test actual clock/timezone changes and reboot/Doze/OEM behavior on physical devices; retain browser background-throttling limitations.
5. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations and force-push/deletion restrictions.
6. **P1 — Finish Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or perform a separately reviewed provenance migration.
7. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Historical whole-project execution queue — 2026-11-09T15:02:16Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

The detailed exact-head inventory, CI evidence, issue list, work log and safety limitations are in [the 15:02 status snapshot](docs/CURRENT_STATUS_20261109T150216Z.md). The #675 head recorded there is the green code/test head before this snapshot/index/plan documentation commits; those docs commits advance the branch and trigger another exact-head CI run.

### Live baseline
- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`; main Android CI and Ubuntu/Windows contracts PASS.
- Six open PRs, twelve open issues; all six PR bases equal current main. No independent approval and no requested reviewers.
- Main protection is disabled, rulesets empty; detailed protection endpoint returns HTTP 403. No settings changed.
- No release/tag/version/signing/applicationId change; no destructive migration. Physical device acceptance remains NOT TESTED.

### Verified delivery gates
- **#648** `4e1199bcf4336144f04fe5c204a7aa08f2d173c9`: Android CI, contracts, Focus UI/Sound, Live Update, device acceptance artifact and device-test APK PASS. API29 367 assertions PASS; API36 **10/10 consecutive runs PASS**, 370 assertions each. Root-view-to-screen conversion and real-control viewport positioning fixed the prior wrong-coordinate injection. Physical device acceptance still pending; downloads remain fail-closed.
- **#656** `abc85397ebf13375238e6004acd1bd6b6e38b8d8`: Node 687/687, Android, Ubuntu/Windows and device APK PASS; independent RFC5545/data-integrity review pending.
- **#659** `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd`: Android/contracts/device checks PASS; Node 541/541, ExtensionStore smoke 12 assertions, 16 guard mutations; independent extension-security review pending.
- **#665** `d3cf902b36e47d1eca512df095fc883bbcd4ebbd`: Android/contracts/device APK PASS; draft. PR/debug builds receive no signing secrets; tag-only signed build and temp-keystore cleanup. Upstream SLSA v1.4.0 still embeds a Node20 artifact action; provenance review required.
- **#675** `9bda5bfcc2278fdc60522e3492b383340b4b57f8`: Node 728/728, Android CI and Gradle debug build PASS, Ubuntu/Windows contracts PASS, device-test APK PASS (release publication skipped). Current webhook endpoint fingerprints, cross-endpoint queue isolation, legacy confirmation, WebCrypto fail-closed tests, storage clear preflight and independent recovery backup reads all pass. Draft; independent security/data-integrity review pending.
- **#676** `59830d290f023c7b0b2cf2828a10de8bedaf195a`: Android/contracts/device acceptance/device APK PASS; ExtensionInjectorSmoke 41 assertions. Page-bound CSS/JS injection and JS-only GM_addStyle bootstrap; physical browser acceptance pending.

### Prioritized whole-project backlog
1. **P0 — Independent review/integration:** #675 webhook endpoint isolation, storage-clear preflight and recovery; #665 signing-secret boundary; #656 import/data semantics; #659/#676 extension security. No merge without fresh independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** current-main APK on real devices with model/API/WebView provider/version, APK SHA and scenario evidence for browser, extensions, SAF, updates, reminders and downloads. Emulator/CI artifacts are not physical-device acceptance.
3. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
4. **P1 — Reminder parity (#476):** recurrence anchors, long-gap catch-up, AlarmManager/Doze/reboot/timezone/OEM behavior.
5. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations and force-push/deletion restrictions.
6. **P1 — Finish Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or perform a separately reviewed provenance migration.
7. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Historical whole-project execution queue — 2026-11-09T14:55:08Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

The detailed exact-head inventory, CI evidence, issue list, work log and safety limitations are in [the 14:55 status snapshot](docs/CURRENT_STATUS_20261109T145508Z.md). Preserve older planning sections below as historical evidence.

### Live baseline
- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`; main Android CI and Ubuntu/Windows contracts PASS.
- Six open PRs, twelve open issues; all six PR bases equal current main. No independent approval and no requested reviewers.
- Main protection is disabled, rulesets empty; the integration cannot read the detailed protection endpoint (HTTP 403). No settings changed.
- No release/tag/version/signing/applicationId change; no destructive migration. Physical device acceptance remains NOT TESTED.

### Current delivery gates
- **#648** `4e1199bcf4336144f04fe5c204a7aa08f2d173c9`: Android CI PASS; Focus UI/Sound and Live Update PASS; API29/API36 Focus lifecycle and device workflows still in progress/pending. New instrumentation translates root-view visible bounds to screen coordinates before UiAutomation injection, positions real controls inside the ScrollView, and guards the ordering. Previous API36 failure was at run 1/10; latest ten-run result not yet verified. Downloads remain fail-closed only on this branch.
- **#656** `abc85397ebf13375238e6004acd1bd6b6e38b8d8`: Node 687/687, Android, Ubuntu/Windows and device APK PASS; independent RFC5545/data-integrity review pending.
- **#659** `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd`: Android/contracts/device checks PASS; Node 541/541, ExtensionStore smoke 12 assertions, 16 guard mutations; independent extension-security review pending.
- **#665** `d3cf902b36e47d1eca512df095fc883bbcd4ebbd`: Android/contracts/device APK PASS; draft. PR/debug builds receive no signing secrets; tag-only signed build and temp-keystore cleanup. Upstream SLSA v1.4.0 still embeds a Node20 artifact action; provenance review required.
- **#675** `a8d57946cee0645db99304a52b34071e022c3b31`: Android and contracts in progress; device APK pending. Previous head Node 726/726 and all workflows PASS. Current head adds WebCrypto-unavailable tests proving no queue write/network send when SHA-256 is unavailable. Endpoint-partitioned queue stores only SHA-256 destination fingerprints, verifies URL/event match before fetch, preserves other-endpoint events, and requires explicit confirmation for legacy unassigned events. Storage clear preflight and independent task/Focus backup reads remain in the branch.
- **#676** `59830d290f023c7b0b2cf2828a10de8bedaf195a`: Android/contracts/device acceptance/device APK PASS; ExtensionInjectorSmoke 41 assertions. Page-bound CSS/JS injection and JS-only GM_addStyle bootstrap; physical browser acceptance pending.

### Prioritized whole-project backlog
1. **P0 — Focus API36 (#648/#613):** finish the latest screen-coordinate/viewport correction and inspect the exact ten-run logs. If it passes, retain and verify real parent-scroll and post-drag tap assertions; if it fails, use the new screen-space diagnostics. No retry or weakened assertions.
2. **P0 — Webhook/storage/recovery (#675; #636/#639/#640/#603):** finish current exact-head tests, obtain independent security/data-integrity review, verify endpoint partitioning and task-persist-before-notify. Keep unreadable/unknown distinct from absent and preserve opaque backup bytes.
3. **P0 — Signing boundary (#665/#84):** independent review of PR/debug secret isolation and trusted SLSA transitive action runtime before merge.
4. **P1 — Extension injection/import (#676/#659):** independent review of page matching, stale navigation, GM_addStyle, default-disabled imports and existing-pack preservation; then physical browser/device acceptance.
5. **P1 — iCalendar/import-export (#656):** independent RFC5545 review for categories, repeated properties, recurrence, timezone, seconds precision and completion metadata.
6. **P0 — Browser downloads (#671/#648):** keep current-main downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport enforces downgrade/private-address/host checks, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp-file cleanup and cancellation/error handling. Do not use preflight-then-DownloadManager.
7. **P0 — Physical Android acceptance (#160):** test current-main APK on real devices with model/API/WebView provider/version and APK SHA. CI/emulator artifacts are not device acceptance.
8. **P1 — Reminder parity (#476):** recurrence anchors, long-gap catch-up, AlarmManager/Doze/reboot/timezone/OEM behavior.
9. **P0 — Main governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations and force-push/deletion restrictions.
10. **P2 — Cross-platform/browser architecture (#325/#348):** measured compatibility and performance work.

## Historical whole-project execution queue — 2026-11-09T14:47:38.879Z (main 59e6961c0645a423eb736d16d129eb0e9cc871f7)

This is a new dated status layer. Older planning sections below are historical; do not rewrite their evidence.

### Live baseline and governance
- Default branch: `main`; current SHA: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Main Android CI #42619910395: **PASS**. Main Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **6 open PRs / 12 open issues**.
- Main branch API: `protected=false`; required status-check enforcement `off`; rulesets API returns `[]`. Detailed branch-protection endpoint returns HTTP 403 to this integration. No repository settings changed.
- No open PR has an independent approval record. All six remain unmerged.
- Source/AGENTS identity remains the current approved package; the run-level safety directive names a different legacy package identifier. No identity, namespace, manifest or signer change was made; reconcile only with explicit owner approval.

### Exact open PR inventory and current checks
| PR | Exact head (base main) | Latest exact-head evidence | Gate / next action |
|---|---|---|---|
| #648 Focus + fail-closed downloads | `dd73640ebdd5b9b12ee668812f9a7c6600de57b7` | Android CI, contracts, Focus UI/Sound, Live Update and device artifacts **PASS**; API 29 lifecycle **PASS**; API 36 lifecycle #42637328004 **FAIL** at run 1/10 after Countdown tap following vertical drag. | Fix coordinate-space mismatch: `getGlobalVisibleRect()` returns root-view coordinates, but `UiAutomation.injectInputEvent()` needs screen coordinates. Keep all gesture assertions and API 36 ten-run gate. No physical device tested. |
| #656 iCalendar/import-export | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` | Android CI #42633721799, contracts #42633722495, device APK #42633721795 **PASS**. | Independent RFC 5545/data-integrity review pending; no merge yet. |
| #659 extension trust | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` | Android CI #42622038075, contracts #42622038055, device acceptance #42622038156 and device APK #42622038116 **PASS**. | Independent extension-security review pending; no merge yet. |
| #665 signing/Node24 | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` | Android CI #42622047147, contracts #42622047145, device APK #42622047583 **PASS**; release publication skipped. | Independent release-security/provenance review pending; review the trusted SLSA generator's transitive Node 20 action. |
| #675 webhook/storage/recovery | Code head `dbbf2b9b0852fe00feca89396e7ef3fe36aedb04`; branch also contains a later docs-only queue refresh | Code head Android CI #42636529872 **PASS**, Node **726/726**, contracts #42636529926 **PASS**, device APK #42636529875 **PASS**. The later docs-only branch tip has no Actions run; re-check live head before merge. | Draft; independent data-storage/security review pending. Duplicate-key guard now covers primary task/Focus, outer and nested recovery payloads and selected imports. Keep #640/#603/#639/#636 open until merge and acceptance. |
| #676 page-bound extension injection | `59830d290f023c7b0b2cf2828a10de8bedaf195a` | Contracts #42637746292 **PASS**; Android CI #42637746064, device acceptance #42637746399 and device APK #42637746704 **IN PROGRESS**. Prior head #6836 failed on a stale JS-only one-submission assertion; #59830 corrects it to the expected two submissions (bootstrap + script). | Draft; wait for exact-head Android/device checks and independent review. No physical device tested. |

### Prioritized whole-project backlog
1. **P0 — Focus API 36 interaction (#648/#613):** fix root-relative versus screen-space coordinates before display injection; verify with non-zero root origin and post-scroll bounds; retain real tap/swipe/vertical-scroll checks and ten consecutive API 36 passes. Current API 29 pass does not waive API 36 failure.
2. **P0 — Browser download security (#671):** current main still enqueues `DownloadManager.Request` and forwards the WebView Cookie header while redirects are followed internally. The fail-closed policy exists only on unmerged #648. Keep the branch fail-closed; implement a Daymark-owned redirect-by-redirect transport with downgrade/private-address rejection, same-origin cookies only, no referrer/ambient credentials, bounded streaming, temporary files and cancellation/error cleanup. Do not create a competing MainActivity edit while #648 owns it.
3. **P1 — Recovery/storage/webhook (#675; #640/#603/#639/#636):** independent review and merge-gate verification; preserve unreadable/unknown versus absent, exact ambiguous bytes, task-persist-before-notify, Web Locks and session-only endpoint secrets. Physical recovery acceptance remains NOT TESTED.
4. **P1 — iCalendar/import-export (#656):** independent RFC 5545 review for categories, recurrence/timezone/date semantics, repeated properties and completion metadata.
5. **P1 — Extension trust (#659):** independent review of default-disabled imports, page-local capabilities, match/exclude scope, archive limits and preservation of existing packs on failed reads.
6. **P1 — Signing/Node24 (#665/#84):** independent security review; PR/debug builds must not receive signing secrets; inspect direct and transitive action runtimes. No release publication.
7. **P0 — Governance (#646):** owner configures PR-only main, independent approval, stable required Android/Ubuntu/Windows checks, stale-review dismissal, conversation resolution and force-push/deletion restrictions. Integration cannot inspect the protection endpoint; no settings changed.
8. **P0 — Physical Android acceptance (#160):** test current-main APK on actual devices; record model, API, WebView provider/version, build SHA and APK SHA. CI/emulator artifacts are not physical-device acceptance.
9. **P1 — Reminder parity (#476):** validate Android/web recurrence anchors and long-gap catch-up; physical AlarmManager/Doze/reboot/timezone/OEM delivery remains open.
10. **P2 — Browser UX/architecture (#348/#325):** continue compatibility, Reader Mode, app links, performance and measured cross-platform contracts after the P0/P1 security and data-integrity gates.

### Run-specific engineering log
- Corrected the CSS bootstrap guard-order host-test assertion on #676 (commits `fd34e50ca6366fa2dab0054edb997cbf781dc105` and `1c11500fb47b79b39578649439c5567906e51ff6`). The later exact head failed for a separate stale JS-only submission-count assertion; that was reported and corrected by commit `59830d290f023c7b0b2cf2828a10de8bedaf195a`. The new exact-head checks are pending.
- Reproduced #648 API 36 failure on head `dd73640`: Countdown bounds `[519,1688][938,1814]`, `getLocationOnScreen=(540,1904)`, injected tap center `(728,1751)`; API 29 passed, API 36 failed at run 1/10. Posted the Android API coordinate-space diagnosis in #613; no competing instrumentation/MainActivity edits made.
- Revalidated #675 exact-head Android/Node/contracts/device-artifact results and duplicate-key guard coverage; verified #656 and #675 use byte-identical `task-logic.js` helper blobs.
- Rechecked #659's active import paths: parser warnings appear in both review dialogs; new imported packs remain disabled until user activation. No independent review claimed.
- Rechecked #665's direct old action references and posted exact-head evidence to #84; no signing secrets, release workflow, tag or release was changed.
- Confirmed main's browser download path still uses DownloadManager plus Cookie header; posted the unmerged fail-closed/transport distinction to #671.
- Updated #646 with live unprotected-branch/ruleset evidence; updated #613 with repeated API 36 failures; updated #640 with current duplicate-key coverage; updated #675 with stale status-snapshot inventory. Added this current execution queue to `PROJECT_PLAN.md` on #675; the documentation-only branch tip has no Actions run, while the underlying code head `dbbf2b9` has the listed passing checks.
- No PR merged by this run. No production release/tag/version bump, signer/package change, destructive migration, automatic restore or user-data mutation. Physical-device acceptance: **NOT TESTED**.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; exact-source/PR/workflow inspection; Android API documentation  
**Timestamp (UTC):** 2026-11-09T14:47:38.879Z

---

## Current execution queue — 2026-11-09T12:34:39.477Z (main 8d76584bc07e)

This queue supersedes older current-priority summaries below; historical planning and evidence remain intact.

1. **P0 — Focus Timer / browser download safety (#648, #613, #671):** synchronize the 120-ahead/7-behind Focus branch with current main, fix source-guard and host-input drift, then prove actual Countdown/Stopwatch taps, horizontal swipes and parent ScrollView vertical scrolling on API 29 and API 36. Keep API 36 ten-consecutive-run gate. New downloads remain fail-closed until a manual redirect-validating, bounded transport is integrated; do not restore DownloadManager opaque redirects.
2. **P1 — Recovery data integrity (#664, #640):** apply duplicate-key rejection to primary Focus storage, task/Focus outer recovery envelopes, every nested JSON string and user-selected imports. Preserve exact raw bytes and refuse ambiguous overwrite/import. Current head 5a1962c5 still has one guard call site (primary task loader); recovery/import regressions are missing.
3. **P1 — Storage health (#666, #603):** latest head 1579ce1d is 28 ahead/0 behind current main; Android CI and device APK checks are running, contracts pass. Complete independent fail-closed review; unreadable data must never be treated as absent or deleted.
4. **P1 — Release signing isolation (#665, #84):** latest head 7e4cd3e7 is 9 ahead/0 behind; exact-head Android/contracts/device workflows are running. Verify PR builds cannot access signing secrets and finish Node24/transitive action inventory.
5. **P1 — Webhook queue (#662, #639, #636):** final-attempt drop and Web Locks/session-only secret behavior pass exact-head Android/contracts/device checks on 2c8aa239; synchronize five commits behind main and obtain independent review.
6. **P1 — Import/export (#656):** exact-head Android/contracts/device checks pass on 199e9fa6; synchronize five commits behind main and obtain independent RFC 5545/data-loss review.
7. **P1 — Extension trust (#659):** exact-head Android/contracts/device checks pass on 6c7d50ab; synchronize five commits behind main and obtain independent security review.
8. **P0 — Physical acceptance (#160):** test current-main APK on real devices, recording model/API/WebView provider/version and APK SHA. Emulator/artifact builds are not physical-device acceptance.
9. **P1 — Governance (#646):** owner-approved required checks and independent-review protection for main; no settings changed in this cycle.
10. **P2 — Browser UX / cross-platform architecture (#348, #325):** resume after Focus/download safety and storage/data-integrity gates.

Recent integration: PR #673 merged at 8d76584bc07ed06388e46de8dd11bd39d7250d3a. Post-merge Android CI is in progress and Ubuntu/Windows contracts pass. No production release/tag was published.

---

## Current execution queue refresh — 2026-11-09T12:00:49Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T120049Z.md](docs/CURRENT_STATUS_20261109T120049Z.md).

Current main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`. Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Open inventory: **10 PRs / 11 issues**.

### P0 — security and runtime acceptance
1. **#665 signing-secret isolation:** exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Current main PR/debug build logs expose masked signing variables to PR-controlled Gradle build steps; no exfiltration evidence. Independent security review required.
2. **#648 Focus Timer:** exact head `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2`, 101 ahead / 0 behind. Direct numeric-only UiAutomation shell input replaces the failed cross-UID bridge and status-marker wrapper. Local host smoke 8 assertions PASS. Exact-head Android/Focus API29+36 workflows queued/in progress; no emulator pass claimed.
3. **#662 webhook:** exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS. Session-only endpoint and Web Locks replace merged #655 localStorage secret/lock behavior. Independent review required.
4. **#664 recovery:** exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`, Android/contracts/device-test PASS; independent review and physical/manual export acceptance pending.
5. **#160 physical Android/WebView/OEM acceptance:** APK artifacts are not physical-device tests.

### P1 — data integrity, extension, recurrence and integration
- #656 import/export: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS.
- #657 recurrence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI/non-publishing acceptance PASS; actual Doze/reboot/timezone/OEM delivery pending.
- #670 CSS press feedback: exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`, Node 658/658 and Android/contracts/device-test PASS; PR ready for review.
- #637 closed without merge after CSS transplant; stale status snapshots and duplicate HTTP guard were not copied.
- #669 docs snapshot/status index: preceding exact head passed Android/contracts/device-test; this refreshed snapshot commit requires new checks.

### P0 governance and release blockers
- #646: main protection disabled, rulesets empty, dedicated endpoint HTTP 403; require owner-side independent approvals and Android/contracts checks.
- Resolve application identity policy conflict between source/root AGENTS and user-mandated target; no identity change without explicit owner decision.
- v1.5 remains latest published; v1.4 draft. No release/tag/version/signing changes authorized.
- No physical-device tests claimed.

### Latest execution ledger
- #648: abandoned cross-UID file bridge after API29 EACCES and removed unreliable status marker; direct bounded UiAutomation shell input, host smoke 8 assertions, runner awk component discovery and source/mutation guards. Exact head `49e4c1bee459dd0afb33d8bc0b3d2fc32de8cda2`; Android CI/Focus API29+36 workflows in progress.
- #656: imported #618 storage-safety changes into iCalendar branch; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679, Android/contracts/device-test PASS; not merged.
- #662: merged #663 markup/test into webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684, Android/contracts/device-test PASS; not merged.
- #665: tag-only signing-secret environment; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659, Android/contracts/device-test PASS; not merged.
- #666: storage-health read-unknown behavior; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671, Android/contracts/device-test PASS; not merged.
- #657/#659/#664: current-main-based branch sync completed with exact-head CI green.
- #670: CSS/accessibility transplant; exact head `59e8825fa1c36b6329a5a1a27212f478c70c2b30`; Node 658/658, Android/contracts/device-test PASS; ready for review, not merged.
- #669: retired-namespace documentation guard failure fixed; preceding head passed Android/contracts/device-test; current snapshot refresh is the new pending docs change.
- #618/#637/#668 closed without merge; #604/#650/#655/#663 merged by concurrent automation. No PR merged by this run.
- Issues updated: #84, #160, #325, #348, #476, #603, #613, #636, #639, #640, #646.
- No production release, tag, version bump, signing-key change, application identity change, or destructive migration.

## Current execution queue refresh — 2026-11-09T11:39:14Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T113914Z.md](docs/CURRENT_STATUS_20261109T113914Z.md).

Current main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`. Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`. Open inventory: **10 PRs / 11 issues**.

### P0 — security and runtime acceptance
1. **#665 signing-secret isolation:** exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Current main PR/debug build logs show masked signing variables in the build-step environment; no exfiltration evidence. Independent security review required.
2. **#648 Focus Timer:** exact head `94dbcc05bcc7cda8adba201697389b30a3866222`, 73 ahead / 0 behind. The failed cross-UID file bridge is removed; bounded shell tap/swipe now runs via UiAutomation. Local host smoke: 11 assertions PASS. Exact-head Android/contracts/device/Focus API29+36 workflows in progress; no emulator pass claimed.
3. **#662 webhook:** exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS. Session-only endpoint and Web Locks replace merged #655 localStorage secret/lock behavior. Independent review required.
4. **#664 recovery:** exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`, Android/contracts/device-test PASS; independent review and physical/manual export acceptance pending.
5. **#160 physical Android/WebView/OEM acceptance:** APK artifacts are not physical-device tests.

### P1 — data integrity, extension, recurrence and integration
- #656 import/export: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS.
- #657 recurrence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI/non-publishing acceptance PASS; actual Doze/reboot/timezone/OEM delivery pending.
- #637 CSS/status index: 12 ahead / 22 behind, mergeable=false; rebase or replace without losing historical links.
- #669 documentation snapshot: prior head `feded2159121a3a6c178967572d41cd873a1be08` passed Android/contracts/device-test; refreshed snapshot commit requires new checks.

### P0 governance and release blockers
- #646: main protection disabled, rulesets empty, dedicated endpoint HTTP 403; require owner-side independent approvals and Android/contracts checks.
- Resolve application identity policy conflict between source/root AGENTS and user-mandated target; no identity change without explicit owner decision.
- v1.5 remains latest published; v1.4 draft. No release/tag/version/signing changes authorized.
- No physical-device tests claimed.

### Latest execution ledger
- #648: removed cross-UID file bridge after API29 EACCES; direct UiAutomation shell input, bounded command grammar/status parser, host smoke (11 assertions), runner and guard updated. Exact head `94dbcc05bcc7cda8adba201697389b30a3866222`; workflows in progress.
- #656: imported #618 storage-safety changes into iCalendar branch; exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679, Android/contracts/device-test PASS; not merged.
- #662: merged #663 markup/test into webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684, Android/contracts/device-test PASS; not merged.
- #665: tag-only signing-secret environment; exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`; Node 659/659, Android/contracts/device-test PASS; not merged.
- #666: storage-health read-unknown behavior; exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`; Node 671/671, Android/contracts/device-test PASS; not merged.
- #657/#659/#664: current-main-based branch sync completed with exact-head CI green.
- #669: initial retired-namespace documentation guard failure fixed; corrected prior head passed Android/contracts/device-test. This snapshot refresh is the new pending docs change.
- #618/#668 closed without merge; #604/#655/#663 merged by concurrent automation. No PR merged by this run.
- Issues updated: #84, #160, #476, #603, #613, #636, #639, #640.
- No production release, tag, version bump, signing-key change, application identity change, or destructive migration.

## Current execution queue refresh — 2026-11-09T11:21:40Z (main 1d29085)

Latest whole-project snapshot: [CURRENT_STATUS_20261109T112140Z.md](docs/CURRENT_STATUS_20261109T112140Z.md).

Current baseline:
- Main: `1d29085b9c4f9ff3489711fd7e18cc88ab368767`.
- Root AGENTS: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`.
- 9 open PRs; 11 open issues.
- Main protection disabled; no rulesets; independent approvals absent on critical open PRs.
- Main SHA direct workflow lookup returned no post-merge runs for #663; current-main-based PR branches #656/#657/#659/#662/#664/#665/#666 have fresh exact-head green Android/contracts/device-test checks.

### P0 — immediate security and runtime acceptance
1. #665 signing-secret isolation: current-main PR debug-build job logs expose masked signing-secret environment variables to PR-controlled Gradle execution. #665 removes them from debug steps and gates secrets to tag release only. Exact head `530ba59607f944358f18f8bcd1f2881d9e0e8aaa`, Node 659/659 and Android/contracts/device-test PASS. Independent security review required.
2. #648/#613 Focus Timer: align instrumentation checkpoints and host runner with `com.abrar.daymark.test`; exact head `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b`; Android CI in progress, contracts/device-test pending, API 29/36 emulator lifecycle queued. Do not claim pass until logs verify.
3. #662 webhook: current main contains #655's localStorage endpoint/lock implementation. #662 replaces it with session-only endpoint state and Web Locks. Exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`, Node 684/684 and Android/contracts/device-test PASS; independent review required.
4. #664 recovery: independent Task/Focus backup reads, UNKNOWN state and byte preservation. Exact head `fc104fd590d3a61deb02efc1808439cbda1c6d41`; Android/contracts/device-test PASS; physical recovery acceptance pending.
5. #160 physical Android/WebView/OEM acceptance; APK artifacts are not device tests.

### P1 — integration and data integrity
- #656 import/export + RFC 5545: exact head `60ed05002237f172a9f9931390b024f5d30756ad`, Node 679/679 and Android/contracts/device-test PASS; independent review pending.
- #659 extension import trust: exact head `3e95f41c5cad12474345875b8078d75249154dc9`; Android/contracts/device acceptance/device-test PASS; independent review pending.
- #666 storage health: exact head `4ebb8256926ae9a3d3fb7ba774da4cc517add7ec`, Node 671/671 and Android/contracts/device-test PASS; review pending.
- #657 recurrence terminal-fire persistence: exact head `0bf58040c9186de574c3e760e61f1bf0cedd04ad`; CI and non-publishing acceptance PASS; real Doze/reboot/timezone notification acceptance pending.
- #637 CSS/status index: 12 ahead / 22 behind, mergeable=false; rebase or replace without losing historical status links.
- Synchronize only branches with non-conflicting paths; #662 already has a manual merge of #663's index/test markup.

### P0 governance / release blockers
- Enable main branch protection and independent PR approvals (#646).
- Resolve application ID policy conflict: source/root AGENTS says `com.abrar.daymark`; user safety instruction says `the user-mandated target identifier`. No identity change without explicit owner decision.
- Keep v1.5 as latest published; v1.4 remains draft. No release/tag/version/signing changes authorized.
- No physical device tests claimed.

### This run's delivery and integration log
- #656: imported #618's six code-file storage-safety changes into the current-main iCalendar branch; added quota/write-failure regression and updated ICS UI validation fixture. Exact head `60ed05002237f172a9f9931390b024f5d30756ad`; Node 679/679; Android/contracts/device-test PASS; not merged.
- #662: merged current main #663 task-editor/toast markup and its contract test into the webhook branch; exact head `4c3252ee5b303184d2e7cac07deb6a3f18d9f865`; Node 684/684; Android/contracts/device-test PASS; not merged.
- #665/#666/#657/#659/#664/#656: merged current main #663 commit into each non-conflicting branch using ordinary merge commits; all now 0 behind current main and fresh exact-head CI green.
- #648: corrected source-guard mutation markers for the host input bridge, aligned Java checkpoint/phase-log storage with instrumentation test context, runner preflight/poll and fake-adb tests to `com.abrar.daymark.test`. Exact head `d3fcf751ae4fbd3dd42a7dcb4116c562274ad27b`; workflows pending/in progress; not merged.
- #618 closed without merge after its code was transplanted into #656; stale status snapshots were not copied.
- #668 opened as a duplicate Focus branch and closed without merge to avoid overlapping instrumentation PRs; #648 remains canonical.
- #604 merged earlier; a mistaken closure statement was corrected on the PR.
- #663 merged by concurrent automation at 11:03Z; exact-head CI passed before merge; post-merge main run not returned.
- Issues updated: #84, #160, #476, #603, #613, #636, #639, #640.
- No PR merged by this run; no production release, tag, version bump, signing-key change, application ID change or destructive migration.

# Daymark Project Plan

Daymark should remain a fast, simple, privacy-first task app that works offline, while letting interested users reveal more capability through task-specific workspaces. Engineering is technology-agnostic: use any language or tool that demonstrably gives the best result for a component, as defined in the [technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md). Language examples are not a whitelist or requirement. The ordinary task flow must not require users to learn about AI, models, plugins, terminals, or Android internals. Advanced tools should be optional, visible, modular where the distribution channel permits, and bounded by user-approved scopes.

**Status snapshot.** This document contains a staged roadmap, not proof that a feature is implemented. Verify live `main`, open PRs/issues, `android-app/app/build.gradle.kts`, and the [Releases page](https://github.com/AbrarulHaque8541/daymark/releases) before making implementation or publication claims. CI/build success does not establish physical-device behavior; device acceptance is tracked separately in issue #160.

## Current execution queue refresh — 2026-11-09T02:36Z

This priority order supersedes the historical **Execution queue (checked 2026-10-13)** below. Older entries remain as audit history; they are not current implementation or workflow claims. Recheck the live status index and exact PR heads before each action.

### P0 — User-data and real-device acceptance

1. **Complete the physical Android acceptance matrix — issue #160.** No physical device was tested in this refresh. Record model, Android API, WebView provider/version, build SHA, APK SHA, scenario and result. Cover browser navigation/renderer recovery, Reader Mode, extensions, downloads/SAF, encrypted task recovery, same-signer upgrade, TalkBack, and notifications. CI/APK verification is not device acceptance.
2. **Finish Focus Timer API 29/36 lifecycle qualification — issue #613 / PR #648.** Current head `007b755103cab21fe38241ad6877192184278716` is 6 ahead / 0 behind main. Android build/host checks, Focus UI, Ubuntu/Windows contracts, manual QA APK and device-test APK verification pass. API 29 passes; API 36 fails on run 6/10 after runs 1–5 pass, with an empty MotionEvent trace for the horizontal selector swipe (exact job 128949878323). The in-app `sendPointerSync` path remains intermittently unreliable on API 36. Next implementation should coordinate host-side `adb shell input swipe` with an instrumentation request/result checkpoint and fake-adb protocol tests. Keep ten consecutive runs and real MotionEvent/mode-state assertions; no retries or weakened tests. Parent ScrollView vertical-scroll behavior and physical-device acceptance remain separate.
3. **Keep browser downloads fail-closed until a redirect-validating transport exists — issue #348 / PR #648.** New WebView download requests are deliberately rejected; existing download history/open/cancel behavior is retained. Do not re-enable DownloadManager or claim download completion without an app-owned HTTPS/redirect/credential-safe transport and SAF device tests.

### P1 — Integrate and independently review security/data work

4. **Bounded API streaming plus resilient data cards — PR #649.** Current-main head `a80e24b157c5fff4a7414e351e6ae8533284545e` is 2 ahead / 0 behind. Android build, Ubuntu/Windows contracts and device-test APK verification pass; release publication was skipped. The canonical Node suite is **567/567**. All four providers use the shared bounded reader and now explicitly omit credentials/referrers, disable caching and reject redirects; provider tests assert the request policy. Independent security/data review remains required before merge.
5. **Webhook privacy and recovery integrity — issues #636/#639/#640, PR #643.** Latest head `24398124ea1478d9c4dfd1df59c4a9a7013fbb65` is 51 ahead / 0 behind. Exact-head Android build, Ubuntu/Windows contracts and device-test APK verification **PASS**; Node **584/584 PASS**; release publication skipped. Endpoint URLs are session-only; task/Focus backups are read independently; task completion persists before webhook notification; queue overflow preserves existing events and refuses new events; cross-tab locks fail closed without Web Locks. The latest commit also cancels unused webhook response bodies on success and HTTP error. Independent security/data-integrity review is pending; PR #643 overlaps storage-health PR #604 in shared storage files.
6. **Storage health and durable status index — issue #603 / PR #604.** Preserve unreadable keys as UNKNOWN, never treat read errors as absent, and keep partial clear/rollback outcomes truthful. PR #604 is 16 ahead / 13 behind current main; its old-head green checks are not current-main integration evidence. It owns `docs/AGENT_STATUS.md`; refresh that index and add a new dated snapshot without deleting historical links. PR #637 is 11 ahead / 3 behind and also touches the index; its CSS active/hover cascade and historical-link preservation findings remain open. Coordinate one combined owner-reviewed tree rather than overwriting either branch.
7. **Remove Node 20 action warnings — issue #84 / PR #645.** Exact head `0d673077f79903acda1c698c8bfcc53106b1934e` is 7 ahead / 0 behind; Android build, contracts, QA/device APK and API 29 Focus pass, while API 36 Focus fails on the Task Editor Cancel/IME visibility gate. PR #645 pins the PGP-verified immutable Gradle Actions v6.4.1 commit `8da46b539cd8fe6ab27ca75128919a18d757604c`; its exact Android job log shows no Node 20 warning for those Gradle actions. Current main still has the older pin until #645 integrates. Separate release-assets, production-release and SLSA provenance workflows retain legacy v4 action refs and need independent release-workflow review.
8. **Complete recurrence/reminder acceptance — issue #476.** The long-gap arithmetic catch-up and four-digit date boundaries are source-tested. Real AlarmManager delivery, Doze, reboot, timezone changes, OEM battery policy and physical notifications remain NOT TESTED.
9. **Review browser/extension/feed/desktop security — PRs #626, #627, #631 and #638; issue #348.** Their exact heads are current-main descendants and their reported Android/contracts/device-artifact or desktop matrix checks pass. Independent security review and physical browser/desktop qualification remain pending. System WebView is not a full Chrome/Firefox extension engine; do not overstate support.

### P2 — Measured platform expansion

10. **Cross-platform architecture — issue #325.** Keep Android as the current shipped target. Desktop browser policy CI is not proof of a packaged desktop task app or GUI/device behavior. Windows/Linux task shell and secure-storage acceptance remain experimental; HarmonyOS/OpenHarmony remains unqualified until an actual ArkTS/native adapter and device evidence exist.

### Current repository baseline (verified 2026-11-09)

- Main: `fbcf1253b18669d36d060b679e1821cf17a6f3a9`; 15 open PRs and 11 open issues at this snapshot.
- Source identity: `com.abrar.daymark`, versionName `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`. A run-level safety instruction names a different legacy package identifier and conflicts with root AGENTS.md and live Gradle; no application identity change is authorized or made.
- Latest published release: v1.5; v1.4 remains draft. No release/tag was created in this refresh.
- Main reports `protected: false`; rulesets API returned an empty list and the protection-detail endpoint returned HTTP 403. See issue #646; no repository settings were changed.
- Physical-device acceptance: **NOT TESTED**.


## Execution queue (checked 2026-10-13)

This is the actionable priority order. A roadmap entry is not an implementation claim; move an item to **Done** only after source review and the stated checks. Recheck live issues and PRs before opening work so agents do not duplicate one another.

### P0 — Stabilize the current browser before adding features

1. **Browser load watchdog recovery — merged (PR #241); device verification pending.** The watchdog is present on current `main`. Preserve its bounded retry/error behavior and the approved HTTP/HTTPS browser policy; keep the updater and other app-owned network clients HTTPS-only. CI/source evidence is not a device result; use the live status index for current workflow evidence.
2. **Blank browser viewport — source issue closed; device acceptance still unverified.** [Issue #221](https://github.com/AbrarulHaque8541/daymark/issues/221) is closed as completed, but its latest discussion does not establish physical-device rendering evidence. Keep normal HTTPS page/search rendering in the runtime matrix tracked by issue #160; capture WebView version, Android API/device, visible lifecycle status, and redacted logcat when tested. CI is not device verification.
3. **Complete the Android runtime acceptance matrix.** Track [issue #160](https://github.com/AbrarulHaque8541/daymark/issues/160). Record PASS / FAIL / NOT TESTED by scenario, device/API, variant, commit SHA, and APK SHA. Cover browser navigation/renderer recovery, Reader Mode, image blocking, extensions, downloads/SAF, encrypted task data/backup restore, and same-signer upgrade. Never label a built APK as device-tested.
4. **Regression/security audit.** Run the repository's prescribed host/source tests and Android CI after each focused change. The owner-approved `com.abrar.daymark` application identity is now on `main` via merged PR [#286](https://github.com/AbrarulHaque8541/daymark/pull/286); keep it, the production signer pin, monotonic `versionCode`, the owner-approved HTTP/HTTPS browser policy (owner decision 2026-11-06; on-device HTTP runtime verification pending), HTTPS-only updater/other app clients, encrypted user data, and the no-broad-JavaScript-bridge boundary unchanged without explicit owner/security review. The identity reset is a separate install; do not promise automatic local-data migration.
   - *Historical host run, 2026-10-10 (branch `arena/2564f1a3-daymark`, base `477b347`):* `npm test` — **PASS** (12/12); browser-watchdog check — **PASS**; core Java tests — **NOT TESTED** because `javac` was unavailable in that run. The PR #243/#246 overlap note describes the queue at that time only; check the live status index instead of treating those PR states as current.

### P1 — First feature after P0 stability evidence

5. **Selected-text actions in the browser.** Inspect current source first and implement only missing actions. Candidate actions: Copy, Explain, Translate, Summarize, and Create Task. Keep actions in a contextual/overflow menu rather than permanently consuming viewport space. Copy and Create Task should work locally; Explain/Translate/Summarize must clearly open a user-selected provider or disclose the required API/network path. Do not imply that Daymark already has an AI backend. Acceptance: selection survives menu invocation, actions handle empty/long text safely, task creation is explicit, HTTPS/provider disclosure is preserved, and automated/source tests cover the action routing.
6. **Per-site browser preferences.** Only proceed after checking what global controls already exist. Candidate per-origin settings: Reader preference, image loading, and theme/font choice. Keep an explicit reset/clear path; store only the minimum origin-level state, explain that current browser history/preferences may not be encrypted, and do not claim network-level ad/tracker blocking. Acceptance: preference is origin-scoped, survives the documented lifecycle, resets cleanly, and does not affect unrelated sites.
7. **User-facing browser diagnostics mode (still planned).** PR [#291](https://github.com/AbrarulHaque8541/daymark/pull/291) merged privacy-safe WebView visual-state/lifecycle log breadcrumbs, but not a user-triggered diagnostics screen or export. If that UI is proposed, redact query strings/fragments and credentials; export must be opt-in. CI logs are not proof that issue #221 is fixed.

### P2 — Consider after the core browser and task flows are reliable

8. **Command palette / quick actions.** Search existing tasks and invoke existing actions from one compact UI. Reuse current task APIs; do not create a second task store or duplicate commands. Acceptance: keyboard and touch access, accessible labels, deterministic ordering, and existing task regression tests.
9. **Research-to-task workflow.** Let a user explicitly save selected page text/link as a task or note, with a preview before writing. Keep it local-first; external AI analysis is optional and clearly disclosed. Acceptance: user confirms saved content, URL sanitization, bounded text size, no silent background capture, and backup/restore compatibility.
10. **Local model/runtime discovery — official source survey completed (2026-10-12); selection remains open.** Do not implement, bundle, or auto-download a model. The [source review](android-app/ANDROID_SOURCES.md#official-source-refresh-2026-10-12) distinguishes AICore/ML Kit, llama.cpp plus GGUF, and LiteRT-LM; no universal compatibility or current model-size claim is supported. Choose nothing until the target device matrix, exact checkpoint/runtime licenses, RAM/storage/size, performance/thermal/battery behavior, removal, and user-started transfer are verified. Decide separately whether AICore's system-managed model delivery fits explicit-download requirements. Never silently cloud-fallback.

### Delivery rules for every queue item

- One focused change per branch/PR where practical; inspect open work before starting.
- State exact tests run and their result. Distinguish **SOURCE-VERIFIED**, **PASS**, **NOT TESTED**, **DEVICE VERIFIED**, and **PUBLISHED** accurately.
- Add a feature to **Done** only when its acceptance criteria are met; otherwise leave it **In review**, **Blocked**, or **Planned** with the relevant PR/issue link.
- Do not bundle speculative features into a browser bug fix. Do not create a release tag without owner approval or an existing standing release instruction.

## Historical status snapshot (verified 2026-10-26)

**Verified against live `main` on 2026-10-26:** `main` is `cac2d7524491a3fce488e57b5cf810dc7b5c5017`. Current Android source uses application ID `com.abrar.daymark`, version `1.5`/code `12`, `compileSdk = 36`, and `targetSdk = 36`; the toolchain is AGP 8.12.2 / Gradle 8.13. The latest published release is [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), whose tag points at the earlier commit `ca6453374c46a1449c8bbec09a27a218d127d8e4`. v1.4 remains a draft. See the [status index](docs/AGENT_STATUS.md) and the current [API 36 readiness note](API36_MIGRATION_READINESS.md); recheck live GitHub before acting.

Current `main` includes encrypted task and attachment storage, explicit encrypted portable backup/import, the HTTP+HTTPS embedded WebView, browser workspaces and page-local extensions, reminders, and local natural-language quick add. v1.5 added internationalized-domain navigation, expanded quick-add date parsing, stricter extension import caps, and reliable attachment-stream error propagation. It remains a deterministic/local-first app: there is no GGUF model, inference runtime, model downloader, Termux/CLI bridge, or cloud fallback. The model, runtime, shell/bridge, and broad plugin phases remain deferred.

Current-main Android CI [run 39934982721](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982721) and cross-platform contract [run 39934982786](https://github.com/AbrarulHaque8541/daymark/actions/runs/39934982786) passed on `cac2d75`. The v1.5 production workflow [run 39932829832](https://github.com/AbrarulHaque8541/daymark/actions/runs/39932829832) failed only in its final draft-release lookup after creating the draft; the artifact was independently verified and published separately, and merged PR #337 corrected the lookup for future runs. Workflow/emulator evidence is not physical-device evidence.

Open PRs at this snapshot are [#333](https://github.com/AbrarulHaque8541/daymark/pull/333) (reminder/attachment instrumentation), [#338](https://github.com/AbrarulHaque8541/daymark/pull/338) (native palette), and [#339](https://github.com/AbrarulHaque8541/daymark/pull/339) (home-scroll/composer behavior). Open issues include [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) (runtime acceptance), [#221](https://github.com/AbrarulHaque8541/daymark/issues/221) (reported blank viewport), [#325](https://github.com/AbrarulHaque8541/daymark/issues/325) (cross-platform architecture), and [#340](https://github.com/AbrarulHaque8541/daymark/issues/340) (vacuous `test*UnitTest` tasks with no app `src/test` sources). PR #333 also edits the Android CI workflow, so any fix for issue #340 must coordinate with that active change.

Owner physical-device acceptance remains **NOT TESTED** for app installation/upgrade, Android 16 UI and Back behavior, WebView/provider behavior, Keystore/backup, TalkBack, reminders, and update flow. Follow issue #160 and record device/model, Android API, WebView provider/version where relevant, build SHA, APK SHA, scenario, and result. Source checks, CI, and emulator cold launches are not substitutes.

## Product direction and architecture

Keep the core task experience small and local. Let a task expand into a workspace only when the user chooses. Preserve the current minimal UI with progressive disclosure rather than putting agent controls on the default home screen.

Use a stable, provider-neutral capability interface between the task/workspace layer and optional tools. Each capability should declare its purpose, typed input/output schema, version, permissions, data scope, online/offline needs, risk, resource limits, cancellation behavior, and license/terms. A broker—not model-generated tool code—checks that a request is within the current task’s granted scope. Keep model, search, and tool adapters replaceable; do not hard-wire task storage or UI to one vendor.

The core tasks, local search, filters, and existing data access must work without a network connection. Optional web search, browsing, or a user-selected hosted model
 may need the network and must say so before use. **No feature requires cloud fallback.** A local model that is unavailable, too large, or out of memory should report that limitation; it must not silently send the prompt to a cloud provider.

## Capability map and feasibility matrix

| Capability | Status | Evidence status | Feasible scope and boundary |
|---|---|---|---|
| Core tasks: title, notes, subtasks, due date/time, priority, completion, search/filter/sort, templates, attachments, deterministic suggestions | **Current** | **Source confirmed; device acceptance remains separate** | Keep task edits local and available offline. Do not describe the existing rule-based demo suggestions as AI. Reminder timing/platform delivery remains best-effort and device-dependent; see [`docs/TASK_REMINDERS.md`](docs/TASK_REMINDERS.md). |
| Offline natural-language quick add | **Current** | **Source merged; parser smoke passed 16 assertions; device UX remains untested** | Only the single-line capture path parses supported dates/times, priorities, and `#tag` tokens; unknown words remain title text and the regular editor is unchanged. See [`docs/NL_QUICK_ADD.md`](docs/NL_QUICK_ADD.md). |
| Encrypted local task storage, attachments, portable backup | **Current** | **Source confirmed** in `main` via current source/merged PRs; **untested on device** for this review | Preserve atomic recovery, encrypted app-private data, explicit file selection, migration safety, and user-controlled portable restore. Avoid absolute “zero data loss” promises. |
| Suggestion-card actions/navigation | **Needs current-source verification** | **Older PR #15 reference is historical; no current implementation claim is made here** | Verify the live source and UI tests before treating suggestion-card navigation as implemented. Keep distinct from future additions; the ten-feature slate is not tracked in public `main`. |
| Offline timed reminders | **Implemented in source; device behavior unverified** | **Current-source checks/documentation; no device acceptance** | Reminder prompts and best-effort OS notifications are implemented. Permission, Doze, reboot, time-zone, revocation, and delivery timing remain device-dependent; do not describe timing as guaranteed. |
| Release updater | **Source enabled and signer-pinned; device flow unverified** | **v1.5 is the latest published release; current `main` is version 1.5/code 12 and targets API 36** | The [release-signing contract](RELEASE_SIGNING.md) and updater source describe the sideload updater and pinned certificate. The user-directed handoff saves a verified APK for manual opening, not app-launched installation. Google's developer-verification rollout does not initially apply to direct sideloads, but global expansion is planned for 2027; review package/signing-key registration before broader distribution. Real provider/process-death and update behavior remain unverified. |
| HTTP+HTTPS browser, Reader Mode, bookmarks, filterable tabs, and network-image preference | **Source present; device/network behavior unverified** | **Source/host/CI checks; no WebView runtime testing** | Browser networking starts Online by default (owner decision 2026-11-05); requested navigation still needs a tap. Reader Mode extracts bounded text; image blocking is not network-level ad/tracker filtering. History stores origins only and is not encrypted. Platform Safe Browsing may make separate network requests. |
| WebView visual-state diagnostics | **Source log breadcrumbs merged; user-facing diagnostics mode remains planned** | **PR #291 CI passed; not device render-validated** | The merged privacy-safe log path is distinct from a diagnostic screen/export. Do not claim the blank viewport is fixed until #221 records device evidence. |
| Other task additions (share-in, research capture, widget) | **Future work** | **No ten-feature slate tracked in public `main`** | Natural-language quick add is already implemented; do not duplicate it. Treat other proposals as unaccepted until the owner adds acceptance criteria to the live queue. |
| User-approved file workspace | **Later feasible** | **Not implemented as an agent workspace in main** | Begin with app-private task/workspace files and Android’s user-selected document access, not arbitrary filesystem access. |
| Local model manager and on-device inference | **Research required** | **No implementation observed in main** | Evaluate runtime compatibility, model license, download size, RAM/storage, CPU/GPU/NPU support, thermal/battery cost, startup latency, and deletion before selecting a model. Never auto-download a large model. |
| Hosted model/provider adapters | **Research required** | **No model API connected in current source** | First-party adapter boundary only after provider terms, privacy, retention, region, price/rate limits, and data disclosure are reviewed. Hosted use is explicit and optional; no cloud fallback. |
| Computer vision, OCR, speech, camera/microphone features | **Research required** | **No implementation observed in main** | Prefer user-selected images/files and on-device processing when practical. Request microphone/camera or media access only for a user-invoked feature. Android's general `SpeechRecognizer` implementation is likely to stream audio to remote servers; on-device recognition availability varies by device/service. Keep typing as a first-class alternative and clearly disclose any audio leaving the device before recording or sending it. See the [SpeechRecognizer API](https://developer.android.com/reference/android/speech/SpeechRecognizer). |
| Downloadable language/model/data assets | **Later feasible** | **Architecture proposal only** | Treat weights and content as data, not remotely injected application code. Show size, license/source, compatibility, integrity, storage use, and removal/update behavior; require a user choice. |
| Play dynamic feature delivery | **Android-limited** | **Official platform constraint** | Play Feature Delivery separates feature modules inside an Android App Bundle and delivers them through Google Play. It is not a module downloader for a GitHub-sideloaded APK. Do not remotely inject executable modules into the GitHub APK. Google Play’s [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en) also restricts downloading executable code outside Play, subject to its stated interpreter/VM distinctions. |
| General plugin system | **Android-limited** | **Architecture proposal only** | Prefer vetted, in-process capabilities shipped in the app, or Play-delivered modules where the app is actually distributed as an eligible AAB. A “plugin” label does not grant arbitrary code execution or Android API access. |
| General-purpose terminal and coding environment | **Research required** | **No implementation observed in main** | A userspace runtime is not a Linux host, root shell, or kernel-isolated container. Bound filesystem, process, CPU, memory, battery, and network access; do not promise arbitrary package installation or full builds on low-end phones. |
| Single-agent task workspace, permission broker, visible activity, cancellation, rollback | **Later feasible** | **Architecture proposal only** | Start with one task-scoped agent and a small stable tool contract. Require visible actions, least-privilege scopes, cancellable foreground work, preview/snapshot for mutations, and user approval for sensitive or external effects. |
| Memory, diagnostics, and device adaptation | **Later feasible** | **Architecture proposal only** | Keep task/session/workspace memory separate and user-resettable. Bound resource use; collect only needed device capability signals; redact logs and make diagnostic export opt-in. |
| Session recording and multi-agent coordination | **Deferred** | **No implementation observed in main** | Reconsider only after single-agent isolation, deletion, consent, audit redaction, and resource limits have been validated. Do not record screens by default. |
| Arbitrary Android app cloning/virtualized app containers | **Deferred** | **No implementation observed in main** | Do not promise unrestricted app cloning. If useful, research a narrower web-app or task-workspace alternative under Android and Play constraints. |

## Task evolution and near-term scope

Extend the task model through small, versioned, reversible migrations, preserving existing IDs, encrypted storage, backups, and undo behavior. Offline natural-language quick add is now implemented in the single-line capture path; see [`docs/NL_QUICK_ADD.md`](docs/NL_QUICK_ADD.md). The older ten-feature slate remains untracked in public `main`; share-in, research capture, and widgets are proposals, not in-flight work. Keep the simple add/edit/complete flow prominent, and make richer fields discoverable only when the user expands a task.

For every task-data migration, test old snapshot reading, interrupted writes, backup export/import, missing or invalid fields, undo/delete interactions, and recovery after process death. Avoid silently rewriting an 
existing task when a template changes, a recurrence advances, or a task is restored.

## Local-first data, security, and permissions

Keep task content in app-controlled storage and encrypted at rest. Android Keystore key material is designed to remain non-exportable; treat it as device-scoped rather than as a portable backup key. For device migration, use a separate authenticated encrypted export/recovery flow that can be decrypted with user-held recovery material and re-encrypted under the destination device’s key. Test missing-key, damaged-archive, interrupted-import, and duplicate-import cases. See Android’s [Keystore guidance](https://developer.android.com/privacy-and-security/keystore), [app-specific storage guidance](https://developer.android.com/training/data-storage/app-specific), and [backup security recommendations](https://developer.android.com/privacy-and-security/risks/backup-best-practices).

Use Android’s narrow system pickers/intents for user-selected files and calendar handoff. Keep app-private workspace files separate from task records and external documents. A permission broker should record the capability, purpose, requesting task/tool, granted scope, lifetime, revocation path, and data exposed. Explain permission requests in context and ask only when the user invokes a feature that needs them.

Do not seek root, hidden APIs, privilege escalation, permission bypasses, or an AccessibilityService as a general agent-control channel. Google Play’s [AccessibilityService policy](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en) prohibits autonomous initiation, planning, and execution through the Accessibility API outside its dedicated accessibility-tool exception. Use accessible controls in Daymark itself and explicit Android APIs/intents for allowed handoffs. Background work must respect Android process, Doze, and battery limits; no permanent invisible agent loop or broad battery-optimization exemption is part of the design.

## Reminder-specific Android constraints

Historical reminder implementation references (PR #17/#19 in the old PR #15 stack) are not current live-queue evidence. Recheck the current source and live PR/issue state before claiming reminder implementation. Any reminder design must disclose platform limits:

- Android 13 (API 33) and later requires the `POST_NOTIFICATIONS` runtime permission for ordinary notifications. Ask in context when the user creates a reminder; if permission is denied or later revoked, state that no notification can be shown. See [notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission).
- Prefer inexact alarms when exact timing is not essential. Exact scheduling is special access through `SCHEDULE_EXACT_ALARM` on relevant versions; request it only when the user explicitly chooses a precise reminder and explain that access can be denied/revoked. Do not assume `USE_EXACT_ALARM` is available to a general task app. See [exact-alarm access](https://developer.android.com/about/versions/14/changes/schedule-exact-alarms) and [alarm scheduling](https://developer.android.com/develop/background-work/services/alarms).
- Alarms do not survive shutdown by default. Persist reminder intent and, only while reminders exist, reconstruct eligible alarms after boot and on wall-clock/time-zone changes. Android documents `BOOT_COMPLETED`, `TIME_SET`, and `TIMEZONE_CHANGED` cases in its [broadcast guidance](https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions).
- Calendar-style reminders need a defined local-time and timezone policy. Daylight-saving transitions can make a local time nonexistent (a gap) or ambiguous (an overlap with two offsets); choose and test a clear policy rather than silently guessing. Relative timers should use elapsed-time semantics where appropriate. See the [Java `ZoneRules` reference](https://docs.oracle.com/javase/8/docs/api/java/time/zone/ZoneRules.html).
- Doze defers ordinary alarms and background activity; even allow-while-idle alarm calls are constrained. Inexact notification timing can be late, so never promise exact delivery on every device. See [Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby).

The PR #15/#17/#19 stack described in the original planning snapshot is historical, not the current open PR queue. Recheck the current issue tracker before planning reminder work. No reminder device/emulator acceptance is established by this plan.

## Browser, models, providers, and terms

Keep the merged WebView inside Daymark’s own controlled browser. The owner-approved durable policy allows deliberate HTTP and HTTPS browsing, labels HTTP as **Not encrypted**, keeps the updater and other app-owned network clients HTTPS-only, and forbids a JavaScript-to-native bridge for untrusted content, form automation, background page loads, or control of the user’s other browser. Fresh installs now start Online by default; each Go/search/site navigation still requires a tap, and a saved Offline choice fails closed until the user accepts **Enable Online**. The owner-approved 2026-11-06 change aligns source, manifest, and UI: cleartext is enabled, redirect downgrades follow mainstream-browser behavior, and HTTP pages are labelled **Not encrypted**. On-device HTTP loading and the visible label are not yet device-verified under issue #348, so do not claim device-verified HTTP support until those tests pass. Clearly distinguish “Daymark page/resource loads are blocked” from “the device makes no network requests.” Chromium’s [Android WebView Safe Browsing implementation note](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/android_webview/browser/safe_browsing/README.md) documents version-dependent checks: before WebView M126, V4 uses a periodically updated local blocklist and, on a local prefix match, requests matching full hashes; from M126, V5 real-time checks send a partial URL hash through a proxy, when that path is available and enabled. The full-URL real-time lookup mechanism is not currently supported in Android WebView. These checks are navigation-related; do not assume a URL blocked by Daymark’s Offline-mode policy necessarily triggers one. The live-check path depends on WebView version, device implementation, and user/system settings; it has not been measured for Daymark, so do not promise zero network traffic. WebView usage statistics and crash reports are separate: Android says diagnostics depend on user settings/consent and do not include URLs. See [WebView management](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview) and [WebView reporting privacy](https://developer.android.com/develop/ui/views/layout/webapps/webview-privacy). Keep Safe Browsing on by default unless a deliberate, user-visible choice and security review justify otherwise.

Browser history contains at most 50 validated HTTP/HTTPS origins in app-private preferences; it is not encrypted and does not retain page paths, queries, fragments, credentials, or titles. Clearing browser data clears Daymark’s history and WebView-managed site data, not other apps’ browser/autofill data or remote site/provider logs. A query or requested URL and ordinary connection metadata go to its selected destination; pages may contact their own or third-party endpoints.

A future Model Manager should show model identity, license, source, capabilities, context limits, download size, approximate storage/RAM demand, and removal/update controls before download. A provider adapter must show whether a request leaves the device, what content is sent, relevant provider terms/retention, and cost or rate limits before the user opts in. Never imply local and hosted models have identical privacy or costs; never fall back to a hosted provider without a separate user choice. Review third-party SDK terms, code, and license compatibility before adopting them.

## Agent workspace, approvals, audit, and recovery

Keep each workspace scoped to a task and expose a structured capability list rather than arbitrary device control. Every tool should have a typed contract, permission declaration, risk tier, resource/time limits, cancellation behavior, and bounded output. A model proposes tool calls; application code validates parameters and permission scope before execution.

Use proportionate approvals: local read/search can normally proceed within the task scope; creating or editing workspace files should be previewable and recoverable; deleting data, exporting/sharing it, accessing sensitive device resources, installing software, or causing an external/irreversible effect requires explicit approval at the point of action. Keep a visible activity timeline with the current action and target. Redact secrets and task text from diagnostic logs by default. Provide pause/cancel for long work and undo/snapshot/rollback for changes the app controls. Clearly state that rollback cannot undo an external effect already completed.

Use task, workspace, and session memory as separate stores with user-visible inspection, deletion, and reset. Recording should be opt-in, narrowly scoped, and redact sensitive content; defer it until retention and access controls are designed. Multi-agent coordination should wait until per-task capability grants and shared-workspace boundaries are tested.

## Release and verification gates

Separate these evidence levels in every release note and handoff:

1. Source inspection or source-contract tests.
2. Host/JDK tests.
3. Compile-only checks, with the exact API level and toolchain stated.
4. Gradle build/APK assembly and artifact/signature verification.
5. Emulator tests.
6. Real-device testing across relevant Android versions and at least representative vendor power-management behavior.

A passing source script is not a Gradle build; an API 35 build is not an API 36 build; neither proves device behavior. The repository does not track APK/AAB release binaries. Main Android CI runs automated checks and builds debug variants; the exact-tag production workflow builds, signs, and verifies the release APK/AAB before publication. Releases and assets are listed on the Releases page. No emulator or real device was tested during this audit.

Google Play's published guidance requires ordinary mobile new submissions and updates to target Android 16 / API 36 or higher from 2026-08-31, subject to exceptions. This is a **conditional Play-submission requirement**, not a blanket requirement for local review or GitHub sideloading. See [Google Play's target API requirement](https://developer.android.com/google/play/requirements/target-sdk). Current `main` uses API 36 with AGP 8.12.2 / Gradle 8.13; the toolchain and release-workflow SDK gates are merged. Neither a successful build nor targeting API 36 proves runtime/device behavior. Keep Android 16 device acceptance and exact signed-artifact verification before any Play submission.

Before any production release, verify signing/release provenance, backup restore and upgrade migration, permissions and revocation, file-provider recovery, offline behavior, low-storage/resource limits, accessibility, and device behavior. Keep debug artifacts clearly labeled and do not call a build production-ready without the relevant signing, release, and device evidence.

## Staged roadmap

1. **Protect the current core.** Reconcile README claims with current source and release artifacts; preserve task data, encryption, undo, backup, and the minimal UI. Recheck live issue/PR status before each implementation change.
2. **Verify merged network-facing features.** The updater and WebView from PRs #12/#13 are in `main`; confirm the fail-closed updater gate, signer configuration, HTTPS/network controls, Safe Browsing disclosures, history handling, and device behavior before enabling or promoting them. Issue #14 is closed, but real provider/process-death recovery still needs validation. Separately recheck reminder implementation and current issues against live `main`; do not infer current status from the historical PR #15/#19 stack. Keep suggestion navigation distinct from reminder work and require device evidence before describing reminders as reliable.
3. **Reconcile remaining capture/research proposals.** NL quick add is implemented on `main` via PR #292; do not duplicate it. Share-in, research-to-task, and widget ideas remain proposals until the owner adds them to the live queue with acceptance criteria. Keep each migration reversible and offline-first.
4. 
**Design the agent foundation.** Define the task-scoped workspace, capability schemas, permission broker, local audit trail, cancellation, and rollback before connecting a model.
5. **Research optional runtimes.** Evaluate model weights, browser, OCR/speech, user-space terminal, coding tools, and any plugin mechanism against device budgets, policy, license, and maintenance cost before committing to a delivery design.
6. **Defer high-risk breadth.** Do not start arbitrary app containers, unrestricted multi-agent control, persistent background autonomy, or screen recording until the narrower single-agent workspace is proven safe and useful.

## Deferred capabilities

Defer arbitrary Android app cloning, unrestricted cross-app automation, root-like control, remote executable plugin/module injection, silent model downloads, cloud fallback, background autonomous agents, default screen recording, and broad multi-agent access. These are not necessary to make the local task core useful and carry platform, privacy, resource, or maintenance costs that are not justified by the current evidence.

## AI handoff rules

A future contributor or AI agent should read [AGENTS.md](AGENTS.md), the [technology-agnostic engineering policy](docs/TECHNOLOGY_AGNOSTIC_ENGINEERING.md), and this plan and the [README](https://github.com/AbrarulHaque8541/daymark/blob/main/README.md), then recheck the live `main` SHA, relevant open issues/PRs, current source, and release artifacts before proposing work. Verify every assumption against the checked-out implementation; do not duplicate merged or in-flight work. Never expose secrets, private chat/audit history, personal emails, or unrelated local workspace details in public documentation.

Preserve user data and the minimal core; use small, reversible, modular changes with tests. Make a recoverable snapshot before risky mutations. Do not bypass Android security or claim an API/device test that was not performed on that API/device. Report source checks, host tests, API-level compile/build results, APK/release status, and device tests as separate 
evidence. Keep user approvals, permission scopes, provider/network choices, and cancellation explicit. Recheck exact branch and PR heads because public status may have changed since this draft was written.

---

## Plan expansion (master architecture addendum)

> Added 2026-10-08 (UTC) after re-audit against the master product vision. This part extends the plan above without replacing any of it. Sections map the vision's required topic list that the base plan did not yet cover in detail.

### Modular download-on-demand system

The base APK stays minimal; every capability beyond the core is an installable **module**. Nothing is bundled "just in case."

**Module manifest (signed index entry):**

```json
{
  "id": "lang.ur",
  "version": "1.0.0",
  "coreCompat": ">=2.0 <3",
  "type": "data",
  "sizeBytes": 4400000,
  "minRamMb": 0,
  "sha256": "…",
  "signature": "ed25519(daymark-release-key)",
  "license": "string-resources license",
  "deps": [],
  "uninstallable": true,
  "offlineCapable": true
}
```

**Lifecycle:** discover → verify signature + hash → compatibility check (RAM/storage/ABI/SDK) → explicit user consent (size shown) → resumable download → re-verify → install → update → rollback to previous version → uninstall. The previous version is kept until the new one verifies; removal never breaks the core app.

**Phase order:** data-only modules first (language packs such as Urdu/Hindi, model weights, prompt packs). Code-bearing modules (DexClassLoader) are RESEARCH REQUIRED and security-gated; no promise is made until a signed, sandboxed design is reviewed.

### Model Manager

A registry of open-source, redistributable model candidates with metadata: size, quantization, minimum RAM, context length, capabilities, license. The manager profiles the device (ActivityManager memory class, ABI, free storage, SDK level) and classifies it low/mid/high end, then **recommends** matching quantized models (for example 0.5B–1B q4 for low-end). It never downloads without explicit consent showing size and RAM cost. Lifecycle: download → verify → smoke-test prompt → activate/switch → update → remove. Low-end devices cap concurrent models at one.

### Standard tool interface and capability discovery

Every agent-facing tool exposes a predictable schema: `name, description, input_schema, output_schema, permissions, risk_level, timeout, cancellation, error_codes`. A small model learns WHAT a tool does and HOW to call it — never Android internals. `agent.capabilities()` returns a structured availability report (browser available, terminal installed, python not-installed, microphone denied) so quantized models can reason reliably. The Java implementation may change; this interface is the stability contract.

### Search provider abstraction

No hard-coded provider. A `SearchProvider` interface (query in, ranked structured results out) with user-selectable implementations. Feasibility: API-key providers are READY; scraping-based providers are ToS/fragility-limited and RESEARCH. Offline searches honestly report "network required."

### Risk levels and confirmation policy

- LOW (no prompt): read, search, analyze inside the workspace.
- MEDIUM (configurable): create/edit workspace files, download modules, modify workspace state.
- HIGH (always confirm): delete, install software, external messages, data sharing, sensitive resources, irreversible operations.

Users can configure policies per level; the Permission Broker enforces and audits every decision.

### Memory layers

Scoped and user-clearable: task memory, workspace memory, session memory, user-approved preferences, project memory, tool memory, model context. Agents read/write only within granted scope; each layer has explicit deletion controls. No ambient cross-scope access.

### Update channels

Separate channels for CORE APP, MODULES, MODELS, PLUGINS, TOOLS — each with version, integrity verification, compatibility check, rollback strategy, and update history. New capability never grows the base APK.

### Explicitly not feasible / deferred (unchanged)

- Arbitrary Android app cloning/containers: NOT FEASIBLE under modern Android security; PWAs and sandboxed web workspaces are the alternative.
- Full Linux terminal on low-end devices: DEFERRED pending a restricted-shell research spike.
- Python bundling (~30–60 MB): ANDROID-LIMITED, download-on-demand only if the module system proves code-module safety.

---

## Suggested features — proposal only (not accepted, not implemented)

> Added 2026-10-10 (UTC). These are **suggestions**, not queue items and not implementation claims. Each one needs an owner decision and an entry in the execution queue (with acceptance criteria) before any work starts. "Verified absent" means a grep of the current branch found no matching code; it is not a device or product-usage finding.

Assumed user profile: a developer who uses Daymark for personal task tracking alongside GitHub work, values speed and privacy, and wants capture without leaving the current app. Adjust this table once the owner states the real use case.

| # | Suggestion | Why it helps this profile | Current code (checked 2026-10-10) | Fit with plan |
|---|---|---|---|---|
| S1 | **Inbound share target**: "Share to Daymark" creates a task from shared text or URL | Capture a GitHub issue link or a snippet from any app in one step | **Verified absent**: no `ACTION_SEND` / share `intent-filter` in `AndroidManifest.xml`; only outbound browser-URL share exists | Fits the "quick capture" direction. Keep it local; prefill the title only, never auto-save |
| S2 | **Task link field** for an issue/PR/doc URL, HTTPS-only, with one-tap open in the in-app browser | Ties a task to its GitHub item without copy-paste | Not verified; existing `notes` field can hold a URL but has no link semantics | Must reuse HTTPS-only policy in `BrowserAddress`; migration needs old-snapshot and backup tests (plan §Task evolution) |
| S3 | **Home-screen widget** showing today's open tasks, with a quick-add button | Fastest daily check without opening the app | **Verified absent**: no `appwidget` declarations in the manifest | Needs a new receiver and must read the encrypted store safely. Consider after the P0 device matrix (#160), because a widget adds a new process-death/locked-device path |
| S4 | **Plain-text / Markdown export** (opt-in, user-chosen file) for personal notes or a git repo | Developers often want tasks in a diffable format | Not verified. Current portable backup is encrypted, which is correct for backups but not for reading | Must clearly warn that plaintext leaves encryption. Opt-in only; no automatic writes |
| S5 | **Keyboard and hardware-keyboard shortcuts** (new task, search, complete, next/previous task) | Power users on tablets or Bluetooth keyboards | Partially: keyboard-related code exists in Android sources, but a shortcut map was not verified | Folds into P2 #8 (command palette). Do not build a second command system |
| S6 | **Focus timer on a task** (local, no network, no notifications by default) | Time-boxing dev work | Not verified | Low risk. Must respect Doze and battery limits; any notification uses the existing reminder rules |
| S7 | **Diagnostics export for bug reports** (WebView version, last load error code, redacted URL) | Makes issue #221-style reports actionable | User-facing screen/export remains planned; privacy-safe lifecycle logs are in source | Already a proposal; logs do not provide an owner-visible export or prove the viewport renders |

**Already present in code, so not suggested as new work:** recurrence (`TaskLogic`, `Task`), subtasks (`Subtask.java`), notes, due time with reminder lead time (`Task.java`), task templates, encrypted backup and import, attachments with a CSV/Markdown/PDF MIME allow-list, Reader Mode, and dark theme. The plan's older text saying time-of-day and notes are absent is out of date for those fields. Update the capability table when the owner confirms them on a device.

**Recommended order if the owner approves:** S1 (small, offline, clear value) → S2 (needs a migration test) → S4 (privacy-sensitive, so design first) → S5 (after P2 #8 is designed) → S3 and S6 (after device evidence for #160). S7 remains a proposal for a user-facing diagnostics/export flow; privacy-safe lifecycle logs are already in source but do not fulfill that UI proposal.

**Decision needed from the owner:** (a) which of S1–S7 to queue; (b) the real day-to-day use case, so the profile above can be corrected.


---
Current-source refresh:
Work by: Cue
Model: not disclosed by runtime
Tooling: GitHub connector CLI, git, local source/workflow/documentation review
Timestamp (UTC): 2026-10-13T14:42:14Z


## Current-source refresh — 2026-11-09 (updates to the 2026-10-10 suggestion table)

The suggestion table above is historical as of 2026-10-10; these two entries are no longer “verified absent” or “not verified”:

- **S1 Inbound share target:** implemented and merged via PR #635. Shared text/URLs enter the task capture flow; line-ending normalization is covered by source/host tests. Physical share-sheet acceptance across third-party apps remains pending issue #160.
- **S6 Focus timer on a task:** the Focus Timer exists in current source. Its gesture/IME/instrumentation integration is under PR #648; API 29/API 36 emulator completion and physical acceptance are still pending. Do not describe the timer as device-verified.

Other suggestions remain proposals unless their acceptance criteria are added to the live execution queue. This refresh does not silently accept or implement S2/S3/S4/S5/S7.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode; live main/PR/issue/Actions/release/source inspection  
Timestamp (UTC): 2026-11-09T02:36:57.068Z


## Whole-project execution update — 2026-11-10T00:49:29.624Z

This is a current execution record, not a replacement for the architecture plan above.

- Current main: `1532838c78ab350b18f95e96a2c547ba384f0831`.
- Current integration branch `integration/webhook-recovery-safe-main-20261109`, code head `4a3306d6ba13a4193c19b5acdbb7f17c27b091a8`, 149 ahead / 0 behind main.
- Focus state/preset/recovery writes and Focus-category/Clear-All operations now share a Web Locks + generation contract. The destructive lock order is task → webhook delivery → webhook queue → Focus.
- Exact code-head checks: Android CI PASS; Ubuntu and Windows contracts PASS; device-test APK PASS; Node suite 820 total / 819 passed / 1 skipped / 0 failed. Release publication skipped; physical device not tested.
- No merge, release, tag, version, signing-key, application identity, or destructive migration changes.

### Next whole-project queue

1. #690 — define durable semantics after explicit Focus-backup clear; add suppression/rehydration tests and verify timer invalidation.
2. #683 — add import/save/clear/recovery/undo races across tabs; keep Web Locks fail-closed.
3. #613/#677 — fix API 36 Task Editor IME layout while retaining the strict Cancel interaction test.
4. #646/#160 — required CI/independent review governance and physical Android acceptance.
5. #671/#678 — complete secure download transport; redirect policy alone is not a downloader.
6. #665/#84, #659/#687, #656, #676 — independent security, extension recovery, import/export and injection reviews.
7. #685/#686 — Service Worker compatibility without weakening Offline enforcement.
8. #684/#476 — align recurrence validation and scheduling contracts across Android and web.

See [the latest dated engineering snapshot](docs/CURRENT_STATUS_20261110T004929Z.md) for exact PR heads, workflow run IDs, blockers and the complete 20-issue inventory.
