# Daymark Browser (desktop)

Daymark ka desktop browser abhi **experimental prototype** hai. Electron Chromium embed karta hai, lekin Windows, Linux aur macOS ke OS integration, packaging aur rendering behavior ko identical ya production-supported assume nahi karna chahiye.

## Kaise chalayein

```bash
git clone https://github.com/AbrarulHaque8541/daymark.git
cd daymark/apps/desktop
npm ci
npm start
npm test
```

The desktop dependency graph is pinned by `package-lock.json`. Use `npm ci` for clean/reproducible installs. Use `npm install` only when intentionally changing dependencies, and commit the regenerated lockfile with that change.

Desktop CI (.github/workflows/desktop-browser-ci.yml) Ubuntu, Windows aur macOS par unit tests chalata hai. Yeh GUI launch, installer packaging, screenshot capture ya real-device compatibility prove nahi karta.

## Runtime compatibility

- Supported stable runtime baseline: Electron **45.3.0**, embedding Chromium **156.0.8078.96** and Node.js **24.22.2**.
- The CI unit-test harness runs under Node 24.22.2, matching Electron's embedded Node runtime; `npm test` also launches the installed Electron binary and verifies its exact version.
- Electron 45 publishes 64-bit x64/arm64 builds only; 32-bit Windows ia32 and Linux armv7l are not supported.
- Electron 45's planned end-of-support date is 2027-04-27; re-check the official release schedule before any desktop distribution decision.

## Features (prototype)

- Tabs (Ctrl+T naya, Ctrl+W band, click se switch)
- Address bar with auto HTTPS upgrade (Ctrl+L)
- HTTPS-only navigation; HTTP/WS exception sirf localhost ke liye
- Secure WebSockets (WSS) aur starter tracker-domain blocking
- Privacy headers: DNT: 1, Sec-GPC: 1
- Find in page (Ctrl+F)
- Downloads pehle ek private per-download staging directory mein likhe jaate hain, phir completed file hard-link ke through atomic no-replace publication se user-visible Downloads folder mein aati hai. Late collision ya hard-link unsupported filesystem par existing file overwrite nahi hoti; publication fail-closed rehti hai. Per-download consent/redirect audit abhi production-grade nahi
- target=_blank / window.open allowed web URLs ko new tab mein route karta hai

## Security boundary

- Host renderer: sandbox, contextIsolation aur webSecurity enabled; nodeIntegration aur nodeIntegrationInWorker disabled.
- Guest webviews: preload aur custom session/partition overrides remove hote hain; Node integration, Node worker integration, plugins aur nested webview disabled; sandbox/security preferences force hoti hain.
- Initial URL, in-page navigation, redirects aur popup targets HTTPS/localhost policy se validate hote hain; credential-bearing URLs are rejected before address/navigation/request admission.
- file: access exact packaged renderer files tak limited hai. data:/blob: sirf subresources ke liye, aur about:blank/about:srcdoc sirf child frames ke liye allowed hain. Top-level file:, data:, chrome:, devtools:, javascript: aur unknown schemes blocked hain.
- HTTPS/WSS allowed; remote HTTP/WS blocked; localhost HTTP/WS development exception hai.
- Tracker list starter list hai, comprehensive network-level ad/tracker blocker nahi.
- Filesystem threat boundary: staging directories are private to the current OS user (mode `0700` on POSIX). This prototype does not claim isolation from malware already running as the same user; portable Node path APIs cannot eliminate every same-user directory-replacement race. A detected staging/publication identity mismatch fails closed and best-effort removes the just-created final link when its file identity is still verifiable.

Android app ka browser policy alag hai: production Android WebView HTTP aur HTTPS dono support karta hai, aur plain HTTP ko “Not encrypted” label karta hai. Is desktop prototype ki HTTPS-only policy ko Android behavior ka replacement na samjhein.

## Design notes

- Request and URL policy pure logic modules mein hain (lib/rules.js, lib/request-policy.js) aur Node tests se verify hote hain.
- Electron/Chromium engine OS-provided browser engine nahi hai; Electron version ke saath Chromium update hota hai. Platform differences remain.
- CI abhi unit/policy tests tak limited hai; GUI smoke, signed installers, physical desktop acceptance aur downloads consent workflow backlog mein hain.

Roadmap aur platform matrix: docs/DESKTOP_BROWSER_PLAN.md.
