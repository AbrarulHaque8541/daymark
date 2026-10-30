package com.abrar.daymark;

/**
 * Hardware-keyboard shortcuts for a tablet, Chromebook or a phone with a physical keyboard.
 *
 * <p>Kept free of {@code android.*} so the mapping is unit-testable on the host: the key codes
 * below are the literal values of the matching {@code android.view.KeyEvent.KEYCODE_*} constants
 * and {@code KeyShortcutsSmoke} pins them.
 *
 * <p>Only the chords that have a single unambiguous meaning in both workspaces are mapped, plus
 * the browser chords that mirror a desktop browser. A chord that would mean different things
 * depending on focus is deliberately left unbound rather than guessed at.
 */
final class KeyShortcuts {
    static final int NONE = 0;
    static final int QUICK_ADD = 1;
    static final int SEARCH = 2;
    static final int FIND_IN_PAGE = 3;
    static final int NEW_TAB = 4;
    static final int CLOSE_TAB = 5;
    static final int RELOAD_PAGE = 6;
    static final int CLEAR_SEARCH = 7;

    static final int KEY_F = 34;
    static final int KEY_K = 39;
    static final int KEY_R = 46;
    static final int KEY_T = 48;
    static final int KEY_W = 52;
    static final int KEY_ESCAPE = 111;

    private KeyShortcuts() { }

    /**
     * Resolves a key press to an action.
     *
     * <p>Ctrl+K is quick add, Ctrl+F is task search or find-in-page depending on the workspace,
     * and Ctrl+T/Ctrl+W/Ctrl+R only act in the browser. Escape clears a narrowing search. Alt and
     * Shift chords are left alone so they stay available to the IME and to app shortcuts.
     */
    static int actionFor(int keyCode, boolean ctrl, boolean shift, boolean alt, boolean webMode) {
        if (keyCode == KEY_ESCAPE) {
            return ctrl || alt || shift ? NONE : CLEAR_SEARCH;
        }
        if (!ctrl || alt || shift) return NONE;
        switch (keyCode) {
            case KEY_K:
                return QUICK_ADD;
            case KEY_F:
                return webMode ? FIND_IN_PAGE : SEARCH;
            case KEY_T:
                return webMode ? NEW_TAB : NONE;
            case KEY_W:
                return webMode ? CLOSE_TAB : NONE;
            case KEY_R:
                return webMode ? RELOAD_PAGE : NONE;
            default:
                return NONE;
        }
    }
}
