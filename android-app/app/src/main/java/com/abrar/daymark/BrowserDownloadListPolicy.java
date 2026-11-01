package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.PriorityQueue;

/**
 * Bounded selection policy for the in-app browser's DownloadManager list.
 *
 * DownloadManager.Query exposes filters but no ordering contract. Keep only the
 * newest visible window while scanning the provider cursor, so a large download
 * history cannot allocate one Java object per row.
 */
final class BrowserDownloadListPolicy {
    static final int MAX_VISIBLE = 100;

    private static final Comparator<Item> OLDEST_FIRST = (left, right) -> {
        int byTimestamp = Long.compare(left.lastModified, right.lastModified);
        return byTimestamp != 0 ? byTimestamp : Long.compare(left.id, right.id);
    };

    private BrowserDownloadListPolicy() { }

    static final class Item {
        final long id;
        final String title;
        final String url;
        final String mimeType;
        final int status;
        final int reason;
        final long downloaded;
        final long total;
        final long lastModified;

        Item(long id, String title, String url, String mimeType, int status, int reason,
             long downloaded, long total, long lastModified) {
            this.id = id;
            this.title = title;
            this.url = url;
            this.mimeType = mimeType;
            this.status = status;
            this.reason = reason;
            this.downloaded = downloaded;
            this.total = total;
            this.lastModified = lastModified;
        }
    }

    static final class Selection {
        final List<Item> items;
        final int totalCount;
        final boolean truncated;

        Selection(List<Item> items, int totalCount) {
            this.items = Collections.unmodifiableList(items);
            this.totalCount = totalCount;
            this.truncated = totalCount > items.size();
        }
    }

    /** Streaming top-K collector: O(MAX_VISIBLE) retained entries, O(n log K) scan. */
    static final class Collector {
        private final int limit;
        private final PriorityQueue<Item> oldestFirst;
        private int totalCount;

        Collector(int requestedLimit) {
            limit = Math.max(0, Math.min(MAX_VISIBLE, requestedLimit));
            oldestFirst = new PriorityQueue<>(Math.max(1, limit), OLDEST_FIRST);
        }

        void add(Item item) {
            if (item == null) return;
            if (totalCount < Integer.MAX_VALUE) totalCount++;
            if (limit == 0) return;

            if (oldestFirst.size() < limit) {
                oldestFirst.add(item);
                return;
            }
            Item oldest = oldestFirst.peek();
            if (oldest != null && OLDEST_FIRST.compare(item, oldest) > 0) {
                oldestFirst.poll();
                oldestFirst.add(item);
            }
        }

        Selection finish() {
            List<Item> newestFirst = new ArrayList<>(oldestFirst);
            newestFirst.sort((left, right) -> OLDEST_FIRST.compare(right, left));
            return new Selection(newestFirst, totalCount);
        }

        int retainedCount() {
            return oldestFirst.size();
        }
    }
}
