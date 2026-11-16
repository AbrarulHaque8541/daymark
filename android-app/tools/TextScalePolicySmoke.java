package com.abrar.daymark;

/** JDK-only checks for the rendered app-choice x system-font-scale policy. */
public final class TextScalePolicySmoke {
    private TextScalePolicySmoke() { }

    public static void main(String[] args) {
        assert renderedScale(1.0f, 1.0f) == 1.0f
                : "standard text at the default system scale must stay 1.0";
        assert renderedScale(1.25f, 1.0f) == 1.25f
                : "the app's extra-large choice must be honoured at the default system scale";
        assert Math.abs(TextScalePolicy.combined(1.25f, 1.3f) - 1.25f) < 0.0001f
                : "the SP multiplier must not pre-apply Android's system font scale";
        assert Math.abs(renderedScale(1.25f, 1.3f) - 1.625f) < 0.0001f
                : "the rendered scale must include system font scale exactly once";
        assert Math.abs(renderedScale(0.9f, 0.5f) - TextScalePolicy.MIN_SCALE) < 0.0001f
                : "an extreme small combination must clamp the rendered scale to MIN_SCALE";
        assert Math.abs(renderedScale(1.25f, 2.0f) - TextScalePolicy.MAX_SCALE) < 0.0001f
                : "an extreme large combination must clamp the rendered scale to MAX_SCALE";
        assert renderedScale(1.0f, 0f) == 1.0f
                : "a zero system scale must be treated as 1.0";
        assert renderedScale(1.0f, -1f) == 1.0f
                : "a negative system scale must be treated as 1.0";
        assert Math.abs(renderedScale(1.0f, 3.0f) - TextScalePolicy.MAX_SCALE) < 0.0001f
                : "large platform font scales must still honor the rendered-scale cap";
        System.out.println("PASS text scale policy: SP receives one system-scale application and rendered size is clamped");
    }

    private static float renderedScale(float appScale, float systemFontScale) {
        float system = systemFontScale <= 0f ? 1.0f : systemFontScale;
        return TextScalePolicy.combined(appScale, systemFontScale) * system;
    }
}
