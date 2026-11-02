package com.abrar.daymark;

import android.graphics.Color;
import android.provider.Settings;
import android.view.View;
import android.view.animation.Interpolator;

/**
 * Shared workspace / chrome motion helpers driven by {@link UiMotionPolicy}.
 * Keeps MainActivity animate blocks small and consistent.
 * Explicitly respects system animator duration scale of 0 (reduced motion).
 * Includes subtle glass polish using accent color with low alpha.
 */
public final class WorkspaceMotion {
    private WorkspaceMotion() {}

    private static final int ACCENT = 0xFF16705F;
    private static final int GLASS_ALPHA = 0x18; // ~9% for subtle glass

    private static boolean isReducedMotion(View view) {
        if (view == null || view.getContext() == null) return false;
        try {
            float scale = Settings.Global.getFloat(
                    view.getContext().getContentResolver(),
                    Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
            return scale == 0f;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Apply subtle glass background using accent tint. */
    public static void applyGlassBackground(View view) {
        if (view == null) return;
        int glass = Color.argb(GLASS_ALPHA, Color.red(ACCENT), Color.green(ACCENT), Color.blue(ACCENT));
        view.setBackgroundColor(glass);
    }

    /** Tasks ↔ Web content transition with subtle horizontal slide. */
    public static void animateWorkspaceSwitch(
            View browserScreen,
            View taskScreen,
            boolean enteringWeb,
            int slidePx,
            Interpolator enterInterpolator) {
        View target = enteringWeb ? browserScreen : taskScreen;
        if (target == null) return;
        target.animate().cancel();
        if (isReducedMotion(target)) {
            target.setAlpha(1f);
            target.setTranslationX(0f);
            target.setTranslationY(0f);
            return;
        }
        float slide = slidePx * UiMotionPolicy.tabSlideFraction() * (enteringWeb ? 1f : -1f);
        target.setAlpha(0f);
        target.setTranslationX(slide);
        target.setTranslationY(enteringWeb ? slidePx * 0.66f : -slidePx * 0.33f);
        target.animate()
                .alpha(1f)
                .translationX(0f)
                .translationY(0f)
                .setDuration(UiMotionPolicy.TAB_SWITCH_MS)
                .setInterpolator(enterInterpolator)
                .start();
    }

    /** Soft browser chrome hide (scroll down). */
    public static void hideChrome(View view, float hiddenOffset, Interpolator exitInterpolator, Runnable endAction) {
        if (view == null) return;
        view.animate().cancel();
        view.setVisibility(View.VISIBLE);
        if (isReducedMotion(view)) {
            view.setTranslationY(hiddenOffset);
            view.setAlpha(0f);
            if (endAction != null) endAction.run();
            return;
        }
        view.animate().translationY(hiddenOffset)
                .alpha(0f)
                .setDuration(UiMotionPolicy.CHROME_HIDE_MS)
                .setInterpolator(exitInterpolator)
                .withEndAction(endAction)
                .start();
    }

    /** Soft browser chrome show (scroll up / top). */
    public static void showChrome(View view, float hiddenOffset, Interpolator enterInterpolator) {
        if (view == null) return;
        view.animate().cancel();
        view.setVisibility(View.VISIBLE);
        applyGlassBackground(view); // subtle glass polish
        if (isReducedMotion(view)) {
            view.setTranslationY(0f);
            view.setAlpha(1f);
            return;
        }
        view.setTranslationY(hiddenOffset);
        view.setAlpha(0f);
        view.animate()
                .translationY(0f)
                .alpha(1f)
                .setDuration(UiMotionPolicy.CHROME_SHOW_MS)
                .setInterpolator(enterInterpolator)
                .start();
    }
}
