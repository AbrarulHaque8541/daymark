package com.abrar.daymark;

import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;

/**
 * Professional press feedback for interactive surfaces.
 * Subtle scale-down on press, restore on release/cancel.
 * Skips animation entirely when reduced-motion is active so the interaction remains instant.
 * No haptic here — callers decide based on their context.
 */
public final class UiPressFeedback {
    private static final float PRESSED_SCALE = 0.96f;
    private static final long PRESS_MS = 80L;
    private static final long RELEASE_MS = 120L;

    private UiPressFeedback() {}

    /**
     * Attach press/release scale feedback to a view.
     * Safe to call multiple times; replaces any previous listener.
     */
    public static void attach(View view) {
        if (view == null) return;
        view.setOnTouchListener((v, event) -> {
            if (UiMotionPolicy.isReducedMotion()) {
                return false; // let the click proceed with no animation
            }
            switch (event.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    v.animate()
                            .scaleX(PRESSED_SCALE)
                            .scaleY(PRESSED_SCALE)
                            .setDuration(PRESS_MS)
                            .setInterpolator(new AccelerateDecelerateInterpolator())
                            .start();
                    break;
                case android.view.MotionEvent.ACTION_UP:
                case android.view.MotionEvent.ACTION_CANCEL:
                    v.animate()
                            .scaleX(1f)
                            .scaleY(1f)
                            .setDuration(RELEASE_MS)
                            .setInterpolator(new AccelerateDecelerateInterpolator())
                            .start();
                    break;
                default:
                    break;
            }
            return false; // do not consume; allow click / long-click
        });
    }

    /**
     * Detach feedback and reset scale immediately.
     */
    public static void detach(View view) {
        if (view == null) return;
        view.setOnTouchListener(null);
        view.animate().cancel();
        view.setScaleX(1f);
        view.setScaleY(1f);
    }
}
