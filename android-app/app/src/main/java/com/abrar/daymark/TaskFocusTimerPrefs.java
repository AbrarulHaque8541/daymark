package com.abrar.daymark;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Versioned local preferences for Focus Timer display unit and sound toggles.
 * Not encrypted: these are UI preferences only, not task or session data.
 */
final class TaskFocusTimerPrefs {
    private static final String PREFS = "daymark.focus.prefs.v1";
    private static final String KEY_DISPLAY_UNIT = "display_unit";
    private static final String KEY_SOUND_ENABLED = "sound_enabled";
    private static final String KEY_FINAL_TICKS = "final_ticks_enabled";

    private TaskFocusTimerPrefs() {}

    static String loadDisplayUnit(Context context, String defaultUnit) {
        if (context == null) return defaultUnit;
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_DISPLAY_UNIT, defaultUnit);
        return saved == null || saved.isEmpty() ? defaultUnit : saved;
    }

    static boolean loadSoundEnabled(Context context) {
        if (context == null) return false;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_SOUND_ENABLED, false);
    }

    static boolean loadFinalTicksEnabled(Context context) {
        if (context == null) return false;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(KEY_FINAL_TICKS, false);
    }

    static void save(Context context, String displayUnit, boolean soundEnabled, boolean finalTicksEnabled) {
        if (context == null) return;
        String unit = displayUnit == null || displayUnit.isEmpty() ? "AUTO" : displayUnit;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_DISPLAY_UNIT, unit)
                .putBoolean(KEY_SOUND_ENABLED, soundEnabled)
                .putBoolean(KEY_FINAL_TICKS, finalTicksEnabled)
                .apply();
    }
}
