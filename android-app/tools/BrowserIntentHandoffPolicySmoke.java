package com.abrar.daymark;

/** Host regressions for the main-frame and user-gesture intent handoff boundary. */
public final class BrowserIntentHandoffPolicySmoke {
    public static void main(String[] args) {
        check(BrowserIntentHandoffPolicy.allows(true, true),
                "main-frame navigation with a user gesture may reach the strict Intent parser");
        check(!BrowserIntentHandoffPolicy.allows(true, false),
                "script-driven main-frame navigation must not trigger an app chooser or top-level load");
        check(!BrowserIntentHandoffPolicy.allows(false, true),
                "a user gesture inside a subframe must not trigger a top-level load or app chooser");
        check(!BrowserIntentHandoffPolicy.allows(false, false),
                "subframe navigation without a user gesture must be consumed");
        System.out.println("PASS Android intent handoff policy: main-frame user gesture required");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
