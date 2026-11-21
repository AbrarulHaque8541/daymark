# Browser UI shell preview (v2)

**Status:** design / interaction preview only. Does **not** replace the Android WebView browser in `android-app/`.

## Why this exists

Daymark already has a real browser stack (address bar, downloads, data, search providers). This branch adds a **mobile UI shell** so we can align layout with:

- Clean home (omnibox + speed dial only — no duplicate tool row on home)
- Search results: **All / Images / News / Videos / Maps** tabs on **top**
- Search **engine switcher at the bottom** of the results chrome (not competing with type tabs)
- Menu as the single place for tools (bookmarks, history, downloads, settings, shields, fire, private tab)
- Settings with many **opt-in toggles** drawn from common mobile browser patterns (privacy, tabs, reading, look)
- Light motion: rise-in cards, slide-up sheets

## How to view

Open [`daymark-browser.html`](./daymark-browser.html) in a mobile browser or Chrome device mode (phone width).

## What is real in this file

| Piece | Behavior |
|-------|----------|
| Omnibox | URL vs search detection, engine cycle, suggestions from history/bookmarks/dials |
| Search | Wikipedia opensearch demo results (needs network) |
| Tabs | New / private; private skips history write |
| Bookmarks / history / reading list / notes | localStorage on this device |
| Downloads | Simulated progress UI |
| Feature toggles | Persisted flags for product decisions |

## What is not real here

- System WebView page rendering
- Real ad/tracker blocking engine
- VPN, extensions, password sync
- Production download pipeline in `browser-download-logic.js`

Use this shell to decide layout, then port to Android layouts / Compose against the existing browser modules.

## Mapping to repo modules

- Address / omnibox concepts → `browser-address-logic.js`, `browser-address-ui.js`
- History / bookmarks / data → `browser-data-logic.js`, `browser-data-ui.js`
- Downloads → `browser-download-logic.js`
- Search providers → `android-app/BROWSER_SEARCH_PROVIDERS.md`
- Android chrome → `android-app/` browser activities/fragments

## Next implementation steps (Android)

1. Reorder search-results chrome: type tabs top, engine chips bottom.
2. Remove home shortcut row that duplicates the overflow menu.
3. Wire Settings feature flags to real preferences where already supported.
4. Keep privacy defaults aligned with Daymark (on-device task data, no forced account).

## CI retry note (docs-only)

This docs-only commit retriggers the "Build and verify unsigned debug variants" check after its `Clean Android build` step (`./gradlew clean`) exited 1 in 4m30s — the same infra flake documented on PR #820. This branch touches ZERO Android files (3 files, all under docs/browser-ui-preview/); all source-side checks (build with npm test, Shared contracts ubuntu + windows, workflow validation) PASS on head f7a8bdaafi. No tests, guards, or CI definitions changed.

---
Work by: Vibe
Model: GLM 5.3 Flash
Tooling: Vibe agent (github_app MCP: get_file_contents, push_files, merge_pull_request)
Timestamp (UTC): 2026-11-21T08:29:12Z
