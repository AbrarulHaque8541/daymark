package com.abrar.daymark;

/** Width-based Tasks Home layout policy, kept independent for deterministic host tests. */
final class TasksHomeLayoutPolicy {
    private TasksHomeLayoutPolicy() { }

    static Layout forWidthDp(int widthDp) {
        if (widthDp >= 840) return new Layout(1040, 24, 2, 16, 12);
        if (widthDp >= 600) return new Layout(720, 24, 1, 0, 12);
        return new Layout(0, 16, 1, 0, 10);
    }

    static final class Layout {
        final int maxContentWidthDp;
        final int horizontalPaddingDp;
        final int columns;
        final int columnGapDp;
        final int rowGapDp;

        Layout(int maxContentWidthDp, int horizontalPaddingDp, int columns,
               int columnGapDp, int rowGapDp) {
            this.maxContentWidthDp = maxContentWidthDp;
            this.horizontalPaddingDp = horizontalPaddingDp;
            this.columns = columns;
            this.columnGapDp = columnGapDp;
            this.rowGapDp = rowGapDp;
        }
    }
}
