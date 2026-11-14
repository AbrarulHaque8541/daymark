package com.abrar.daymark;

/** JDK-only checks for the window-insets (soft keyboard) policy. */
public final class WindowInsetsPolicySmoke {
    private WindowInsetsPolicySmoke() { }

    public static void main(String[] args) {
        assert WindowInsetsPolicy.CONSUME_IME_INSETS
                : "the IME inset must be consumed so the keyboard does not cover the composer";
        assert !WindowInsetsPolicy.DECOR_FITS_SYSTEM_WINDOWS
                : "content must be laid out edge-to-edge and padded by consumed insets";
        assert WindowInsetsPolicy.bottomPadding(48, 0) == 48
                : "with no keyboard the system-bar inset must be used";
        assert WindowInsetsPolicy.bottomPadding(48, 720) == 720
                : "with the keyboard open the larger IME inset must win";
        assert WindowInsetsPolicy.bottomPadding(0, 0) == 0
                : "no insets means no bottom padding";
        assert WindowInsetsPolicy.shouldApplyImeInsets(720)
                : "a present IME inset must be applied";
        assert !WindowInsetsPolicy.shouldApplyImeInsets(0)
                : "an absent IME inset must not add padding";
        // 1920px window: 63px status inset, 872px IME; the dialog is centered in the 985px safe area.
        assert WindowInsetsPolicy.dialogYOffsetForIme(63, 872) == -404
                : "the dialog center must shift upward by half the additional keyboard occlusion";
        assert WindowInsetsPolicy.dialogYOffsetForIme(96, 72) == 0
                : "a keyboard inset smaller than the navigation inset must not shift the dialog";
        assert WindowInsetsPolicy.dialogYOffsetForIme(63, 0) == 0
                : "a hidden keyboard must restore the centered dialog position";
        assert WindowInsetsPolicy.dialogHeightForIme(1920, 63, 63, 872) == 985
                : "the task editor dialog must fit between the status bar and visible keyboard";
        assert WindowInsetsPolicy.dialogHeightForIme(1920, 63, 96, 72) == 1761
                : "system navigation inset must win when it exceeds the reported IME inset";
        assert WindowInsetsPolicy.dialogHeightForIme(1920, 63, 63, 0) == 0
                : "a hidden keyboard must restore the dialog's natural WRAP_CONTENT height";
        assert WindowInsetsPolicy.dialogHeightForIme(0, 0, 0, 720) == 0
                : "invalid window metrics must not produce a dialog layout";
        assert WindowInsetsPolicy.dialogHeightForIme(100, 200, 0, 80) == 1
                : "a very small safe area must clamp to a positive layout height";
        System.out.println("PASS window insets policy: IME padding and keyboard-safe task-editor dialog height");
    }
}
