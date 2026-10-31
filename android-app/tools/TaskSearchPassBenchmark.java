package com.abrar.daymark;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Optional JDK-only comparison of one vs two search passes; not an Android UI benchmark. */
public final class TaskSearchPassBenchmark {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);

    private TaskSearchPassBenchmark() { }

    private static int filter(List<Task> tasks) {
        return TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "abszent budgit", TODAY).size();
    }

    private static long measure(List<Task> tasks, int passes) {
        long start = System.nanoTime();
        int results = 0;
        for (int pass = 0; pass < passes; pass++) results += filter(tasks);
        if (results != 0) throw new AssertionError("Unexpected benchmark match");
        return (System.nanoTime() - start) / 1_000_000L;
    }

    public static void main(String[] args) {
        String sentence = "routine planning paperwork analysis reviewing project document ";
        StringBuilder note = new StringBuilder();
        while (note.length() + sentence.length() <= 3980) note.append(sentence);
        String notes = note.toString();
        List<Task> tasks = new ArrayList<>();
        for (int index = 0; index < 1000; index++) {
            tasks.add(new Task("t" + index, "Task " + index, null, "medium", false,
                    "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z", Collections.emptyList(), notes,
                    null, null, null, null, Collections.emptyList(), Collections.emptyList()));
        }
        for (int index = 0; index < 8; index++) {
            measure(tasks, 1);
            measure(tasks, 2);
        }
        long[] single = new long[11];
        long[] twice = new long[11];
        for (int index = 0; index < single.length; index++) {
            // Alternate measurement order to reduce ordering bias.
            if ((index & 1) == 0) {
                single[index] = measure(tasks, 1);
                twice[index] = measure(tasks, 2);
            } else {
                twice[index] = measure(tasks, 2);
                single[index] = measure(tasks, 1);
            }
        }
        Arrays.sort(single);
        Arrays.sort(twice);
        System.out.println("HOST ONLY: warmed JDK, 1000 tasks, " + notes.length()
                + " note characters, two absent fuzzy terms");
        System.out.println("one filter pass median: " + single[5] + " ms; samples " + Arrays.toString(single));
        System.out.println("two filter passes median: " + twice[5] + " ms; samples " + Arrays.toString(twice));
        System.out.println("Not an Android, cold-start, frame-time or end-to-end UI measurement.");
    }
}
