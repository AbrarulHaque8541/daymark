package com.abrar.daymark;

import android.view.View;
import android.view.animation.Interpolator;

/**
 * Shared workspace / chrome motion helpers driven by {@link UiMotionPolicy}.
 * Keeps MainActivity animate blocks small and consistent.
 */
public final class WorkspaceMotion {
    private WorkspaceMotion() {}

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
