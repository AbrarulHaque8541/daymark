package com.abrar.daymark;

public final class TasksHomeLayoutPolicySmoke {
    private TasksHomeLayoutPolicySmoke() { }

    public static void main(String[] args) {
        TasksHomeLayoutPolicy.Layout compact = TasksHomeLayoutPolicy.forWidthDp(599);
        check(compact.maxContentWidthDp == 0, "compact phones use available width");
        check(compact.horizontalPaddingDp == 16 && compact.columns == 1,
                "compact phones use one column and 16dp side padding");

        TasksHomeLayoutPolicy.Layout medium = TasksHomeLayoutPolicy.forWidthDp(600);
        check(medium.maxContentWidthDp == 720, "medium layouts cap content at 720dp");
        check(medium.horizontalPaddingDp == 24 && medium.columns == 1,
                "medium layouts remain one column with wider gutters");

        TasksHomeLayoutPolicy.Layout expanded = TasksHomeLayoutPolicy.forWidthDp(840);
        check(expanded.maxContentWidthDp == 1040, "expanded layouts cap content at 1040dp");
        check(expanded.columns == 2 && expanded.columnGapDp == 16,
                "expanded layouts use a two-column task grid");

        TasksHomeLayoutPolicy.Layout wide = TasksHomeLayoutPolicy.forWidthDp(1200);
        check(wide.columns == 2 && wide.maxContentWidthDp == 1040,
                "wide tablets retain the same centered content cap");
        System.out.println("PASS responsive Tasks Home layout policy: 8 assertions");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
