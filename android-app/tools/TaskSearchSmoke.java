package com.abrar.daymark;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/** Host regression coverage for local, typo-tolerant task search and existing filters. */
public final class TaskSearchSmoke {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static final String STAMP = "2026-10-01T00:00:00Z";
    private static int assertions;

    private TaskSearchSmoke() { }

    public static void main(String[] args) {
        preservesExistingSearch();
        matchesCommonTyposAndMultipleTerms();
        keepsCategoryAndTagFiltersExact();
        handlesUnicodeAndBoundsConservatively();
        matchesReferenceOneEditPolicy();
        System.out.println("PASS task search: " + assertions + " assertions");
    }

    private static void preservesExistingSearch() {
        List<Task> tasks = fixtures();
        check(ids(filter(tasks, "  PLAN  ")).equals(Collections.singletonList("a")),
                "existing case-insensitive, trimmed title substring still works");
        check(ids(filter(tasks, "scuss bud")).equals(Collections.singletonList("a")),
                "an arbitrary note substring still works");
        check(ids(filter(tasks, "errand")).equals(Collections.singletonList("b")),
                "existing tag substring still works");
        check(ids(filter(tasks, "2026-10-05")).equals(Collections.singletonList("a")),
                "literal dates still work");
        check(ids(filter(tasks, "no date")).equals(Arrays.asList("b", "d")),
                "the existing no-date phrase still works");
        check(ids(filter(tasks, "")).equals(Arrays.asList("a", "b", "d", "c")),
                "blank search retains the existing task order");
        check(ids(filter(tasks, "PLAN quarterly")).equals(Collections.singletonList("a")),
                "existing literal phrases still work without case sensitivity");
        check(filter(tasks, "missing@example.org").isEmpty(),
                "punctuation-bearing text is not broadened into unrelated terms");
    }

    private static void matchesCommonTyposAndMultipleTerms() {
        List<Task> tasks = fixtures();
        check(ids(filter(tasks, "meting")).equals(Collections.singletonList("a")),
                "a missing character matches the title");
        check(ids(filter(tasks, "meetting")).equals(Collections.singletonList("a")),
                "an extra character matches the title");
        check(ids(filter(tasks, "meating")).equals(Collections.singletonList("a")),
                "a substituted character matches the title");
        check(ids(filter(tasks, "meetnig")).equals(Collections.singletonList("a")),
                "an adjacent transposition matches the title");
        check(ids(filter(tasks, "groceris")).equals(Collections.singletonList("b")),
                "a typo in a second task matches");
        check(ids(filter(tasks, "coffe")).equals(Collections.singletonList("b")),
                "typos also match notes");
        check(ids(filter(tasks, "errandz")).equals(Collections.singletonList("b")),
                "typos also match tags");
        check(ids(filter(tasks, "buget plan")).equals(Collections.singletonList("a")),
                "multiple terms can match across title and notes");
        check(ids(filter(tasks, "milk groceris")).equals(Collections.singletonList("b")),
                "one exact and one fuzzy term both have to match");
        check(filter(tasks, "milk meting").isEmpty(),
                "a multi-term query does not match when only one term is present");
        check(filter(tasks, "metang").isEmpty(),
                "two edits in one term do not produce a fuzzy match");
        check(filter(tasks, "mox").isEmpty(),
                "short terms are literal to avoid broad fuzzy matches");
        check(ids(filter(tasks, "mee")).equals(Collections.singletonList("a")),
                "short prefixes still match literally while typing");
    }

    private static void keepsCategoryAndTagFiltersExact() {
        List<Task> tasks = fixtures();
        check(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_TODAY, "meting", "work", TODAY))
                        .equals(Collections.singletonList("a")),
                "fuzzy search composes with today and exact tag filters");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_COMPLETED, "meting", "work", TODAY).isEmpty(),
                "fuzzy matches do not bypass the completed filter");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "meting", "errands", TODAY).isEmpty(),
                "fuzzy matches do not bypass the selected tag");
        check(TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, "meting", "WORK", TODAY).isEmpty(),
                "tag chips remain exact and are not fuzzy or case-folded");
        check(ids(TaskLogic.filter(tasks, TaskLogic.FILTER_COMPLETED, "reprot", "work", TODAY))
                        .equals(Collections.singletonList("c")),
                "completed tasks can be found by a typo");
    }

    private static void handlesUnicodeAndBoundsConservatively() {
        List<Task> tasks = fixtures();
        check(ids(filter(tasks, "योजाना")).equals(Collections.singletonList("d")),
                "Unicode letter and combining-mark terms tolerate one extra character");
        check(ids(filter(tasks, "योजना")).equals(Collections.singletonList("d")),
                "exact non-Latin text remains searchable");
        check(ids(filter(tasks, "🚀")).equals(Collections.singletonList("d")),
                "symbols still match literally");
        check(filter(tasks, "🚀 budget").isEmpty(),
                "a symbol-bearing unmatched query is not reduced to unrelated text");
        check(filter(tasks, "2026-10-07").isEmpty(),
                "numeric and punctuation-only typos do not fuzzily match dates");
        check(filter(tasks, "05 2026").isEmpty(),
                "numeric-only terms are not reordered into a misleading date match");
        Task supplementary = task("astral", "𐐨abcd", "", null, false);
        check(ids(filter(Collections.singletonList(supplementary), "𐐨abdc"))
                        .equals(Collections.singletonList("astral")),
                "supplementary Unicode letters survive adjacent-transposition matching");

        String longText = repeat('x', 200);
        Task longTask = task("long", "Long", longText, null, false);
        check(ids(filter(Collections.singletonList(longTask), longText)).equals(Collections.singletonList("long")),
                "long exact queries are not silently truncated");
        check(filter(Collections.singletonList(longTask), longText + "y").isEmpty(),
                "long queries fall back to exact matching");

        Task manyWords = task("words", "alpha bravo charlie delta echo foxtrot golf", "", null, false);
        check(ids(filter(Collections.singletonList(manyWords),
                        "alpha bravo charlie delta echo foxtrot golf")).equals(Collections.singletonList("words")),
                "a long exact phrase still matches");
        check(filter(Collections.singletonList(manyWords),
                "golf foxtrot echo delta charlie bravo alpha").isEmpty(),
                "excessive query terms fall back to exact matching");
    }

    /** Compare the production matcher against an independent edit-distance oracle. */
    private static void matchesReferenceOneEditPolicy() {
        Random random = new Random(8541L);
        for (int iteration = 0; iteration < 5000; iteration++) {
            String query = randomWord(random, 4 + random.nextInt(6));
            String candidate;
            int position = random.nextInt(query.length());
            switch (iteration % 7) {
                case 0:
                    candidate = query;
                    break;
                case 1:
                    candidate = query.substring(0, position) + randomLetter(random)
                            + query.substring(position + 1);
                    break;
                case 2:
                    candidate = query.substring(0, position) + query.substring(position + 1);
                    break;
                case 3:
                    candidate = query.substring(0, position) + randomLetter(random)
                            + query.substring(position);
                    break;
                case 4:
                    int adjacent = Math.min(position, query.length() - 2);
                    candidate = query.substring(0, adjacent) + query.charAt(adjacent + 1)
                            + query.charAt(adjacent) + query.substring(adjacent + 2);
                    break;
                case 5:
                    candidate = randomWord(random, 3 + random.nextInt(9));
                    break;
                default:
                    candidate = randomLetter(random) + query + randomLetter(random);
            }
            Task task = task("oracle", candidate, "", null, false);
            boolean expected = candidate.contains(query) || referenceDistance(query, candidate) <= 1;
            boolean actual = TaskSearch.prepare(query).matches(task);
            check(actual == expected, "oracle mismatch for " + query + " / " + candidate);
        }
    }

    private static int referenceDistance(String left, String right) {
        int[] a = left.codePoints().toArray();
        int[] b = right.codePoints().toArray();
        int[][] distance = new int[a.length + 1][b.length + 1];
        for (int i = 0; i <= a.length; i++) distance[i][0] = i;
        for (int j = 0; j <= b.length; j++) distance[0][j] = j;
        for (int i = 1; i <= a.length; i++) {
            for (int j = 1; j <= b.length; j++) {
                int cost = a[i - 1] == b[j - 1] ? 0 : 1;
                int value = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1);
                value = Math.min(value, distance[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                    value = Math.min(value, distance[i - 2][j - 2] + 1);
                }
                distance[i][j] = value;
            }
        }
        return distance[a.length][b.length];
    }

    private static String randomWord(Random random, int length) {
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) value.append(randomLetter(random));
        return value.toString();
    }

    private static char randomLetter(Random random) {
        return (char) ('a' + random.nextInt(8));
    }

    private static List<Task> fixtures() {
        return Arrays.asList(
                task("a", "Plan quarterly meeting", "Discuss budget on Tuesday", "2026-10-05", false, "work"),
                task("b", "Buy groceries", "Milk and coffee", null, false, "errands"),
                task("c", "Review report", "Résumé for client", "2026-10-06", true, "work"),
                task("d", "🚀 Launch schedule", "साप्ताहिक योजना", null, false, "work"));
    }

    private static Task task(String id, String title, String notes, String due, boolean completed,
                             String... tags) {
        return new Task(id, title, due, "medium", completed, STAMP, STAMP,
                Collections.emptyList(), notes, null, null, null, null,
                Collections.emptyList(), Arrays.asList(tags));
    }

    private static List<Task> filter(List<Task> tasks, String query) {
        return TaskLogic.filter(tasks, TaskLogic.FILTER_ALL, query, TODAY);
    }

    private static List<String> ids(List<Task> tasks) {
        List<String> result = new ArrayList<>();
        for (Task task : tasks) result.add(task.id);
        return result;
    }

    private static String repeat(char c, int count) {
        char[] chars = new char[count];
        Arrays.fill(chars, c);
        return new String(chars);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
