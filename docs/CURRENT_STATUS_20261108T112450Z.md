# Daymark whole-project engineering handoff — 2026-11-08T11:24:50Z

## Current main and completed integrations

- Repository: `AbrarulHaque8541/daymark`; default branch `main`.
- Current main SHA at snapshot time: `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`.
- PR #608 merged at `c702d73f7ef269cdb7f061256f3dbd27bacfece8`: note-link HTTP/HTTPS behavior aligned with browser policy.
- PR #606 merged at `78524e9f12824f580aec29a8ed1dd123c78bf46f`: reminder lead time is subtracted from the zone-resolved due instant across DST gaps/overlaps.
- PR #609 merged at current main `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`: cross-platform support matrix now states Android is the shipped app and distinguishes shared-core CI from actual desktop/platform support.

## PR #610 — fail closed on unsafe browser downloads

- PR: https://github.com/AbrarulHaque8541/daymark/pull/610
- Branch: `fix/browser-download-cookie-redirect-scope-20261108`.
- Code head at snapshot time: `313f4a3fd0b782c5e3419f6bfe44168877183a35`.
- Base/main: `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`.
- PR remains OPEN. Exact-head CI and independent security review are required before merge.

### Why the initial cookie-only mitigation was rejected

The first implementation removed Cookie forwarding but continued to enqueue URLs into Android DownloadManager. Further source inspection found that DownloadProvider persists the request URI in its database, not only the custom headers. Query-bearing signed URLs can therefore leave auth tokens persisted even when Cookie is omitted. A cookie-only fix did not satisfy Issue #348's "never log or persist auth tokens" requirement.

Current AOSP evidence:
- DownloadProvider stores the URI in `Downloads.Impl.COLUMN_URI`: https://android.googlesource.com/platform/packages/providers/DownloadProvider/+/refs/heads/main/src/com/android/providers/downloads/DownloadProvider.java
- DownloadThread follows redirects and re-applies stored request headers to each connection: https://android.googlesource.com/platform/packages/providers/DownloadProvider/+/refs/heads/main/src/com/android/providers/downloads/DownloadThread.java

### Final mitigation in PR #610

- Added pure-Java `BrowserDownloadFailClosedPolicy`: new browser downloads are denied in both Online and Offline modes while no redirect-validating app-owned transport exists.
- `MainActivity.queueBrowserDownload()` now validates HTTP/HTTPS input and displays a truthful policy message; it does not create `DownloadManager.Request`, enqueue a URL, read WebView cookies, or attach auth headers.
- Failed history rows no longer offer a retry that would create another unsafe request.
- The Downloads view still queries existing DownloadManager history; completed-file open and explicit active-download cancellation remain available.
- Media discovery no longer claims a download started and tells users that downloads are temporarily unavailable.
- The Offline message explicitly says enabling Online alone does not restore downloads.
- Added `BrowserDownloadFailClosedPolicySmoke` (7 assertions) and wired it into `run-core-tests.sh`.
- Updated browser-download source guards to require the fail-closed policy and reject new DownloadManager enqueue/request sinks.
- Removed the intermediate `BrowserDownloadRequestHeaders` helper/smoke from the final tree.
- Changed files: `MainActivity.java`, `BrowserDownloadFailClosedPolicy.java`, `BrowserDownloadFailClosedPolicySmoke.java`, `check-browser-downloads.py`, `check-browser-downloads-entry.py`, `run-core-tests.sh`.
- The earlier cookie-only implementation was not merged. The final PR diff is fail-closed.

### Validation and residual risk

- JDK 21 compile with `javac --release 17` and focused policy smoke: **PASS — 7 assertions**.
- Full repository `npm test` and `sh android-app/tools/check-v1-source.sh`: **NOT RUN locally**; exact-head GitHub Actions required.
- Exact-head Actions for this code head: fresh runs pending; do not reuse the failed intermediate header-policy run as validation.
- Physical DownloadManager/provider behavior: **NOT TESTED**.
- This blocks **new** downloads only. Existing requests queued by older app versions may still have URI/headers stored by Android DownloadProvider; Daymark does not cancel/delete them automatically. Existing provider history/open/cancel behavior remains.
- This is a temporary safety mitigation, **not** completion of Issue #348's redirect-aware downloader or SAF destination flow.

## Cross-agent integration

After PR #606 and PR #609 merged, open branches were synchronized to current main using non-force merge commits:
- PR #601 browser address security: `e4f5cf27c2af8319e8ee9ddc9e5293c3ffcd9c82` (exact-head CI in progress; independent security review required).
- PR #604 storage health: `0e2190e4bb796dfb971710d273db948a71c40053` (exact-head CI in progress; independent data-integrity review required).
- PR #607 world-clock storage: `0cdbe91be91156ea4b137630079924df1b75fb6d` (exact-head CI in progress; independent data-integrity review required).
- PR #610 download fail-closed: `313f4a3fd0b782c5e3419f6bfe44168877183a35` at snapshot time.

The shared `docs/AGENT_STATUS.md` index is actively owned by PR #604. This snapshot is added without editing that shared index; link it after #604 integrates.

## Ranked whole-project backlog

1. **P0 #160 — Physical Android/WebView acceptance:** **NOT TESTED**. Requires actual device model, Android API/build, WebView provider/version, build SHA, APK SHA-256 and scenario-by-scenario results.
2. **P1 #348 — Browser reliability:** implement redirect-validating app-owned download transport, cookie scoping per hop, SAF/media destination, and resume/cancel lifecycle; then validate forms, target=_blank, redirects, renderer recovery, keyboard/insets and accessibility. New downloads remain fail-closed until that transport is safe.
3. **P1 #601 — Browser address/legacy IPv4 security:** current-head CI and independent security review before merge.
4. **P1 #604 — Storage health:** current-head CI and independent data-integrity review; preserve unreadable-vs-absent semantics.
5. **P1 #607 — World-clock storage:** current-head CI and independent data-integrity review; verify failure recovery.
6. **P2 #325 — Cross-platform architecture:** evidence-based POC/compatibility matrix only; no speculative rewrite or unsupported desktop claims.

## Safety and attribution

No release/tag, version bump, signing change, application identity change, manifest permission, schema migration, destructive data operation, or device-install action was performed.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector, GitHub Actions, AOSP source inspection, JDK 21 container
Timestamp (UTC): 2026-11-08T11:24:50Z
