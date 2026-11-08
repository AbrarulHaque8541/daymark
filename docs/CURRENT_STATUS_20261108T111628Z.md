# Daymark whole-project engineering handoff — 2026-11-08T11:16:28Z

## Live baseline and merged work

- Repository: `AbrarulHaque8541/daymark`; default branch `main`.
- Verified `main` SHA at snapshot time: `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`.
- PR #608 merged at `c702d73f7ef269cdb7f061256f3dbd27bacfece8`: note-link HTTP/HTTPS handling now matches the browser's explicit transport policy.
- PR #606 merged at `78524e9f12824f580aec29a8ed1dd123c78bf46f`: reminder lead is subtracted from the zone-resolved due instant, preserving elapsed minutes across DST gaps and overlaps.
- PR #609 merged at current main `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`: platform support matrix refreshed with a current-main baseline and explicit unsupported/experimental qualifications.
- No release, tag, version bump, signing change, manifest permission, schema migration, or destructive data operation was performed.

## New browser security work — PR #610

- PR: https://github.com/AbrarulHaque8541/daymark/pull/610
- Branch: `fix/browser-download-cookie-redirect-scope-20261108`.
- Exact branch head at snapshot time: `ec258397bf68e4aaa522ba09230fa7365cc76e65`.
- Base/main: `555ca0745a5a7ddf3ae443c64859fea9ee2a737a`.
- PR is OPEN and mergeable; independent security review and latest exact-head CI remain outstanding.

### Root cause

`MainActivity.queueBrowserDownload()` copied the WebView's `CookieManager.getCookie(url)` into `DownloadManager.Request.addRequestHeader("Cookie", ...)`. Current AOSP DownloadProvider `DownloadThread` manually follows redirects (current main source lines 430–503) and re-applies stored custom headers to each new connection (lines 472 and 847–855). A cross-origin redirect can therefore receive the originating site's session cookie.

Current AOSP evidence:
https://android.googlesource.com/platform/packages/providers/DownloadProvider/+/refs/heads/main/src/com/android/providers/downloads/DownloadThread.java

### Implementation and tests

- Added `BrowserDownloadRequestHeaders.java`: only a bounded (≤512 chars), trimmed, CR/LF-free User-Agent is allowed; no Cookie, Authorization, Referer or other origin-sensitive headers.
- Removed WebView cookie extraction and Cookie header forwarding from new DownloadManager requests.
- Kept public HTTP/HTTPS downloads enabled.
- Notification description and start toast disclose that site cookies are not shared; sign-in-protected downloads may fail until a redirect-validating app-owned transport is implemented.
- Added `BrowserDownloadRequestHeadersSmoke.java` and wired it into `run-core-tests.sh`.
- Added source guards for the actual DownloadManager queue path and its non-sensitive header allowlist.
- Changed files: `MainActivity.java`, `BrowserDownloadRequestHeaders.java`, `BrowserDownloadRequestHeadersSmoke.java`, `check-browser-downloads.py`, `check-browser-downloads-entry.py`, `run-core-tests.sh`.
- Code commit: `f331bd3d65329154f69c65e72278dc14cdd20dd9`; non-force main synchronization commits followed.

### Validation and residual risk

- JDK 21 compile with `javac --release 17` and focused header-policy smoke: **PASS**.
- On the pre-sync code head `bee4b89250b14d8da997118e9082a1f72cbdc281`: Android CI host regression, Node tests, cross-platform contracts, Focus UI/Sound and Focus Live Update passed; APK workflows were still running at the last poll.
- Current exact head `ec258397` received fresh Actions runs, but they were queued/in progress at snapshot time:
  - Android CI: run 42474957501
  - Cross-platform contracts: run 42474957503
  - Device-test APK: run 42474957495
  - Non-publishing device QA artifact: run 42474957455
  - Focus UI/Sound: run 42474957465
  - Focus Live Update: run 42474957538
  - Focus emulator lifecycle: run 42474957500
- Full repository `npm test` and `sh android-app/tools/check-v1-source.sh`: **NOT RUN locally** (no repository checkout in this runtime).
- Physical redirect/cookie behavior: **NOT TESTED**.
- This change applies to new requests only. Existing downloads already queued by older versions may still have stored headers; Daymark does not cancel or delete those downloads automatically.
- This is a credential-containment mitigation, **not** completion of Issue #348's redirect/SAF download journey.

## Cross-agent integration and active PRs

After #606 and #609 merged, the following open branches were synchronized to current main using non-force merge commits; exact-head CI was triggered again:

- PR #601 — browser address/legacy IPv4 validation: head `e4f5cf27c2af8319e8ee9ddc9e5293c3ffcd9c82`; security review required; exact-head CI in progress.
- PR #604 — storage health/unreadable-state handling: head `0e2190e4bb796dfb971710d273db948a71c40053`; independent data-integrity review required; exact-head CI in progress.
- PR #607 — world-clock storage failure recovery: head `0cdbe91be91156ea4b137630079924df1b75fb6d`; independent data-integrity review required; exact-head CI in progress.
- PR #610 — download header privacy: head `ec258397bf68e4aaa522ba09230fa7365cc76e65`; independent security review required; exact-head CI in progress.

The shared `docs/AGENT_STATUS.md` index is actively changed by PR #604. This snapshot is therefore added without editing that shared index; link it from the index after #604 integrates. Historical snapshots are not rewritten.

## Prioritized whole-project backlog

1. **P0 — Issue #160: physical Android/WebView acceptance.** Still **NOT TESTED**. A real device owner/tester must record model, Android API/build, WebView provider/version, exact build SHA, APK SHA-256 and scenario-by-scenario results.
2. **P1 — Issue #348: browser reliability.** Finish safe redirect-aware downloads, SAF/storage destination behavior, login/forms, target=_blank, navigation/history, renderer recovery, keyboard/insets and accessibility. PR #610 only removes cross-origin session-cookie replay; authenticated download support remains incomplete.
3. **P1 — PR #601: browser address validation.** Complete current-head CI and obtain an independent security review before merge.
4. **P1 — PR #604: storage health.** Complete current-head CI and independent data-integrity review; preserve unreadable-vs-absent distinction.
5. **P1 — PR #607: world-clock storage.** Complete current-head CI and independent data-integrity review; verify failure recovery and persistence semantics.
6. **P2 — Issue #325: cross-platform architecture.** Continue evidence-based POC/compatibility work; do not claim desktop or HarmonyOS app support from shared-core CI alone.

## Safety and attribution

No releases/tags, version changes, signer or signing-secret changes, application identity changes, manifest permission changes, destructive migration, or user-data deletion were performed.

Work by: ChatGPT (OpenAI)
Model: GPT-6
Tooling: GitHub connector, GitHub Actions, AOSP source inspection, JDK 21 container
Timestamp (UTC): 2026-11-08T11:16:28Z
