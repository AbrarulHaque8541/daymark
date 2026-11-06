# Browser HTTP policy mismatch — source audit

Audit base: `63176e5fdd1b582d3e95e9169c30e7f22478e32c` (main); runtime/device result: **NOT TESTED**.

The product policy in `AGENTS.md` calls for explicit HTTP/HTTPS browsing, an unencrypted-connection label for HTTP, an Offline/consent gate, and HTTPS-only updater and other app network clients. Current source does not establish that complete behavior:

1. `BrowserAddress` and `BrowserHistory` accept HTTP addresses, but `android-app/app/src/main/AndroidManifest.xml` sets `android:usesCleartextTraffic="false"` and the app targets API 36. [Android's application manifest documentation](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic) says WebView honors this flag for apps targeting API 26 or later. HTTP page loading is therefore expected to be blocked by the platform, notwithstanding address-parser acceptance. It has not been reproduced on an emulator or physical device here.
2. `BrowserHttpPolicy.securityLabel()` returns “Not encrypted” for HTTP, but no runtime code calls it. Existing `MainActivity` privacy and error text still says the browser is HTTPS-only. A helper existing in source is not proof that a user sees an HTTP warning.
3. The prior `check-updater-https-only.py` assumed WebView bypassed the application cleartext setting. Its comment-stripping also missed `http://` inside updater string literals. The guard now preserves quoted literals, checks the updater, public-issues and webhook HTTPS/redirect boundaries, and has mutation tests. It explicitly does **not** claim a real HTTP load or visible UI label was tested. Past issue #348 comments and checked items that rely on the old assumption should not be treated as runtime evidence.

Do not simply enable cleartext app-wide to make the parser and platform agree. That would remove a platform defense beyond the browser. Any fix must first audit all app-owned clients and redirect paths (including updater metadata/assets, GitHub issues, webhook, and DownloadManager), preserve HTTPS-only requirements and TLS failures there, and provide accurate HTTP warning/consent UI. It also needs automated and real-device tests for explicit HTTP/HTTPS loads, downgrade redirects, Offline mode, mixed content, and both distribution flavors. Coordinate `MainActivity.java` changes with any open shared-file PR and obtain independent security review before changing manifest security policy.

No manifest, transport, or browser security policy was changed as part of this audit. Other historical documents may describe earlier behavior; verify current source and device evidence instead of assuming they are current.

## Owner decision 2026-11-06: HTTP browsing enabled

The owner directed that the in-app browser must not be HTTPS-only: every site should open like in mainstream browsers. Implemented on branch `feat/http-browsing-vibe-20261106`:

- `android:usesCleartextTraffic="true"` in the shared manifest, recorded as an owner decision.
- The HTTPS-to-HTTP redirect downgrade block in `DaymarkWebView` was removed, so redirect downgrades follow mainstream-browser behavior.
- `MIXED_CONTENT_ALWAYS_ALLOW` replaces `MIXED_CONTENT_NEVER_ALLOW`.
- `MainActivity` labels HTTP pages **Not encrypted** in the page status via `BrowserHttpPolicy.isHttp`, and the old HTTPS-only disclosure copy was replaced.
- App-owned clients were audited and remain HTTPS-only in code: the updater (metadata/assets), the public-issues client, the webhook, and their guard checks.

Honesty boundaries: no emulator or physical device was available, so real-device HTTP loading, redirect behavior, and the visible label are **NOT TESTED**; this remains tracked by issue #348. Independent security review of the app-wide cleartext decision is still outstanding. The historical audit above is preserved unchanged.
