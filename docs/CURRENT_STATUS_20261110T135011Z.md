# Daymark whole-project engineering snapshot — 2026-11-10T13:50:11Z

Live repository evidence, revalidated on the exact objects below. Durable policy remains in [AGENTS.md](../AGENTS.md); this dated snapshot is not a permanent policy rewrite.

## Baseline
- Default branch `main`, exact SHA `41fda91fbb15d2bf9634fd7576cf842fe9bdacbc`.
- Root `AGENTS.md` blob `7747504267d7330a4a51bf04fde494dd750a6023`; no nested `AGENTS.md` found.
- Inventory: **8 open PRs / 25 open issues**.
- Main Android CI [#42784930733](https://github.com/AbrarulHaque8541/daymark/actions/runs/42784930733), contracts [#42784930716](https://github.com/AbrarulHaque8541/daymark/actions/runs/42784930716), nightly audit [#42807418062](https://github.com/AbrarulHaque8541/daymark/actions/runs/42807418062): all PASS on main.
- Main `protected=false`; repository rulesets `[]`. No independent APPROVED review found across the eight open PRs.

## Open PRs and exact integration state

| PR | Base | Head | Ahead / behind | Files / commits | Exact-head status |
|---|---|---|---:|---:|---|
| [#656 import/export + iCalendar](https://github.com/AbrarulHaque8541/daymark/pull/656) | `41fda91f` | `a47ba7b4ad991071d2029d75b7c54fa02f9464fb` | 90 / 0 | 29 / 90 | **7/7 PASS** |
| [#675 storage/recovery/webhook](https://github.com/AbrarulHaque8541/daymark/pull/675) | `41fda91f` | `6b0c3eeb41871fb95741771ee33fdb3199fdb778` | 239 / 0 | 65 / 239 | 6/7 PASS; API 36 lifecycle failed twice |
| [#706 status/docs](https://github.com/AbrarulHaque8541/daymark/pull/706) | `41fda91f` | `49641e401620fc89d7c12730752168f4bec79268` | 12 / 0 | 20 / 12 | previous exact head 3/3 PASS; new snapshot needs fresh checks |
| [#708 bounded download body](https://github.com/AbrarulHaque8541/daymark/pull/708) | `41fda91f` | `932c7aae760e6d1989caa16348bb08ed52cd2029` | 6 / 0 | 4 / 6 | **5/5 PASS** |
| [#648 Focus/download integration](https://github.com/AbrarulHaque8541/daymark/pull/648) | `469b29edea69` | `239b180d398f50d5f06812e706220b5367e7afbd` | 202 / 9 | 32 / 217 | mergeable=false; no current-head workflow runs |
| [#705 signing/provenance](https://github.com/AbrarulHaque8541/daymark/pull/705) | `41fda91f` | `d0312cb775828cea3375367801e2b009fc64fafb` | 21 / 0 | 7 / 21 | **4/4 PASS** |
| [#676 extension SPA privacy](https://github.com/AbrarulHaque8541/daymark/pull/676) | `41fda91f` | `f6bf233f739e6c85661c0f0f6e32845af2c6cb67` | 51 / 0 | 16 / 51 | **6/6 PASS** |
| [#704 Service Worker fail-closed](https://github.com/AbrarulHaque8541/daymark/pull/704) | `41fda91f` | `ed5496c905136f70bf354c982f7c3b8b0d0df09e` | 7 / 0 | 4 / 7 | **6/6 PASS** |

### #656 — all seven workflows PASS on `a47ba7b4`
- [Android CI #42826385738](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385738): Node **849/849**, Gradle BUILD SUCCESSFUL.
- [Contracts #42826385710](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385710): PASS.
- [Focus UI/Sound #42826386033](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826386033): PASS.
- [Focus Live Update #42826385863](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385863): PASS.
- [Focus lifecycle #42826385911](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385911): API 29 **372 assertions**, API 36 **375 assertions**, both PASS.
- [Device artifact #42826385780](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385780): PASS.
- [Unsigned device validation #42826385881](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826385881): PASS.

### #675 — six workflows PASS, API 36 lifecycle failed on `6b0c3eeb`
- [Android CI #42826375233](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375233): Node **949/949**, Gradle BUILD SUCCESSFUL.
- [Contracts #42826375326](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375326): PASS.
- [Focus UI/Sound #42826375260](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375260): PASS.
- [Focus Live Update #42826375340](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375340): PASS.
- [Device artifact #42826375481](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375481): PASS.
- [Unsigned device validation #42826375296](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375296): PASS.
- [Focus lifecycle #42826375287](https://github.com/AbrarulHaque8541/daymark/actions/runs/42826375287): API 29 PASS; API 36 failed on both original attempt and one retry. Failure: real Stopwatch tap; target reports visible/enabled/clickable/attached bounds [121,822][540,948], but the event path reaches TaskFocusTimerPanel/LinearLayout/FrameLayout/ScrollView and not the ModeSelector/button. No UI code or assertion was weakened.

#656 passes the same API 36 lifecycle with 375 assertions. Its MainActivity and instrumentation blobs match #675; TaskFocusTimerPanel differs only in comments. The discrepancy is unexplained and needs hit-path/scroll-state diagnostics, not speculative code changes.

### Other open PR evidence
- #708: [host tests #42818129827](https://github.com/AbrarulHaque8541/daymark/actions/runs/42818129827), [Android #42818128003](https://github.com/AbrarulHaque8541/daymark/actions/runs/42818128003), [contracts #42818128023](https://github.com/AbrarulHaque8541/daymark/actions/runs/42818128023), [device artifact #42818128025](https://github.com/AbrarulHaque8541/daymark/actions/runs/42818128025), [unsigned validation #42818128009](https://github.com/AbrarulHaque8541/daymark/actions/runs/42818128009): **5/5 PASS**; body-transfer smoke 53 assertions. No DNS-pinned transport or Android Downloads/SAF publication yet.
- #705: [Android #42813190800](https://github.com/AbrarulHaque8541/daymark/actions/runs/42813190800), [contracts #42813190866](https://github.com/AbrarulHaque8541/daymark/actions/runs/42813190866), [device artifact #42813190829](https://github.com/AbrarulHaque8541/daymark/actions/runs/42813190829), [unsigned validation #42813190908](https://github.com/AbrarulHaque8541/daymark/actions/runs/42813190908): **4/4 PASS**. Protected environment references exist in source; owner-side reviewer/ref protection is not verified.
- #706 previous head: [Android #42814256787](https://github.com/AbrarulHaque8541/daymark/actions/runs/42814256787), [contracts #42814256826](https://github.com/AbrarulHaque8541/daymark/actions/runs/42814256826), [unsigned validation #42814256966](https://github.com/AbrarulHaque8541/daymark/actions/runs/42814256966): **3/3 PASS**.
- #676: [Android #42797638699](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638699), [contracts #42797638384](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638384), [device artifact #42797638395](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638395), [device validation #42797638427](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638427), [SW policy #42797638563](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638563), [SW runtime #42797638725](https://github.com/AbrarulHaque8541/daymark/actions/runs/42797638725): **6/6 PASS**.
- #704: [Android #42792286610](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286610), [contracts #42792286541](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286541), [device artifact #42792286538](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286538), [device validation #42792286733](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286733), [SW policy #42792286533](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286533), [SW runtime #42792286726](https://github.com/AbrarulHaque8541/daymark/actions/runs/42792286726): **6/6 PASS**.

## Work delivered in this run

### Shared Instant offset-second parity (committed to #675 and #656, not main)
- Web `task-logic.js` and Android `TaskLogic.java` accept optional `±HH:MM:SS`.
- Both reject offset seconds above 59 and offsets outside ±18:00:00.
- Web instant ordering includes offset seconds.
- Shared TSV fixture: **43 data rows**, exactly two columns; Node and Android smoke tests consume it.
- Comparator regressions cover +01:30:15, -00:00:30 and +18:00:00 equivalence.
- #675 implementation `e65def382f9e547d93c7f0b104d3bbaf50062fe9`; fixture correction `6b0c3eeb41871fb95741771ee33fdb3199fdb778`.
- #656 implementation `ef7fb78f33422ae794d424ebcc7679cb423cde2b`; fixture correction `a47ba7b4ad991071d2029d75b7c54fa02f9464fb`.
- #675 recovery-test boundary fix `d4f4d9c375883cc116afd5728d7ec59ab4b628c3` recognizes synchronous/asynchronous `persistFocusState`.

### Task-generation fence on #675
- `commitTaskSnapshot()` compares caller-captured generation inside the task lock and rejects stale callers as `stale-generation`.
- Normal writes and async import/recovery capture generation before delayed work.
- Tasks/task-backup clear and Clear All increment generation under task → webhook delivery → queue → Focus lock order.
- Tests cover queued stale write after Clear All, stale recovery import, and generation-fenced clear.
- Current #675 branch preserves the Telegram card and Telegram scripts; older comments alleging absence are superseded by current-tree comparison.

## Recent merged mainline work

#659 extension import opt-in/recovery; #686 Service Worker fail-closed; #692 desktop safe download names; #682 clear-action lifecycle; #678 redirect policy; #677 reminder rescheduling; #665 signing-secret isolation; #694 AST-aware Node test guard; #703 Telegram delivery confirmation; #698 Telegram token redaction/browser fetch isolation. No merge was performed by this run.

## Open issues — 25

#707 Instant parity; #613 API 36 Focus/Task Editor instrumentation; #683 cross-tab task lost updates; #671 Android download transport; #687 malformed extension recovery; #84 Actions version warnings; #646 main required CI/reviews; #679 package identity; #689 webhook queue/clear serialization; #690 Focus write/clear; #685 Service Worker Offline; #702 extension metadata privacy; #636 webhook URL privacy; #700 Telegram browser/CORS acceptance; #684 repeat completion parity; #680 SPA match/exclude; #691 desktop download confinement; #696 Electron lockfile/npm ci; #640 backup recovery; #160 physical Android/WebView matrix; #603 storage-health semantics; #639 cross-tab webhook queue; #476 repeat scheduling; #348 browser UX; #325 cross-platform architecture.

## Release, identity, governance and device safety

- Live Gradle: namespace/applicationId `com.abrar.daymark`, versionName `1.6`, versionCode `13`.
- Releases: v1.5 published 2026-10-23; v1.4 draft. No release/tag/version change.
- Root AGENTS says `com.abrar.daymark` is owner-approved; run-level safety says `com.cue.daymark`. Issue #679 tracks the conflict. No applicationId/namespace change or data migration.
- Main `protected=false`; rulesets empty; required checks and independent-review enforcement absent. No settings changed.
- Physical Android/OEM/WebView tests: **NOT TESTED**.
- No production signing, secret access, signer change, destructive migration, force push/merge or release publication.

## Prioritized next work

1. Resolve #675 API 36 tap discrepancy with targeted hit-path/scroll-state diagnostics; no speculative UI change or assertion weakening.
2. Obtain independent data/security review of #675's 65-file/239-commit stack and #656's RFC 5545/import integrity; both remain draft.
3. Keep #707 open until the 43-case contract reaches main through reviewed integration and post-merge CI.
4. Continue #708 with DNS-pinned socket/TLS verification, bounded HTTP parsing/manual redirects, cancellation/Offline close and atomic Downloads/SAF publication; keep downloads fail-closed.
5. Resolve #648 divergence and Focus API 36 work on one canonical branch.
6. Complete task/Focus/webhook cross-tab write/clear and backup integrity (#683/#689/#690/#640/#603).
7. Configure main protection and production-signing environment only with explicit owner/admin approval.
8. Complete physical Android/WebView/OEM acceptance (#160), extension/Telegram/recurrence/desktop compatibility.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode; live inventory; exact-head Actions/job logs; source/test/branch review  
Timestamp (UTC): 2026-11-10T13:50:11Z
