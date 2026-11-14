package com.abrar.daymark;

/**
 * Pure policy for how the Activity and floating task-editor dialog consume window insets.
 *
 * <p>Android 15+ enforces edge-to-edge for target SDK 35+, so the app must explicitly handle
 * system-bar and IME insets rather than assuming the framework will resize every window.
 */
final class WindowInsetsPolicy {
    /** The IME (soft keyboard) inset must be consumed so content is not covered. */
    static final boolean CONSUME_IME_INSETS = true;
    /** Content must be laid out edge-to-edge and padded by the insets we consume. */
    static final boolean DECOR_FITS_SYSTEM_WINDOWS = false;

    private WindowInsetsPolicy() { }

    /**
     * Bottom padding for the root view: the larger of the system-bar inset and the
     * IME inset, so the keyboard never covers the composer or the browser viewport.
     */
    static int bottomPadding(int systemBarsBottom, int imeBottom) {
        if (!CONSUME_IME_INSETS) return systemBarsBottom;
        return Math.max(systemBarsBottom, imeBottom);
    }

    /** Whether the IME inset is currently present and must be applied. */
    static boolean shouldApplyImeInsets(int imeBottom) {
        return CONSUME_IME_INSETS && imeBottom > 0;
    }

    /**
     * Center offset for a dialog whose height is capped above the IME. The window's normal
     * centered frame already accounts for the navigation inset, so only the additional IME
     * occlusion shifts its center.
     */
    static int dialogYOffsetForIme(int systemBarsBottom, int imeBottom) {
        if (!shouldApplyImeInsets(imeBottom)) return 0;
        int extraOcclusion = Math.max(0, imeBottom - Math.max(0, systemBarsBottom));
        return -(extraOcclusion / 2);
    }

    /**
     * Available floating-dialog height above the IME. Zero means restore WRAP_CONTENT.
     * The caller positions the dialog within this height and keeps the form scrollable.
     */
    static int dialogHeightForIme(int windowHeight, int topInset, int systemBarsBottom, int imeBottom) {
        if (windowHeight <= 0 || !shouldApplyImeInsets(imeBottom)) return 0;
        int safeTop = Math.max(0, topInset);
        int safeBottom = Math.max(Math.max(0, systemBarsBottom), imeBottom);
        return Math.max(1, windowHeight - safeTop - safeBottom);
    }
}
