package com.abrar.daymark;

/** Host smoke for browser UX speed policies (home / tools / downloads / settings). */
public final class BrowserUxSpeedPolicySmoke {
    private BrowserUxSpeedPolicySmoke() {}

    public static void main(String[] args) {
        int n = 0;

        // Home
        check(BrowserHomeLayoutPolicy.MAX_QUICK_TILES == 4, "home quick tiles capped at 4");
        n++;
        check(BrowserHomeLayoutPolicy.QUICK_TILE_IDS.length == BrowserHomeLayoutPolicy.QUICK_TILE_LABELS.length,
                "home tile ids/labels aligned");
        n++;
        check(BrowserHomeLayoutPolicy.searchPillBeforeTiles(), "search pill before tiles");
        n++;
        check(!BrowserHomeLayoutPolicy.allowPromotionalBanners(), "no promo banners on home");
        n++;
        check(BrowserHomeLayoutPolicy.isValidQuickTileId("downloads"), "downloads tile known");
        n++;
        check(!BrowserHomeLayoutPolicy.isValidQuickTileId("lucky_spin"), "no lucky-spin tile");
        n++;

        // Tools sheet groups
        check(BrowserToolsSheetPolicy.preferGroupedSheet(), "grouped tools sheet preferred");
        n++;
        check(BrowserToolsSheetPolicy.groupsInOrder().length == 5, "five tool groups");
        n++;
        check(BrowserToolsSheetPolicy.actionsFor(BrowserToolsSheetPolicy.Group.LIBRARY).length >= 3,
                "library group has downloads/bookmarks/history");
        n++;
        int totalActions = 0;
        for (BrowserToolsSheetPolicy.Group g : BrowserToolsSheetPolicy.groupsInOrder()) {
            totalActions += BrowserToolsSheetPolicy.actionsFor(g).length;
        }
        check(totalActions <= BrowserToolsSheetPolicy.maxVisibleActionsHint() + 8,
                "action count stays bounded");
        n++;

        // Downloads filters
        check(BrowserDownloadUiPolicy.filtersInOrder().length == 5, "five download filters");
        n++;
        check(BrowserDownloadUiPolicy.classifyMime("video/mp4") == BrowserDownloadUiPolicy.Filter.VIDEO,
                "video mime classifies");
        n++;
        check(BrowserDownloadUiPolicy.classifyMime("image/png") == BrowserDownloadUiPolicy.Filter.IMAGE,
                "image mime classifies");
        n++;
        check(BrowserDownloadUiPolicy.matches(BrowserDownloadUiPolicy.Filter.ALL, "audio/mpeg"),
                "ALL matches any mime");
        n++;
        check(!BrowserDownloadUiPolicy.matches(BrowserDownloadUiPolicy.Filter.VIDEO, "image/jpeg"),
                "video filter rejects image");
        n++;

        // Settings hierarchy
        check(SettingsHierarchyPolicy.sectionsInOrder().length == 5, "five settings sections");
        n++;
        check(!SettingsHierarchyPolicy.allowDuplicateMoreHub(), "no duplicate More hub");
        n++;
        check(SettingsHierarchyPolicy.isBrowserOnlyRow("search_engine"), "search engine is browser-only");
        n++;
        check(!SettingsHierarchyPolicy.isBrowserOnlyRow("appearance"), "appearance stays in app settings");
        n++;
        check(SettingsHierarchyPolicy.sheetPresentMs() == UiMotionPolicy.SHEET_PRESENT_MS,
                "settings sheet uses motion policy duration");
        n++;

        // Speed caps from motion policy still honest
        check(UiMotionPolicy.TAB_SWITCH_MS <= 300L, "tab switch stays fast");
        n++;
        check(UiMotionPolicy.CHROME_HIDE_MS <= 200L, "chrome hide stays fast");
        n++;

        System.out.println("PASS browser ux speed policy smoke: " + n + " assertions");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
