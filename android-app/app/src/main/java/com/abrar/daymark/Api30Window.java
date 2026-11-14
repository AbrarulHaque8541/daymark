package com.abrar.daymark;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Insets;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.view.WindowMetrics;

/**
 * API 30 window calls isolated from the launcher activity.
 *
 * <p>{@code Insets}, {@code WindowMetrics}, and {@code WindowInsets.Type} do not exist before
 * API 30. Referencing them from a method that always runs crashes cold start on Android 8, 9,
 * and 10. Callers must check {@code SDK_INT >= 30} before loading this class.
 */
@SuppressLint("NewApi")
final class Api30Window {
    private Api30Window() { }

    static void setDecorFits(Window window, boolean fits) {
        window.setDecorFitsSystemWindows(fits);
    }

    static void applyInsets(View root, WindowInsets insets, int sidePad) {
        Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        int imeBottom = WindowInsetsPolicy.CONSUME_IME_INSETS
                ? insets.getInsets(WindowInsets.Type.ime()).bottom : 0;
        root.setPadding(sidePad + bars.left, bars.top, sidePad + bars.right,
                WindowInsetsPolicy.bottomPadding(bars.bottom, imeBottom));
    }

    /**
     * Keep the task editor's AlertDialog inside the visible area above the IME.
     *
     * <p>Target SDK 36 runs edge-to-edge, so ADJUST_NOTHING alone does not resize a floating
     * dialog's button panel. Read the Activity window metrics (not the already-positioned dialog
     * bounds), cap the dialog to the unobscured height, and shift its center by half of the
     * additional IME occlusion. Restore WRAP_CONTENT as soon as the IME is hidden.
     */
    static void applyDialogImeInsets(Context activityContext, Window dialogWindow, WindowInsets dialogInsets) {
        WindowManager manager = activityContext.getSystemService(WindowManager.class);
        if (manager == null) return;
        WindowMetrics metrics = manager.getCurrentWindowMetrics();
        // Prefer the Activity window's own metrics: a dialog's insets are already offset by the
        // window it floats in, so deriving the IME height from them under-reports the occlusion
        // and the button panel stays hidden behind the keyboard.
        WindowInsets stableInsets = metrics.getWindowInsets();
        if (stableInsets != null) dialogInsets = stableInsets;
        Insets bars = dialogInsets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        int imeBottom = dialogInsets.getInsets(WindowInsets.Type.ime()).bottom;
        boolean imeVisible = WindowInsetsPolicy.shouldApplyImeInsets(imeBottom);

        View decor = dialogWindow.getDecorView();
        int left = bars.left;
        int top = imeVisible ? 0 : bars.top;
        int right = bars.right;
        int bottom = imeVisible ? 0 : bars.bottom;
        if (decor.getPaddingLeft() != left || decor.getPaddingTop() != top
                || decor.getPaddingRight() != right || decor.getPaddingBottom() != bottom) {
            decor.setPadding(left, top, right, bottom);
        }

        int targetHeight = WindowInsetsPolicy.dialogHeightForIme(
                metrics.getBounds().height(), bars.top, bars.bottom, imeBottom);
        int height = targetHeight > 0 ? targetHeight : WindowManager.LayoutParams.WRAP_CONTENT;
        int y = WindowInsetsPolicy.dialogYOffsetForIme(bars.bottom, imeBottom);
        WindowManager.LayoutParams params = dialogWindow.getAttributes();
        if (params.height != height || params.y != y || params.gravity != Gravity.CENTER) {
            params.height = height;
            params.y = y;
            params.gravity = Gravity.CENTER;
            dialogWindow.setAttributes(params);
        }
    }
}
