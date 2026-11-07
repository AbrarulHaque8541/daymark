package com.abrar.daymark;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;

/** Host regression smoke for browser history and the unintegrated persistent tab snapshot model. */
public final class BrowserHistoryTabStoreSmoke {
    private static int assertions;

    private BrowserHistoryTabStoreSmoke() { }

    public static void main(String[] args) {
        historyStoreKeepsOriginOnlyLegacyPersistence();
        historyStoreIsImmutableAndBounded();
        tabSnapshotsRoundTripAndMutateDeterministically();
        tabSnapshotsEnforceBoundaries();
        tabSnapshotsRejectMalformedOrUnsafeRecords();
        System.out.println("PASS browser history/tab store smoke: " + assertions + " assertions");
    }

    private static void historyStoreKeepsOriginOnlyLegacyPersistence() {
        String legacy = BrowserHistory.add("", "https://first.example/path?token=old#fragment");
        BrowserHistoryStore restored = BrowserHistoryStore.restore(legacy);
        check(restored.origins().equals(Arrays.asList("https://first.example")),
                "existing history preference values restore through the model");

        BrowserHistoryStore visited = restored.record("HTTP://user:pass@Second.Example:80/a?secret=1#f");
        check(visited.origins().equals(Arrays.asList("http://second.example", "https://first.example")),
                "HTTP visits are normalized to an origin and prepended newest-first");
        String serialized = visited.serialize();
        check(!serialized.contains("secret") && !serialized.contains("user") && !serialized.contains("/a"),
                "serialized history contains no paths, query values, or userinfo");
        check(BrowserHistoryStore.restore(serialized).origins().equals(visited.origins()),
                "history serializes and restores using the established format");
        check(visited.search("FIRST").equals(Arrays.asList("https://first.example")),
                "history search is case-insensitive and preserves stored order");
        check(visited.remove("https://first.example/a").origins().equals(Arrays.asList("http://second.example")),
                "forgetting an address removes only its matching origin");
        check(visited.clear().origins().isEmpty(), "clear returns an empty history model");
        expectIllegalArgument(() -> restored.record("javascript:alert(1)"),
                "non-web addresses cannot enter history");
        check(restored.origins().equals(Arrays.asList("https://first.example")),
                "recording does not mutate the original history model");
    }

    private static void historyStoreIsImmutableAndBounded() {
        BrowserHistoryStore history = BrowserHistoryStore.empty();
        for (int i = 0; i < BrowserHistory.MAX_ENTRIES + 7; i++) {
            history = history.record("https://site" + i + ".example/page");
        }
        check(history.origins().size() == BrowserHistory.MAX_ENTRIES,
                "history respects the existing fifty-origin cap");
        check("https://site56.example".equals(history.origins().get(0)),
                "the newest origin remains first at the cap");
        check(!history.origins().contains("https://site0.example"),
                "the oldest origin drops off when the cap is exceeded");
        BrowserHistoryStore cappedHistory = history;
        expectUnsupported(() -> cappedHistory.origins().add("https://mutate.example"),
                "callers cannot mutate the returned origin list");
    }

    private static void tabSnapshotsRoundTripAndMutateDeterministically() {
        BrowserTabStore.Snapshot empty = BrowserTabStore.empty();
        check(BrowserTabStore.decode(BrowserTabStore.encode(empty)).equals(empty),
                "empty session snapshots round-trip");

        BrowserTabStore.Snapshot session = empty.open("https://example.com/route?view=1#panel");
        long firstId = session.selectedId();
        session = session.open("http://plain.example/start");
        long secondId = session.selectedId();
        check(firstId == 1L && secondId == 2L,
                "new tabs receive stable monotonically increasing IDs");
        check("http://plain.example/start".equals(session.tabs().get(1).address()),
                "HTTP addresses can be represented without claiming a load occurred");

        BrowserTabStore.Snapshot selectedFirst = session.select(firstId);
        BrowserTabStore.Snapshot updated = selectedFirst.updateAddress(firstId,
                "https://example.com/next?view=2#details");
        check(updated.selectedId() == firstId
                        && "https://example.com/next?view=2#details".equals(updated.tabs().get(0).address()),
                "updating a tab preserves selection and its normalized navigation address");
        check(selectedFirst.tabs().get(0).address().endsWith("?view=1#panel"),
                "tab snapshots are immutable");
        BrowserTabStore.Snapshot closed = updated.close(firstId);
        check(closed.tabs().size() == 1 && closed.selectedId() == secondId,
                "closing the selected tab chooses the preceding remaining tab when available");
        BrowserTabStore.Snapshot closedLast = closed.close(secondId);
        check(closedLast.tabs().isEmpty() && closedLast.selectedId() == 0L,
                "closing the last tab leaves a valid empty session");
        BrowserTabStore.Snapshot next = closedLast.open("");
        check(next.tabs().get(0).id() == 3L,
                "an empty session keeps its next ID so closed tab IDs are not reused");

        String encoded = BrowserTabStore.encode(updated);
        check(encoded.startsWith("DAYMARK_BROWSER_TABS\t1\n"),
                "tab snapshots carry an explicit format version");
        check(!encoded.contains("example.com") && BrowserTabStore.decode(encoded).equals(updated),
                "tab addresses are safely delimited and the complete snapshot restores");
        expectUnsupported(() -> updated.tabs().clear(), "callers cannot mutate the tab list");
    }

    private static void tabSnapshotsEnforceBoundaries() {
        BrowserTabStore.Snapshot full = BrowserTabStore.empty();
        for (int i = 0; i < BrowserTabPolicy.MAX_TABS; i++) {
            full = full.open("https://tab" + i + ".example/path");
        }
        check(full.tabs().size() == BrowserTabPolicy.MAX_TABS,
                "the store uses the existing browser tab-count policy");
        BrowserTabStore.Snapshot fullSnapshot = full;
        expectIllegalState(() -> fullSnapshot.open("https://extra.example"),
                "opening more than the configured maximum is rejected");
        expectIllegalArgument(() -> fullSnapshot.select(Long.MAX_VALUE),
                "selection of a missing tab is rejected");
        expectIllegalArgument(() -> fullSnapshot.updateAddress(Long.MAX_VALUE, "https://example.com"),
                "updates to a missing tab are rejected");

        BrowserTabStore.Snapshot withBackgroundClosed = fullSnapshot.close(fullSnapshot.tabs().get(0).id());
        check(withBackgroundClosed.selectedId() == fullSnapshot.selectedId(),
                "closing a non-selected tab preserves the active selection");
        check(BrowserTabStore.decode(BrowserTabStore.encode(withBackgroundClosed)).equals(withBackgroundClosed),
                "the selected ID and ordered tabs survive a persistence round-trip");
    }

    private static void tabSnapshotsRejectMalformedOrUnsafeRecords() {
        expectIllegalArgument(() -> BrowserTabStore.decode("DAYMARK_BROWSER_TABS\t2\nselected\t0\nnext\t1"),
                "unknown snapshot versions are rejected");
        expectIllegalArgument(() -> BrowserTabStore.decode("not a snapshot"),
                "malformed non-empty records are rejected instead of silently erased");
        expectIllegalArgument(() -> BrowserTabStore.decode("x".repeat(BrowserTabStore.MAX_SERIALIZED_CHARS + 1)),
                "oversized snapshots are rejected before parsing");
        expectIllegalArgument(() -> BrowserTabStore.empty().open("javascript:alert(1)"),
                "script schemes cannot be persisted as tabs");
        expectIllegalArgument(() -> BrowserTabStore.empty().open("https://user:secret@example.com/path"),
                "embedded credentials cannot be persisted as tab addresses");

        String badScheme = "DAYMARK_BROWSER_TABS\t1\nselected\t1\nnext\t2\ntab\t1\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString("file:///tmp/x".getBytes(StandardCharsets.UTF_8));
        expectIllegalArgument(() -> BrowserTabStore.decode(badScheme),
                "unsafe web schemes in old or corrupted snapshots are rejected");
        String missingSelection = "DAYMARK_BROWSER_TABS\t1\nselected\t9\nnext\t2\ntab\t1\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString("https://example.com".getBytes(StandardCharsets.UTF_8));
        expectIllegalArgument(() -> BrowserTabStore.decode(missingSelection),
                "a snapshot cannot select a tab it does not contain");
        String duplicateIds = "DAYMARK_BROWSER_TABS\t1\nselected\t1\nnext\t3\ntab\t1\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString("https://one.example".getBytes(StandardCharsets.UTF_8))
                + "\ntab\t1\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString("https://two.example".getBytes(StandardCharsets.UTF_8));
        expectIllegalArgument(() -> BrowserTabStore.decode(duplicateIds),
                "duplicate tab IDs are rejected");
        check(BrowserTabStore.decode("").equals(BrowserTabStore.empty()),
                "an absent preference value means an empty session");
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalArgument(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected validation failure.
        }
    }

    private static void expectIllegalState(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IllegalStateException expected) {
            // Expected tab-cap failure.
        }
    }

    private static void expectUnsupported(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (UnsupportedOperationException expected) {
            // Expected immutable view.
        }
    }
}
