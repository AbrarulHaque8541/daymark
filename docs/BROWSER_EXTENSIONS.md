# Daymark browser extensions

## Positioning (multi-model consensus)

Daymark packs **customize the current WebView page** (CSS + page JS).  
They are **not** Chrome extensions and do **not** provide browser privileges, network blocking, or private Daymark data access.

Imported JavaScript is not sandboxed: Android evaluates it in the currently displayed page's JavaScript context. It can read or change matching page content and data visible to that page, and could send that data to an external service. Daymark exposes no native bridge to imported scripts. New user imports are saved disabled and require a separate enable action in the manager; an identical re-import preserves the existing enabled state. An existing unreadable or malformed stored pack is preserved and a same-ID re-import is rejected rather than silently replacing its bytes. The Android recovery surface is implemented on PR #659 (not yet merged): malformed files are shown as non-executable metadata, raw export is fingerprint-checked, and removal requires explicit confirmation plus a second fingerprint check.

Suggested in-app copy:

> Daymark packs only customize the current WebView page. They are not Chrome extensions and do not provide browser privileges, network blocking, or private Daymark data access.

## Must (shipped / in progress)

| Item | Status |
|------|--------|
| Daymark JSON packs (matches, excludes, css, js, runAt, warnings) | ✅ |
| `onPageFinished` injection + SPA bootstrap (history + MutationObserver) | ✅ |
| Userscript parse: `@name` `@match` `@exclude` `@run-at` `@grant none` | ✅ |
| `GM_addStyle` only (in-page); **no** `GM_getValue`/`setValue` in v1 | ✅ |
| ABP cosmetic `##` → CSS | ✅ |
| Chrome content_scripts CSS/JS fragment import | ✅ |
| Pack size / enabled-per-page limits | ✅ |
| Import warnings for unsupported grants / `@require` | ✅ |

## Explicitly refuse

- Chrome Web Store / `.crx` / full MV3  
- Network filters (`\|\|ads^`) / uBlock scriptlets  
- `addJavascriptInterface` bridge  
- `shouldInterceptRequest`  
- Remote `@require` / `@resource` fetch  
- Guaranteed `document-start` (System WebView; optional androidx.webkit later, currently no new deps)  

## GM storage decision (consensus)

- **No** SharedPreferences + bridge.  
- **v1:** no `GM_getValue` / `GM_setValue`.  
- **Later (optional):** pure `localStorage` shim, page-visible, not private — only after security review.

## Manager UI (shipped in v1.0.3)

- List + enable/disable toggle per pack (built-in vs user pack labeled).
- **Global kill switch** — "Run extensions in the browser"; when off, nothing is injected into any page (`ExtensionRuntime` checks `ExtensionStore.isGloballyEnabled()` first).
- Import (auto-detect Daymark JSON / userscript / ZIP-XPI-CRX) with a page-context trust warning in the review dialog and a 5 MB cap; new packs start disabled until separately enabled.
- **Details** dialog per pack: source, id, state, run-at, CSS/JS sizes, full match/exclude lists, paused sites, explicit "Permissions: none" statement, and import warnings.
- **Sites** dialog per pack: pause/resume the pack on specific hosts (host or subdomain); sites are normalized (`example.com`, `https://example.com/page`, case/dot normalization; non-HTTPS/credentialed input rejected).
- **Export** user packs to a `.daymark-ext.json` document via SAF (`ACTION_CREATE_DOCUMENT`); built-ins are not exportable.
- **Remove** valid user packs with confirmation.
- **Malformed-pack recovery (PR #659, pending review):** list malformed/oversized/unreadable/non-regular records without loading them; export exact raw bytes only for fingerprinted regular malformed files; remove only after explicit confirmation and a fresh SHA-256/stable-byte check. Unsafe or oversized entries remain visible but non-actionable; no automatic cleanup.
- `disabledSites` persist inside the pack file (user packs) or per-pack preferences (built-ins) and round-trip through `toDaymarkJson`/`parseDaymarkJson`.
- Match rules are scheme-strict: an `https://…` pattern never matches a cleartext URL (`BrowserExtension.MatchRules`).

## Signing / release note

Production APK publish must use the **same keystore** as existing v1.0.x installs. A signer mismatch must fail closed (already enforced in CI).
