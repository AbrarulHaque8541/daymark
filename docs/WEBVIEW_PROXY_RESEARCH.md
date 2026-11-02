# Android System WebView proxy support — research and limitations (2026-11-02)

Scope: issue #348, P1 "Proxy and restricted-network support", first unchecked item —
"Research Android System WebView proxy support and its limitations across supported
Android versions." This is a research deliverable, not an implementation claim. No
runtime proxy code, dependency, manifest change, or UI control is added by this
document.

Evidence status: desk research against official Android/Jetpack documentation and
Chromium's proxy architecture notes, cross-checked with current Daymark main
(source guards, dependency policy, manifest). **Device/emulator verification: NOT
TESTED.** No proxy feature ships with this document.

## 1. Current Daymark behavior (verified against current main)

- Daymark's browser uses Android System WebView as its only engine
  (docs/BROWSER_ENGINE_RESEARCH.md; AGENTS.md). WebView networking follows the
  **Android system proxy settings** by default: Wi-Fi/manual proxy, and
  system-configured PAC (proxy auto-config) via Android's PAC resolver.
- There is **no proxy code** in Daymark today: no `ProxyController`, no reflection
  proxy hacks, no proxy settings UI. The updater and other app network clients are
  separate, HTTPS-only code paths unaffected by any browser proxy decision.
- The canonical source guard `android-app/tools/check-v1-source.sh` asserts the app
  has **no runtime dependencies at all** ("unexpected app runtime dependency") and
  the manifest permission set is pinned (INTERNET, POST_NOTIFICATIONS,
  RECEIVE_BOOT_COMPLETED, VIBRATE; plus sideload flavor network-state additions).
  Any proxy proposal that adds an AndroidX library or a permission must first pass
  an explicit dependency/manifest policy change — it cannot slip in silently.

## 2. How WebView proxying works per platform version

| Mechanism | Applies to | Notes / limitations |
|---|---|---|
| System (Wi-Fi/global) proxy + PAC | All supported versions (API 26+ today) | WebView honors the OS proxy. PAC is resolved by Android's **system PAC resolver, not Chrome's**: WebView's network stack then sees the proxy as a single HTTP proxy on localhost, so PAC misconfiguration affects WebView differently from Chrome (Chromium net docs). |
| `androidx.webkit` `ProxyController.setProxyOverride()` | Only when `WebViewFeature.isFeatureSupported(PROXY_OVERRIDE)` is true | Per-**process** override for all of the app's WebViews; bypass rules; `socks://` scheme rules; `addDirect()` fallback rules; `clearProxyOverride()` restores system behavior. Must wait for the listener before loading a page (connections already in flight are not guaranteed to switch). Calling it makes WebView **ignore the system-wide setting** while the override is active. |
| `http.proxyHost`/`https.proxyHost` system properties + reflection | Historical hacks only | Unreliable: these depend on non-SDK internals and repeatedly **broke across System WebView updates** (documented breakage after WebView standalone updates). Non-SDK interface use is also restricted on modern Android. Not acceptable for Daymark. |
| `VpnService` local tunnel (e.g., app-local SOCKS→VPN bridge, Tor) | All versions, but requires `android.permission.BIND_VPN_SERVICE` `<service>` | **Blocked by Daymark's constraints**: no new `<service>` components, no new permissions, no maintainer-paid backend, and honest battery/UX cost. Revisit only if the owner changes component policy. |

Key version caveat: `PROXY_OVERRIDE` availability is a function of the **installed
System WebView version** (an updatable component), not the Android API level. A
device on API 26 with a current WebView may support it; the only safe pattern is the
runtime feature check on every device. CI cannot prove this; it must be recorded in
the #160 device matrix when proxy work is ever implemented.

## 3. Limitations that matter for an honest proxy profile

1. **No proxy authentication API.** `ProxyConfig` accepts rules and bypass
   patterns but has **no username/password or challenge support**. Proxy-auth
   failure surfaces as generic load failures. A Daymark proxy UI must not promise
   authenticated-proxy support.
2. **DNS handling depends on the rule scheme.** With HTTP proxy rules, name
   resolution occurs at the proxy via `CONNECT` (no local DNS leak for HTTPS
   origins, subject to the proxy's own behavior); SOCKS rules in Chromium-style
   stacks historically vary between resolving locally vs at the proxy
   (`socks` vs `socks5h` semantics are not exposed by `ProxyConfig`). Any
   "no DNS leak" claim requires device verification first.
3. **Timing and state.** `setProxyOverride` is asynchronous: the app must gate the
   first navigation on the listener callback; forgetting this is the classic
   first-load-through-the-wrong-path bug (observed in other projects that migrated
   from reflection to `ProxyController`).
4. **Override is app-process-wide** and silences the system proxy while active —
   a privacy disclosure must say exactly that, and turning it off must call
   `clearProxyOverride()` so the system setting is honored again.
5. **Scope.** The override governs WebView-initiated requests only. Daymark's
   updater, webhook client, and other app network clients would **not** use the
   browser proxy — which is actually aligned with Daymark's separation of
   browser policy from updater HTTPS-only policy, but must be stated in the UI.
6. **Downloads and app handoffs.** Media/download handoffs that leave WebView
   (DownloadManager, external apps) do not respect the WebView override. Per #348's
   checklist, download-journey behavior under proxy must be device-tested before
   any claim.
7. **Tor is not an HTTP proxy.** Labeling a plain HTTP/SOCKS profile "Tor" would be
   false; real Tor needs a bundled/external Tor client and the tunnel path above,
   which is currently out of bounds.

## 4. Recommendation (decision input, not a decision)

- Keep Daymark on the **system proxy** behavior for now: zero code, zero
  dependencies, and it already works for users who configure a device-level proxy.
- If the owner wants an in-app proxy profile, the only supported route is
  `androidx.webkit` `ProxyController`, which requires:
  1. an explicit dependency-policy exception (the zero-dependency guard must be
     relaxed by a focused, reviewed change — not bypassed);
  2. a runtime `PROXY_OVERRIDE` feature gate with a clear "not supported on this
     WebView" state — never a fake toggle;
  3. per-session enable/disable with `clearProxyOverride()` on disable;
  4. listener-gated first navigation and an explicit privacy disclosure
     (app-process-wide override, no proxy authentication, downloads/handoffs and
     the updater unaffected);
  5. device-matrix rows in #160 before any "works" claim (per-API and per-WebView
     provider/version).
- Do not implement reflection-based proxy hacks, and do not add a `VpnService`/
  Tor component under the current constraints.

## 5. Evidence

- androidx.webkit `ProxyController` / `ProxyConfig` reference and
  `WebViewFeature.PROXY_OVERRIDE` gating: developer.android.com reference and
  Jetpack webkit release notes (fallback-rule bug fix in the 1.4.0 line;
  `addDirect()` / `socks://` additions).
- Chromium proxy architecture notes (net/docs/proxy.md): Android WebView uses the
  Android system PAC resolver, not Chrome's, and sees system PAC as a single
  localhost HTTP proxy.
- Field evidence of reflection hacks breaking after System WebView updates, and of
  listener-gated migration to `ProxyController` in other Android apps.
- Daymark current-main guards: `check-v1-source.sh` (no runtime dependencies,
  pinned permissions, no services), `check-updater-https-only.py`.

All of the above is source/documentation evidence. **Runtime behavior on devices:
NOT TESTED.**

---
Work by: Vibe
Model: GLM 5.3 (served on Mistral AI infrastructure)
Tooling: GitHub MCP tools via Vibe run_typescript; web research via web search
Timestamp (UTC): 2026-11-02T16:07:46Z
