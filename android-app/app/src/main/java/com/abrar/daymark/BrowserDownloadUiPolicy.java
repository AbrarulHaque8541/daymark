package com.abrar.daymark;

/**
 * Pure UI policy for the browser downloads list filters and labels.
 *
 * <p>Filter chips (All / Video / Image / Audio / Other) keep the list fast to
 * scan. Progress wording stays honest for unknown totals.
 */
public final class BrowserDownloadUiPolicy {
    private BrowserDownloadUiPolicy() {}

    public enum Filter {
        ALL("All"),
        VIDEO("Video"),
        IMAGE("Image"),
        AUDIO("Audio"),
        OTHER("Other");

        public final String label;

        Filter(String label) {
            this.label = label;
        }
    }

    public static Filter[] filtersInOrder() {
        return Filter.values();
    }

    /**
     * Classifies a MIME type into a filter bucket. Null/blank → OTHER.
     */
    public static Filter classifyMime(String mimeType) {
        if (mimeType == null || mimeType.trim().isEmpty()) return Filter.OTHER;
        String mime = mimeType.trim().toLowerCase(java.util.Locale.ROOT);
        if (mime.startsWith("video/")) return Filter.VIDEO;
        if (mime.startsWith("image/")) return Filter.IMAGE;
        if (mime.startsWith("audio/")) return Filter.AUDIO;
        return Filter.OTHER;
    }

    public static boolean matches(Filter filter, String mimeType) {
        if (filter == null || filter == Filter.ALL) return true;
        return classifyMime(mimeType) == filter;
    }

    /** Soft sheet title when the list is empty. */
    public static String emptyListMessage() {
        return "No browser downloads yet.";
    }

    public static boolean showPauseAllWhenMultipleRunning() {
        return true;
    }
}
