package android.content;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/** Minimal host-test surface; this stub is isolated from the Android application source set. */
public final class Context {
    public static final int MODE_PRIVATE = 0;

    private final File filesDir;
    private final SharedPreferences preferences = new MemoryPreferences();

    public Context(File filesDir) {
        this.filesDir = filesDir;
    }

    public Context getApplicationContext() {
        return this;
    }

    public File getFilesDir() {
        return filesDir;
    }

    public SharedPreferences getSharedPreferences(String name, int mode) {
        return preferences;
    }

    private static final class MemoryPreferences implements SharedPreferences {
        private final Map<String, Object> values = new HashMap<>();

        @Override
        public boolean getBoolean(String key, boolean defaultValue) {
            Object value = values.get(key);
            return value instanceof Boolean ? (Boolean) value : defaultValue;
        }

        @Override
        public String getString(String key, String defaultValue) {
            Object value = values.get(key);
            return value instanceof String ? (String) value : defaultValue;
        }

        @Override
        public Editor edit() {
            return new MemoryEditor();
        }

        private final class MemoryEditor implements Editor {
            private final Map<String, Object> changes = new HashMap<>();

            @Override
            public Editor putBoolean(String key, boolean value) {
                changes.put(key, value);
                return this;
            }

            @Override
            public Editor putString(String key, String value) {
                changes.put(key, value);
                return this;
            }

            @Override
            public void apply() {
                values.putAll(changes);
            }
        }
    }
}
