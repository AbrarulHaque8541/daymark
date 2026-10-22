# Desktop Browser Plan — platform compatibility matrix

Date: 2026-10-17 | Status: Phase 1 implemented (`apps/desktop`)

## Goal

Daymark ka browser har device/platform pe chale — Windows, Linux, macOS, Android,
HarmonyOS — taaki testing/install kisi bhi machine (owner ke paas ya kisi bhi agent
ke paas jo Windows/Linux use karta ho) se possible ho.

## Honest engineering position

- **Engine scratch se nahi likhenge.** Brave, Edge, Vivaldi — koi bhi naya browser
  engine scratch se nahi likhta; Chromium ya Gecko use hota hai. Hum bhi wahi
  karenge, taaki behaviour stable aur auditable rahe.
- Ek hi codebase, per-platform engine binding:
  - Desktop (Windows/Linux/macOS): **Chromium via Electron** — teeno pe identical.
  - Android: Phase 2 mein **GeckoView** (Firefox engine) dual-engine option —
    real extension + adblock support ke liye (research: `docs/BROWSER_ENGINE_RESEARCH.md`,
    `docs/GECKOVIEW_EXTENSION_RESEARCH.md`).
- HTTPS-only policy har platform pe preserve hogi (ye Daymark ki core security rule hai).

## Platform matrix

| Platform | Engine | Status | Notes |
| --- | --- | --- | --- |
| Windows 10/11 | Chromium (Electron) | Phase 1 — done | `npm install && npm start` in `apps/desktop` |
| Linux (X11/Wayland) | Chromium (Electron) | Phase 1 — done | any modern distro with glibc; CI proves it |
| macOS | Chromium (Electron) | Phase 1 — done | CI proves it |
| Android 8+ (existing app) | System WebView | Live | current released app |
| Android (Phase 2) | GeckoView dual-engine | Planned | real extensions (uBlock etc.) + content blocking |
| HarmonyOS 4.x (Android-compatible) | via APK | Works | Android APK install hota hai |
| HarmonyOS NEXT / OpenHarmony | — | **Needs separate port** | APK bhi nahi chalta, Electron bhi nahi; ArkTS-based alag port banega (bada, alag project) |
| iOS | — | Out of scope (abhi) | WKWebView possible future |

## Testing on any machine (the "kisi bhi agent ke computer pe test" use-case)

- Desktop browser: `git clone` → `cd apps/desktop` → `npm install` → `npm start`
  (GUI) ya `npm test` (headless unit tests). Windows/Linux/macOS — sab same.
- CI (`desktop-browser-ci.yml`) ubuntu + windows + macos matrix pe `npm test`
  chala ke cross-platform guarantee deta hai.
- Android app: repo existing emulator gates (API 29 + API 36) pe CI mein hi
  cold-launch tested hota hai — owner device-test alag se.

## Phases

1. **Phase 1 (this)**: Electron desktop browser, HTTPS-only + tracker blocking +
   tabs + find-in-page + downloads; unit tests; tri-OS CI.
2. **Phase 2**: Android GeckoView dual-engine mode (research docs ready).
3. **Phase 3 (optional, big)**: HarmonyOS NEXT / OpenHarmony ArkTS port;
   browser-extension packaging; installer builds (NSIS/AppImage/dmg).
