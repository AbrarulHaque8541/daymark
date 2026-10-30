package com.abrar.daymark;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
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
import android.widget.TextView;

import java.util.Locale;

/**
 * Reusable address-bar notice affordance.
 *
 * <p>The neutral circular site-information target remains compact. A notice expands the same
 * target into a one-line capsule; tapping either part opens a panel anchored to the circle.
 * This view owns presentation only. The host supplies real actions and site-information behavior.
 */
final class BrowserAddressNoticeView extends LinearLayout {
    interface ActionListener {
        void onAction(String noticeId, String actionId);
    }

    interface SiteInfoListener {
        void onSiteInfoRequested();
    }

    private static final long INFO_INLINE_TIMEOUT_MS = 1000L;
    private static final long WARNING_INLINE_TIMEOUT_MS = 5000L;
    private static final long EXPANSION_DURATION_MS = 180L;

    private final BrowserAddressNotice state = new BrowserAddressNotice();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final FrameLayout indicatorTarget;
    private final TextView indicatorGlyph;
    private final TextView inlineLabel;

    private PopupWindow panel;
    private ValueAnimator labelAnimator;
    private Runnable timeoutRunnable;
    private ActionListener actionListener;
    private SiteInfoListener siteInfoListener;
    private int maxInlineWidthPx;
    private boolean disposed;
    private boolean detached = true;

    BrowserAddressNoticeView(Context context) {
        this(context, null);
    }

    BrowserAddressNoticeView(Context context, AttributeSet attrs) {
        super(context, attrs);
        setOrientation(HORIZONTAL);
        setGravity(Gravity.CENTER_VERTICAL);
        setClipChildren(false);
        setClipToPadding(false);
        setFocusable(false);
        setMinimumHeight(dp(48));
        maxInlineWidthPx = dp(144);

        indicatorTarget = new FrameLayout(context);
        indicatorTarget.setFocusable(true);
        indicatorTarget.setClickable(true);
        indicatorTarget.setContentDescription("Site information");
        indicatorTarget.setOnClickListener(view -> onIndicatorTapped());
        addView(indicatorTarget, new LayoutParams(dp(48), dp(48)));

        indicatorGlyph = new TextView(context);
        indicatorGlyph.setGravity(Gravity.CENTER);
        indicatorGlyph.setText("•");
        indicatorGlyph.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        indicatorGlyph.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        indicatorGlyph.setTextColor(themeColor(android.R.attr.colorAccent, 0xFF16705F));
        indicatorGlyph.setBackground(circleBackground());
        indicatorTarget.addView(indicatorGlyph, new FrameLayout.LayoutParams(
                dp(32), dp(32), Gravity.CENTER));

        inlineLabel = new TextView(context);
        inlineLabel.setGravity(Gravity.CENTER_VERTICAL);
        inlineLabel.setSingleLine(true);
        inlineLabel.setEllipsize(TextUtils.TruncateAt.END);
        inlineLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        inlineLabel.setTextColor(themeColor(android.R.attr.textColorPrimary, Color.BLACK));
        inlineLabel.setPadding(dp(9), 0, dp(9), 0);
        inlineLabel.setMinHeight(dp(48));
        inlineLabel.setMaxWidth(maxInlineWidthPx);
        inlineLabel.setBackground(capsuleBackground());
        inlineLabel.setVisibility(GONE);
        inlineLabel.setFocusable(true);
        inlineLabel.setClickable(true);
        inlineLabel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        inlineLabel.setOnClickListener(view -> openPanel());
        addView(inlineLabel, new LayoutParams(0, dp(48)));
    }

    void setActionListener(ActionListener listener) {
        requireMainThread();
        actionListener = listener;
    }

    void setSiteInfoListener(SiteInfoListener listener) {
        requireMainThread();
        siteInfoListener = listener;
    }

    /** Set a host-computed cap so the address field keeps useful width on compact screens. */
    void setMaxInlineWidthPx(int widthPx) {
        requireMainThread();
        maxInlineWidthPx = Math.max(dp(72), widthPx);
        inlineLabel.setMaxWidth(maxInlineWidthPx);
        if (state.current() != null) renderInline(false);
    }

    /** Show a real notice. Actions require a host callback; no decorative/fake buttons are shown. */
    boolean showNotice(BrowserAddressNotice.Notice notice) {
        requireMainThread();
        if (disposed) return false;
        if (notice == null) throw new IllegalArgumentException("notice is required");
        if (!notice.actions.isEmpty() && actionListener == null) {
            throw new IllegalStateException("notice actions require an action listener");
        }
        if (!state.show(notice)) return false;

        cancelTimeout();
        dismissPanelIfShowing();
        renderInline(true);
        scheduleTimeoutIfNeeded();
        return true;
    }

    /** Resolve only after the owning feature has confirmed the underlying event is handled. */
    boolean resolveNotice(String noticeId) {
        requireMainThread();
        if (!state.resolve(noticeId)) return false;
        cancelTimeout();
        dismissPanelIfShowing();
        renderInline(true);
        return true;
    }

    boolean dismissNotice() {
        requireMainThread();
        if (!state.dismiss()) return false;
        cancelTimeout();
        dismissPanelIfShowing();
        renderInline(true);
        return true;
    }

    void dispose() {
        requireMainThread();
        disposed = true;
        cancelTimeout();
        if (labelAnimator != null) labelAnimator.cancel();
        dismissPanelIfShowing();
    }

    private void onIndicatorTapped() {
        BrowserAddressNotice.Notice notice = state.current();
        if (notice != null) {
            openPanel();
        } else if (siteInfoListener != null) {
            siteInfoListener.onSiteInfoRequested();
        }
    }

    private void openPanel() {
        if (disposed || !state.openPanel()) return;
        cancelTimeout();
        if (panel != null && panel.isShowing()) return;

        BrowserAddressNotice.Notice notice = state.current();
        if (notice == null) return;

        LinearLayout content = buildPanelContent(notice);
        panel = new PopupWindow(content, panelWidthPx(),
                ViewGroup.LayoutParams.WRAP_CONTENT, true);
        panel.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        panel.setOutsideTouchable(true);
        panel.setClippingEnabled(true);
        panel.setElevation(dp(8));
        panel.setOnDismissListener(() -> {
            panel = null;
            if (state.presentation() == BrowserAddressNotice.Presentation.PANEL) {
                state.collapsePanel();
            }
            renderInline(false);
            if (!detached && isAttachedToWindow()) scheduleTimeoutIfNeeded();
        });

        int gravity = getLayoutDirection() == View.LAYOUT_DIRECTION_RTL
                ? Gravity.END : Gravity.START;
        try {
            panel.showAsDropDown(indicatorTarget, 0, dp(4), gravity);
        } catch (RuntimeException windowUnavailable) {
            PopupWindow failedPanel = panel;
            panel = null;
            if (failedPanel.isShowing()) failedPanel.dismiss();
            if (state.presentation() == BrowserAddressNotice.Presentation.PANEL) {
                state.collapsePanel();
            }
            renderInline(false);
            scheduleTimeoutIfNeeded();
        }
    }

    private LinearLayout buildPanelContent(BrowserAddressNotice.Notice notice) {
        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(VERTICAL);
        content.setPadding(dp(16), dp(14), dp(16), dp(14));
        content.setBackground(panelBackground());

        TextView title = new TextView(getContext());
        title.setText(notice.title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(themeColor(android.R.attr.textColorPrimary, Color.BLACK));
        content.addView(title, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView message = new TextView(getContext());
        message.setText(notice.message);
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        message.setTextColor(themeColor(android.R.attr.textColorSecondary, 0xFF555555));
        message.setPadding(0, dp(7), 0, dp(5));
        content.addView(message, new LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        for (BrowserAddressNotice.Action action : notice.actions) {
            Button actionButton = new Button(getContext());
            actionButton.setText(action.label);
            actionButton.setAllCaps(false);
            actionButton.setMinHeight(dp(44));
            actionButton.setOnClickListener(view -> {
                ActionListener listener = actionListener;
                if (panel != null && panel.isShowing()) panel.dismiss();
                if (listener != null) listener.onAction(notice.id, action.id);
            });
            content.addView(actionButton, new LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        if (notice.dismissible) {
            Button dismissButton = new Button(getContext());
            dismissButton.setText("Dismiss notice");
            dismissButton.setAllCaps(false);
            dismissButton.setMinHeight(dp(44));
            dismissButton.setOnClickListener(view -> dismissNotice());
            content.addView(dismissButton, new LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }
        return content;
    }

    private void renderInline(boolean animate) {
        BrowserAddressNotice.Notice notice = state.current();
        if (notice == null) {
            indicatorGlyph.setText("•");
            indicatorTarget.setContentDescription("Site information");
            hideInlineLabel(animate);
            return;
        }

        boolean informational = notice.severity == BrowserAddressNotice.Severity.INFO;
        indicatorGlyph.setText(informational ? "i" : "!");
        String severity = notice.severity.name().toLowerCase(Locale.ROOT);
        String description = severity + " notice: " + notice.title + ". Tap for details.";
        indicatorTarget.setContentDescription(description);
        inlineLabel.setText(notice.title);
        inlineLabel.setContentDescription(description);
        showInlineLabel(animate);
    }

    private void showInlineLabel(boolean animate) {
        inlineLabel.setMaxWidth(maxInlineWidthPx);
        int textWidth = (int) Math.ceil(inlineLabel.getPaint().measureText(
                inlineLabel.getText() == null ? "" : inlineLabel.getText().toString()));
        int targetWidth = Math.min(maxInlineWidthPx,
                Math.max(dp(72), textWidth + inlineLabel.getPaddingLeft()
                        + inlineLabel.getPaddingRight()));
        animateLabelWidth(targetWidth, animate, false);
    }

    private void hideInlineLabel(boolean animate) {
        if (inlineLabel.getVisibility() != VISIBLE) return;
        LayoutParams params = (LayoutParams) inlineLabel.getLayoutParams();
        int currentWidth = Math.max(0, params.width);
        animateLabelWidth(currentWidth, animate, true);
    }

    private void animateLabelWidth(int targetWidth, boolean animate, boolean hideAtEnd) {
        if (labelAnimator != null) {
            labelAnimator.cancel();
            labelAnimator = null;
        }
        inlineLabel.setVisibility(VISIBLE);
        LayoutParams params = (LayoutParams) inlineLabel.getLayoutParams();
        int startWidth = Math.max(0, params.width);
        if (!animate || !ValueAnimator.areAnimatorsEnabled() || startWidth == targetWidth) {
            params.width = targetWidth;
            inlineLabel.setLayoutParams(params);
            inlineLabel.setAlpha(1f);
            if (hideAtEnd) inlineLabel.setVisibility(GONE);
            return;
        }

        ValueAnimator animator = ValueAnimator.ofInt(startWidth, targetWidth);
        labelAnimator = animator;
        animator.setDuration(EXPANSION_DURATION_MS);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(value -> {
            params.width = (Integer) value.getAnimatedValue();
            inlineLabel.setLayoutParams(params);
        });
        animator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                if (labelAnimator == animator) labelAnimator = null;
                if (hideAtEnd) inlineLabel.setVisibility(GONE);
            }
        });
        animator.start();
    }

    private void scheduleTimeoutIfNeeded() {
        BrowserAddressNotice.Notice notice = state.current();
        if (disposed || detached || notice == null
                || notice.severity == BrowserAddressNotice.Severity.CRITICAL
                || state.presentation() != BrowserAddressNotice.Presentation.INLINE) return;
        cancelTimeout();
        timeoutRunnable = () -> {
            timeoutRunnable = null;
            if (state.onInlineTimeout()) renderInline(true);
        };
        long timeoutMs = notice.severity == BrowserAddressNotice.Severity.INFO
                ? INFO_INLINE_TIMEOUT_MS : WARNING_INLINE_TIMEOUT_MS;
        mainHandler.postDelayed(timeoutRunnable, timeoutMs);
    }

    private void cancelTimeout() {
        if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
    }

    private void dismissPanelIfShowing() {
        if (panel != null && panel.isShowing()) {
            panel.dismiss();
        } else {
            panel = null;
        }
    }

    private int panelWidthPx() {
        int windowWidth = getRootView().getWidth();
        if (windowWidth <= 0) windowWidth = getResources().getDisplayMetrics().widthPixels;
        int available = windowWidth - dp(24);
        return available > 0 ? Math.min(dp(320), available) : dp(240);
    }

    private GradientDrawable circleBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(themeColor(android.R.attr.colorBackground, Color.WHITE));
        drawable.setStroke(dp(1), themeColor(android.R.attr.colorAccent, 0xFF16705F));
        return drawable;
    }

    private GradientDrawable capsuleBackground() {
        return roundedBackground(dp(24));
    }

    private GradientDrawable panelBackground() {
        return roundedBackground(dp(16));
    }

    private GradientDrawable roundedBackground(int radiusPx) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(themeColor(android.R.attr.colorBackground, Color.WHITE));
        drawable.setCornerRadius(radiusPx);
        drawable.setStroke(dp(1), themeColor(android.R.attr.textColorSecondary, 0xFF777777));
        return drawable;
    }

    private int themeColor(int attribute, int fallback) {
        TypedValue value = new TypedValue();
        if (!getContext().getTheme().resolveAttribute(attribute, value, true)) return fallback;
        if (value.resourceId != 0) {
            try {
                return getResources().getColor(value.resourceId, getContext().getTheme());
            } catch (RuntimeException ignored) {
                return fallback;
            }
        }
        return value.data;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void requireMainThread() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            throw new IllegalStateException("BrowserAddressNoticeView must be used on the main thread");
        }
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        detached = false;
        if (!disposed) scheduleTimeoutIfNeeded();
    }

    @Override
    protected void onDetachedFromWindow() {
        detached = true;
        cancelTimeout();
        if (labelAnimator != null) {
            labelAnimator.cancel();
            labelAnimator = null;
        }
        dismissPanelIfShowing();
        super.onDetachedFromWindow();
    }
}
