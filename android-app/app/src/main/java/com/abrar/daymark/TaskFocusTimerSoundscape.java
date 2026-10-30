package com.abrar.daymark;

import android.media.AudioManager;
import android.media.ToneGenerator;

/**
 * Small, opt-in sound palette for Focus Timer interactions.
 *
 * <p>No looping audio is used. Countdown ticks are emitted only during the final ten seconds,
 * only when the user enables both sound and final-countdown ticks, and at most once per second.
 */
final class TaskFocusTimerSoundscape implements AutoCloseable {
    private static final int VOLUME = 32;
    private ToneGenerator toneGenerator;
    private boolean enabled;
    private boolean finalTicksEnabled;
    private int lastTickSecond = -1;
    private boolean finishedTonePlayed;

    TaskFocusTimerSoundscape() {
        try {
            toneGenerator = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, VOLUME);
        } catch (RuntimeException unavailable) {
            toneGenerator = null;
        }
    }

    void setEnabled(boolean value) {
        enabled = value;
        if (!value) {
            lastTickSecond = -1;
        }
    }

    void setFinalTicksEnabled(boolean value) {
        finalTicksEnabled = value;
        lastTickSecond = -1;
    }

    boolean isEnabled() { return enabled; }
    boolean areFinalTicksEnabled() { return finalTicksEnabled; }

    void onAction() {
        play(ToneGenerator.TONE_PROP_BEEP, 38);
    }

    void onSelection() {
        play(ToneGenerator.TONE_PROP_ACK, 42);
    }

    void onCountdownSecond(int remainingSeconds) {
        if (!enabled || !finalTicksEnabled || remainingSeconds < 1 || remainingSeconds > 10
                || remainingSeconds == lastTickSecond) {
            return;
        }
        lastTickSecond = remainingSeconds;
        play(ToneGenerator.TONE_PROP_BEEP, 48);
    }

    void onFinished() {
        if (finishedTonePlayed) return;
        finishedTonePlayed = true;
        play(ToneGenerator.TONE_PROP_ACK, 180);
    }

    void resetForNewSession() {
        lastTickSecond = -1;
        finishedTonePlayed = false;
    }

    private void play(int tone, int durationMs) {
        if (!enabled || toneGenerator == null) return;
        try {
            toneGenerator.startTone(tone, durationMs);
        } catch (RuntimeException ignored) {
            // Audio focus/device routing can change while the panel is visible. Sound is optional.
        }
    }

    @Override
    public void close() {
        if (toneGenerator == null) return;
        try {
            toneGenerator.release();
        } catch (RuntimeException ignored) {
            // Releasing an optional sound resource must never interrupt task/timer state.
        }
        toneGenerator = null;
    }
}
