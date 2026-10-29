package com.abrar.daymark;

import java.util.ArrayList;
import java.util.List;

/**
 * Host-side regression checks for the press tint's contrast clamp.
 *
 * <p>The device symptom this protects against: adding a visible pressed fill to the hand-built
 * rows and buttons is supposed to be an accessibility improvement, but a fixed overlay consumes
 * the contrast headroom the palette was measured to leave. In the dark theme a 15&nbsp;% white
 * layer lifts {@code surface} far enough that {@code muted} row labels fall below the 4.5:1 the
 * repository's palette guard promises — the press state would silently break a guarded invariant
 * the moment a user touched a row.
 *
 * <p>Every label/fill pair below is a pair an actual {@code MainActivity.pressable(...)} call site
 * renders, in all four palette variants (light/dark × normal/high-contrast), and the alpha is the
 * one the activity selects for that variant.
 */
public final class PressSurfaceSmoke {
    private PressSurfaceSmoke() {}

    /** One press surface exactly as a call site composes it. */
    private static final class Surface {
        final String role;
        final boolean dark;
        final boolean highContrast;
        final int label;
        final int fill;

        Surface(String role, boolean dark, boolean highContrast, int label, int fill) {
            this.role = role;
            this.dark = dark;
            this.highContrast = highContrast;
            this.label = label;
            this.fill = fill;
        }

        int preferredAlpha() {
            return highContrast ? PressSurface.HIGH_CONTRAST_ALPHA : PressSurface.PREFERRED_ALPHA;
        }

        String id() {
            return role + " " + (dark ? "dark" : "light") + "/" + (highContrast ? "hc" : "default");
        }
    }

    private static int rgb(int red, int green, int intBlue) {
        return (red << 16) | (green << 8) | intBlue;
    }

    private static final int WHITE = rgb(255, 255, 255);
    private static final int BLACK = rgb(0, 0, 0);

    public static void main(String[] args) {
        List<Surface> surfaces = callSiteSurfaces();
        check(!surfaces.isEmpty(), "the smoke must enumerate the real pressable call sites");

        for (Surface surface : surfaces) {
            double restingRatio = ratioOf(surface.label, surface.fill);
            check(restingRatio >= PressSurface.MINIMUM_RATIO,
                    "resting " + surface.id() + " must already clear the palette guarantee, "
                            + "otherwise the guard being tested is meaningless");

            int pressed = PressSurface.pressedFill(surface.label, surface.fill, surface.dark,
                    surface.preferredAlpha());
            double pressedRatio = ratioOf(surface.label, pressed);
            check(pressedRatio >= PressSurface.MINIMUM_RATIO,
                    "pressed " + surface.id() + " must never drop the label below "
                            + PressSurface.MINIMUM_RATIO + ":1, got " + pressedRatio);

            // The tint must read as a press in both themes: dark surfaces are pressed with light
            // ink and light surfaces with dark ink, so the fill moves toward the ink and never
            // past it. Overshooting would turn a press into a highlight blob.
            int ink = PressSurface.overlayRgb(surface.dark);
            double inkLum = PressSurface.luminance(ink);
            double restingLum = PressSurface.luminance(surface.fill);
            double pressedLum = PressSurface.luminance(pressed);
            boolean movedTowardInk = pressedLum == restingLum
                    || (inkLum > restingLum ? pressedLum > restingLum : pressedLum < restingLum);
            check(movedTowardInk,
                    "a pressed fill must move toward the press ink, never away from it: "
                            + surface.id());
            check(Math.abs(pressedLum - inkLum) <= Math.abs(restingLum - inkLum) + 1e-12,
                    "a pressed fill must never overshoot the ink it is blended toward: "
                            + surface.id());
        }

        // The clamp must be load-bearing, not decoration: at least one real pair has to lose
        // alpha, and at least one must keep the full preferred overlay.
        Surface darkRow = new Surface("taskRow", true, false, rgb(148, 161, 172), rgb(22, 28, 34));
        int clamped = PressSurface.safeAlpha(darkRow.label, darkRow.fill,
                PressSurface.overlayRgb(true), darkRow.preferredAlpha(),
                PressSurface.MINIMUM_RATIO);
        check(clamped > 0, "the dark-theme row still has headroom, so the press must stay visible");
        check(clamped < PressSurface.PREFERRED_ALPHA,
                "the dark-theme row must be clamped below the preferred overlay; if this fails the "
                        + "clamp is dead code and a blanket tint is being shipped instead");
        check(clamped == 31,
                "PressSurface's javadoc documents the dark row settling at 12.2 % (31/255) for "
                        + "4.55:1; if the palette or the clamp moved, update the prose and this pin");
        check(ratioOf(darkRow.label, PressSurface.composite(darkRow.fill,
                PressSurface.overlayRgb(true), PressSurface.PREFERRED_ALPHA))
                < PressSurface.MINIMUM_RATIO,
                "an unclamped preferred tint on the dark row must be the contrast-breaking case");

        // Zero headroom must fall back to the stroke alone rather than a broken tint.
        int noHeadroom = PressSurface.safeAlpha(WHITE, WHITE, BLACK,
                PressSurface.PREFERRED_ALPHA, PressSurface.MINIMUM_RATIO);
        check(noHeadroom == 0, "a surface with no headroom must not be tinted at all");
        check(PressSurface.tintIsInvisible(WHITE, WHITE, false, PressSurface.PREFERRED_ALPHA),
                "tintIsInvisible must agree with safeAlpha for the no-headroom surface");
        check(PressSurface.pressedFill(WHITE, WHITE, false, PressSurface.PREFERRED_ALPHA) == WHITE,
                "the fallback must return the resting fill unchanged so only the stroke moves");
        check(!PressSurface.tintIsInvisible(darkRow.label, darkRow.fill, true,
                PressSurface.PREFERRED_ALPHA),
                "a surface with headroom must not be reported as stroke-only");

        // Alpha is monotonically capped by what the caller prefers: asking for more must never
        // produce a smaller press, and asking for none must produce none.
        int low = PressSurface.safeAlpha(darkRow.label, darkRow.fill,
                PressSurface.overlayRgb(true), 0x10, PressSurface.MINIMUM_RATIO);
        check(low <= clamped && low <= 0x10,
                "safeAlpha must never exceed the caller's preferred alpha");
        check(PressSurface.safeAlpha(darkRow.label, darkRow.fill,
                PressSurface.overlayRgb(true), 0, PressSurface.MINIMUM_RATIO) == 0,
                "a zero preferred alpha must keep the surface unpressed");

        // Compositing edges, and the luminance/ratio math the whole guard depends on.
        check(PressSurface.composite(rgb(10, 20, 30), WHITE, 0) == rgb(10, 20, 30),
                "alpha 0 must return the base untouched");
        check(PressSurface.composite(rgb(10, 20, 30), BLACK, -4) == rgb(10, 20, 30),
                "a negative alpha must clamp to the base rather than invert the channel math");
        check(PressSurface.composite(rgb(10, 20, 30), WHITE, 999) == WHITE,
                "an oversized alpha must clamp to full overlay instead of overflowing the channel");
        check(PressSurface.composite(rgb(10, 20, 30), rgb(255, 128, 64) | 0xFF000000, 255)
                == rgb(255, 128, 64), "the overlay alpha channel must never leak into the result");
        check(Math.abs(PressSurface.luminance(WHITE) - 1.0) < 1e-9, "white luminance must be 1.0");
        check(PressSurface.luminance(BLACK) == 0.0, "black luminance must be 0.0");
        check(Math.abs(PressSurface.contrastRatio(BLACK, WHITE) - 21.0) < 0.01,
                "the WCAG anchor value black/white must be 21:1");
        check(PressSurface.contrastRatio(rgb(100, 120, 140), rgb(100, 120, 140)) == 1.0,
                "a color against itself must be 1:1 regardless of argument order");
        check(PressSurface.contrastRatio(BLACK, WHITE) == PressSurface.contrastRatio(WHITE, BLACK),
                "the ratio must be symmetric");

        // The overlay ink must flip with the theme, or a dark press would read as a highlight.
        check(PressSurface.overlayRgb(true) == WHITE && PressSurface.overlayRgb(false) == BLACK,
                "dark surfaces are pressed with light ink, light surfaces with dark ink");

        System.out.println("PASS press surface smoke (" + surfaces.size() + " palette pairs)");
    }

    /** The label/fill pairs MainActivity renders through pressable(...), in every palette variant. */
    private static List<Surface> callSiteSurfaces() {
        List<Surface> all = new ArrayList<>();
        for (boolean dark : new boolean[] {true, false}) {
            for (boolean highContrast : new boolean[] {false, true}) {
                int background = dark ? rgb(14, 18, 22) : rgb(242, 245, 247);
                int surface = dark ? rgb(22, 28, 34) : WHITE;
                int surfaceAlt = dark ? rgb(30, 38, 46) : rgb(235, 240, 243);
                int muted = dark
                        ? (highContrast ? rgb(206, 216, 222) : rgb(148, 161, 172))
                        : (highContrast ? rgb(46, 54, 60) : rgb(82, 95, 105));
                int accent = dark
                        ? (highContrast ? rgb(168, 232, 212) : rgb(122, 204, 178))
                        : (highContrast ? rgb(13, 84, 73) : rgb(22, 112, 95));
                int accentSoft = dark
                        ? (highContrast ? rgb(26, 56, 48) : rgb(32, 52, 47))
                        : (highContrast ? rgb(219, 240, 235) : rgb(226, 240, 236));
                int danger = dark
                        ? (highContrast ? rgb(255, 176, 168) : rgb(238, 150, 142))
                        : (highContrast ? rgb(140, 38, 30) : rgb(168, 62, 56));
                int dangerSoft = dark
                        ? (highContrast ? rgb(74, 34, 32) : rgb(58, 38, 38))
                        : (highContrast ? rgb(255, 231, 228) : rgb(251, 238, 237));

                // buildTaskRow and addSettingsRow.
                all.add(new Surface("taskRow", dark, highContrast, muted, surface));
                all.add(new Surface("settingsRow", dark, highContrast, muted, surface));
                // Browser chrome buttons and the neutral compact button.
                all.add(new Surface("chromeButton", dark, highContrast, accent, surfaceAlt));
                all.add(new Surface("compactButton", dark, highContrast, accent, surfaceAlt));
                all.add(new Surface("compactButtonDanger", dark, highContrast, danger, dangerSoft));
                // plainButton.
                all.add(new Surface("plainButton", dark, highContrast, accent, accentSoft));
                // primaryButton: the label is the page background in the dark theme and white in
                // the light theme, because the accent fill is the darker of the two.
                all.add(new Surface("primaryButton", dark, highContrast,
                        dark ? background : WHITE, accent));
            }
        }
        return all;
    }

    private static double ratioOf(int label, int fill) {
        return PressSurface.contrastRatio(label, fill);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
