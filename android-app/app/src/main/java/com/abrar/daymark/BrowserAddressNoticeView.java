package com.abrar.daymark;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;

/** Address-bar notice that explains plain-HTTP or mixed-content risks. */
final class BrowserAddressNoticeView extends FrameLayout {
    private static final int ACCENT = 0xFF16705F;
    private static final int PANEL_MAX_HEIGHT_DP = 320;
    private final TextView titleView;
    private final TextView bodyView;
    private final Button dismissButton;
    private PopupWindow panel;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingShow;

    BrowserAddressNoticeView(Context context) {
        this(context, null);
    }

    BrowserAddressNoticeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setClickable(true);
        setFocusable(true);
        titleView = new TextView(context);
        bodyView = new TextView(context);
        dismissButton = new Button(context);
        styleText(titleView, 16, true);
        styleText(bodyView, 14, false);
        dismissButton.setText("Dismiss");
        dismissButton.setAllCaps(false);
        dismissButton.setOnClickListener(v -> dismissPanelIfShowing());
        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(12), dp(16), dp(12));
        content.addView(titleView);
        content.addView(bodyView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        content.addView(dismissButton, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ScrollView scroller = new ScrollView(context);
        scroller.addView(content);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF1A2429);
        bg.setCornerRadius(dp(12));
        scroller.setBackground(bg);
        addView(scroller, new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    void showNotice(String title, String body, View anchor) {
        titleView.setText(title);
        bodyView.setText(body);
        if (pendingShow != null) handler.removeCallbacks(pendingShow);
        pendingShow = () -> showPanel(anchor);
        handler.post(pendingShow);
    }

    private void showPanel(View anchor) {
        if (panel != null && panel.isShowing()) panel.dismiss();
        int maxH = BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx(
                0, getRootView().getHeight(),
                anchor.getTop(), anchor.getHeight(),
                dp(4), dp(16));
        int fitted = BrowserAddressNoticePanelPolicy.fitContentHeightPx(
                (int) bodyView.getPaint().measureText(bodyView.getText().toString()) > 0 ? dp(PANEL_MAX_HEIGHT_DP) : dp(80),
                maxH);
        if (fitted <= 0) return;
        panel = new PopupWindow(this, ViewGroup.LayoutParams.MATCH_PARENT, fitted, true);
        panel.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        panel.setOutsideTouchable(true);
        panel.setAnimationStyle(0);
        panel.showAsDropDown(anchor, 0, dp(4));
    }

    void dismissPanelIfShowing() {
        if (panel != null && panel.isShowing()) panel.dismiss();
        panel = null;
    }

    private void styleText(TextView tv, int sp, boolean bold) {
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(0xFFE8EEF2);
        if (bold) tv.setTypeface(Typeface.DEFAULT_BOLD);
        tv.setPadding(0, dp(4), 0, dp(4));
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics());
    }

    @Override
    protected void onDetachedFromWindow() {
        if (pendingShow != null) handler.removeCallbacks(pendingShow);
        dismissPanelIfShowing();
        super.onDetachedFromWindow();
    }
}
