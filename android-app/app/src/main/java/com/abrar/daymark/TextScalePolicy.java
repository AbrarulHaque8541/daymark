package com.abrar.daymark;

/**
 * Pure policy for callers that pass a scaled value to TextView.setTextSize(float).
 *
 * <p>That Android overload interprets its argument as SP and applies the device's
 * font scale itself. This policy clamps the intended rendered scale (app choice x
 * device scale), then removes the device scale from the value passed to TextView
 * so the platform applies it exactly once.
 */
final class TextScalePolicy {
    /** Smallest rendered scale; below this the UI becomes unreadable. */
    static final float MIN_SCALE = 0.85f;
    /** Largest rendered scale; above this labels overflow their controls. */
    static final float MAX_SCALE = 2.0f;

    private TextScalePolicy() { }

    /**
     * Returns the multiplier for setTextSize(float), whose SP conversion applies
     * systemFontScale implicitly. The resulting rendered scale is the app choice
     * times the system font scale, clamped to [{@link #MIN_SCALE},
     * {@link #MAX_SCALE}]. A non-positive system scale is treated as 1.0.
     */
    static float combined(float appScale, float systemFontScale) {
        float system = systemFontScale <= 0f ? 1.0f : systemFontScale;
        float effective = appScale * system;
        if (effective < MIN_SCALE) effective = MIN_SCALE;
        if (effective > MAX_SCALE) effective = MAX_SCALE;
        return effective / system;
    }
}
