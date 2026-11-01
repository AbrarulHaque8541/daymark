package com.abrar.daymark;

import java.util.List;

/** Host regression tests for bounded, newest-first browser download selection. */
public final class BrowserDownloadListPolicySmoke {
    private static int assertions;

    private BrowserDownloadListPolicySmoke() { }

    public static void main(String[] args) {
        newestWindowIsBoundedAndSorted();
        arbitraryCursorOrderDoesNotChangeSelection();
        timestampTiesUseStableDownloadIdOrder();
        smallAndEmptySelectionsRemainUntruncated();
        zeroLimitAndOversizedLimitStayBounded();
        System.out.println("PASS BrowserDownloadListPolicySmoke: " + assertions + " assertions");
    }

    private static void newestWindowIsBoundedAndSorted() {
        BrowserDownloadListPolicy.Collector collector =
                new BrowserDownloadListPolicy.Collector(BrowserDownloadListPolicy.MAX_VISIBLE);
        for (long id = 1; id <= 120; id++) {
            collector.add(item(id, id));
        }
        BrowserDownloadListPolicy.Selection selection = collector.finish();
        check(selection.totalCount == 120, "selection counts every provider row");
        check(selection.truncated, "more than the visible limit reports truncation");
        check(selection.items.size() == BrowserDownloadListPolicy.MAX_VISIBLE,
                "retained selection never exceeds the visible limit");
        check(selection.items.get(0).id == 120L && selection.items.get(0).lastModified == 120L,
                "newest row is first");
        check(selection.items.get(selection.items.size() - 1).id == 21L,
                "oldest row in the retained newest window is last");
        for (int index = 1; index < selection.items.size(); index++) {
            BrowserDownloadListPolicy.Item previous = selection.items.get(index - 1);
            BrowserDownloadListPolicy.Item current = selection.items.get(index);
            check(previous.lastModified >= current.lastModified,
                    "selection is ordered by descending modification time");
        }
        expectUnsupported(() -> selection.items.clear(),
                "selection list is immutable after finish");
        check(collector.retainedCount() == BrowserDownloadListPolicy.MAX_VISIBLE,
                "collector retains only the bounded top-K window");
    }

    private static void arbitraryCursorOrderDoesNotChangeSelection() {
        BrowserDownloadListPolicy.Collector collector =
                new BrowserDownloadListPolicy.Collector(3);
        collector.add(item(2, 20));
        collector.add(item(100, 100));
        collector.add(item(7, 7));
        collector.add(item(50, 50));
        collector.add(item(3, 30));
        BrowserDownloadListPolicy.Selection selection = collector.finish();
        check(selection.items.size() == 3 && selection.truncated,
                "collector selects three rows from an unordered provider cursor");
        check(selection.items.get(0).id == 100L
                        && selection.items.get(1).id == 50L
                        && selection.items.get(2).id == 3L,
                "top-K selection is independent of cursor arrival order");
    }

    private static void timestampTiesUseStableDownloadIdOrder() {
        BrowserDownloadListPolicy.Collector collector =
                new BrowserDownloadListPolicy.Collector(4);
        collector.add(item(4, 10));
        collector.add(item(2, 10));
        collector.add(item(9, 10));
        collector.add(item(1, 9));
        BrowserDownloadListPolicy.Selection selection = collector.finish();
        check(selection.items.get(0).id == 9L
                        && selection.items.get(1).id == 4L
                        && selection.items.get(2).id == 2L
                        && selection.items.get(3).id == 1L,
                "equal timestamps are ordered deterministically by descending DownloadManager id");
        check(!selection.truncated, "selection at the limit is not truncated");
    }

    private static void smallAndEmptySelectionsRemainUntruncated() {
        BrowserDownloadListPolicy.Collector empty =
                new BrowserDownloadListPolicy.Collector(100);
        BrowserDownloadListPolicy.Selection none = empty.finish();
        check(none.items.isEmpty() && none.totalCount == 0 && !none.truncated,
                "empty provider returns an empty non-truncated selection");

        BrowserDownloadListPolicy.Collector small =
                new BrowserDownloadListPolicy.Collector(100);
        small.add(item(1, 5));
        small.add(item(2, 3));
        BrowserDownloadListPolicy.Selection two = small.finish();
        check(two.items.size() == 2 && two.totalCount == 2 && !two.truncated,
                "provider history below the cap remains complete");
        check(two.items.get(0).id == 1L && two.items.get(1).id == 2L,
                "small result is still newest-first");
    }

    private static void zeroLimitAndOversizedLimitStayBounded() {
        BrowserDownloadListPolicy.Collector zero =
                new BrowserDownloadListPolicy.Collector(0);
        zero.add(item(1, 1));
        BrowserDownloadListPolicy.Selection none = zero.finish();
        check(none.items.isEmpty() && none.totalCount == 1 && none.truncated,
                "zero limit retains no entries but reports omitted rows");

        BrowserDownloadListPolicy.Collector oversized =
                new BrowserDownloadListPolicy.Collector(Integer.MAX_VALUE);
        for (int index = 0; index < BrowserDownloadListPolicy.MAX_VISIBLE + 1; index++) {
            oversized.add(item(index, index));
        }
        check(oversized.retainedCount() == BrowserDownloadListPolicy.MAX_VISIBLE,
                "requested limit cannot exceed the global visible bound");
        check(oversized.finish().truncated,
                "global bound reports omitted rows even for an oversized request");
    }

    private static BrowserDownloadListPolicy.Item item(long id, long timestamp) {
        return new BrowserDownloadListPolicy.Item(id, "Download " + id,
                "https://example.test/" + id, "application/octet-stream",
                2, 0, 100, 200, timestamp);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectUnsupported(Runnable operation, String message) {
        assertions++;
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (UnsupportedOperationException expected) {
            // Expected immutable result.
        }
    }
}
