# Daymark engineering status — 2026-11-21T04:17:48Z (R&D: DNR permission and post-merge refresh)

## Current repository state

| Item | Verified state |
|---|---|
| `main` at snapshot time | `b897234d4f7d8365765df8aa32b46a742aad44fd` |
| PR #842 — remove unused DNR feedback permission | Merged at 2026-11-21T04:09:46Z; reviewed head `920c312cab80f660d4e4993381104fb23fec5c6a`; merge commit `bd39d53b4c015d09c386ca15797b7494a8154ee0` |
| PR #839 — announce Connections filter results | Merged at 2026-11-21T04:11:12Z; head `095ef32d26585d2bd8caf8cad9bda8f96991aef7`; merge commit `ef140ef5a5925a3d80f500b41c1c9dc9a0c5b677` |
| PR #843 — command-palette accessibility status record | Merged at 2026-11-21T04:15:00Z; head `5e56fa5977e081ac29df9bfb8cb7aea8af412768`; merge commit/current `main` `b897234d4f7d8365765df8aa32b46a742aad44fd` |
| Open PRs | #832, #834, #840; current heads and blockers below |
| Physical-device / installed-Chrome acceptance | **NOT TESTED** |

The snapshot in PR #843 (`CURRENT_STATUS_20261121T040504Z.md`) was accurate for its creation time but predates the merges of #842 and #839. It is preserved as historical evidence, not rewritten; this follow-up snapshot records the later repository state.

## Completed improvement: remove an unused extension permission

The MV3 extension no longer requests `declarativeNetRequestFeedback`. It retains `storage` and `declarativeNetRequest`, so normal declarative request blocking remains intact. A regression test requires the retained permissions and guards against re-adding the unused feedback permission. Repository inspection found no runtime use of the debugging-only `getMatchedRules()` or `onRuleMatchedDebug` APIs.

Chrome documents that `declarativeNetRequestFeedback` is for debugging unpacked extensions, enables those debugging APIs, and can trigger the “Read your browsing history” warning. The permission is not required for normal DNR behavior. See [Chrome’s permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list), [DNR API reference](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), and [permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

## Verification

| Check | Result |
|---|---|
| Focused extension-network tests | **PASS** — 19/19 |
| Full `npm test` | **PASS** — 1,665/1,665 |
| `sh android-app/tools/check-v1-source.sh` | **PASS** |
| `git diff --check` | **PASS** |
| `npm ci --ignore-scripts --no-audit --no-fund --include=dev` | **PASS** |
| PR #842 exact-head checks | **PASS** — 6/6 on `920c312cab80f660d4e4993381104fb23fec5c6a` |
| Independent review of PR #842 exact head | **PASS** — no findings |
| Post-merge Android CI on `b897234d` | **PASS** — [run 44865157677](https://github.com/AbrarulHaque8541/daymark/actions/runs/44865157677) |
| Post-merge cross-platform contracts on `b897234d` | **PASS** — [run 44865157652](https://github.com/AbrarulHaque8541/daymark/actions/runs/44865157652) |
| Physical device, installed Chrome, and browser UI acceptance | **NOT TESTED** in this sandbox |

## Remaining unmerged work

| PR | Branch / exact head | Current state |
|---|---|---|
| #832 — browser error diagnostics and reduced-motion feedback | `feat/browser-feedback-privacy-20261120` / `b600d044113616eade65c466b761022529626081` | **UNSTABLE**; 13 checks pass, Focus runtime API 36 fails. Do not merge until the failure is resolved and exact-head checks pass. |
| #834 — browser home shell reference | `preview/clean-browser-shell` / `9ac6ef512ee2a31c2eed8ecbcdcc679b9b253855` | **CLEAN**; 5/5 checks pass. An earlier independent review note remains to reconcile implemented-versus-proposed documentation claims and the engine list before treating it as cleared. |
| #840 — pin external GitHub Actions to immutable SHAs | `security/pin-all-actions-20261121` / `7f9ace0a0ad22b4d89858932335b290066b68c3c` | **UNSTABLE**; 12 checks pass and 4 are still in progress (debug-variant build, Service Worker API 26/API 36, and Focus API 36). Do not merge while checks are pending. |

These three branches are the currently visible unmerged PR work. No failed or pending work was force-merged. The next refresh should re-check their exact heads and Actions before making any merge decision.

---
Work by: Cue agent
Model: not disclosed by runtime
Tooling: GitHub CLI, git, Node.js `node:test`, Android source-check script, independent read-only reviewers
Timestamp (UTC): 2026-11-21T04:17:48Z
