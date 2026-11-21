package com.abrar.daymark;

/**
 * Pure policy for the browser tools sheet (overflow replacement structure).
 *
 * <p>Groups actions so the menu is scannable and fast: Page, Find, Library,
 * Privacy, Navigation. Duplicates of bottom-chrome controls stay out of the
 * first group. No ad or “lucky spin” style entries.
 */
public final class BrowserToolsSheetPolicy {
    private BrowserToolsSheetPolicy() {}

    public enum Group {
        PAGE("Page"),
        FIND("Find"),
        LIBRARY("Library"),
        PRIVACY("Privacy & settings"),
        NAVIGATION("Navigation");

        public final String title;

        Group(String title) {
            this.title = title;
        }
    }

    /** Action ids the host maps to existing handlers. */
    public static final String[] PAGE_ACTIONS = {
            "new_tab",
            "share",
            "copy_url",
            "open_external",
            "desktop_site",
            "bookmark_page",
            "save_as_task"
    };

    public static final String[] FIND_ACTIONS = {
            "find_in_page",
            "reader_mode",
            "full_screen",
            "find_media"
    };

    public static final String[] LIBRARY_ACTIONS = {
            "downloads",
            "bookmarks",
            "site_history",
            "extensions"
    };

    public static final String[] PRIVACY_ACTIONS = {
            "privacy_details",
            "browser_settings",
            "site_info",
            "online_toggle",
            "diagnostics"
    };

    public static final String[] NAVIGATION_ACTIONS = {
            "back",
            "forward",
            "reload"
    };

    public static String[] actionsFor(Group group) {
        switch (group) {
            case PAGE:
                return PAGE_ACTIONS;
            case FIND:
                return FIND_ACTIONS;
            case LIBRARY:
                return LIBRARY_ACTIONS;
            case PRIVACY:
                return PRIVACY_ACTIONS;
            case NAVIGATION:
                return NAVIGATION_ACTIONS;
            default:
                return new String[0];
        }
    }

    public static Group[] groupsInOrder() {
        return Group.values();
    }

    /** Prefer a soft sheet presentation over a long flat list when the host can. */
    public static boolean preferGroupedSheet() {
        return true;
    }

    public static int maxVisibleActionsHint() {
        return 16;
    }
}
