# Desktop Browser Plan — platform compatibility matrix

Date: 2026-11-08 | Status: Desktop Phase 1 prototype implemented; platform qualification remains incomplete.

## Goal

Daymark ke shared product contracts ko Android, Windows aur Linux par incrementally testable banana, bina Android app, installed identity, encrypted user data ya release process destabilize kiye. HarmonyOS/OpenHarmony ke liye actual target OS/toolchain evidence ke bina compatibility claim nahi karna.

## Honest engineering position

- Desktop prototype Electron ke through bundled Chromium use karta hai. Same Electron release par Chromium baseline similar hota hai, lekin OS integration, packaging, codecs, fonts, graphics drivers aur rendering differences ki wajah se behavior ko “100% identical” nahi kaha ja sakta.
- Android production app System WebView use karta hai; woh OS/provider-managed runtime hai, desktop Electron Chromium ka same engine binary nahi.
- Desktop prototype ka navigation policy HTTPS-only hai, localhost HTTP/WS exception ke saath. Android product policy HTTP + HTTPS allow karti hai aur HTTP ko “Not encrypted” label karti hai. Dono policies ko platform adapters ke roop mein test karna hai; blanket policy parity assume nahi karni.
- Framework/engine rewrite ya GeckoView adoption tab tak nahi jab tak measured POC size, update ownership, ABI, performance, security, licensing aur compatibility evidence na de.

## Platform matrix

| Platform | Runtime | Status | Evidence / remaining gate |
| --- | --- | --- | --- |
| Windows 10/11 | Electron + bundled Chromium | EXPERIMENTAL; unit CI-tested | Desktop Node policy tests run on Windows CI. GUI launch, packaging, updater and device acceptance not yet qualified. |
| Linux (X11/Wayland) | Electron + bundled Chromium | EXPERIMENTAL; unit CI-tested | Desktop Node policy tests run on Ubuntu CI. GUI launch/screenshot and distro/Wayland matrix remain untested. |
| macOS | Electron + bundled Chromium | EXPERIMENTAL; unit CI-tested | Desktop Node policy tests run on macOS CI. GUI launch, signing, packaging and notarization not qualified. |
| Android 8+ | Android app + System WebView | Existing product; Android CI-tested | Physical-device runtime acceptance remains tracked in issue #160; CI/emulator is not physical-device proof. |
| Android optional engine | GeckoView | PLANNED | Requires isolated POC and comparison against System WebView; no engine switch approved. |
| HarmonyOS 4.x | Android compatibility layer | NOT VERIFIED | APK compatibility must be tested on a named device/OS build before support claim. |
| HarmonyOS NEXT / OpenHarmony | Native platform port | UNSUPPORTED / separate project | Requires a real ArkTS/native toolchain and target hardware/emulator acceptance. |
| iOS | WKWebView | OUT OF SCOPE | No current implementation or qualification plan. |

## Desktop security boundary

- Host shell enables sandbox, context isolation and web security; Node integration is disabled.
- will-attach-webview strips guest preload and session/partition overrides, forces sandbox/security preferences, and disables Node integration, plugins and nested webviews.
- Initial guest URL, guest navigation, redirects and popup destinations use the HTTPS/localhost allow policy.
- Network requests allow HTTPS/WSS and localhost HTTP/WS only. Packaged file: access is restricted to the exact renderer entry, script and stylesheet. data:/blob: are child-resource-only; about:blank/about:srcdoc are child-frame-only. Privileged/unknown schemes fail closed.
- Downloads still auto-save to the OS Downloads folder; explicit save consent and redirect-aware download auditing remain open production-readiness work.
- Tracker blocking uses a starter domain list; it is not a complete adblocker or network filter.

## Testing evidence and limits

- .github/workflows/desktop-browser-ci.yml runs headless Node unit/policy tests on Ubuntu, Windows and macOS.
- That workflow does not build distributable installers, launch the GUI, capture screenshots, verify native window lifecycle, or prove platform compatibility.
- Android CI and API 29/36 emulator jobs are separate. Physical Android/WebView acceptance is tracked in issue #160 and must record device model, Android API, WebView provider/version, exact source SHA, APK SHA, scenario and result.
- No desktop or Android physical-device result should be inferred from a green unit/CI/emulator job.

## Phases

1. Phase 1 — desktop policy prototype: Electron shell, tabs, find-in-page, URL policy, request filtering and headless tests. Implemented but not fully platform-qualified.
2. Phase 1b — desktop qualification: GUI launch smoke, screenshot/log artifacts, installer/package validation, download-consent flow, Electron update policy and OS-specific runtime tests.
3. Phase 2 — Android engine comparison: evaluate GeckoView as an optional isolated POC; preserve System WebView fallback and current product behavior until parity/security/performance gates pass.
4. Phase 3 — HarmonyOS NEXT/OpenHarmony: separate ArkTS/native feasibility project after target OS/device/toolchain is confirmed.
