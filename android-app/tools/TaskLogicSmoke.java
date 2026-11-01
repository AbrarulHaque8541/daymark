package com.abrar.daymark;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

public final class TaskLogicSmoke {
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);
    private static int assertions;

    private TaskLogicSmoke() { }

    public static void main(String[] args) throws IOException {
        datesAreStrictAndDateOnly();
        if (args.length > 0) sharedDateContract(Path.of(args[0]));
        if (args.length > 1) sharedRepeatContract(Path.of(args[1]));
        CRUDKeepsStableIdentityAndTimestamps();
        templatesValidateAndCreateFreshTasks();
        templateListsRejectDuplicatesAndExcess();
        storedTaskSnapshotsMatchWriterRules();
        snapshotSchemaRejectsCoercibleWrongTypes();
        notesDueTimeAndReminderValidate();
        subtasksValidateAndToggle();
        attachmentMetadataAndQuotasAreStrict();
        filtersAndSearchCompose();
        suggestionsUseOnlyTransparentLocalRules();
        repeatRulesValidateAndAdvance();
        System.out.println("PASS Android core logic smoke tests: " + assertions + " assertions");
    }

    private static void datesAreStrictAndDateOnly() {
        check(TaskLogic.isDateOnly("2024-02-29"), "valid leap date accepted");
        check(!TaskLogic.isDateOnly("2026-02-29"), "impossible date rejected");
        check(!TaskLogic.isDateOnly("2026-2-09"), "non-padded date rejected");
        check(TaskLogic.isValid(task("1", "Review", "0001-01-01", "high", false, 1)), "year 0001 supported");
    }

    private static void sharedDateContract(Path fixture) throws IOException {
        int cases = 0;
        try (BufferedReader reader = Files.newBufferedReader(fixture, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] fields = line.split("\\t", -1);
                check(fields.length == 2, "date contract fixture line " + lineNumber + " has two columns");
                boolean expected;
                if ("true".equals(fields[1])) expected = true;
                else if ("false".equals(fields[1])) expected = false;
                else throw new AssertionError("invalid expected boolean at date contract fixture line " + lineNumber);
                check(TaskLogic.isDateOnly(fields[0]) == expected,
                        "Android date validation matches shared fixture line " + lineNumber);
                cases++;
            }
        }
        check(cases == 9, "shared date contract fixture contains all nine cases");
    }

    private static void sharedRepeatContract(Path fixture) throws IOException {
        int cases = 0;
        try (BufferedReader reader = Files.newBufferedReader(fixture, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] fields = line.split("\\t", -1);
                check(fields.length == 4, "recurrence contract fixture line " + lineNumber + " has four columns");
                Integer anchor = "-".equals(fields[2]) ? null : Integer.valueOf(fields[2]);
                String actual = TaskLogic.nextDueDate(fields[0], fields[1], anchor);
                check(fields[3].equals(actual),
                        "Android recurrence matches shared fixture line " + lineNumber + ": " + fields[1]);
                cases++;
            }
        }
        check(cases == 10, "shared recurrence contract contains all ten edge cases");
    }

    private static void CRUDKeepsStableIdentityAndTimestamps() {
        Task created = TaskLogic.create("  Call the dentist  ", null, "medium");
        check("Call the dentist".equals(created.title), "new titles are trimmed");
        check(TaskLogic.isValid(created) && !created.completed, "new task has valid model fields");
        Task edited = TaskLogic.update(created, "Call clinic", "2026-10-05", "high");
        check(created.id.equals(edited.id), "edits preserve task ID");
        check(created.createdAt.equals(edited.createdAt), "edits preserve createdAt");
        check(!Instant.parse(edited.updatedAt).isBefore(Instant.parse(created.updatedAt)), "edit timestamp is valid and does not move backwards");
        Task completed = TaskLogic.toggleCompleted(edited);
        check(completed.completed && completed.id.equals(edited.id), "completion toggles without changing identity");
        expectIllegalArgument(() -> TaskLogic.create("  ", null, "medium"), "blank title rejected");
        expectIllegalArgument(() -> TaskLogic.create("Bad date", "2026-02-30", "medium"), "invalid due date rejected");
    }
