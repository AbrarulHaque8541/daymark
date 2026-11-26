# Browser tools sheet — MainActivity live wire

## Problem (current main)
`showBrowserOverflowMenu` uses a flat `String[]` of ~23 items and `switch (which)` on integer indices. Adding/reordering actions breaks cases. `BrowserToolsSheetPolicy` exists on main but is unused by the menu.

## Fix
1. Add `BrowserToolsSheetLabels.java` (this branch).
2. In `MainActivity.java`, **replace the entire method** `showBrowserOverflowMenu` with the grouped version below, and **add** `dispatchBrowserToolAction` immediately after it.

## Replacement code (paste into MainActivity.java)

Find:
```
private void showBrowserOverflowMenu(View anchor) {
```
Replace from that line through the closing `}` of the method (before the diagnostics javadoc) with:

```java
    private void showBrowserOverflowMenu(View anchor) {
        if (browserPrivacyDisclosure == null) browserPrivacyDisclosure = "";
        final java.util.ArrayList<String> labels = new java.util.ArrayList<>();
        final java.util.ArrayList<String> actionIds = new java.util.ArrayList<>();
        for (BrowserToolsSheetPolicy.Group group : BrowserToolsSheetPolicy.groupsInOrder()) {
            labels.add("— " + group.title + " —");
            actionIds.add(null);
            for (String actionId : BrowserToolsSheetPolicy.actionsFor(group)) {
                labels.add(BrowserToolsSheetLabels.label(actionId));
                actionIds.add(actionId);
            }
        }
        new AlertDialog.Builder(this)
                .setTitle("Browser tools")
                .setItems(labels.toArray(new String[0]), (dialog, which) -> {
                    if (which < 0 || which >= actionIds.size()) return;
                    String actionId = actionIds.get(which);
                    if (actionId == null) return;
                    dispatchBrowserToolAction(actionId);
                }).show();
    }

    private void dispatchBrowserToolAction(String actionId) {
        if (actionId == null) return;
        switch (actionId) {
            case "new_tab": requestNewBrowserTab(); break;
            case "find_in_page": showFindInPageDialog(); break;
            case "reader_mode": openReaderMode(); break;
            case "full_screen": openFullScreenWebView(); break;
            case "share": shareCurrentBrowserUrl(); break;
            case "copy_url": copyCurrentBrowserUrl(); break;
            case "open_external": openCurrentBrowserExternally(); break;
            case "desktop_site": toggleDesktopSite(); break;
            case "downloads": showBrowserDownloadsDialog(); break;
            case "find_media": findMediaOnPage(); break;
            case "extensions": showBrowserExtensionsManager(); break;
            case "site_history": showBrowserHistoryDialog(); break;
            case "privacy_details": showInfo("Privacy & connection details", browserPrivacyDisclosure); break;
            case "browser_settings": showBrowserSettingsDialog(); break;
            case "site_info": showBrowserSiteInfoDialog(); break;
            case "online_toggle":
                if (browserNetworkPolicy.isOnlineEnabled()) {
                    setBrowserOnlineEnabled(false);
                    showToast("Online browsing is off. Pages and tabs were closed.");
                } else {
                    showToast("Online browsing is already off.");
                }
                break;
            case "diagnostics": showBrowserDiagnosticsDialog(); break;
            case "bookmark_page": bookmarkCurrentBrowserPage(); break;
            case "bookmarks": showBrowserBookmarksDialog(); break;
            case "save_as_task": saveCurrentPageAsTask(); break;
            case "back":
                if (browserWebView != null && browserWebView.canGoBack()) browserWebView.goBack();
                else showBrowserStatus("There is no earlier page to go back to.");
                break;
            case "forward":
                if (browserWebView != null && browserWebView.canGoForward()) browserWebView.goForward();
                else showBrowserStatus("There is no later page to go forward to.");
                break;
            case "reload":
                if (browserWebView != null) {
                    if (browserWebView.getUrl() != null && browserWebView.getProgress() < 100) browserWebView.stopLoading();
                    else browserWebView.reload();
                } else showBrowserStatus("No web page is open yet.");
                break;
            default: break;
        }
    }
```

## Verify
- Menu shows section headers: Page, Find, Library, Privacy & settings, Navigation
- Each action still works (same handlers as before)
- No remaining `final String[] actions = { "New tab"`

## Next
Wire `BrowserDownloadUiPolicy` filter chips into `showBrowserDownloadsDialog`.
