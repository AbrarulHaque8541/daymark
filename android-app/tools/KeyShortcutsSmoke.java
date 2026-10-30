package com.abrar.daymark;

/**
 * Host-side coverage for the hardware-keyboard map, including the literal key-code values it
 * shares with {@code android.view.KeyEvent}.
 */
public final class KeyShortcutsSmoke {
    private static int assertions;

    private KeyShortcutsSmoke() { }

    public static void main(String[] args) {
        keyCodesMatchAndroid();
        taskWorkspaceChords();
        browserWorkspaceChords();
        modifiersAreRespected();
        System.out.println("PASS key shortcuts smoke: " + assertions + " assertions");
    }

    private static void keyCodesMatchAndroid() {
        check(KeyShortcuts.KEY_F == 34, "KEYCODE_F");
        check(KeyShortcuts.KEY_K == 39, "KEYCODE_K");
        check(KeyShortcuts.KEY_P == 44, "KEYCODE_P");
        check(KeyShortcuts.KEY_R == 46, "KEYCODE_R");
        check(KeyShortcuts.KEY_T == 48, "KEYCODE_T");
        check(KeyShortcuts.KEY_W == 52, "KEYCODE_W");
        check(KeyShortcuts.KEY_ESCAPE == 111, "KEYCODE_ESCAPE");
        check(KeyShortcuts.NONE == 0, "NONE is the zero sentinel callers test against");
    }

    private static void taskWorkspaceChords() {
        check(act(KeyShortcuts.KEY_K, false) == KeyShortcuts.QUICK_ADD, "Ctrl+K adds a task");
        check(act(KeyShortcuts.KEY_F, false) == KeyShortcuts.SEARCH, "Ctrl+F focuses task search");
        check(act(KeyShortcuts.KEY_T, false) == KeyShortcuts.NONE, "Ctrl+T is browser-only");
        check(act(KeyShortcuts.KEY_W, false) == KeyShortcuts.NONE, "Ctrl+W is browser-only");
        check(act(KeyShortcuts.KEY_R, false) == KeyShortcuts.NONE, "Ctrl+R is browser-only");
    }

    private static void browserWorkspaceChords() {
        check(act(KeyShortcuts.KEY_K, true) == KeyShortcuts.QUICK_ADD, "Ctrl+K leaves the browser");
        check(act(KeyShortcuts.KEY_F, true) == KeyShortcuts.FIND_IN_PAGE, "Ctrl+F finds on the page");
        check(act(KeyShortcuts.KEY_T, true) == KeyShortcuts.NEW_TAB, "Ctrl+T opens a tab");
        check(act(KeyShortcuts.KEY_W, true) == KeyShortcuts.CLOSE_TAB, "Ctrl+W closes a tab");
        check(act(KeyShortcuts.KEY_R, true) == KeyShortcuts.RELOAD_PAGE, "Ctrl+R reloads");
    }

    private static void modifiersAreRespected() {
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_K, false, false, false, false)
                == KeyShortcuts.NONE, "bare K is typing");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_K, true, true, false, false)
                == KeyShortcuts.NONE, "Ctrl+Shift+K is left to the IME");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_K, true, false, true, false)
                == KeyShortcuts.NONE, "Ctrl+Alt+K is left alone");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_P, true, true, false, false)
                == KeyShortcuts.COMMAND_PALETTE, "Ctrl+Shift+P opens the palette");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_P, true, true, false, true)
                == KeyShortcuts.COMMAND_PALETTE, "the palette also opens from the browser");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_P, true, false, false, false)
                == KeyShortcuts.NONE, "Ctrl+P alone is unbindable (print/print-preview conventions)");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_ESCAPE, false, false, false, false)
                == KeyShortcuts.CLEAR_SEARCH, "Escape clears search");
        check(KeyShortcuts.actionFor(KeyShortcuts.KEY_ESCAPE, true, false, false, false)
                == KeyShortcuts.NONE, "Ctrl+Escape is not ours");
        check(KeyShortcuts.actionFor(42, true, false, false, true) == KeyShortcuts.NONE,
                "unmapped key stays unhandled");
    }

    private static int act(int keyCode, boolean webMode) {
        return KeyShortcuts.actionFor(keyCode, true, false, false, webMode);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
