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

    /**
     * True when the persisted bookmark list holds more origins than the rail can show.
     * Used only to decide whether a "More…" affordance is useful; never mutates storage.
     */
    static boolean hasAdditionalOrigins(String serializedBookmarks) {
        return BrowserHistory.decode(serializedBookmarks).size() > MAX_VISIBLE;
    }

    /** Total valid saved origins; for accessibility labels only. Never mutates storage. */
    static int totalOrigins(String serializedBookmarks) {
        return BrowserHistory.decode(serializedBookmarks).size();
    }
}
