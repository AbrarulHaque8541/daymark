package com.abrar.daymark;

/**
 * Human labels for {@link BrowserToolsSheetPolicy} action ids.
 * Keeps wording in one place so the overflow sheet stays consistent.
 */
public final class BrowserToolsSheetLabels {
    private BrowserToolsSheetLabels() {}

    public static String label(String actionId) {
        if (actionId == null) return "";
        switch (actionId) {
            case "new_tab": return "New tab";
            case "share": return "Share page";
            case "copy_url": return "Copy page URL";
            case "open_external": return "Open in external browser";
            case "desktop_site": return "Desktop site";
            case "bookmark_page": return "Bookmark this page";
            case "save_as_task": return "Save page as task";
            case "find_in_page": return "Find in page";
            case "reader_mode": return "Reader mode";
            case "full_screen": return "Full-screen page";
            case "find_media": return "Find media on page";
            case "downloads": return "Downloads";
            case "bookmarks": return "Bookmarks";
            case "site_history": return "Site history";
            case "extensions": return "Extensions";
            case "privacy_details": return "Privacy details";
            case "browser_settings": return "Browser settings";
            case "site_info": return "Site info";
            case "online_toggle": return "Turn off online browsing";
            case "diagnostics": return "Diagnostics";
            case "back": return "Back";
            case "forward": return "Forward";
            case "reload": return "Reload";
            default: return actionId;
        }
    }
}
