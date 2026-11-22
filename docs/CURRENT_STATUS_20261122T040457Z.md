# Daymark engineering status — 2026-11-22T04:04:57Z (PR #858 release-workflow credential isolation merged)

## Live repository state at snapshot time

| Item | Verified state |
|---|---|
| Current `main` | `0ccc592427b8dbd93e039250c21dee9c36b32238`, the squash merge of [PR #861](https://github.com/AbrarulHaque8541/daymark/pull/861). |
| Current-main Actions | [Cross-platform contract tests](https://github.com/AbrarulHaque8541/daymark/actions/runs/44983055792) and [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/44983055786) both **PASS** on exact SHA `0ccc592427b8dbd93e039250c21dee9c36b32238`. |
| PR #858 | [Merged](https://github.com/AbrarulHaque8541/daymark/pull/858) by squash. Base `a7b582efcbab89657ee4b2da76c564342b47d04f`; exact code head `bd6d56182c80a2d88027515fa013ce39613f98e7`; resulting commit `bbe8547b157416ece3f8bb4c0f764d02a464e612`. All 6 required PR checks passed on that exact head, and the post-merge [Cross-platform contract tests](https://github.com/AbrarulHaque8541/daymark/actions/runs/44982608495) and [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/44982608459) both passed on the exact squash commit. An independent review of the final code diff approved it with no findings. The PR description was refreshed with these results and fresh attribution. |
| PR #861 | [Merged](https://github.com/AbrarulHaque8541/daymark/pull/861) at `2026-11-22T03:59:44Z`; exact head `a7203c16549c1cfe0cd4878b570695fe1eef9472`; result `0ccc592427b8dbd93e039250c21dee9c36b32238`. Its web-only change preserves recurring tasks during **Complete visible**; cross-platform repeat semantics remain open in issue #684. |
| Open PR #859 | [fix(zones): recover after clearing corrupt cache](https://github.com/AbrarulHaque8541/daymark/pull/859), base `0ccc592427b8dbd93e039250c21dee9c36b32238`, head `87f10b9cd4ff2ba4759c1141d10db96549eff57f`, GitHub merge state `UNSTABLE`; at the latest check query, 3 checks passed and 3 were pending. No review decision was recorded. Not modified here. |
| Open PR #860 | [fix(web): reject duplicate JSON task backup keys](https://github.com/AbrarulHaque8541/daymark/pull/860), base `bbe8547b157416ece3f8bb4c0f764d02a464e612`, head `8bec8c41edb0485bd21533cbcc7f53c24de5460a`, GitHub merge state `CLEAN`; all 6 checks passed on that head. No review decision was recorded. Not modified here. |
| Latest published release | GitHub lists [Daymark v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5) as Latest. No release or tag was created in this cycle. |
| Source release identity | The source guard on PR #858's exact code head verified `versionName=1.6`, `versionCode=13`, and the existing signer pin. |
| Physical-device acceptance | **NOT TESTED**. The change in PR #858 is limited to release workflow authentication and contract tests. |

At the snapshot timestamp, the other open issues were: [#739](https://github.com/AbrarulHaque8541/daymark/issues/739) desktop download/redirect audit; [#731](https://github.com/AbrarulHaque8541/daymark/issues/731) air-quality privacy QA; [#717](https://github.com/AbrarulHaque8541/daymark/issues/717) browser download QA; [#702](https://github.com/AbrarulHaque8541/daymark/issues/702) extension metadata exposure; [#700](https://github.com/AbrarulHaque8541/daymark/issues/700) Telegram digest QA; [#690](https://github.com/AbrarulHaque8541/daymark/issues/690) Focus/storage lifecycle coordination; [#684](https://github.com/AbrarulHaque8541/daymark/issues/684) Android/web repeat-task semantics; [#680](https://github.com/AbrarulHaque8541/daymark/issues/680) extension matching on SPA navigation; [#671](https://github.com/AbrarulHaque8541/daymark/issues/671) redirect-validating download transport; [#646](https://github.com/AbrarulHaque8541/daymark/issues/646) main branch protection; [#613](https://github.com/AbrarulHaque8541/daymark/issues/613) API 36 Focus/editor emulator lifecycle; [#476](https://github.com/AbrarulHaque8541/daymark/issues/476) repeat scheduling and long-gap catch-up; [#348](https://github.com/AbrarulHaque8541/daymark/issues/348) browser UX; [#325](https://github.com/AbrarulHaque8541/daymark/issues/325) cross-platform architecture; and [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) current-main Android runtime acceptance.

## Work in this cycle

The selected, non-overlapping security improvement prevents the production and signed device-test release workflows from persisting checkout credentials into `.git/config`, where later repository-controlled build or test steps could access them. Checkout now uses `persist-credentials: false`. The main-ref verification fetch still authenticates through a token scoped to that one step and temporary process-only Git configuration; it does not store the credential in the repository configuration. This is separate from PR #840's immutable Action pins and issue #646's branch-protection governance.

The work was delivered in [PR #858](https://github.com/AbrarulHaque8541/daymark/pull/858), with contract tests for the checkout settings and step-scoped fetch authentication.

## Verification

| Check | Result |
|---|---|
| `npm ci --ignore-scripts --no-audit --no-fund --include=dev` | **PASS** |
| `node --test tests/release-action-runtime.test.js` | **PASS** — 14/14 |
| `bash scripts/validate-workflows.sh` | **PASS** — 20 workflow files, including `actionlint` and immutable-pin validation |
| `sh android-app/tools/check-v1-source.sh` | **PASS** |
| `npm test` | **PASS** — 1,749/1,749 |
| Process-only Git-config smoke, anonymous main-ref lookup, `git diff --check` | **PASS** |
| PR #858 exact-head checks | **PASS** — 6/6 on `bd6d56182c80a2d88027515fa013ce39613f98e7`; [run links and exact results](https://github.com/AbrarulHaque8541/daymark/pull/858). |
| Post-merge runs | **PASS** — [Cross-platform contract tests](https://github.com/AbrarulHaque8541/daymark/actions/runs/44982608495) and [Android CI](https://github.com/AbrarulHaque8541/daymark/actions/runs/44982608459) on exact `bbe8547b157416ece3f8bb4c0f764d02a464e612`. |
| Independent code review | **APPROVED** — final diff, no findings. |
| Physical device / System WebView runtime | **NOT TESTED**. |

A separate Focus lifecycle emulator-instrumentation attempt did not complete: one repeated run exited 23 and a later disposable-emulator app-data reset failed. It was not retried and is unrelated to the workflow-only change; issue #613 remains open. Do not treat this as a PR #858 result. No release was built, signed, or published.

---
Work by: Cue Agent (DayMark R&D)
Model: not disclosed by runtime
Tooling: GitHub connector CLI, git, Node.js `node:test`, workflow/`actionlint` validation, Android source guard, independent code-review agent
Timestamp (UTC): 2026-11-22T04:04:57Z
