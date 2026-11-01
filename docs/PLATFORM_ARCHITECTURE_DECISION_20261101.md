# Daymark cross-platform architecture decision record (research snapshot)

**Research date:** 2026-11-01  
**Baseline:** `main` = `5e68189168984d67574a937b7bfa27164c558bfb`  
**Status:** Architecture direction only. No framework or browser engine selected for production; no prototype/build/device acceptance performed.

This record advances [Issue #325](https://github.com/AbrarulHaque8541/daymark/issues/325). It separates official platform support from Daymark-specific compatibility, and recommends a reversible sequence rather than a wholesale rewrite.

## Executive decision

**Keep the existing native Android application and System WebView. Do not rewrite the app or swap its browser engine now.**

For Windows/Linux, evaluate **Compose Multiplatform (CMP) + Kotlin Multiplatform (KMP)** in a small desktop proof of concept because it can share Kotlin UI/domain code and has stable Android + desktop targets according to JetBrains. However, Daymark's current domain code is largely Java; moving it into `commonMain` is not a zero-cost lift. First measure a thin JVM/core boundary and its parity with the current Android behavior.

**Treat HarmonyOS NEXT as a separate native target.** Official Huawei material describes ArkTS + ArkUI + ArkCompiler; OpenHarmony Stage-model docs do not prove that an OpenHarmony app/package runs unchanged on proprietary HarmonyOS NEXT. Do not advertise Harmony support until the actual distribution, SDK, device/emulator and required APIs are verified.

**Keep browser-engine choice independent of UI framework.** CMP, Flutter, or Tauri does not automatically give Daymark one identical browser engine on all platforms. The Android browser is currently Android System WebView; engine-specific policy, downloads, permissions, extensions, navigation and testing remain adapter responsibilities.

## Candidate matrix

| Candidate | Android | Windows | Linux | HarmonyOS NEXT | Assessment for Daymark |
|---|---|---|---|---|
| Existing native Android (Java/Kotlin + System WebView) | Current product | No current native desktop target | No current native desktop target | Not portable as-is | **Preserve as baseline.** Lowest regression risk; retain package, signer, encrypted storage, SAF, reminders and WebView consent semantics. |
| **KMP + Compose Multiplatform** | Official stable target | Official stable desktop target (Windows 10+, x64/arm64 in current CMP docs) | Official stable desktop target (Ubuntu 20.04+, x64/arm64 in current CMP docs) | **Not listed as an official CMP target** | **Best first desktop spike.** Kotlin/UI/domain sharing is attractive; current Java domain requires boundary/migration work. CMP Web/Wasm is Beta in current docs and not a desktop substitute. |
| Flutter | Official supported target (current docs list Android 24–37; CI-tested 24–36) | Official supported target (Windows 10/11; x64/arm64) | Official supported Debian/Ubuntu targets (x64/arm64; specific release matrix) | No official Huawei/HarmonyOS NEXT target in Flutter's upstream matrix found | Strong mature cross-platform UI option, but would mean Dart UI and native plugin/adapters for Android storage, encryption, alarms, browser and integrations. **Second candidate**, benchmark rather than assume. |
| Tauri 2 (Rust + web UI + WRY system WebView) | Supported (Android 7+, currently 8+ per upstream) | Supported (Windows 10+) | Supported; Tauri 2 uses WebKitGTK 4.1 (e.g. Ubuntu 22.04+) | Not in official platform matrix | Could reuse web UI and provide Rust backend, but WebView engine differs by OS; Rust/native bridge and data-security boundary add cost. Android is supported but migration is not free. |
| Native HarmonyOS NEXT (ArkTS + ArkUI) | N/A | N/A | N/A | Huawei's native stack | **Separate implementation/adapter required.** Validate API/device, persistence/crypto, notifications, browser kit and distribution constraints independently. |

### Important version caveat

Platform minimums and stability labels are release-specific. The matrix above reflects official documentation observed on 2026-11-01; re-check pinned toolchain/framework versions before any POC or support statement. A framework's "supported" platform is not the same as Daymark being feature-parity, CI-tested, or device-tested there.

## Browser engine options (separate decision)

| Engine | Platforms / delivery | Benefits | Costs / risks | Recommendation |
|---|---|---|---|---|
| Android System WebView (current) | Android; updated by platform/provider | Small app footprint; platform security updates; existing implementation | Provider/version varies by device; browser-specific APIs/extensions limited; real-device compatibility matrix required | **Keep for Android.** No evidence justifies replacement yet. |
| GeckoView | Android embeddable, bundled Gecko runtime | Mozilla describes it as browser-oriented, full-featured and self-contained; engine tested with app | Adds substantial native payload/RAM; app must track Gecko releases/security updates; Android-only | Optional Android browser-engine spike only if current WebView limitations are a proven user blocker. |
| Tauri WRY system webview | Windows WebView2, Linux WebKitGTK, Android System WebView; WKWebView on Apple | Small package; native platform integration | Rendering/compatibility varies by OS/provider; different browser policies and regression matrix | Reasonable desktop shell candidate only if engine differences are explicitly accepted. |
| CEF (Chromium Embedded Framework) | Desktop Linux/Windows/macOS, bundled Chromium | More controlled and consistent Chromium version across supported desktop builds | Large binaries, frequent security updates, build/ABI/packaging burden; no official Android target | Do not bundle for Daymark until a desktop browser requirement and size/security maintenance budget are demonstrated. |

**No framework choice solves browser parity by itself.** Preserve the executable security policy (HTTPS-only for non-browser clients, explicit online consent, safe external navigation, download validation, no broad JS/native bridge) as shared contracts plus platform-specific enforcement and tests.

## Recommended staged plan

### Stage 0 — contracts and capability truth (in progress in existing repo)
- Continue language-neutral deterministic fixtures (e.g. `contracts/task-recurrence.tsv`) consumed by web and Android host tests.
- Define platform capability labels: **SUPPORTED**, **CI-TESTED**, **EMULATOR-TESTED**, **DEVICE-TESTED**, **EXPERIMENTAL**, **UNSUPPORTED**.
- Keep Task and Browser workspaces separated; no shared task data sent to search/AI by default.
- No rewrite, no package/version/signing/data migration.

### Stage 1 — measure a reusable domain seam
- Inventory Android pure Java domain/validation/serialization versus Android-only adapters (Keystore, AtomicFile, alarms, SAF, WebView, lifecycle).
- Prototype a small JVM core module that Android and a desktop JVM test target can consume without changing `applicationId` (`com.abrar.daymark`) or the production signer.
- Add differential fixtures against current Android/web behavior; no silent schema change.
- Benchmark build time, startup, binary size, storage, memory, test speed and maintainability. **Stop if the seam adds more cost than it removes.**

### Stage 2 — minimal Windows/Linux desktop POC
- One task list + local persistence + import/export recovery, keyboard/accessibility and screenshot/log CI artifacts.
- Do not port the full browser until the domain and storage/security adapters pass parity.
- Record Linux distribution/GTK and Windows WebView runtime prerequisites; do not claim universal desktop support.

### Stage 3 — decide UI sharing
- If JVM-core reuse and parity are strong, test CMP for a small UI screen on Android + Windows + Linux.
- Compare against Flutter with a measured prototype only if CMP integration cost or UI capability is unsatisfactory.
- Do not replace the existing Android app UI in one migration. Preserve feature parity and provide explicit, tested backup/rollback before any user-data change.

### Stage 4 — HarmonyOS NEXT feasibility
- Obtain/confirm the actual target device, OS release, DevEco Studio/SDK and app distribution requirements.
- Build a minimal ArkTS/ArkUI task-list prototype with local encrypted persistence and a recurrence contract consumer.
- Validate notifications/reminders, lifecycle, browser/ArkWeb behavior, backup interoperability and privacy on the target device.
- Until those pass, label HarmonyOS NEXT **EXPERIMENTAL / NOT TESTED**, not supported.

### Stage 5 — browser-engine decision
- First complete current Android WebView device acceptance (#160) and browser reliability matrix (#348).
- Write engine-specific policy/adapter tests and compare WebView, GeckoView (Android) and CEF (desktop) on representative pages, redirects, cookies, downloads, target=_blank, accessibility, renderer failure, offline/online consent and security behavior.
- Record p50/p95 startup/navigation, RSS/peak memory, APK/package delta, CPU/battery/thermal, update ownership and vulnerability-response process. No speed/size claim without measurement.

## Gate checklist before implementation approval

- [ ] Actual supported OS/device/CPU/SDK matrix and build agents confirmed.
- [ ] Existing app features, persistence, encryption, backup, reminders and browser policy inventoried.
- [ ] Exact license/maintenance/security/update cadence reviewed for every new dependency.
- [ ] Candidate POC builds reproducibly on Linux + Windows CI; Android baseline remains green.
- [ ] Shared fixtures pass with zero unexplained divergence.
- [ ] Accessibility, keyboard, font scaling, RTL, lifecycle, process death and recovery are tested.
- [ ] Data export/import and rollback tested; no migration without explicit approval.
- [ ] APK/installer size, cold/warm start, memory, CPU and battery/thermal measured on comparable hardware.
- [ ] Physical-device results separated from CI/emulator evidence.
- [ ] Owner reviews trade-offs before production framework/engine selection.

## Official references (checked 2026-11-01)

- [JetBrains — Compose Multiplatform supported platforms and compatibility](https://kotlinlang.org/docs/multiplatform/compose-compatibility-and-versioning.html)
- [JetBrains — Kotlin Multiplatform FAQ / platform sharing](https://kotlinlang.org/docs/multiplatform/faq.html)
- [Flutter — official supported deployment platform matrix](https://docs.flutter.dev/reference/supported-platforms)
- [Flutter — desktop integration and per-OS tooling](https://docs.flutter.dev/platform-integration/desktop)
- [Tauri — upstream platform support and WebView architecture](https://github.com/tauri-apps/tauri)
- [Tauri — v2 configuration/platform documentation](https://v2.tauri.app/reference/config/)
- [Huawei — HarmonyOS NEXT developer platform (ArkTS, ArkUI, ArkCompiler)](https://developer.huawei.com/consumer/en/harmonyos/develop/)
- [OpenHarmony — application model / Stage model](https://github.com/openharmony/docs/blob/master/en/application-dev/application-models/application-models.md)
- [Mozilla — GeckoView overview](https://mozilla.github.io/geckoview/)
- [Mozilla — GeckoView quick start](https://mozilla.github.io/geckoview/consumer/docs/geckoview-quick-start)
- [Chromium Embedded Framework — upstream project and security updates](https://github.com/chromiumembedded/cef)
- [CEF — supported branches/building requirements](https://github.com/chromiumembedded/cef/blob/master/docs/branches_and_building.md)
- [Android — WebView integration and platform API](https://developer.android.com/develop/ui/views/layout/webapps/webview)

## Evidence and attribution

- **Research:** official vendor/upstream documentation listed above + live Daymark source/AGENTS.md/Issue #325 inspection.
- **Code prototype/build/benchmark:** NOT RUN.
- **Emulator/physical-device acceptance:** NOT TESTED.
- **Production framework/browser engine selection:** NOT MADE.
- **Application identity, signer, version, release, and user data:** unchanged.

Work by: ChatGPT (OpenAI)  
Model: GPT-6  
Tooling: GitHub MCP (live repository/issue/branch APIs), web research of official framework/platform docs  
Timestamp (UTC): 2026-11-01T10:36:00Z
