# Daymark multi-device architecture and support matrix

**Status:** Architecture proposal with one CI-tested Java 17 capability-policy slice and a separate experimental Electron desktop-browser prototype; no non-Android full Daymark task-workspace app is shipped. This document is not a compatibility claim.
**Baseline inspected:** `main` at `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`.
**Owner direction:** Make Daymark useful across device classes and operating systems, including constrained and display-less companions, while preserving the current Android product.
**Last updated:** 2026-11-10T04:04:26.726Z

## 1. Product principle

Daymark is one product with a shared, versioned domain contract and multiple capability-adaptive experiences. It is not one oversized binary that must run unchanged on every device.

The smallest target is a low-power companion with no screen, or only a few LEDs and a haptic actuator. It must not be expected to host the full task editor, browser, database, or general-purpose UI. Its useful surface is a few reliable commands and acknowledgements, with richer workflows delegated to a paired phone or desktop.

The full product should adapt to:
- available display area and input methods;
- CPU, RAM, storage, network and battery budgets;
- OS lifecycle/background execution rules;
- hardware capabilities and vendor APIs;
- accessibility needs, locale, text direction and reduced-motion settings.

## 2. Current baseline (verified source, not device qualification)

| Area | Current source state |
|---|---|
| Android app | Native Java Activity + Android System WebView; task-linked focus timer and notifications are now on main after PR #382 |
| Android identity | applicationId and namespace `com.abrar.daymark` — immutable without owner approval |
| Android range | minSdk 26 (Android 8.0+), targetSdk 36 in inspected source |
| Storage | Local encrypted task/attachment stores and encrypted portable backup; no account or mandatory cloud sync |
| Browser | Android System WebView adapter with explicit network consent and platform-specific policy; not a universal browser engine |
| Desktop browser | Separate Electron/Chromium prototype under `apps/desktop`; experimental, not the Android app or a full task workspace |
| UI | Programmatic native Android views; no shared cross-platform UI module in current baseline |
| Other OS/device apps | No non-Android full Daymark task workspace is shipped; see the separate desktop-browser rows below |

Source inspection does not prove current APK publication, physical-device compatibility, or release readiness. Preserve the production signer pin, encrypted formats, backup compatibility, existing feature behavior and release gates.

## 3. Platform and device capability matrix

Status meanings:
- **SUPPORTED** — shipped product behavior with documented OS/version/architecture range.
- **CI-TESTED** — automated build/tests run for the stated target; not proof of real-device behavior.
- **DEVICE-TESTED** — acceptance suite passed on a named representative physical device.
- **EXPERIMENTAL** — feasibility work or prototype only.
- **UNSUPPORTED** — no implementation/compatibility claim.

| Platform / device class | Target experience | Current status | Required qualification |
|---|---|---|---|
| Android phone | Full tasks, reminders, focus timer, browser, backup/settings | SUPPORTED (source baseline; exact release/device qualification separate) | API/ABI matrix, physical device, lifecycle, battery and accessibility |
| Android tablet / foldable / DeX / external display | Adaptive multi-pane workspace, resize/reflow, keyboard/mouse | EXPERIMENTAL | Window-size classes, posture, split-screen, large text, external input |
| iPhone | Native-feeling tasks, focus, reminders, secure local data | UNSUPPORTED | iOS shell, Keychain/storage, notification and background policy |
| iPad | Adaptive multi-column workspace, keyboard/pointer, Stage Manager | UNSUPPORTED | iPadOS shell and large-screen acceptance |
| Wear OS watch | Timer, due reminders, glanceable tiles/complications and short actions | EXPERIMENTAL | Watch app, tile/complication, notifications, battery and offline tests |
| Apple Watch | Short task actions, timer, complications/widgets and notifications | UNSUPPORTED | watchOS/SwiftUI/WidgetKit implementation and real watch testing |
| Smart ring | Haptic/LED/button acknowledgements and a few companion-triggered actions | EXPERIMENTAL (API survey only) | Per-vendor public SDK/API, supported commands, radio/battery limits and paired-device tests |
| Display-less BLE device / button | Explicit start/pause/finish or acknowledge/snooze commands | EXPERIMENTAL (design only) | Authenticated pairing, replay protection, debounce, feedback and lost-connection behavior |
| Windows desktop/laptop — full task workspace | Keyboard-first task workspace, tray/menu, multi-window and local data | UNSUPPORTED | Installer/signing, secure storage, accessibility, update and GUI smoke tests |
| macOS desktop/laptop — full task workspace | Native desktop workspace, menu bar, shortcuts and local data | UNSUPPORTED | Hardened/notarized distribution, Keychain, sandbox and GUI tests |
| Linux desktop/laptop — full task workspace | Desktop workspace, keyboard shortcuts and local data | UNSUPPORTED | Distro/package/ABI matrix, secret storage and desktop integration |
| Windows — Electron browser prototype | Tabbed mini-browser, address/navigation policy and downloads; no Daymark task workspace | EXPERIMENTAL; CI-TESTED on PR #692 head only | GUI/installer acceptance, keyboard/screen-reader checks, secure download publication and OS integration |
| macOS — Electron browser prototype | Tabbed mini-browser, address/navigation policy and downloads; no Daymark task workspace | EXPERIMENTAL; CI-TESTED on PR #692 head only | GUI/installer acceptance, keyboard/screen-reader checks, secure download publication and OS integration |
| Linux — Electron browser prototype | Tabbed mini-browser, address/navigation policy and downloads; no Daymark task workspace | EXPERIMENTAL; CI-TESTED on PR #692 head only | GUI/installer acceptance, keyboard/screen-reader checks, secure download publication and OS integration |
| Web / installable PWA | Responsive companion for task capture and review | UNSUPPORTED | Browser storage/security limits, offline tests, installability and sync contract |
| ChromeOS | Android app or desktop/web experience depending on device | EXPERIMENTAL | Windowing/input/storage and actual Chromebook testing |
| Android Auto | Restricted glanceable/voice-first actions where app category is allowed | UNSUPPORTED | Google-supported category/template eligibility and policy review |
| Apple CarPlay | Restricted voice/approved-template experience only if eligible | UNSUPPORTED | Apple entitlement/category approval and policy review |
| OpenHarmony / HarmonyOS | Native/ArkTS adapter if target APIs support required behavior | EXPERIMENTAL (research only) | Exact OS/device/toolchain, API parity, security and real-device build |
| E-ink / smart display / TV | Low-refresh glanceable dashboard or remote companion | EXPERIMENTAL (research only) | Actual platform APIs, refresh/power constraints and input model |

Do not combine status labels. For example, CI-TESTED is not DEVICE-TESTED. A platform remains unsupported until its acceptance suite is complete.

## 4. Shared core and platform adapter boundaries

### Shared, deterministic core

Define contracts before moving production code:
- stable task, subtask, attachment-reference and template identifiers;
- title/notes/tag validation and task state transitions;
- date/time-zone, due-time, recurrence and snooze semantics;
- focus timer state machine using monotonic time while running;
- reminder policy and idempotent event/action identifiers;
- command/action registry with typed inputs, authorization and typed results;
- versioned import/export schema and compatibility fixtures;
- browser URL/security policy rules that can be tested independently of a rendering engine;
- conflict-resolution rules for any future optional multi-device sync.

The shared core must not depend on Android Activity, Android View, WebView, AlarmManager, WorkManager, Apple frameworks, a desktop window, or a specific UI toolkit.

### Platform-owned adapters

Each OS owns its own:
- secure key storage and encrypted-at-rest storage adapter;
- notification channels/categories/actions and OS scheduling;
- widgets, watch tiles/complications, Live Activities/Live Updates;
- lifecycle, background execution and reboot restoration;
- haptics, audio, voice, sensors, BLE and car interfaces;
- browser engine, downloads, permissions, cookies and extension capabilities;
- accessibility APIs, platform navigation and native visual conventions.

Use shared business rules, not fake cross-platform abstractions that erase meaningful OS differences.

## 5. First executable shared-core slice

The first platform-neutral implementation lives in `shared-core/` as Java 17 source with no Android, AndroidX, UI toolkit, WebView, network, storage, or vendor SDK dependency:

- `DeviceCapabilityPolicy` accepts an explicit platform-adapter snapshot: surface, display class, input affordances, and declared Daymark features.
- It returns a deterministic immutable set of available actions. It does not infer capabilities from a device brand/model or silently grant permissions.
- Button-only/no-display surfaces are limited to focus and reminder commands. Task capture requires declared Daymark voice-capture support or a visible surface with rich input so the user can supply a task title; a button press alone must not create a blank task. Rich editing and browser actions require a full display and rich input.
- Car surfaces are deliberately restricted to reminder acknowledge/snooze actions. Task editing, browsing, capture, list review and focus controls are not exposed by this policy.
- Invalid ring/display combinations are rejected. Missing capabilities fail closed.

The cross-platform contract workflow now compiles and executes this slice on Ubuntu and Windows using Java 17. The smoke suite covers phone, watch, ring/display-less, car, e-ink and desktop policy behavior, plus immutable snapshots and invalid profiles.

A single TSV contract at `contracts/device-capability-policy.tsv` is now consumed by both the Java 17 shared-core smoke test and the Node test suite for the JavaScript adapter. This prevents the two implementations from quietly drifting on the same device scenarios. The existing experimental browser desktop spike also loads the shared JavaScript policy and uses real browser pointer/touch and viewport signals to label its current interaction surface and gate task capture; it explicitly does not infer a native OS, wearable, ring, or car integration.

**Boundary:** this is an executable shared-core proof, not yet wired into the Android UI or a shipped multi-platform app. Platform adapters, real device capability discovery, iOS/desktop/watch shells, vendor ring integrations, and physical-device validation remain outstanding. Do not label any new platform supported based on this policy alone.

## 6. Technology evaluation — no framework selected yet

Evaluate candidates against the actual repository and a small vertical slice. Current candidates:
- **Kotlin Multiplatform:** strong candidate for sharing domain/data logic across Android, iOS and desktop targets while retaining native platform APIs. Compose Multiplatform may suit some phone/desktop UI, but does not eliminate the need for dedicated watch, ring or car surfaces.
- **Flutter:** candidate for broad mobile/desktop UI reuse; measure binary size, startup, RAM, platform integrations, accessibility and plugin maintenance against a real Daymark slice.
- **Tauri + Rust + web UI:** candidate for desktop/web shells where small distribution and Rust-side boundaries help; measure platform WebView differences, Android/iOS integration and security implications.
- **Native platform UI:** SwiftUI for Apple platforms, Compose/Views for Android and Wear OS, and platform-native frameworks where required.

Likely shape is hybrid: share domain contracts and deterministic logic; use native shells and specialized UI where platform fidelity, background policy or hardware access matters. Do not rewrite the Android production app in one step. Do not add a runtime or language solely for novelty. A candidate wins only after measured parity, security, performance and maintenance review.

## 7. Smallest-device experience

For rings and display-less companions, define a deliberately tiny command set:
1. Start or resume the selected focus session.
2. Pause or finish the active session.
3. Acknowledge or snooze the currently surfaced reminder.
4. Confirm success/failure through supported haptic/LED/audio feedback.

Constraints:
- No full task editing, browser, rich text, AI inference or local task database on a minimal peripheral unless the hardware actually supports it.
- No continuous sensor sampling, always-on microphone, always-on BLE scanning or location tracking by default.
- Require secure pairing, explicit device association, authenticated commands, replay/idempotency protection and clear disconnect behavior.
- The phone/desktop remains the companion and source of rich UI; do not assume all rings expose a public third-party app SDK or arbitrary haptic control.

## 8. Battery, performance and reliability budgets

Set numeric budgets only after measuring representative devices. Capture:
- cold and warm startup; p50/p95 action latency;
- idle and active CPU, peak/steady RAM, allocations and storage;
- background wakeups, scheduled jobs, BLE radio duty cycle and network bytes;
- battery drain per hour/day in idle, timer, reminder and sync scenarios;
- thermal behavior, install size, update size and database growth.

Engineering rules:
- Event-driven state changes; no background one-second timer polling. Use monotonic clocks for elapsed time; let visible UI render locally and use OS-supported notifications/scheduling for background state.
- Coalesce writes and notification updates; bounded retries with exponential backoff and cancellation.
- No permanent daemon or background sensor/AI work. Respect Doze, Low Power Mode, thermal pressure and vendor restrictions.
- Request Bluetooth, health, location, microphone, notification and background permissions only at the point a user enables the related feature.
- Degrade gracefully when hardware APIs, network, permission, companion or platform service is unavailable.
- Define separate budgets for phone, watch, ring/display-less peripheral and desktop. Do not impose an unrealistic single budget across unlike hardware.

## 9. Privacy, storage and synchronization

Daymark keeps task data on the device and stays useful without an account. Cross-platform support must not force an account or central cloud database, and must not degrade the direct network path on platforms where the network is available.

First establish:
- a versioned encrypted portable format;
- explicit user-controlled export/import and tested recovery;
- stable IDs and schema migrations with rollback/recovery tests;
- per-platform key-management adapters using OS-provided secure storage;
- conflict semantics for duplicate edits, recurrence, deleted tasks and timer sessions.

Only evaluate optional device-to-device sync after the shared data contract is stable. It requires explicit opt-in, end-to-end encryption, peer/device revocation, conflict handling, replay protection and a clear explanation of network metadata. No silent upload or background sync by default.

## 10. Browser portability

Do not treat “browser” as a universal shared implementation. Keep policy tests separate from engine adapters. Each engine needs a capability report for navigation, HTTPS/downgrade handling, explicit online consent, cookies, downloads, safe browsing, site permissions, extensions, Web Push and recovery.

Android System WebView is Android's embedded renderer, not a cross-platform engine. Evaluate desktop OS WebViews and any bundled engine separately for security update ownership, binary size, licensing, memory, architecture support and extension behavior. Preserve the existing Android browser policy while any alternative is only a prototype.

## 11. Car and activity-context UX

Car mode must be restricted to OS-approved categories and templates. It should offer only glanceable state and brief voice/large-target actions when parked or when the OS allows them. No free-form task editing, long lists, browser or distracting interaction while driving. Do not claim Android Auto or CarPlay eligibility until the relevant platform confirms category/entitlement and review.

For desk work, meetings, walking, jogging, reading, exercise and sport, use optional context presets and user-controlled shortcuts—not hidden tracking. Location, motion/health sensors and automatic activity detection must be opt-in, privacy-reviewed and battery-budgeted. Manual context selection must always remain available.

## 12. Delivery stages and acceptance

1. **Architecture baseline:** update this matrix with exact OS/device versions, inspect open PR ownership, produce an ADR and measurable budgets.
2. **Core seam:** extract one low-risk pure domain/policy component and run identical deterministic fixtures on Linux and Windows, with Android parity tests. No storage migration in this stage.
3. **Desktop proof:** build a small Windows/Linux task workspace with encrypted local persistence and GUI screenshot/log smoke tests.
4. **Web proof:** responsive PWA for explicitly scoped workflows; document browser storage and notification limits.
5. **Mobile/wearables:** add iOS/iPadOS, Wear OS and watchOS native shells/adapters with their own device acceptance.
6. **Constrained companions:** survey each ring/vendor API and prototype only documented commands/haptics.
7. **Car/other ecosystems:** feasibility and policy review before implementation.
8. **Migration decision:** only move production components after behavioral parity, performance, security, rollback and data compatibility are demonstrated.

Every stage must state exact commit, OS/toolchain, tests, artifacts, benchmark methodology and untested hardware. Android's existing package ID, signer, data, features and release line remain protected throughout.


## 13. Live verification refresh — 2026-11-08T10:29:23.921Z

This section supersedes only the dated source/CI facts above; the platform status labels remain conservative and are not upgraded by a green shared-core workflow.

### Current Android product baseline

- Exact `main` SHA: `05de9c927843d32586c24a478653e9caab097c72`.
- Android module: native Java application with Android System WebView; `minSdk = 26`, `targetSdk = 36`.
- Source build identity/version: namespace and application ID `com.abrar.daymark`; `versionName = 1.6`, `versionCode = 13`. No identity, signer, version, manifest, or release changes were made in this refresh.
- Browser policy: Android System WebView accepts explicit HTTP and HTTPS; plain HTTP is visibly labelled **Not encrypted**. Bare domains resolve to HTTPS. Online is the default; a deliberately saved Offline choice remains fail-closed and returning Online uses the explicit disclosure. The updater and other app-owned network clients remain HTTPS-only.
- Task/attachment data and portable backup remain local and encrypted in the current Android source. No desktop storage adapter or cross-device sync implementation is present.

### Exact current-main CI evidence

- [Android CI — run 42469883833](https://github.com/AbrarulHaque8541/daymark/actions/runs/42469883833), exact `main` SHA `05de9c927843d32586c24a478653e9caab097c72`: **PASS**.
- [Cross-platform contract tests — run 42469883856](https://github.com/AbrarulHaque8541/daymark/actions/runs/42469883856), exact `main` SHA `05de9c927843d32586c24a478653e9caab097c72`: **PASS**. The shared Java 17 capability-policy/contract slice ran on Ubuntu 24.04 and Windows 2025.
- This proves the stated CI suites on those runners only. It does not build a Windows/Linux Daymark desktop app, prove platform storage/security adapters, or establish device compatibility.
- Android physical-device acceptance remains **NOT TESTED**; issue [#160](https://github.com/AbrarulHaque8541/daymark/issues/160) remains open. The required evidence is a named device/model, Android API/build, WebView provider/version, tested build SHA, APK SHA-256, and scenario-by-scenario results.

### Current distribution boundary

- Latest published release observed: [v1.5](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.5), published 2026-10-23.
- [v1.4](https://github.com/AbrarulHaque8541/daymark/releases/tag/v1.4) remains a draft.
- Source is at version 1.6 / versionCode 13, but no v1.6 release was observed. This matrix refresh does not authorize a tag, version bump, draft creation, or publication.

### Platform status interpretation

- **Android phone:** remains the only shipped product target (**SUPPORTED**); current-main Android CI is **CI-TESTED**. It is not **DEVICE-TESTED**.
- **Windows and Linux:** the shared Java 17 contract slice is **CI-TESTED** on the named runners; the Daymark desktop applications remain **UNSUPPORTED** because no desktop shell, packaging, encrypted storage adapter, updater, or GUI acceptance suite is shipped.
- **HarmonyOS/OpenHarmony, iOS, watchOS/Wear OS, car, ring, and other companion targets:** remain **EXPERIMENTAL** or **UNSUPPORTED** exactly as shown in the platform matrix; no new target build or physical-device evidence was produced in this refresh.

### Next qualification gates

1. Complete the physical Android/WebView matrix under #160 before making broader Android compatibility claims.
2. Finish browser reliability work under #348, keeping HTTP/HTTPS transport policy tests separate from real WebView/device acceptance.
3. For Windows/Linux, produce a minimal desktop POC with local encrypted persistence, packaging, keyboard/accessibility checks, screenshots/log artifacts, and the same synthetic shared-core fixtures before changing those rows from **UNSUPPORTED**.
4. Treat HarmonyOS NEXT as a separate ArkTS/ArkUI target: require a real toolchain build and target-runtime/device evidence before any support claim.

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub connector (live AGENTS/source/PR/Actions/Releases inspection; Git tree/commit/ref APIs)
Timestamp (UTC): 2026-11-08T10:29:23.921Z


## 14. Integration refresh after PR #608 and PR #606 — 2026-11-08T11:10:37Z

- Current `main` SHA: `78524e9f12824f580aec29a8ed1dd123c78bf46f`.
- PR #608 merged at `c702d73f7ef269cdb7f061256f3dbd27bacfece8`, aligning task-note HTTP/HTTPS link handling with the browser's explicit HTTP+HTTPS policy.
- PR #606 merged at the current main SHA, preserving elapsed reminder lead time across spring-forward gaps and fall-back overlaps.
- The Android CI and Ubuntu/Windows contract runs listed in section 13 were executed against `05de9c927843d32586c24a478653e9caab097c72`; they are historical and do **not** validate the current `78524e9f` tree. Fresh current-main CI evidence was not yet observed at this refresh.
- Android remains the only shipped product target. Windows/Linux have only the shared Java 17 contract slice; no desktop app shell is shipped.
- Physical Android/WebView and AlarmManager acceptance remain **NOT TESTED** under #160.


## 15. Live desktop/browser qualification refresh — 2026-11-10T04:04:26.726Z

This section distinguishes the experimental Electron browser from a full cross-platform Daymark task application. It supersedes the earlier blanket statement that no desktop shell exists, but it does **not** upgrade Windows, macOS, or Linux task-workspace support.

### Current main source boundary

- Current main: `557af3160d16463a6a8a9c3031f5ef887fdb5ef9`.
- `apps/desktop/README.md` describes **Daymark Browser** as an experimental Electron/Chromium prototype. Its current features include tabs, an address bar, HTTPS-only navigation with a localhost development exception, starter tracker blocking, privacy headers, and find-in-page.
- `apps/desktop/package.json` declares the Electron dependency range as `^33.4.0` and Node `>=20`.
- `.github/workflows/desktop-browser-ci.yml` runs Node unit/policy tests on Ubuntu, Windows, and macOS. It does not launch the GUI, build/sign installers, or prove desktop OS integration.
- The prototype is separate from the Android native app. It does not provide the full Daymark task workspace, an encrypted task-storage adapter, account/device sync, or a production updater. Therefore the full Windows/macOS/Linux task-workspace rows above remain **UNSUPPORTED**.

### Current-main download limitation

At this main SHA, `apps/desktop/main.js` joins Electron's remote `item.getFilename()` directly to the OS Downloads directory. If destination setup throws, the catch path leaves Electron's default download behavior in place. The current README also states that per-download consent and redirect auditing are not production-grade.

This is not represented as fixed on main. PR [#692](https://github.com/AbrarulHaque8541/daymark/pull/692) proposes a sanitized/collision-aware filename policy and fail-closed cancellation, but remains OPEN and unmerged. Its exact head is `33d5bf95b2d3c25a717f96b172c509f553b07a8b`, based on this main SHA.

### PR #692 evidence — not mainline evidence

Exact-head workflows for PR #692 completed successfully:

- [Desktop browser CI — run 42751675537](https://github.com/AbrarulHaque8541/daymark/actions/runs/42751675537): **PASS**, 43/43 on Ubuntu, Windows, and macOS.
- [Cross-platform contracts — run 42751675450](https://github.com/AbrarulHaque8541/daymark/actions/runs/42751675450): **PASS** on Ubuntu and Windows.
- [Android CI — run 42751675524](https://github.com/AbrarulHaque8541/daymark/actions/runs/42751675524): **PASS**, Node 697/697, source guards and Gradle build successful.
- [Device-test APK — run 42751675799](https://github.com/AbrarulHaque8541/daymark/actions/runs/42751675799): **PASS**; release-publication step **SKIPPED**.

These are PR-head automated tests, not a mainline merge, GUI launch, installer acceptance, or physical desktop test. PR #692 explicitly leaves a hostile external local-process pathname race outside its current guarantee; private temporary staging plus atomic/no-replace publication remains future work. No independent APPROVED review was present at this refresh.

### Conservative status

- Android phone: remains the only shipped full Daymark product target; physical device acceptance remains **NOT TESTED** under #160.
- Electron desktop browser: **EXPERIMENTAL**; its policy/unit tests are **CI-TESTED on PR #692's head only**.
- Windows/macOS/Linux full Daymark task workspace: **UNSUPPORTED**.
- No installer, signed desktop release, GUI smoke suite, physical desktop acceptance, encrypted desktop task store, or production updater is claimed.
- The shared Java 17 capability-policy slice remains a separate contract proof; it is not a desktop app implementation.

Next qualification gates: integrate and independently review #692; add GUI launch/navigation/download smoke tests on each desktop OS; design private staging and no-replace publication if external local-process races are in scope; then evaluate a full task workspace separately.

**Work by:** ChatGPT (OpenAI)  
**Model:** GPT-6  
**Tooling:** GitHub connector via Code Mode; live main source/docs/workflow inspection; PR #692 exact-head Actions metadata  
**Timestamp (UTC):** 2026-11-10T03:00:00Z
