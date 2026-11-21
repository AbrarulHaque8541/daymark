package com.abrar.daymark;

/**
 * Pure policy for the app Settings tree: one source of truth, no duplicate
 * “More” vs Settings paths, browser-only controls stay in the browser sheet.
 */
public final class SettingsHierarchyPolicy {
    private SettingsHierarchyPolicy() {}

    public enum Section {
        PERSONALIZE("PERSONALIZE"),
        ACCESSIBILITY_DATA("ACCESSIBILITY & DATA"),
        CONNECTIONS("CONNECTIONS"),
        TASK_TOOLS("TASK TOOLS"),
        POWER("POWER FEATURES");

        public final String title;

        Section(String title) {
            this.title = title;
        }
    }

    public static Section[] sectionsInOrder() {
        return Section.values();
    }

    /**
     * Rows that belong only in browser settings / tools — not in app Settings.
     * Prevents the duplicate-control problem the owner flagged.
     */
    public static final String[] BROWSER_ONLY_ROW_IDS = {
            "download_settings",
            "search_engine",
            "safe_browsing",
            "block_images",
            "desktop_site_default",
            "online_browsing"
    };

    public static boolean isBrowserOnlyRow(String rowId) {
        if (rowId == null) return false;
        for (String id : BROWSER_ONLY_ROW_IDS) {
            if (id.equals(rowId)) return true;
        }
        return false;
    }

    /** App Settings must not mirror a second permanent “More” hub. */
    public static boolean allowDuplicateMoreHub() {
        return false;
    }

    /** Soft present duration hint — host uses {@link UiMotionPolicy#SHEET_PRESENT_MS}. */
    public static long sheetPresentMs() {
        return UiMotionPolicy.SHEET_PRESENT_MS;
    }
}
