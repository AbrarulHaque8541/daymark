package com.abrar.daymark;

/**
 * Contrast-aware press state for the app's hand-built surfaces.
 *
 * <p>Every card, row and button in this app is a flat {@code GradientDrawable}, so a touch
 * previously produced no visible confirmation at all. The obvious fix — a fixed 15&nbsp;% state
 * layer over the pressed surface — is not safe here: the palette guarantees at least 4.5:1 for
 * each label/surface pair, and a press overlay consumes that headroom. Measured against the real
 * palette, {@code muted} on the dark theme's {@code surface} rests at 6.50:1 and a 15&nbsp;% white
 * overlay drags it to 4.15:1 — below the ratio the repository guards. On {@code surfaceAlt} the
 * same overlay lands at 3.62:1. A press state that only appears while a finger is down would
 * therefore be the exact moment the app stops meeting its contrast promise.
 *
 * <p>So the tint is sized per surface and per every label that surface draws: the preferred alpha
 * is reduced until the pressed fill still clears the minimum ratio for all of them. The dark row
 * above settles at 12.2&nbsp;% (4.55:1), while the light-theme row keeps almost the whole overlay.
 * A surface with no headroom at all keeps its exact color and relies on the stroke change instead,
 * which cannot affect text contrast. {@code PressSurfaceSmoke} pins these cases over every real
 * label set in the palette.
 *
 * <p>Pure integer arithmetic with no {@code android.graphics} dependency, so the host smoke suite
 * can assert the invariant for every real palette pair.
 */
public final class PressSurface {

    /** Preferred overlay: 15 %. Material's ordinary pressed-layer strength. */
    public static final int PREFERRED_ALPHA = 0x26;

    /** Stronger overlay for the high-contrast theme, where labels carry more weight. */
    public static final int HIGH_CONTRAST_ALPHA = 0x40;

    /** The ratio the palette guard already guarantees for every resting label. */
    public static final double MINIMUM_RATIO = 4.5;

    private PressSurface() { }

    /**
     * Ink for the press overlay: light ink over the dark theme's near-black fills, dark ink over
     * the light theme's white and pale fills. Overlaying the opposite ink would wash the surface
     * out and read as a highlight rather than a press.
     */
    public static int overlayRgb(boolean darkTheme) {
        return darkTheme ? 0x00FFFFFF : 0x00000000;
    }

    /** Blends a translucent overlay onto an opaque RGB value using source-over alpha. */
    public static int composite(int baseRgb, int overlayArgb, int alpha) {
        if (alpha <= 0) return baseRgb & 0xFFFFFF;
        int clamped = Math.min(alpha, 255);
        int ink = overlayArgb & 0xFFFFFF;
        int r = (((baseRgb >> 16 & 0xFF) * (255 - clamped) + (ink >> 16 & 0xFF) * clamped) / 255) & 0xFF;
        int g = (((baseRgb >> 8 & 0xFF) * (255 - clamped) + (ink >> 8 & 0xFF) * clamped) / 255) & 0xFF;
        int b = (((baseRgb & 0xFF) * (255 - clamped) + (ink & 0xFF) * clamped) / 255) & 0xFF;
        return (r << 16) | (g << 8) | b;
    }

    /** WCAG 2.1 relative luminance of an opaque RGB value. */
    public static double luminance(int rgb) {
        return 0.2126 * channel(rgb >> 16 & 0xFF)
                + 0.7152 * channel(rgb >> 8 & 0xFF)
                + 0.0722 * channel(rgb & 0xFF);
    }

    private static double channel(int value) {
        double scaled = value / 255.0;
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
    }

    /** Contrast ratio between two opaque colors, always 1.0 or greater. */
    public static double contrastRatio(int one, int other) {
        double brighter = Math.max(luminance(one), luminance(other));
        double darker = Math.min(luminance(one), luminance(other));
        return (brighter + 0.05) / (darker + 0.05);
    }

    /**
     * Largest overlay alpha in {@code 0..preferredAlpha} whose pressed fill still clears
     * {@code minimumRatio} for {@code labelRgb}. Zero means the surface has no headroom at all and
     * must not be tinted; the stroke change carries the press feedback instead.
     */
    public static int safeAlpha(int labelRgb, int fillRgb, int overlayRgb, int preferredAlpha,
            double minimumRatio) {
        int bounded = Math.max(0, Math.min(preferredAlpha, 255));
        for (int alpha = bounded; alpha >= 0; alpha--) {
            if (contrastRatio(labelRgb, composite(fillRgb, overlayRgb, alpha)) >= minimumRatio) {
                return alpha;
            }
        }
        return 0;
    }

    /**
     * The same clamp measured against every label a surface draws. A row is not tinted for its
     * title alone: an overdue task renders the same row in {@code danger}, and a today task in
     * {@code warning}, so the binding constraint is whichever of those loses contrast first.
     * Clamping only for the resting {@code muted} label leaves an overdue row at 4.37:1 in the dark
     * high-contrast theme and 4.05:1 in the light theme — both under the guarded minimum.
     */
    public static int safeAlpha(int[] labelRgb, int fillRgb, int overlayRgb, int preferredAlpha,
            double minimumRatio) {
        int allowed = preferredAlpha <= 0 ? 0
                : safeAlpha(labelRgb[0], fillRgb, overlayRgb, preferredAlpha, minimumRatio);
        for (int i = 1; i < labelRgb.length; i++) {
            allowed = Math.min(allowed,
                    safeAlpha(labelRgb[i], fillRgb, overlayRgb, preferredAlpha, minimumRatio));
        }
        return Math.max(allowed, 0);
    }

    /**
     * The pressed fill for a surface: {@code fillRgb} tinted by as much overlay as the weakest of
     * {@code labelRgb} can absorb. Never returns a color that fails {@code MINIMUM_RATIO} for any
     * of those labels.
     */
    public static int pressedFill(int[] labelRgb, int fillRgb, boolean darkTheme,
            int preferredAlpha) {
        int ink = overlayRgb(darkTheme);
        int alpha = safeAlpha(labelRgb, fillRgb & 0xFFFFFF, ink, preferredAlpha, MINIMUM_RATIO);
        return composite(fillRgb & 0xFFFFFF, ink, alpha);
    }

    /**
     * True when the press state must be carried by the stroke alone, because even the smallest
     * visible tint would break one of the resting labels' contrast.
     */
    public static boolean tintIsInvisible(int[] labelRgb, int fillRgb, boolean darkTheme,
            int preferredAlpha) {
        return safeAlpha(labelRgb, fillRgb & 0xFFFFFF, overlayRgb(darkTheme), preferredAlpha,
                MINIMUM_RATIO) <= 0;
    }
}
