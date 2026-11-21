# Clean browser shell (layout reference)

This branch does **not** change the Android WebView, task store, or release pipeline.
It records the home-shell layout the owner asked to study before wiring it into Daymark.

## What the shell does

- Night home: title, engine-marked search field, four tools, five shortcuts.
- Search focus: engine picker (Google, DuckDuckGo, Yandex, Bing, Perplexity) plus URL chips.
- Results: engine chips stay visible. Opening a hit uses a reader card, not a second browser.
- Tabs: count button opens a sheet. New, switch, and close are real tab state.
- Menu: bookmarks, history, downloads, theme, tools, copy, find-in-page, search settings, exit.
- Downloads: All / page / image / audio filters, pause, resume, progress.
- Exit: optional history clear, then close the current tab.
- Bookmarks, history, engine, and night mode persist in local storage for the preview only.

## Not in this branch

- No change under `android-app/`.
- Live pages still belong to the existing System WebView.
- Search in the preview uses the Wikipedia opensearch API so the layout can be judged without embedding third-party sites.

## Suggested Android follow-up (separate change)

1. Restyle the existing browser home to this spacing: one search pill, 4 tools, 5 dials.
2. Move scattered actions into the two sheets (menu + tools) instead of new screens.
3. Keep current Online / cleartext / Safe Browsing policy. Do not add new permissions for this layout.
