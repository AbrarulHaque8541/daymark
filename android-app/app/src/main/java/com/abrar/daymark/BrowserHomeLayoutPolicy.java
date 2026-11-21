package com.abrar.daymark;

/**
 * Pure layout policy for the Web home screen (speed-first, search-first).
 *
 * <p>Inspired by clean mobile-browser home patterns: one search pill, a short
 * row of meaningful tiles, then provider shortcuts. No ad tiles, gift spins,
 * or marketing rows.
 */
public final class BrowserHomeLayoutPolicy {
    private BrowserHomeLayoutPolicy() {}

    /** Maximum quick-action tiles on the first home row (keeps the row scannable). */
    public static final int MAX_QUICK_TILES = 4;

    /** Maximum origins on the optional saved-sites rail. */
    public static final int MAX_SAVED_SITE_CHIPS = 4;

    /** Stable id keys for the primary home tiles, in display order. */
    public static final String[] QUICK_TILE_IDS = {
            "history",
            "bookmarks",
            "downloads",
            "extensions"
    };

    /** Human labels aligned with {@link #QUICK_TILE_IDS}. */
    public static final String[] QUICK_TILE_LABELS = {
            "History",
            "Bookmarks",
            "Downloads",
            "Extensions"
    };

    public static boolean isValidQuickTileId(String id) {
        if (id == null) return false;
        for (String known : QUICK_TILE_IDS) {
            if (known.equals(id)) return true;
        }
        return false;
    }

    /** Search pill stays above tiles so typing is the first action. */
    public static boolean searchPillBeforeTiles() {
        return true;
    }

    /** Home should not reserve space for promotional banners. */
    public static boolean allowPromotionalBanners() {
        return false;
    }
}
