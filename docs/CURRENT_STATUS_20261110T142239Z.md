# Daymark whole-project engineering status — 2026-11-10T14:22:39Z

## Live repository baseline

- Repository: `AbrarulHaque8541/daymark`; default branch `main`; public and not archived.
- Current main SHA: `41fda91fbb15d2bf9634fd7576cf842fe9bdacbc`.
- Root `AGENTS.md` blob: `7747504267d7330a4a51bf04fde494dd750a6023`, read in full. Code search found no nested `AGENTS.md`; `GEMINI.md`/`CLAUDE.md` are root-policy entrypoints.
- Main status index on main still points to the older 05:15Z snapshot. The status branch #706 contains newer snapshots and index/plan updates.
- Live inventory: **8 open PRs / 25 open issues**.
- Main Android CI #42784930733, contracts #42784930716 and nightly audit #42807418062 were recorded PASS on main SHA 41fda91 in the latest mainline handoff.
- No independent APPROVED review was found across the eight open PRs.
- Branch protection was last recorded as `protected=false` and repository rulesets empty in the 13:53Z handoff. The current GitHub connector has no protection/ruleset read action; public REST page access was unavailable, so this setting was not independently reverified in this run.

## Open PR inventory

| PR | Head SHA at this snapshot | Base / divergence | Exact-head evidence | State / remaining work |
|---|---|---|---|---|
| #706 status/docs | `0e68b7f666f31e1db8a82bb7e84ce221dfc4ece7` (snapshot-creation head) | main `41fda91`; 25 ahead / 0 behind | Android CI #42832409710 PASS; contracts #42832409669 PASS; unsigned device validation #42832409762 PASS | Draft; this snapshot/index/plan branch is self-updating, so its later SHA/checks must be read from live PR metadata |
| #656 import/export/iCalendar | `a47ba7b4ad991071d2029d75b7c54fa02f9464fb` | main; 90 ahead / 0 behind | 7/7 workflows PASS, including API 29/36 Focus lifecycle | Draft; independent RFC 5545, category, timestamp and data-integrity review pending |
| #675 task/Focus/webhook/recovery integration | `a5ed596a9284b37ba12f22f8da2e5443d6a4148a` | main; 248 ahead / 0 behind | Focus UI #42833084428 PASS; contracts #42833084333 PASS; Live Update #42833084621 PASS; Android CI #42833084387 IN PROGRESS; Focus lifecycle #42833084500 IN PROGRESS; unsigned validation #42833084711 IN PROGRESS; device artifact #42833084931 PENDING | Draft; API 36 tap regression still unresolved; 65-file/248-commit integration requires independent review |
| #648 Focus/download branch | `239b180d398f50d5f06812e706220b5367e7afbd` | 202 ahead / 9 behind; diverged | No current-head workflow runs returned | Draft/non-mergeable; overlapping MainActivity/Focus/download history; do not bulk-merge |
| #708 bounded download body transfer | `2119020ad2c89644df94dfff7860c0afb17f7c90` | main; 8 ahead / 0 behind | 5/5 workflows PASS; browser job confirms 57 body-transfer assertions | Draft; isolated component, not a complete network/download implementation |
| #705 signing/provenance isolation | `d0312cb775828cea3375367801e2b009fc64fafb` | main; 21 ahead / 0 behind | 4/4 workflows PASS | Ready/open; owner must configure protected production-signing environment reviewer/ref controls |
| #676 extension SPA injection/privacy | `f6bf233f739e6c85661c0f0f6e32845af2c6cb67` | main; 51 ahead / 0 behind | 6/6 workflows PASS | Draft; actual System WebView SPA/OEM acceptance remains |
| #704 Service Worker fail-closed policy | `ed5496c905136f70bf354c982f7c3b8b0d0df09e` | main; 7 ahead / 0 behind | Previous handoff recorded 6/6 PASS; this run's exact-head workflow lookup returned no runs | Ready/open; keep Offline fail-closed; recheck exact runs and Online compatibility |

Note: PR #706 is the delivery branch containing this status snapshot. Its row records the exact head at snapshot creation; later snapshot/index/plan commits advance that branch. Always fetch the live PR for its latest SHA/checks.

## Focus API 36 root-cause refinement

The earlier #675 head `6fd9577df98d92603851ea695269c4e509c18e9b` produced:
- API 29: PASS.
- API 36: FAIL at assertion 215 on the real Stopwatch tap.
- The target was shown, enabled, clickable, attached and had a click listener, but the event trace showed ACTION_DOWN and ACTION_UP delivered to the parent ScrollView at scrollY=929, not to ModeSelector or the button.

This proves the ModeSelector's ACTION_DOWN policy cannot resolve a stream the parent already intercepts. The earlier change releasing parent interception on ACTION_DOWN remains, and the source guard passes, but it did not by itself fix the trace.

This run added a bounded test-only parent-scroll stabilization:
- `DaymarkPlatformInstrumentation.dispatchTap()` waits for three consecutive 50ms stable scrollY samples (maximum 2 seconds) before calculating tap coordinates.
- `scrollDescendantIntoScrollView()` uses the same bounded wait after programmatic centering.
- `check-focus-timer-ui.py` requires the wait to precede stable tap-bound calculation and verifies the bounded sample contract.
- No real tap/swipe/vertical-scroll assertion was removed or weakened; no MainActivity or production runtime behavior changed in this instrumentation step.

Commits:
- `923a28fa5c6da68bf51612d05c69453c060c90f7` — bounded parent-scroll settling in instrumentation.
- `a5ed596a9284b37ba12f22f8da2e5443d6a4148a` — source guard for the settling contract.

On exact head `a5ed596a`, Focus UI/Sound passes and contracts/Live Update were already reported PASS; Android CI and API 29/36 lifecycle are still running, device artifact pending. No current-head API 36 pass or 10-run stability gate is claimed.

## This run's other engineering delivery

### PR #708 — bounded download body transfer

Commits `6fe03296d9c50e94c181a5c54eefa9599651d84b` and `2119020ad2c89644df94dfff7860c0afb17f7c90`:
- Required a PublicationGate to atomically serialize final cancellation/Online check with staged publication.
- Added fatal Error cleanup while preserving the original error and attaching cleanup failures as suppressed.
- Added publication-boundary and fatal-cleanup regressions.
- Exact-head browser workflow #42830132038 reports 57 assertions PASS; Android CI #42830132067, contracts #42830131960, device artifact #42830132118 and unsigned validation #42830131865 all PASS.

This remains a body-transfer primitive. It does not implement DNS/address-pinned HTTP/TLS, manual redirect/cookie policy, MediaStore/SAF staging, or MainActivity/download-history integration. Do not re-enable downloads until the complete transport and fail-closed mainline gate are integrated.

## Current blockers and backlog

1. **P0 Focus (#613/#648/#675):** finish current API 29/36 run on #675 head a5ed; if parent-scroll settling does not resolve the tap, inspect ScrollView interception/drag state and hierarchy at ACTION_DOWN. Retain the 10-run API 36 acceptance requirement. Keep #648 unmerged until synchronized and independently validated.
2. **P0 downloads (#671/#648/#708):** isolate and land #648's fail-closed DownloadManager mitigation separately from its unrelated Focus history; then implement DNS-pinned HTTP/HTTPS, per-hop redirect validation, same-origin-only cookies, no ambient/referrer credentials, bounded body transfer, cancellation/timeouts, atomic MediaStore/SAF publication and UI/history integration.
3. **P0 storage (#683/#689/#690/#640/#603):** review #675 task-generation rollback, cross-tab task/import/recovery/undo races, Focus generation/write/clear coordination, webhook queue ordering and backup preservation. Preserve task → delivery → queue → Focus lock order.
4. **P0 governance/device (#646/#160):** owner-side required checks/independent review rules and physical Android/WebView/OEM/SAF acceptance remain outstanding.
5. **P1 import/export (#656/#707/#684/#476):** independently review RFC 5545, category preservation, strict timestamps and repeat semantics before merge.
6. **P1 signing (#705/#84):** configure and verify protected production-signing environment reviewer/ref restrictions; no signing secret/key was accessed or changed.
7. **P1 extensions/Service Worker (#676/#702/#680/#687/#704/#685):** actual WebView SPA route acceptance, malformed-pack SAF/export/remove acceptance and Online compatibility while preserving Offline fail-closed policy.
8. **P1 desktop (#696/#691):** package-lock generation is blocked here: container Git clone failed DNS resolution to github.com; Node/npm exist but npm registry access and cached Electron dependency graph do not. Do not handcraft a lockfile. Generate under Node 20 in a network-enabled environment, then verify npm ci on Ubuntu/Windows/macOS.
9. **P1/P2 (#700/#636/#639/#348/#325):** real Telegram CORS delivery, webhook secret privacy/cross-tab queue serialization, browser UX/performance and cross-platform architecture.

## Open issue inventory (25)

#671 secure download transport; #613 Focus API 36; #707 timestamp validation; #683 task cross-tab mutation; #696 desktop lockfile/npm ci; #687 extension recovery UI; #84 Actions runtime/provenance; #646 branch protection/review governance; #679 application identity reconciliation; #689 storage/webhook clear ordering; #690 Focus write/clear coordination; #685 Service Worker Offline; #702 extension metadata privacy; #636 webhook endpoint privacy; #700 Telegram browser/CORS acceptance; #684 repeat-task semantics; #680 extension SPA match/exclude behavior; #691 desktop download race; #640 recovery backup integrity; #160 physical Android/WebView/SAF acceptance; #603 unreadable-versus-absent storage; #639 cross-tab webhook queue; #476 repeat scheduling/catch-up parity; #348 browser UX; #325 cross-platform architecture.

## Identity, release and safety

- Current Gradle namespace/applicationId: `com.abrar.daymark`; versionName `1.6`, versionCode `13`. Root AGENTS agrees.
- The run-level safety directive requires a different package identifier. This conflicts with the live owner-approved AGENTS/Gradle identity. No applicationId/namespace/manifest or data migration was made; owner reconciliation remains tracked by #679.
- Release inventory was not re-queried in this run. No release/tag, version bump, signer/key/pin change, production signing or publishing action was performed.
- No destructive migration or user-data deletion was performed.
- No physical Android/OEM device or real browser/WebView download acceptance was performed.
- No PR was merged by this run; no independent approval was available.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub connector via Code Mode; live PR/issue/source/Actions inspection; exact job logs; container environment check; web time source  
Timestamp (UTC): 2026-11-10T14:22:39Z
