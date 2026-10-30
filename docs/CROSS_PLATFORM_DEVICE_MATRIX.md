# Daymark multi-device architecture and support matrix

**Status:** Architecture proposal / implementation not yet complete. This document is not a compatibility claim.
**Baseline inspected:** `main` at `76277adba7ad26521f60b7a4da408bb31f5f48ce`.
**Owner direction:** Make Daymark useful across device classes and operating systems, including constrained and display-less companions, while preserving the current Android product.
**Last updated:** 2026-10-30T18:55:05.347Z

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
| Android app | Native Java Activity + Android System WebView |
| Android identity | applicationId and namespace `com.abrar.daymark` — immutable without owner approval |
| Android range | minSdk 26 (Android 8.0+), targetSdk 36 in inspected source |
| Storage | Local encrypted task/attachment stores and encrypted portable backup; no account or mandatory cloud sync |
| Browser | Android System WebView adapter with explicit network consent and platform-specific policy; not a universal browser engine |
| UI | Programmatic native Android views; no shared cross-platform UI module in current baseline |
| Other OS/device apps | Not implemented by this baseline; see matrix below |

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
| Windows desktop/laptop | Keyboard-first task workspace, tray/menu, multi-window and local data | UNSUPPORTED | Installer/signing, secure storage, accessibility, update and GUI smoke tests |
| macOS desktop/laptop | Native desktop workspace, menu bar, shortcuts and local data | UNSUPPORTED | Hardened/notarized distribution, Keychain, sandbox and GUI tests |
| Linux desktop/laptop | Desktop workspace, keyboard shortcuts and local data | UNSUPPORTED | Distro/package/ABI matrix, secret storage and desktop integration |
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
- Button-only/no-display surfaces are limited to short capture/focus/reminder actions; rich editing and browser actions require a full display and rich input.
- Car surfaces are deliberately restricted to reminder acknowledge/snooze actions. Task editing, browsing, capture, list review and focus controls are not exposed by this policy.
- Invalid ring/display combinations are rejected. Missing capabilities fail closed.

The cross-platform contract workflow now compiles and executes this slice on Ubuntu and Windows using Java 17. The smoke suite covers phone, watch, ring/display-less, car, e-ink and desktop policy behavior, plus immutable snapshots and invalid profiles.

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

Daymark remains local-first and useful offline. Cross-platform support must not force an account or central cloud database.

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
