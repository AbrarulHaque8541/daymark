package com.abrar.daymark;

import android.animation.ValueAnimator;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RadioGroup;
import android.widget.RadioButton;
import android.widget.TextView;

import java.util.Locale;

/**
 * Self-contained premium Focus Timer surface. The Activity owns persistence and task mutations;
 * this view only renders timer state and emits explicit user actions through Listener.
 */
final class TaskFocusTimerPanel extends LinearLayout implements AutoCloseable {
    interface Listener {
        void onStart(TaskFocusTimer.Mode mode, long targetDurationMs);
        void onPause();
        void onResume();
        void onStop();
        void onChooseTask();
    }

    // Colors are injected from MainActivity.Palette so Light, Dark, System and High Contrast
    // all use the same design tokens as the rest of Daymark.
    private final int BG;
    private final int SURFACE;
    private final int SURFACE_HI;
    private final int TEXT;
    private final int MUTED;
    private final int ACCENT;
    private final int ACCENT_SOFT;
    private final int WARNING;
    private static final long[] PRESETS_MINUTES = {5, 15, 25, 45, 60};
    private enum DisplayUnit { AUTO, SECONDS, MINUTES, HOURS }
    private DisplayUnit displayUnit = DisplayUnit.AUTO;
    private final TextView[] displayUnitButtons = new TextView[4];

    private final Listener listener;
    private final TaskFocusTimerSoundscape sounds = new TaskFocusTimerSoundscape();
    private final TextView taskName;
    private final TextView timeValue;
    private final TextView statusLabel;
    private final TextView modeStopwatch;
    private final TextView modeCountdown;
    private final TextView primaryAction;
    private final TextView stopAction;
    private final TextView customDuration;
    private final ProgressRing progressRing;
    private final LinearLayout presetRow;
    private final TextView soundToggle;
    private final TextView tickToggle;

    private TaskFocusTimer.Mode selectedMode = TaskFocusTimer.Mode.STOPWATCH;
    private long selectedDurationMs = 25L * 60L * 1000L;
    private TaskFocusTimer timer;
    private String taskLabel = "Choose a task";
    private boolean soundEnabled;
    private boolean finalTicksEnabled;
    private boolean finishSoundPlayed;
    private boolean closed;
    private TextView dailySummary;

    TaskFocusTimerPanel(Context context, Listener listener,
            int background, int surface, int surfaceAlt, int text, int muted,
            int accent, int accentSoft, int warning) {
        super(context);
        if (listener == null) throw new IllegalArgumentException("A timer action listener is required.");
        this.listener = listener;
        BG = background;
        SURFACE = surface;
        SURFACE_HI = surfaceAlt;
        TEXT = text;
        MUTED = muted;
        ACCENT = accent;
        ACCENT_SOFT = accentSoft;
        WARNING = warning;
        setOrientation(VERTICAL);
        setPadding(dp(18), dp(20), dp(18), dp(18));
        setBackground(round(BG, 30));
        setClipToOutline(true);

        TextView heading = label("FOCUS TIMER", 12, MUTED, true);
        heading.setLetterSpacing(0.16f);
        addView(heading, matchWrap());

        TextView title = label("Make time count.", 26, TEXT, true);
        title.setPadding(0, dp(5), 0, 0);
        addView(title, matchWrap());

        taskName = label(taskLabel + "  ›", 13, TEXT, true);
        taskName.setGravity(Gravity.CENTER);
        taskName.setPadding(dp(16), dp(10), dp(16), dp(10));
        taskName.setBackground(round(SURFACE_HI, 22));
        taskName.setClickable(true);
        taskName.setFocusable(true);
        taskName.setOnClickListener(v -> { if (closed) return; sounds.onSelection(); listener.onChooseTask(); });
        LayoutParams taskLp = wrapWrap();
        taskLp.gravity = Gravity.CENTER_HORIZONTAL;
        taskLp.topMargin = dp(16);
        addView(taskName, taskLp);

        LinearLayout modes = new LinearLayout(context);
        modes.setOrientation(HORIZONTAL);
        modes.setPadding(dp(4), dp(4), dp(4), dp(4));
        modes.setBackground(round(SURFACE, 22));
        modeStopwatch = modeButton("Stopwatch", true);
        modeCountdown = modeButton("Countdown", false);
        modes.addView(modeStopwatch, new LayoutParams(0, dp(48), 1));
        modes.addView(modeCountdown, new LayoutParams(0, dp(48), 1));
        LayoutParams modeLp = matchWrap();
        modeLp.topMargin = dp(18);
        addView(modes, modeLp);
        modeStopwatch.setOnClickListener(v -> chooseMode(TaskFocusTimer.Mode.STOPWATCH));
        modeCountdown.setOnClickListener(v -> chooseMode(TaskFocusTimer.Mode.COUNTDOWN));

        FrameLayout ringFrame = new FrameLayout(context);
        progressRing = new ProgressRing(context);
        ringFrame.addView(progressRing, new FrameLayout.LayoutParams(dp(252), dp(252), Gravity.CENTER));
        LinearLayout ringCenter = new LinearLayout(context);
        ringCenter.setGravity(Gravity.CENTER);
        ringCenter.setOrientation(VERTICAL);
        timeValue = label("00:00:00", 38, TEXT, true);
        timeValue.setGravity(Gravity.CENTER);
        timeValue.setIncludeFontPadding(false);
        statusLabel = label("READY WHEN YOU ARE", 10, MUTED, true);
        statusLabel.setGravity(Gravity.CENTER);
        statusLabel.setLetterSpacing(0.12f);
        ringCenter.addView(timeValue, matchWrap());
        LayoutParams statusLp = wrapWrap();
        statusLp.topMargin = dp(8);
        ringCenter.addView(statusLabel, statusLp);
        ringFrame.addView(ringCenter, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        LayoutParams ringLp = matchWrap();
        ringLp.gravity = Gravity.CENTER_HORIZONTAL;
        ringLp.topMargin = dp(12);
        addView(ringFrame, ringLp);

        TextView displayLabel = label("TIME DISPLAY", 10, MUTED, true);
        displayLabel.setLetterSpacing(0.14f);
        LayoutParams displayLabelLp = matchWrap();
        displayLabelLp.topMargin = dp(2);
        addView(displayLabel, displayLabelLp);
        LinearLayout displayModes = new LinearLayout(context);
        displayModes.setOrientation(HORIZONTAL);
        displayModes.setGravity(Gravity.CENTER);
        displayModes.setPadding(dp(4), dp(4), dp(4), dp(4));
        displayModes.setBackground(round(SURFACE, 18));
        String[] displayNames = {"Auto", "Seconds", "Minutes", "Hours"};
        DisplayUnit[] displayValues = DisplayUnit.values();
        for (int i = 0; i < displayNames.length; i++) {
            final DisplayUnit unit = displayValues[i];
            TextView choice = label(displayNames[i], 11, unit == displayUnit ? TEXT : MUTED, true);
            choice.setGravity(Gravity.CENTER);
            choice.setPadding(dp(5), dp(11), dp(5), dp(11));
            choice.setBackground(round(unit == displayUnit ? ACCENT_SOFT : SURFACE, 14));
            displayUnitButtons[i] = choice;
            displayModes.addView(choice, new LayoutParams(0, dp(42), 1));
            choice.setOnClickListener(v -> chooseDisplayUnit(unit));
        }
        LayoutParams displayModesLp = matchWrap();
        displayModesLp.topMargin = dp(7);
        addView(displayModes, displayModesLp);

        TextView targetLabel = label("QUICK DURATION", 10, MUTED, true);
        targetLabel.setLetterSpacing(0.14f);
        LayoutParams targetLp = matchWrap();
        targetLp.topMargin = dp(4);
        addView(targetLabel, targetLp);

        presetRow = new LinearLayout(context);
        presetRow.setOrientation(HORIZONTAL);
        presetRow.setGravity(Gravity.CENTER);
        LayoutParams presetLp = matchWrap();
        presetLp.topMargin = dp(10);
        addView(presetRow, presetLp);
        rebuildPresets();

        customDuration = label("＋   Custom duration", 14, TEXT, true);
        customDuration.setGravity(Gravity.CENTER);
        customDuration.setPadding(dp(14), dp(14), dp(14), dp(14));
        customDuration.setBackground(round(SURFACE_HI, 18));
        LayoutParams customLp = matchWrap();
        customLp.topMargin = dp(10);
        addView(customDuration, customLp);
        customDuration.setOnClickListener(v -> showCustomDuration());

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LayoutParams actionLp = matchWrap();
        actionLp.topMargin = dp(20);
        addView(actions, actionLp);
        primaryAction = actionButton("Start focus", ACCENT);
        stopAction = actionButton("Finish", SURFACE_HI);
        actions.addView(primaryAction, new LayoutParams(0, dp(58), 1.5f));
        LayoutParams stopLp = new LayoutParams(0, dp(58), 1);
        stopLp.leftMargin = dp(10);
        actions.addView(stopAction, stopLp);
        primaryAction.setContentDescription("Start, pause, or resume focus timer");
        stopAction.setContentDescription("Finish focus session");
        timeValue.setContentDescription("Focus timer value");
        primaryAction.setOnClickListener(v -> performPrimaryAction());
        stopAction.setOnClickListener(v -> {
            if (!closed && timer != null && !timer.isFinished()) {
                sounds.onAction();
                listener.onStop();
            }
        });

        TextView soundHeading = label("SOUND & FEEDBACK", 10, MUTED, true);
        soundHeading.setLetterSpacing(0.14f);
        LayoutParams soundHeadingLp = matchWrap();
        soundHeadingLp.topMargin = dp(22);
        addView(soundHeading, soundHeadingLp);

        dailySummary = label("TODAY  ·  0m focus  ·  0 sessions", 12, MUTED, true);
        dailySummary.setPadding(dp(14), dp(15), dp(14), dp(15));
        dailySummary.setBackground(round(SURFACE, 18));
        LayoutParams summaryLp = matchWrap();
        summaryLp.topMargin = dp(14);
        addView(dailySummary, summaryLp);

        soundToggle = settingRow("Soft interaction sounds", soundEnabled);
        tickToggle = settingRow("Final 10-second ticks", false);
        LayoutParams settingLp = matchWrap();
        settingLp.topMargin = dp(8);
        addView(soundToggle, settingLp);
        LayoutParams tickLp = matchWrap();
        tickLp.topMargin = dp(7);
        addView(tickToggle, tickLp);
        sounds.setEnabled(soundEnabled);
        tickToggle.setAlpha(0.45f);
        soundToggle.setOnClickListener(v -> {
            soundEnabled = !soundEnabled;
            sounds.setEnabled(soundEnabled);
            soundToggle.setText((soundEnabled ? "●  " : "○  ") + "Soft interaction sounds");
            if (soundEnabled) sounds.onSelection();
            tickToggle.setAlpha(soundEnabled ? 1f : 0.45f);
        });
        tickToggle.setOnClickListener(v -> {
            if (!soundEnabled) return;
            finalTicksEnabled = !finalTicksEnabled;
            sounds.setFinalTicksEnabled(finalTicksEnabled);
            tickToggle.setText((finalTicksEnabled ? "●  " : "○  ") + "Final 10-second ticks");
            sounds.onSelection();
        });

        render(null, 0);
    }

    void setTaskLabel(String value) {
        if (closed) return;
        taskLabel = value == null || value.trim().isEmpty() ? "Choose a task" : value.trim();
        taskName.setText(taskLabel + "  ›");
    }

    void setDailySummary(long focusDurationMs, int sessionCount) {
        if (closed) return;
        long minutes = Math.max(0L, focusDurationMs / 60_000L);
        int safeSessions = Math.max(0, sessionCount);
        dailySummary.setText("TODAY  ·  " + minutes + "m focus  ·  " + safeSessions + " sessions");
    }

    void setSoundEnabled(boolean enabled) {
        if (closed) return;
        soundEnabled = enabled;
        sounds.setEnabled(enabled);
        soundToggle.setText((enabled ? "●  " : "○  ") + "Soft interaction sounds");
        tickToggle.setAlpha(enabled ? 1f : 0.45f);
    }

    void setFinalTicksEnabled(boolean enabled) {
        if (closed) return;
        finalTicksEnabled = enabled;
        sounds.setFinalTicksEnabled(enabled);
        tickToggle.setText((enabled ? "●  " : "○  ") + "Final 10-second ticks");
    }

    void render(TaskFocusTimer value, long nowElapsedRealtimeMs) {
        if (closed) return;
        timer = value;
        boolean active = value != null && !value.isFinished();
        if (value == null) {
            timeValue.setText(selectedMode == TaskFocusTimer.Mode.STOPWATCH ? format(0L) : format(selectedDurationMs));
            statusLabel.setText(selectedMode == TaskFocusTimer.Mode.STOPWATCH ? "READY WHEN YOU ARE" : "TARGET DURATION");
            progressRing.setProgress(0f, ACCENT);
        } else {
            long elapsed = value.elapsedMsAt(nowElapsedRealtimeMs);
            long shown = value.isCountdown() ? value.remainingMsAt(nowElapsedRealtimeMs) : elapsed;
            timeValue.setText(format(shown));
            statusLabel.setText(value.isFinished() ? "SESSION COMPLETE"
                    : value.isPaused() ? "PAUSED · READY TO RESUME"
                    : value.isCountdown() ? "TIME REMAINING" : "FOCUS IN PROGRESS");
            float progress = value.isCountdown()
                    ? value.progressPermilleAt(nowElapsedRealtimeMs) / 1000f : 0f;
            progressRing.setProgress(progress, value.isCountdown() ? WARNING : ACCENT);
            if (value.isCountdown() && value.isRunning()) {
                sounds.onCountdownSecond((int) Math.ceil(value.remainingMsAt(nowElapsedRealtimeMs) / 1000d));
            }
            if (value.isFinished() && !finishSoundPlayed) {
                finishSoundPlayed = true;
                sounds.onFinished();
            }
        }
        boolean running = value != null && value.isRunning();
        boolean paused = value != null && value.isPaused();
        primaryAction.setText(running ? "Ⅱ   Pause" : paused ? "▶   Resume" : "▶   Start focus");
        primaryAction.setEnabled(true);
        stopAction.setEnabled(active);
        stopAction.setAlpha(active ? 1f : 0.55f);
        modeStopwatch.setEnabled(!active);
        modeCountdown.setEnabled(!active);
        customDuration.setEnabled(!active && selectedMode == TaskFocusTimer.Mode.COUNTDOWN);
        for (int i = 0; i < presetRow.getChildCount(); i++) {
            presetRow.getChildAt(i).setEnabled(!active && selectedMode == TaskFocusTimer.Mode.COUNTDOWN);
            presetRow.getChildAt(i).setAlpha(selectedMode == TaskFocusTimer.Mode.COUNTDOWN ? 1f : 0.42f);
        }
    }

    private void performPrimaryAction() {
        if (closed) return;
        sounds.onAction();
        if (timer == null || timer.isFinished()) {
            sounds.resetForNewSession();
            finishSoundPlayed = false;
            listener.onStart(selectedMode, selectedMode == TaskFocusTimer.Mode.COUNTDOWN
                    ? selectedDurationMs : 0L);
        } else if (timer.isRunning()) {
            listener.onPause();
        } else if (timer.isPaused()) {
            listener.onResume();
        }
    }

    private void chooseMode(TaskFocusTimer.Mode mode) {
        if (closed || timer != null && !timer.isFinished()) return;
        selectedMode = mode;
        sounds.onSelection();
        modeStopwatch.setBackground(round(mode == TaskFocusTimer.Mode.STOPWATCH ? ACCENT_SOFT : SURFACE, 18));
        modeCountdown.setBackground(round(mode == TaskFocusTimer.Mode.COUNTDOWN ? ACCENT_SOFT : SURFACE, 18));
        modeStopwatch.setTextColor(mode == TaskFocusTimer.Mode.STOPWATCH ? TEXT : MUTED);
        modeCountdown.setTextColor(mode == TaskFocusTimer.Mode.COUNTDOWN ? TEXT : MUTED);
        render(null, 0);
    }

    private void chooseDisplayUnit(DisplayUnit unit) {
        if (closed || unit == null) return;
        displayUnit = unit;
        sounds.onSelection();
        String[] names = {"Auto", "Seconds", "Minutes", "Hours"};
        DisplayUnit[] values = DisplayUnit.values();
        for (int i = 0; i < displayUnitButtons.length; i++) {
            boolean selected = values[i] == unit;
            displayUnitButtons[i].setBackground(round(selected ? ACCENT_SOFT : SURFACE, 14));
            displayUnitButtons[i].setTextColor(selected ? TEXT : MUTED);
            displayUnitButtons[i].setContentDescription(names[i] + (selected ? ", selected" : ""));
        }
        render(timer, timer == null ? 0 : android.os.SystemClock.elapsedRealtime());
    }

    private TextView modeButton(String text, boolean selected) {
        TextView view = label(text, 13, selected ? TEXT : MUTED, true);
        view.setGravity(Gravity.CENTER);
        view.setBackground(round(selected ? ACCENT_SOFT : SURFACE, 18));
        return view;
    }

    private void rebuildPresets() {
        presetRow.removeAllViews();
        for (long minutes : PRESETS_MINUTES) {
            TextView preset = label(minutes + "\nmin", 12,
                    selectedDurationMs == minutes * 60_000L ? TEXT : MUTED, true);
            preset.setGravity(Gravity.CENTER);
            preset.setBackground(round(selectedDurationMs == minutes * 60_000L
                    ? ACCENT_SOFT : SURFACE_HI, 16));
            LayoutParams lp = new LayoutParams(0, dp(62), 1);
            if (presetRow.getChildCount() > 0) lp.leftMargin = dp(6);
            presetRow.addView(preset, lp);
            preset.setOnClickListener(v -> {
                if (timer != null && !timer.isFinished()) return;
                selectedDurationMs = minutes * 60_000L;
                sounds.onSelection();
                rebuildPresets();
                render(null, 0);
            });
        }
    }

    private void showCustomDuration() {
        if (closed || timer != null && !timer.isFinished()) return;
        EditText input = new EditText(getContext());
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setSingleLine(true);
        input.setHint("Duration");
        input.setText(String.valueOf(Math.max(1, selectedDurationMs / 60_000L)));
        RadioGroup units = new RadioGroup(getContext());
        units.setOrientation(RadioGroup.HORIZONTAL);
        String[] unitNames = {"Seconds", "Minutes", "Hours"};
        int[] unitIds = {1001, 1002, 1003};
        for (int i = 0; i < unitNames.length; i++) {
            RadioButton option = new RadioButton(getContext());
            option.setId(unitIds[i]);
            option.setText(unitNames[i]);
            units.addView(option);
        }
        units.check(unitIds[1]);
        LinearLayout content = new LinearLayout(getContext());
        content.setOrientation(VERTICAL);
        content.setPadding(dp(8), dp(4), dp(8), dp(4));
        content.addView(input, matchWrap());
        content.addView(units, matchWrap());
        AlertDialog dialog = new AlertDialog.Builder(getContext())
                .setTitle("Custom focus duration")
                .setMessage("Choose a unit. Maximum duration is 24 hours.")
                .setView(content)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Apply", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(v -> {
                    if (closed) { dialog.dismiss(); return; }
                    try {
                        long amount = Long.parseLong(input.getText().toString().trim());
                        long multiplier = units.getCheckedRadioButtonId() == unitIds[0] ? 1000L
                                : units.getCheckedRadioButtonId() == unitIds[2] ? 3_600_000L : 60_000L;
                        if (amount < 1 || amount > TaskFocusTimer.MAX_COUNTDOWN_MS / multiplier) {
                            throw new NumberFormatException();
                        }
                        selectedDurationMs = amount * multiplier;
                        sounds.onSelection();
                        rebuildPresets();
                        render(null, 0);
                        dialog.dismiss();
                    } catch (NumberFormatException invalid) {
                        input.setError("Enter a valid duration up to 24 hours");
                    }
                }));
        dialog.show();
    }

    private TextView settingRow(String text, boolean selected) {
        TextView view = label((selected ? "●  " : "○  ") + text, 13, TEXT, true);
        view.setPadding(dp(14), dp(13), dp(14), dp(13));
        view.setBackground(round(SURFACE_HI, 16));
        return view;
    }

    private TextView actionButton(String text, int color) {
        TextView view = label(text, 14, TEXT, true);
        view.setGravity(Gravity.CENTER);
        view.setBackground(round(color, 22));
        view.setClickable(true);
        view.setFocusable(true);
        return view;
    }

    private TextView label(String text, int sizeSp, int color, boolean bold) {
        TextView view = new TextView(getContext());
        view.setText(text);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        view.setIncludeFontPadding(false);
        return view;
    }

    private GradientDrawable round(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private LayoutParams matchWrap() {
        return new LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LayoutParams wrapWrap() {
        return new LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private String format(long millis) {
        long totalSeconds = Math.max(0, millis / 1000L);
        if (displayUnit == DisplayUnit.SECONDS) return totalSeconds + " sec";
        if (displayUnit == DisplayUnit.MINUTES) {
            return formatFixedUnit(totalSeconds / 60.0d, "min");
        }
        if (displayUnit == DisplayUnit.HOURS) {
            return formatFixedUnit(totalSeconds / 3600.0d, "hr");
        }
        long hours = totalSeconds / 3600L;
        long minutes = (totalSeconds / 60L) % 60L;
        long seconds = totalSeconds % 60L;
        return hours > 0
                ? String.format(Locale.ROOT, "%02d:%02d:%02d", hours, minutes, seconds)
                : String.format(Locale.ROOT, "%02d:%02d", minutes, seconds);
    }

    private static String formatFixedUnit(double value, String suffix) {
        if (Math.abs(value - Math.rint(value)) < 0.000001d) {
            return String.format(Locale.ROOT, "%.0f %s", value, suffix);
        }
        return String.format(Locale.ROOT, "%.1f %s", value, suffix);
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        if (progressRing.activeAnimator != null) {
            progressRing.activeAnimator.cancel();
            progressRing.activeAnimator = null;
        }
        sounds.close();
    }

    private final class ProgressRing extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint progress = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF bounds = new RectF();
        private float value;
        private int color = ACCENT;
        private ValueAnimator activeAnimator;

        ProgressRing(Context context) {
            super(context);
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeCap(Paint.Cap.ROUND);
            track.setStrokeWidth(dp(9));
            track.setColor(SURFACE_HI);
            progress.setStyle(Paint.Style.STROKE);
            progress.setStrokeCap(Paint.Cap.ROUND);
            progress.setStrokeWidth(dp(9));
        }

        void setProgress(float next, int tint) {
            float bounded = Math.max(0f, Math.min(1f, next));
            color = tint;
            if (Math.abs(value - bounded) < 0.001f) {
                color = tint;
                invalidate();
                return;
            }
            if (activeAnimator != null) activeAnimator.cancel();
            ValueAnimator animator = ValueAnimator.ofFloat(value, bounded);
            activeAnimator = animator;
            animator.setDuration(260L);
            animator.setInterpolator(new DecelerateInterpolator());
            animator.addUpdateListener(a -> {
                value = (Float) a.getAnimatedValue();
                invalidate();
            });
            animator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override public void onAnimationEnd(android.animation.Animator animation) {
                    if (activeAnimator == animator) activeAnimator = null;
                }
                @Override public void onAnimationCancel(android.animation.Animator animation) {
                    if (activeAnimator == animator) activeAnimator = null;
                }
            });
            animator.start();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float inset = dp(13);
            bounds.set(inset, inset, getWidth() - inset, getHeight() - inset);
            float cx = bounds.centerX();
            float cy = bounds.centerY();
            canvas.drawArc(bounds, 0, 360, false, track);
            progress.setColor(color);
            canvas.drawArc(bounds, -90, value * 360f, false, progress);
        }
    }
}
