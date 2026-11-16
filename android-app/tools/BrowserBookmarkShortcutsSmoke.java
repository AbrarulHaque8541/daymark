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
        additionalOriginsFlagMatchesCount();
        System.out.println("PASS BrowserBookmarkShortcuts smoke: " + assertions + " assertions");
    }

    private static void emptyAndMalformedBookmarksStayHidden() {
        check(BrowserBookmarkShortcuts.visibleOrigins("").isEmpty(), "no saved bookmarks means no shortcuts");
        check(BrowserBookmarkShortcuts.visibleOrigins(null).isEmpty(), "null saved data means no shortcuts");
        check(BrowserBookmarkShortcuts.visibleOrigins("!!!corrupt!!!").isEmpty(),
                "malformed local bookmark data safely produces no shortcuts");
        check(!BrowserBookmarkShortcuts.hasAdditionalOrigins(""), "empty data has no additional origins");
        check(!BrowserBookmarkShortcuts.hasAdditionalOrigins(null), "null data has no additional origins");
        check(BrowserBookmarkShortcuts.totalOrigins("") == 0, "empty total is zero");
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
        check(BrowserBookmarkShortcuts.hasAdditionalOrigins(saved),
                "seven saved origins must report additional origins beyond the rail");
        check(BrowserBookmarkShortcuts.totalOrigins(saved) == 7, "total origins reports full list size");

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

    private static void additionalOriginsFlagMatchesCount() {
        String few = "";
        for (int i = 0; i < BrowserBookmarkShortcuts.MAX_VISIBLE; i++) {
            few = BrowserHistory.add(few, "https://few" + i + ".example/");
        }
        check(!BrowserBookmarkShortcuts.hasAdditionalOrigins(few),
                "exactly MAX_VISIBLE bookmarks means no overflow affordance");
        check(BrowserBookmarkShortcuts.totalOrigins(few) == BrowserBookmarkShortcuts.MAX_VISIBLE,
                "total matches MAX_VISIBLE when there is no overflow");
        String more = BrowserHistory.add(few, "https://extra.example/");
        check(BrowserBookmarkShortcuts.hasAdditionalOrigins(more),
                "one past MAX_VISIBLE must surface the overflow affordance");
        check(BrowserBookmarkShortcuts.visibleOrigins(more).size() == BrowserBookmarkShortcuts.MAX_VISIBLE,
                "overflow does not expand the visible rail");
        check(BrowserBookmarkShortcuts.totalOrigins(more) == BrowserBookmarkShortcuts.MAX_VISIBLE + 1,
                "total includes the overflow origin");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
