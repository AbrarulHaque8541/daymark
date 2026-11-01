package com.abrar.daymark;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ScaleXSpan;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Opening splash for Daymark: the app logo, the DAYMARK title and the BY ABRARUL HAQUE
 * attribution over a deep-green gradient, with a light sweep and entrance motion, then a
 * single safe handoff to {@link MainActivity}.
 *
 * <p>The splash owns no network, storage, permission or WebView behavior. It respects the
 * system reduced-motion setting (transition animation scale) and always removes its pending
 * callbacks when destroyed.
 */
public final class SplashActivity extends Activity {
    private static final int BACKGROUND_TOP = 0xFF0E2A21;
    private static final int BACKGROUND_BOTTOM = 0xFF16705F;
    private static final int BRAND_TEXT = 0xFFF6F7F4;
    private static final int ACCENT_TEXT = 0xFF7ACCB2;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean launched = false;
    private final Runnable launchRunnable = this::launchMain;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BACKGROUND_TOP);
        getWindow().setNavigationBarColor(BACKGROUND_TOP);

        boolean animations = SplashPolicy.animationsEnabled(
                Settings.Global.getFloat(getContentResolver(), Settings.Global.TRANSITION_ANIMATION_SCALE, 1f));

        FrameLayout root = new FrameLayout(this);
        root.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{BACKGROUND_TOP, BACKGROUND_BOTTOM}));

        int logoSize = dp(112);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_launcher);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("Daymark logo");
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(logoSize, logoSize);
        logoParams.gravity = Gravity.CENTER_HORIZONTAL;

        TextView title = new TextView(this);
        title.setText(spaced(SplashPolicy.BRAND_TITLE));
        title.setTextSize(30f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(BRAND_TEXT);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.gravity = Gravity.CENTER_HORIZONTAL;
        titleParams.topMargin = dp(20);

        TextView subtitle = new TextView(this);
        subtitle.setText(spaced(SplashPolicy.BRAND_SUBTITLE));
        subtitle.setTextSize(12f);
        subtitle.setTextColor(ACCENT_TEXT);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleParams.gravity = Gravity.CENTER_HORIZONTAL;
        subtitleParams.topMargin = dp(8);

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);
        center.addView(logo, logoParams);
        center.addView(title, titleParams);
        center.addView(subtitle, subtitleParams);
        root.addView(center, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        View sweep = new View(this);
        sweep.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{0x00000000, 0x557ACCB2, 0x00000000}));
        root.addView(sweep, new FrameLayout.LayoutParams(dp(160), ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER_VERTICAL | Gravity.START));

        setContentView(root);

        if (animations) {
            logo.setAlpha(0f);
            logo.setScaleX(0.8f);
            logo.setScaleY(0.8f);
            logo.animate().alpha(1f).scaleX(1f).scaleY(1f)
                    .setDuration(SplashPolicy.LOGO_ENTER_MS).start();

            float rise = dp(24);
            title.setAlpha(0f);
            title.setTranslationY(rise);
            subtitle.setAlpha(0f);
            subtitle.setTranslationY(rise);
            title.animate().alpha(1f).translationY(0f)
                    .setDuration(SplashPolicy.TITLE_ENTER_MS)
                    .setStartDelay(SplashPolicy.LOGO_ENTER_MS / 2).start();
            subtitle.animate().alpha(1f).translationY(0f)
                    .setDuration(SplashPolicy.TITLE_ENTER_MS)
                    .setStartDelay(SplashPolicy.LOGO_ENTER_MS / 2 + 120L).start();

            root.post(() -> {
                float distance = root.getWidth() + sweep.getWidth();
                sweep.setTranslationX(-sweep.getWidth());
                sweep.animate().translationX(distance)
                        .setDuration(SplashPolicy.SWEEP_MS)
                        .setStartDelay(SplashPolicy.LOGO_ENTER_MS).start();
            });
        }

        handler.postDelayed(launchRunnable, SplashPolicy.splashHoldMs(animations));
    }

    private void launchMain() {
        if (launched || isFinishing() || isDestroyed()) return;
        launched = true;
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private static CharSequence spaced(String text) {
        SpannableString span = new SpannableString(text);
        span.setSpan(new ScaleXSpan(1.25f), 0, span.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return span;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
