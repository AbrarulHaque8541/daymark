#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
addr = (root / "app/src/main/java/com/abrar/daymark/BrowserAddress.java").read_text(encoding="utf-8")
ai = (root / "app/src/main/java/com/abrar/daymark/AiSiteCatalog.java").read_text(encoding="utf-8")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
network = (root / "app/src/main/java/com/abrar/daymark/BrowserNetworkPolicy.java").read_text(encoding="utf-8")
providers = (root / "BROWSER_SEARCH_PROVIDERS.md").read_text(encoding="utf-8")

for engine in ("DUCKDUCKGO", "GOOGLE", "BING", "BRAVE", "STARTPAGE", "KAGI", "YOU", "YANDEX"):
    assert engine in addr, engine
assert "ChatGPT" in ai and "Perplexity" in ai and "Copilot" in ai and "Grok" in ai
assert "for (BrowserAddress.SearchEngine engine : BrowserAddress.SearchEngine.values())" in activity
assert "isBottomShortcutProvider(engine)" in activity and "isAiProvider(engine)" in activity
assert "browserSearchShortcutButton(engine)" in activity and "browserLastSearchQuery" in activity
assert "canGoBack()" in activity
assert "DEFAULT_ONLINE_ENABLED = true" in network, "fresh installs must start Online like mainstream browsers"
assert "Browsing starts Online." in providers, "provider guide must reflect the Online default"
assert "searches and sites open directly" in providers, "provider guide must explain direct navigation"
assert "enabling Online alone sends no request" in providers, "provider guide must not imply that consent itself requests a page"
assert "switch browsing Offline again from **Browser actions**" in providers
assert "remains offline until the user enables Online" not in providers, "stale offline-mode guidance"
assert "confirmBrowserOnlineAccess(() -> loadBrowserAddress(webAddress))" in activity
assert "BROWSER_ONLINE_EXPLICIT_OPT_IN_KEY" in activity
# UC-style browser home (owner request 2026-11-05): the home grid reuses the shared catalog and
# the same tap handlers as the bottom provider chips, so tiles and chips cannot drift apart.
assert "browserHomeSearchPill()" in activity and "browserHomeTile(" in activity, \
    "browser home must expose the UC-style search pill and quick-access tiles"
assert "browserHomeScenicBackdrop()" in activity, "browser home needs its palette-aware scenic backdrop"
assert "handleBrowserEngineShortcutTap(engine)" in activity and "handleBrowserSiteShortcutTap(entry)" in activity, \
    "home tiles and bottom chips must share one tap implementation per provider kind"
assert "browserAddressInput.requestFocus();" in activity and "InputMethodManager" in activity, \
    "the home search pill must focus the real address bar and open the keyboard"
print("PASS browser catalog and provider guide: catalog wiring, Online default, explicit user-action navigation gate, and quiet first-page status agree")
