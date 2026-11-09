# Daymark whole-project engineering status — 2026-11-09T06:41:12.544Z

**Verified UTC:** 2026-11-09T06:41:12.544Z  
**Repository:** `AbrarulHaque8541/daymark`  
**Default branch:** `main`  
**Current main SHA:** `7e540c9b5d3a71372cca942af4c869cb3c1b808f`  
**Root AGENTS.md SHA:** `492ed21e2219a8d1b80c7d6e63575525c98a5a91`

## Current-main validation

- Android CI: **PASS** — [run #42563175421](https://github.com/AbrarulHaque8541/daymark/actions/runs/42563175421).
- Ubuntu + Windows shared contracts: **PASS** — [run #42563175429](https://github.com/AbrarulHaque8541/daymark/actions/runs/42563175429).
- These checks are tied to current main `7e540c9b5d3a71372cca942af4c869cb3c1b808f`.
- No physical-device acceptance is implied by CI or APK verification.

## Product, identity, and release state

- Gradle namespace/application ID in current source: `com.abrar.daymark`.
- Current version: `1.6`, versionCode `13`, minSdk `26`, targetSdk `36`.
- The run-level instruction specifies a different package identifier than root AGENTS.md and Gradle. No package/applicationId change was made. Resolve only through an explicit owner decision and migration/release plan.
- Latest published release: **v1.5**, published 2026-10-23.
- **v1.4** remains draft.
- No tag, release, version bump, signing-key change, destructive migration, or production publication occurred in this run.

## Open pull requests — exact base/head inventory

There are **19 open PRs**. #604, #627 and #656 now use the exact current-main base SHA; the other 16 branches are based on older main snapshots and require conflict-aware synchronization before integration.

| PR | Area | Base SHA | Head SHA | Current evidence / blocker |
|---|---|---|---|---|
| #643 | webhook/recovery/storage health | `843efe96a1edc0f3f0fa6fda48e2fca336fe5f14` | `2c0e5d577cf05c8fb153a908f2ec0fc634e35e8e` | 55 ahead / 5 behind; exact-head Android 614/614, contracts, device APK PASS; no independent approval |
| #627 | bounded RSS/Atom streaming | `7e540c9b5d3a71372cca942af4c869cb3c1b808f` | `01fd64ab18b077383b1166d72fa938fbb4c45267` | 7 ahead / 0 behind; Android, contracts, device APK PASS |
| #631 | desktop WebView security | `60713561597aa594661b7e497bb14d06a1028c68` | `f7d8fbc27da7c35070c71e208c3c58480569ae3b` | Android/contracts/device PASS; desktop Windows retry PASS after Electron download HTTP 504 |
| #604 | status index / historical snapshots | `7e540c9b5d3a71372cca942af4c869cb3c1b808f` | `9ac66b516e1f9bb980a54ab8f1b48f59a29b3071` | 19 ahead / 0 behind; docs-only tree diff; Android/contracts/device checks pending |
| #656 | RFC 5545 iCalendar import | `7e540c9b5d3a71372cca942af4c869cb3c1b808f` | `1d9f7b8576edd744f52009e2042f2a2e8d0bf507` | 10 ahead / 0 behind; Android 545/545, contracts, device APK PASS; draft |
| #652 | extension import trust/storage | `fbcf1253b18669d36d060b679e1821cf17a6f3a9` | `68fcbecef6c05c15bcac1191d58c111a6511c5de` | Android 541/541, ExtensionStore 12 assertions, 16 guard mutations, contracts, QA/device APK PASS; stale base |
| #650 | project plan refresh | `fbcf1253b18669d36d060b679e1821cf17a6f3a9` | `c407aab3874ea864d6694cb5c2bce2005ff8b7d2` | Android, contracts, device APK PASS; stale base |
| #637 | press feedback / accessibility | `60713561597aa594661b7e497bb14d06a1028c68` | `5f1a94d9d5d6b6de1ab43debd1486befc201e2bc` | mergeable=false; no exact-head workflow runs returned |
| #655 | webhook automation card / queue | `77c5c321469d5bcd13466eb8e22cddd7414ffa7c` | `75dc884615a7e138ec7f1405ad8d53d7756c1e35` | Android/contracts/device PASS; unsafe localStorage/lock/queue semantics; do not merge; superseded by #643 |
| #626 | extension network bounds | `60713561597aa594661b7e497bb14d06a1028c68` | `c05f3ccfecf8083474d7f1f104577ac75611428b` | Android/contracts/device PASS; stale base |
| #649 | bounded API streaming/data cards | `fbcf1253b18669d36d060b679e1821cf17a6f3a9` | `a80e24b157c5fff4a7414e351e6ae8533284545e` | Android/contracts/device PASS; stale base |
| #651 | Node 24 release workflow pins/signing isolation | `fbcf1253b18669d36d060b679e1821cf17a6f3a9` | `0c7d381adc089738e6fd9bbe60fa7e3192838300` | Android/contracts/device PASS; draft; independent security review pending |
| #645 | Gradle Node 24 / Focus lifecycle | `60713561597aa594661b7e497bb14d06a1028c68` | `0d673077f79903acda1c698c8bfcc53106b1934e` | API 36 Focus lifecycle FAIL; other listed checks PASS; stale base |
| #648 | Focus lifecycle / browser downloads | `fbcf1253b18669d36d060b679e1821cf17a6f3a9` | `007b755103cab21fe38241ad6877192184278716` | API 36 Focus gesture FAIL; other listed checks PASS; stale base |
| #638 | proxy storage cleanup / mapped loopback | `60713561597aa594661b7e497bb14d06a1028c68` | `028e591bc1308b45aa352970a4fc6710cbc01723` | Android/contracts/device PASS; stale base |
| #601 | bare IP / localhost navigation | `0b2a15f360fca0d45572dae2531931ed2042b760` | `1c65a67e4077fa6a38a914a34462d963fa93ddb6` | Android/contracts/device PASS; stale base |
| #607 | zones storage fail-closed | `0b2a15f360fca0d45572dae2531931ed2042b760` | `0f5219f492c3203a7250f3658b266c8e53637714` | Android/contracts/device PASS; stale base |
| #618 | data-card storage resilience | `f9e505604718beae5ef14e274fc96879e34fdfdb` | `8d8dc0dfe09f07c85a1034e78db8342f815f5d54` | mergeable=false; Android/contracts/device historical checks PASS |
| #617 | browser error-card boot resilience | `f9e505604718beae5ef14e274fc96879e34fdfdb` | `23db4a90acd3b14e82272da4ce4a3e1bc9c199f8` | Android/contracts/device PASS; stale base |

### Important exact-head workflows

- **#604** head `9ac66b516e1f9bb980a54ab8f1b48f59a29b3071`: documentation-only status-index refresh; Android, Ubuntu/Windows and device-test APK checks are running. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42574431637) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42574431648) · [device APK](https://github.com/AbrarulHaque8541/daymark/actions/runs/42574431488).
- **#627** head `01fd64ab18b077383b1166d72fa938fbb4c45267`: Android PASS, Ubuntu/Windows PASS, device-test APK build/verification PASS; release publication skipped. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573285488) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573285375) · [device APK](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573285384). Reader-acquisition and decoder-construction cleanup regressions are on this head.
- **#643** head `2c0e5d577cf05c8fb153a908f2ec0fc634e35e8e`: Android PASS, **614/614 Node tests**, Ubuntu/Windows PASS, device-test APK build/manifest/archive/signature verification PASS; release publication skipped. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573742463) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573742397) · [device APK](https://github.com/AbrarulHaque8541/daymark/actions/runs/42573742413). Branch remains 5 commits behind main and requires independent review.
- **#631** head `f7d8fbc27da7c35070c71e208c3c58480569ae3b`: desktop Windows retry PASS after Electron's installer returned HTTP 504; macOS/Ubuntu desktop tests, Android, contracts, and device APK checks PASS. [Desktop retry](https://github.com/AbrarulHaque8541/daymark/actions/runs/42572035384).
- **#656** head `1d9f7b8576edd744f52009e2042f2a2e8d0bf507`: Android 545/545, Ubuntu/Windows, and device APK checks PASS. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42571327666) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42571327606) · [device APK](https://github.com/AbrarulHaque8541/daymark/actions/runs/42571327576).
- **#652** head `68fcbecef6c05c15bcac1191d58c111a6511c5de`: Android 541/541, ExtensionStoreSmoke 12 assertions, 16 source-guard mutations rejected, Ubuntu/Windows and QA/device APK checks PASS. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42568569800) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42568569852) · [device APK](https://github.com/AbrarulHaque8541/daymark/actions/runs/42568569796).
- **#651** head `0c7d381adc089738e6fd9bbe60fa7e3192838300`: Android, Ubuntu/Windows and device-test workflows PASS. PR/debug builds no longer receive production signing secrets; draft and independent security review pending. [Android](https://github.com/AbrarulHaque8541/daymark/actions/runs/42557990963) · [contracts](https://github.com/AbrarulHaque8541/daymark/actions/runs/42557990964).
- **#649** head `a80e24b157c5fff4a7414e351e6ae8533284545e`: Android, Ubuntu/Windows and device-test workflows PASS. API requests omit credentials, suppress referrers, disable cache, and reject redirects.
- **#645/#648**: Focus API 36 emulator lifecycle/gesture checks still FAIL; API 29 checks pass. Do not weaken the ten-run gate or add blind retries.
- **#655**: historical CI is green, but the branch still has secret-persistence, non-atomic localStorage locking, remove-before-POST, and queue-loss risks. Use #643 as the canonical safe implementation; do not merge #655.
- **#604**: storage-health implementation was ported and extended into #643. This branch is being converted to a current-main-based status-index/documentation-only delivery.

## Open issues — 11

- #84 — GitHub Actions Node 20 deprecation migration
- #160 — physical Android runtime acceptance
- #325 — cross-platform architecture/compatibility
- #348 — browser UX, downloads, security, performance
- #476 — repeat/reminder parity; Doze/reboot/timezone acceptance pending
- #603 — storage health; implementation consolidated on #643
- #613 — Focus Timer API 36 gesture/IME stability
- #636 — webhook endpoint secret privacy; implementation on #643
- #639 — webhook cross-tab queue consistency
- #640 — independent recovery backup availability; tests on #643
- #646 — main branch protection and independent review

## Cross-project findings and priorities

1. **P0 — Webhook/recovery integration:** #643 is the canonical session-only secret, Web Locks, queue preservation, persist-before-notify, independent backup-read and storage-health implementation. Exact-head CI passes, but the branch is 5 commits behind main and has no independent approval. #655 is unsafe and must not be merged.
2. **P0 — Focus Timer:** API 36 intermittent horizontal swipe loss and keyboard-obscured Cancel remain. Vertical drag interception can also prevent the parent Tasks ScrollView from scrolling. Keep assertions intact; fix actual event/IME handling.
3. **P0 — Physical Android acceptance:** issue #160 remains NOT TESTED on a real device. Emulator/APK CI is not device acceptance.
4. **P1 — Feed/network boundary:** #627 is current-main based and exact-head green. It uses bounded streaming, fatal UTF-8, no unbounded text fallback, redirect rejection, credentials omission, no-referrer, and reader cleanup.
5. **P1 — Extension import/storage:** #652 protects existing extension files on oversized/read failures; sync with main and obtain independent security review.
6. **P1 — CI runtime:** #651 isolates production signing secrets and pins several release actions to Node 24; #645 still has Focus API 36 failure. Remaining Gradle/third-party SLSA Node 20 references require verified upstream migration.
7. **P1 — Status index and branch hygiene:** preserve historical snapshots; rebase old branches in conflict-aware batches. Do not treat old green checks as proof of current-main integration.
8. **P1 — Reminder acceptance:** recurrence source boundaries are covered, but AlarmManager, Doze, reboot, timezone and OEM delivery remain NOT TESTED.
9. **P1 — Governance:** main reports `protected=false`; rulesets endpoint returned an empty list; branch-protection details endpoint returned HTTP 403. No independent approval or requested reviewers were found on the 19 open PRs. Owner-side protection is required.

## Governance and review

- `main.protected`: false.
- Repository rulesets: empty list.
- Branch-protection details API: HTTP 403 (cannot independently inspect all settings).
- All 19 open PRs were inspected for exact base/head and reviews. No independent approval is recorded; requested reviewer lists are empty. Existing submitted reviews are COMMENTED by the repository-owner account.
- Do not merge solely because general CI is green. Require independent review and current-main exact-head checks for security, data, package, and release-sensitive work.

## What is not tested

- Physical Android phone/browser acceptance: **NOT TESTED**.
- Real Android notification delivery under Doze/reboot/timezone/OEM constraints: **NOT TESTED**.
- Physical desktop/WebView installation acceptance: **NOT TESTED**.
- Live external webhook endpoint delivery: **NOT TESTED**.
- Production release publication in this run: **NOT PERFORMED**.

## Work attribution

- **Work by:** ChatGPT (OpenAI).
- **Model:** GPT-6.
- **Tooling:** GitHub connector via Code Mode (repository/PR/issue/Actions/file/tree/blob/commit/ref APIs); V8 runtime for focused feed-reader harness.
- **Timestamp (UTC):** 2026-11-09T06:41:12.544Z
