# Daymark whole-project engineering snapshot — 2026-11-08T11:50:17.463Z

This is a new, live-verified repository handoff. It supersedes the 09:51Z snapshot in the status index. Current facts below are based on GitHub source, PR metadata, commit trees, and exact-head Actions as of the timestamp above.

## Repository baseline and durable constraints

- Repository: [AbrarulHaque8541/daymark](https://github.com/AbrarulHaque8541/daymark).
- Current `main`: `b1993efffc810750d5b2081a84ea08ac300cfa30` — squash merge of PR #612.
- Root `AGENTS.md` was read in full. The mainline status index previously pointed at 09:20Z; PR #604 carries the 09:51Z index update, and this snapshot updates it again.
- No application identity, version, signer, manifest permission, schema, or user-data migration was changed in this run.
- Branch protection/required-review settings were not re-queried in this run. No protection bypass or force update was used.
- No release/tag/publication action occurred.

## Work completed in this run

### PR #611 — Windows subprocess-backed Node test reliability — MERGED

- PR head before merge: `07cf31508b561361bf262d97811e6166642896dc`.
- Merge/main SHA: `0b2a15f360fca0d45572dae2531931ed2042b760`.
- Exact PR head checks: Android CI PASS; Ubuntu/Windows cross-platform contracts PASS; non-publishing Android acceptance artifact PASS; device-test APK/manifest workflow PASS.
- The squash-merge tree is byte-for-byte the same Git tree as the tested PR head.
- Change: serialize Node test files (`--test-concurrency=1`), use Windows `py -3`, invoke POSIX runner paths through Bash on Windows, and report spawn error/signal diagnostics with realistic timeouts. No production app code changed.

### PR #612 — Device capability task-capture input contract — MERGED

- PR head before merge: `67ad1f35b3ba0e200b5c4c8d5c4267baa8f9db04`.
- Merge/main SHA: `b1993efffc810750d5b2081a84ea08ac300cfa30`.
- Exact PR head checks: Android CI PASS; Ubuntu/Windows contracts PASS; non-publishing acceptance APK PASS; device-test APK/manifest workflow PASS.
- Merge tree is byte-for-byte identical to the tested PR head.
- Change: button-only displayless/ring profiles no longer advertise task capture without a way to enter a title; voice-only capture requires both voice input and explicitly declared Daymark voice-capture support. Java 17 and JavaScript use the same TSV contract and negative tests. This is a policy slice, not a shipped ring/watch/desktop app or support claim.

### PR #607 — World-clock storage fail-closed — implementation extended

- Current branch head before this snapshot commit: `87d39b3f02ca3391a6960287bab75a3af5ed0fae`; base at last sync `0b2a15f360fca0d45572dae2531931ed2042b760`. Main has since advanced to `b1993efffc810750d5b2081a84ea08ac300cfa30`, so the branch is one commit behind and must be synchronized before merge.
- Added a follow-up fix in `zones-ui.js`: persistence now requires both `getItem` and `setItem`; a partial Storage-like adapter cannot write when existing state cannot be read.
- Added `tests/zones-ui.test.js` setItem-only adapter regression: add/clear/refresh produce zero writes/removals and preserve the pre-existing cache.
- Commits: [a16b34e](https://github.com/AbrarulHaque8541/daymark/commit/a16b34e9293d68737c6630157c65a7c1e552b88a), [6772749](https://github.com/AbrarulHaque8541/daymark/commit/6772749eff2f687d6303dc6b789bea42c5c01a78), then main synchronization [87d39b3](https://github.com/AbrarulHaque8541/daymark/commit/87d39b3f02ca3391a6960287bab75a3af5ed0fae).
- Before main synchronization, exact head `6772749`: Android CI PASS, Ubuntu/Windows contracts PASS, device-test APK PASS. After sync, exact head `87d39b3`: cross-platform contracts PASS; Android CI and device-test APK were still IN PROGRESS at last poll.
- Data-storage independent review is still required. The authenticated PR-author identity cannot approve its own PR; a separate reviewer is needed.

## Current open PRs and exact-head state

All four branches below were synchronized with main `0b2a15f` using non-force merge commits. Main then advanced to `b1993efffc810750d5b2081a84ea08ac300cfa30` via PR #612, so these branches are currently one commit behind the new main and must be synchronized again before any merge.

### PR #601 — Browser bare IP/IPv6/localhost parsing

- Head: `2f83e348c2d2db74ec9c526ccd74a1e7743adc39`; base `0b2a15f360fca0d45572dae2531931ed2042b760`; 12 commits ahead / 0 behind that base.
- Current-head Android CI PASS and cross-platform contracts PASS; non-publishing acceptance artifact and device-test APK were IN PROGRESS at last poll.
- Changes reject WHATWG legacy IPv4 aliases (shortened, integer, octal, hex, leading-zero) before navigation and align Android/web IPv6 embedded-tail validation.
- Independent source review found no blocking parser defect in the reviewed diff. Approval is still pending; this authenticated identity cannot approve its own PR. Physical WebView navigation remains NOT TESTED.

### PR #604 — Storage health must distinguish unreadable from absent data

- Head: `71210ce6c54a06949195b8b809c0fe052261accc`; base `0b2a15f360fca0d45572dae2531931ed2042b760`; 14 ahead / 0 behind that base.
- Current-head Android CI PASS and cross-platform contracts PASS; device-test APK was IN PROGRESS at last poll.
- Changes distinguish absent data from unreadable keys, show unknown/partial UI states, and preserve keys whose pre-removal read fails.
- Independent source review found no blocking defect in the reviewed diff. Data-storage approval remains pending; a different reviewer is required.

### PR #607 — World-clock storage errors

- Head: `87d39b3f02ca3391a6960287bab75a3af5ed0fae`; base `0b2a15f360fca0d45572dae2531931ed2042b760`; 11 ahead / 0 behind that base.
- Current-head cross-platform contracts PASS; Android CI and device-test APK were IN PROGRESS at last poll.
- Includes the setItem-only unreadable-storage regression described above. Web-only storage change; physical Android test is NOT APPLICABLE.
- Independent data-storage approval remains pending.

### PR #610 — Fail closed on unsafe Android browser downloads

- Head: `c1baf9315b5bdcb17702cb199d05d61d256fc3db`; base `0b2a15f360fca0d45572dae2531931ed2042b760`; 12 ahead / 0 behind that base.
- Removes the new DownloadManager request/enqueue path until Daymark can validate each redirect and scope credentials to the current origin. Cookie extraction/header forwarding and failed-history retry are removed; provider history, completed-file opening and explicit cancellation remain. New browser downloads are intentionally unavailable and this is not completion of #348.
- On prior exact head `b71471f6`: Android CI, cross-platform contracts, acceptance APK, device-test APK, Focus UI and Focus Live Update PASS; API 29 Focus emulator PASS; API 36 Focus emulator failed twice in different phases (task-editor Cancel lookup, then rightward mode-selector swipe). [Issue #613](https://github.com/AbrarulHaque8541/daymark/issues/613) tracks the nondeterministic/API 36 instrumentation/product interaction without weakening assertions.
- New head `c1baf931`: Android CI, contracts, Focus emulator, Focus UI/Live and APK workflows were IN PROGRESS at last poll. Independent security approval is still required. Physical download/redirect behavior remains NOT TESTED.

## Issues and ranked repository-wide backlog

1. **P0 — [#160 physical Android/WebView acceptance](https://github.com/AbrarulHaque8541/daymark/issues/160): NOT TESTED.** Requires actual device/model, Android API, WebView provider/version, tested build SHA, APK SHA-256, scenario and result. CI emulator/APK build is not physical acceptance.
2. **P1 — [#348 browser reliability](https://github.com/AbrarulHaque8541/daymark/issues/348): OPEN.** Keep new downloads fail-closed until redirect-safe app-owned transport, credential scoping, SAF destination, cancellation/resume and failure handling are implemented. Continue redirects/cookies/site-data, renderer recovery, navigation/app links, keyboard/insets, TalkBack and measured performance.
3. **P1 — [#613 API 36 Focus emulator lifecycle stability](https://github.com/AbrarulHaque8541/daymark/issues/613): OPEN.** Capture event coordinates/view bounds/state and IME/window phase evidence; fix product behavior or deterministic test injection, without skipping assertions or blind retries. Physical device is separate.
4. **P1 — [#476 Android/web recurrence parity](https://github.com/AbrarulHaque8541/daymark/issues/476): OPEN.** PR #599 is merged; continue long-gap catch-up, monthly/yearly anchor, DST and real AlarmManager/notification delivery validation.
5. **P1 — [Storage health issue #603](https://github.com/AbrarulHaque8541/daymark/issues/603): OPEN.** PR #604 contains the main storage-health change; merge only after current-main synchronization, exact-head checks and independent data-storage review. PR #607 is a separate world-clock consumer fix.
6. **P2 — [#325 cross-platform architecture](https://github.com/AbrarulHaque8541/daymark/issues/325): OPEN.** PR #612's capability contract is merged. Continue evidence-based Linux/Windows/Android prototypes and benchmarks; do not claim ring/watch/HarmonyOS/desktop support from a policy fixture.

## Validation, blockers and safety

- Full local `npm test` and `sh android-app/tools/check-v1-source.sh` were NOT RUN in this connector runtime. Exact-head GitHub Actions results are listed above; newer branch heads must complete their own checks.
- Physical-device acceptance: **NOT TESTED**. No real Android device/WebView/DownloadManager/TalkBack/AlarmManager run was performed.
- Independent review remains outstanding for security and data-storage PRs (#601, #604, #607, #610); comments/audits by the PR-author identity do not satisfy independent approval.
- No release/tag/publication, version bump, signing/signer change, application identity change, manifest permission change, destructive migration, or user-data mutation was performed.
- Work continues beyond any individual PR or issue; the ranked backlog above is the durable handoff.
