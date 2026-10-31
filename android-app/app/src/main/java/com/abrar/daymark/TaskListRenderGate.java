package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/** Avoid rebuilding task rows only while their immutable task instances and inputs are unchanged. */
final class TaskListRenderGate {
    private boolean hasRendered;
    private String lastFilter = "";
    private String lastQuery = "";
    private String lastTag = "";
    private boolean lastSaveFailed;
    private List<Task> lastVisible = Collections.emptyList();

    TaskListRenderGate() { }

    static TaskListRenderGate create() {
        return new TaskListRenderGate();
    }

    /** @return true if the list should be rebuilt. */
    boolean shouldRebuild(String filter, String query, List<Task> visible, boolean saveFailed) {
        return shouldRebuild(filter, query, "", visible, saveFailed);
    }

    /** @return true if the list or any filter input changed. */
    boolean shouldRebuild(String filter, String query, String tag, List<Task> visible,
                          boolean saveFailed) {
        String nextFilter = filter == null ? "" : filter;
        String nextQuery = query == null ? "" : query;
        String nextTag = tag == null ? "" : tag;
        if (hasRendered && lastFilter.equals(nextFilter) && lastQuery.equals(nextQuery)
                && lastTag.equals(nextTag) && lastSaveFailed == saveFailed
                && sameTasksByIdentity(lastVisible, visible)) {
            return false;
        }
        lastFilter = nextFilter;
        lastQuery = nextQuery;
        lastTag = nextTag;
        lastSaveFailed = saveFailed;
        // Callers may mutate their list in place. Copy only the references, not the task data.
        lastVisible = visible == null ? Collections.emptyList() : new ArrayList<>(visible);
        hasRendered = true;
        return true;
    }

    void invalidate() {
        hasRendered = false;
        lastVisible = Collections.emptyList();
    }

    /**
     * Task is immutable, including its copied attachment/subtask/tag lists. Every modification
     * produces a new instance, even when updatedAt is unchanged (attachment import/removal does
     * exactly that). Rows and their callbacks capture an instance, so comparing a partial string
     * fingerprint or only updatedAt can otherwise retain stale data and overwrite newer fields.
     */
    private static boolean sameTasksByIdentity(List<Task> previous, List<Task> current) {
        if (current == null) return previous.isEmpty();
        if (previous.size() != current.size()) return false;
        Iterator<Task> iterator = current.iterator();
        for (Task task : previous) {
            if (task != iterator.next()) return false;
        }
        return true;
    }
}
