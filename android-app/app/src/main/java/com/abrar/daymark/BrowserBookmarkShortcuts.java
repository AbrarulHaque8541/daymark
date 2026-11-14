package com.abrar.daymark;

import java.util.ArrayList;
import java.util.List;

/** Selects a small, optional set of explicit saved origins for the browser's blank-tab view. */
final class BrowserBookmarkShortcuts {
    static final int MAX_VISIBLE = 4;

    private BrowserBookmarkShortcuts() { }

    /** Returns the newest valid saved origins, leaving the persisted bookmark list untouched. */
    static List<String> visibleOrigins(String serializedBookmarks) {
        List<String> savedOrigins = BrowserHistory.decode(serializedBookmarks);
        int visibleCount = Math.min(MAX_VISIBLE, savedOrigins.size());
        return new ArrayList<>(savedOrigins.subList(0, visibleCount));
    }
}
