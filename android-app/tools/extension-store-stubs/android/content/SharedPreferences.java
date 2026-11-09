package android.content;

/** Minimal in-memory host-test surface; never included in Android app sources. */
public interface SharedPreferences {
    boolean getBoolean(String key, boolean defaultValue);
    String getString(String key, String defaultValue);
    Editor edit();

    interface Editor {
        Editor putBoolean(String key, boolean value);
        Editor putString(String key, String value);
        void apply();
    }
}
