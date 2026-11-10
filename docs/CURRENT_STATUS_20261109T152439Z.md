# Daymark whole-project engineering status — 2026-11-09T15:24:39Z

## Repository baseline

- Default branch `main`: `59e6961c0645a423eb736d16d129eb0e9cc871f7`.
- Root `AGENTS.md`: `492ed21e2219a8d1b80c7d6e63575525c98a5a91`; technology-agnostic policy: `71282a4e0789d1180b18cb915f7ad5878829bdee`. Both read in full.
- Main Android CI #42619910395 and Ubuntu/Windows contracts #42619910295: **PASS**.
- Live inventory: **7 open PRs / 12 open issues**. All seven PRs are based on current main; zero commits behind.
- No independent approval is recorded for any open PR; requested-reviewer lists are empty. Reviews on #648/#656/#665 are COMMENTED only, not APPROVED.
- `main.protected=false`; rulesets `[]`; detailed branch-protection endpoint HTTP 403. No settings changed.
- Root AGENTS/Gradle specify the repository-approved package identity; the run-level safety directive specifies a different identity. No applicationId/namespace/manifest/signer change; explicit owner reconciliation remains required.
- v1.5 published (2026-10-23); v1.4 draft. No release/tag/version bump in this run.

## Exact open PR inventory

All bases are `main@59e6961c0645a423eb736d16d129eb0e9cc871f7`.

| PR | Exact head | Verified checks | Remaining gate |
|---|---|---|---|
| [#648 Focus instrumentation + fail-closed downloads](https://github.com/AbrarulHaque8541/daymark/pull/648) | `4e1199bcf4336144f04fe5c204a7aa08f2d173c9` | Android CI #42638970746, Focus lifecycle #42638970727, contracts #42638970829, Focus UI/Sound #42638970840, Live Update #42638970935, device acceptance #42638970744 and device APK #42638970792 **PASS**. API29 367 assertions; API36 **10/10 consecutive runs**, 370 assertions each. | Draft/unmerged; independent review and physical device acceptance pending. Downloads remain fail-closed; redirect-validating transport not implemented. |
| [#656 iCalendar/import-export integrity](https://github.com/AbrarulHaque8541/daymark/pull/656) | `abc85397ebf13375238e6004acd1bd6b6e38b8d8` | Android #42633721799, contracts #42633722495, device APK #42633721795 PASS; Node **687/687**. | Independent RFC5545/data-integrity review pending. |
| [#659 extension import/storage preservation](https://github.com/AbrarulHaque8541/daymark/pull/659) | `8c96abd770f679796a0ad9fc5e8f5c12cda9e4cd` | Android #42622038075, contracts #42622038055, device acceptance #42622038156, device APK #42622038116 PASS; Node **541/541**; ExtensionStore smoke 12 assertions; 16 guard mutations rejected. | Draft; independent extension-security review pending. |
| [#665 signing-secret isolation / Node24](https://github.com/AbrarulHaque8541/daymark/pull/665) | `d3cf902b36e47d1eca512df095fc883bbcd4ebbd` | Android #42622047147, contracts #42622047145, device APK #42622047583 PASS; tag-only release steps skipped. | Draft; independent security/provenance review pending. Trusted upstream SLSA v1.4.0 still embeds a Node20 artifact action. |
| [#675 webhook/storage/recovery integration](https://github.com/AbrarulHaque8541/daymark/pull/675) | `8fe4a143cfcae3ae546cc2bd337dcc9042296379` | Android CI #42643754741, contracts #42643754413, device-test APK #42643754424 **PASS**; underlying code/test head `9bda5bf` Node **728/728 PASS**; docs/plan-only head reran Android, contracts and APK PASS; release publication skipped. | Draft/unmerged; independent security/data-integrity review pending. |
| [#676 page-bound extension injection](https://github.com/AbrarulHaque8541/daymark/pull/676) | `59830d290f023c7b0b2cf2828a10de8bedaf195a` | Android #42637746064, contracts #42637746292, device acceptance #42637746399, device APK #42637746704 PASS; ExtensionInjectorSmoke **41 assertions PASS**. | Draft; independent extension-security review and physical browser acceptance pending. |
| [#677 reminder clock/timezone re-arming](https://github.com/AbrarulHaque8541/daymark/pull/677) | `925930b88649c25017c2cd8f00af72dbf090e6fa` | Android CI #42642913013 PASS (host reminder smoke/guards, Node, Gradle); contracts #42642913080 PASS; Live Update #42642912574 PASS; device acceptance #42642912754 PASS; device APK #42642912723 PASS (release skipped). Focus API29 PASS; Focus API36 FAIL at the existing horizontal-swipe assertion (210 assertions). | Draft; independent review and physical clock/timezone testing pending. This main-based branch lacks #648's root-to-screen correction. #648 passes API36 10/10; synchronize #677 with the reviewed/merged #648 fix and rerun. Do not weaken/retry away. |

## Open issues (12)

- #671 redirect-validating browser download transport.
- #646 main branch protection and independent review.
- #640 recovery backup availability.
- #639 webhook cross-tab queue consistency.
- #636 webhook endpoint secret privacy.
- #613 Focus Timer API36 instrumentation.
- #603 storage health/unknown-state handling.
- #476 Android/web recurrence and reminder parity.
- #348 browser/extension compatibility and performance.
- #325 cross-platform architecture.
- #160 physical Android acceptance.
- #84 GitHub Actions Node runtime and provenance.

## Recent merged mainline work

#674 touch-helper revert; #669 status/backlog pointer; #673 nightly placeholder path-safety; #672 VTODO false-positive guard; #657 terminal recurrence fire persistence; #670 accessible press feedback; #604 status-index history; #663 task editor/toast contract; #655 webhook automation card. Current main remains #674 merge SHA `59e6961`. No PR was merged by this run.

## Work delivered or advanced

### Focus instrumentation — #648
- Root cause: `getGlobalVisibleRect()` bounds are root-view-relative while `UiAutomation.injectInputEvent()` consumes screen coordinates.
- Instrumentation translates bounds by root-view `getLocationOnScreen()`, positions real controls inside the ScrollView, and guards scroll/coordinate ordering.
- API29 367 assertions PASS; API36 10/10 consecutive runs PASS, 370 assertions each. No assertion was weakened.

### Webhook/storage/recovery — #675
- Queue stores only SHA-256 fingerprint of normalized HTTPS endpoint; raw URL stays session-only.
- Delivery recomputes fingerprint and rejects endpoint mismatch/unassigned events before fetch; different tabs cannot deliver each other's events.
- Legacy assignment requires explicit confirmation; decline preserves exact bytes. WebCrypto unavailable fails closed with no queue persistence/network send.
- Storage clear preflights managed keys and refuses destructive clear on unreadable/unknown state. Task and Focus backups read independently; one unreadable sibling does not hide the other readable opaque backup.
- Task persistence occurs before webhook notification.
- Code/test head Node 728/728; current docs/plan head Android CI, contracts and device-test APK PASS.

### Extension injection/import — #676/#659
- Injection checks the finished page URL before queueing and again inside CSS/bootstrap and JS submission; JS-only userscripts get page-bound GM_addStyle bootstrap; 41 smoke assertions PASS.
- Existing packs >200 KB rejected rather than truncated; I/O errors never overwrite existing packs; imported extensions default disabled. Node 541/541, smoke 12, guard mutations 16 PASS.

### Import/export — #656
- RFC5545 repeated/escaped categories, VTODO completion pairing/UTC timestamp validation, seconds/timezone disclosure, and duplicate-key rejection for nested CSV JSON. Node 687/687 and Android/contracts/device APK PASS.

### Signing/CI — #665
- PR/debug builds receive no production signing secrets; signed release step tag-only with temporary-keystore cleanup; verified Node24 action pins. Android/contracts/device APK PASS; draft pending independent security/provenance review.

### Reminder system time — #677
- Main previously re-armed Android reminders only after boot/quick-boot, despite local due-time calculation using `ZoneId.systemDefault()`. PR adds `TIME_SET` and `TIMEZONE_CHANGED` to the existing non-exported receiver and reuses encrypted task read + idempotent `rescheduleAll()`.
- Adds pure policy smoke assertions, exact manifest/source guards and mutation tests. No permission, service, exact-alarm permission, background poller, storage change or migration.
- Docs distinguish Android inexact alarms from browser in-page checks (nominal 30 seconds, subject to hidden-tab throttling; no OS/background delivery after tab close).
- Android CI, contracts, device-test APK and device-acceptance artifact pass. API36 Focus fails only because this main-based branch does not yet include #648's tested instrumentation correction; API29 passes. Synchronize after #648 review/merge and rerun. No physical clock/timezone transition test yet.

## Prioritized backlog

1. **P0 — Independent review/integration:** #648 Focus coordinate correction; #675 webhook/storage/recovery; #665 signing-secret boundary; #656 import semantics; #659/#676 extension security; #677 reminder time-change re-arming. No merge without fresh independent approval and exact-head CI.
2. **P0 — Physical Android acceptance (#160):** real devices with model/API/WebView provider/version, APK SHA and evidence for browser, extensions, SAF, updates, reminders and downloads. CI/emulator artifacts are not physical acceptance.
3. **P0 — Browser downloads (#671/#648):** keep downloads blocked until a Daymark-owned redirect-by-redirect HTTPS transport validates downgrade/private addresses/host, same-origin cookies, no referrer/ambient credentials, bounded streaming, temp cleanup and cancellation/error behavior.
4. **P1 — Reminder delivery (#476/#677):** synchronize #677 with #648, rerun API36, then test actual clock/timezone transitions and reboot/Doze/OEM behavior on physical devices.
5. **P0 — Governance (#646):** owner-side PR-only protection, independent approval, required Android and Ubuntu/Windows checks, stale-review dismissal, resolved conversations, no force-push/deletion.
6. **P1 — Node24/provenance (#84):** preserve trusted SLSA identity; wait for upstream Node24-compatible reusable workflow or separately review provenance migration.
7. **P2 — Cross-platform/browser (#325/#348):** measured compatibility and performance.

## Safety and limitations

- No merge or force/protection bypass.
- No release/tag/version bump/signing-key/applicationId change, destructive migration or user-data operation.
- Physical Android/device/browser/timezone testing: **NOT TESTED**.
- Local Node/Gradle tests were not run; canonical GitHub Actions were used. Local clone was blocked by outbound DNS. JavaScript source syntax was parsed in the tool runtime.
- GitHub connector cannot set a separate commit author/committer identity; attribution is present in PR bodies/comments/commit messages.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; live repository/PR/issue inventory, source review, Actions/job-log inspection, Android official documentation  
**Timestamp (UTC):** 2026-11-09T15:24:39Z
