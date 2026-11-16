# Daymark engineering status — 20261114T185706Z

## Android bookmark shortcuts and URI routing (branch `feat/android-bookmark-newtab-20261114`)

PR [#779](https://github.com/AbrarulHaque8541/daymark/pull/779) remains OPEN and unmerged. Its base is `83bc05f48030f351099f55e3f2ac012b36b94bcd`. The last verified remote head before this combined update was `508369987b46062948cd47ade77be0abcfbe3fea`; the post-update exact head must be read from the live PR after push. This work stays on the existing branch and PR.

The saved-bookmark shortcuts remain. URI routing is now implemented in the same branch: HTTP and HTTPS, including verified App Links, remain in Daymark and plain HTTP retains its “Not encrypted” warning. `javascript:` and `data:` stay in WebView. `file:` and `content:` remain disabled under the existing isolation, with a clear visible explanation on typed-address and in-page attempts; broad file/content access is not enabled. `mailto:`, `tel:`, `sms:`, `geo:`, and safe `intent:` links require explicit confirmation before Android handoff. Typed-address classification happens inside `navigateBrowserTo()` before app-initiated WebView loading, while separate host tests cover typed input and in-page callback paths. Intent URIs are parsed into a fresh `ACTION_VIEW`/`BROWSABLE` intent; embedded components, selectors, arbitrary extras and launch flags (including URI-grant flags) are rejected. The confirmation displays the sanitized destination and the Android-resolved handler when available; unsupported intent data receives visible feedback.

### Verification at the pre-update base and local candidate

- `sh android-app/tools/run-core-tests.sh` — PASS, including route classes, typed-vs-in-page handoff gates, and deterministic `component=` plus URI read/write-grant flag rejection cases.
- `sh android-app/tools/check-v1-source.sh` — PASS on the local candidate.
- `npm test` — PASS, 1,194 tests.
- `git diff --check` — PASS.
- Android Gradle Java compilation — NOT RUN: the Play compile task stops before compilation because this sandbox has no configured Android SDK (`ANDROID_HOME` or `sdk.dir`).
- Android WebView runtime/device behavior for these schemes — NOT TESTED: `adb` and an emulator/device are unavailable. No APK was built.

### Existing API 36 check blocker

On the old remote head `508369987b46062948cd47ade77be0abcfbe3fea`, the GitHub check set was 10/11 successful; [`Focus runtime API 36` job 132539756137](https://github.com/AbrarulHaque8541/daymark/actions/runs/43625325891/job/132539756137) failed. Watchdog’s read-only triage says API 29 passed and the API 36 failure occurred in the combined APK-install plus platform-instrumentation-runner step at `.github:700`; setup, checkout, JDK and KVM passed. The raw logs returned 403, so the failing phase, iteration and cause remain unknown. This does not establish a Focus regression, API 36 incompatibility or emulator flake. No Focus code or assertions were changed. The new exact PR head must have green checks or this failure must be triaged with evidence before merge; merge remains with Error Hunter.

### Next verification

After the single combined code/test/status push, re-check PR #779’s exact new head and its CI. If `Focus runtime API 36` still fails and the logs remain unavailable, keep the PR unmerged and report the cause as unknown rather than weakening tests or calling it flaky.

---
Work by: Cue
Model: not disclosed by runtime
Tooling: Git, GitHub REST read-only checks, OpenJDK 17 host tests, Python source guards, Node.js test suite, Gradle wrapper (Android SDK unavailable)
Timestamp (UTC): 2026-11-14T18:57:06Z
