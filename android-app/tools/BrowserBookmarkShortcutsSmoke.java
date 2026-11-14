package com.abrar.daymark;

import java.util.Arrays;
import java.util.List;

/** Host regression smoke for the optional new-tab shortcuts derived only from saved bookmarks. */
public final class BrowserBookmarkShortcutsSmoke {
    private static int assertions;

    private BrowserBookmarkShortcutsSmoke() { }

    public static void main(String[] args) {
        emptyAndMalformedBookmarksStayHidden();
        newestSavedOriginsAreBoundedAndPrivacySafe();
        returnedListDoesNotMutateSavedData();
        System.out.println("PASS BrowserBookmarkShortcuts smoke: " + assertions + " assertions");
    }

    private static void emptyAndMalformedBookmarksStayHidden() {
        check(BrowserBookmarkShortcuts.visibleOrigins("").isEmpty(), "no saved bookmarks means no shortcuts");
        check(BrowserBookmarkShortcuts.visibleOrigins(null).isEmpty(), "null saved data means no shortcuts");
        check(BrowserBookmarkShortcuts.visibleOrigins("!!!corrupt!!!").isEmpty(),
                "malformed local bookmark data safely produces no shortcuts");
    }

    private static void newestSavedOriginsAreBoundedAndPrivacySafe() {
        String saved = "";
        for (int i = 0; i < 7; i++) {
            saved = BrowserHistory.add(saved,
                    "https://site" + i + ".example/private/path?token=secret#fragment");
        }
        List<String> visible = BrowserBookmarkShortcuts.visibleOrigins(saved);
        check(visible.equals(Arrays.asList("https://site6.example", "https://site5.example",
                        "https://site4.example", "https://site3.example")),
                "the rail shows only the four newest saved origins in newest-first order");
        check(visible.size() <= BrowserBookmarkShortcuts.MAX_VISIBLE,
                "the shortcut rail remains bounded");
        check(visible.stream().allMatch(origin -> origin.equals(BrowserHistory.sanitizeUrl(origin)))
                        && visible.stream().noneMatch(origin -> origin.contains("secret")),
                "shortcut destinations contain only canonical origins, not paths, queries, fragments, or secrets");
        check(BrowserHistory.decode(saved).size() == 7,
                "selecting shortcuts does not truncate or rewrite the saved bookmark list");

        String localHttp = BrowserHistory.add(saved, "http://localhost:8080/private?draft=1");
        check(BrowserBookmarkShortcuts.visibleOrigins(localHttp).get(0).equals("http://localhost:8080"),
                "saved HTTP origins and their non-default ports remain intact");
    }

    private static void returnedListDoesNotMutateSavedData() {
        String saved = BrowserHistory.add("", "https://one.example/page");
        List<String> visible = BrowserBookmarkShortcuts.visibleOrigins(saved);
        visible.clear();
        check(BrowserBookmarkShortcuts.visibleOrigins(saved).equals(Arrays.asList("https://one.example")),
                "editing the presentation list cannot mutate persisted bookmark data");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
