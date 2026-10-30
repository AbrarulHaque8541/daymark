package com.daymark.core;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

public final class DeviceCapabilityPolicySmoke {
    private static int assertions;

    private DeviceCapabilityPolicySmoke() { }

    public static void main(String[] args) throws Exception {
        phoneGetsOnlyDeclaredFeatures();
        displaylessCompanionStaysTiny();
        watchIsGlanceableNotAFullEditor();
        carPolicyIsRestrictive();
        einkAndDesktopFollowDeclaredCapabilities();
        snapshotsAreImmutableAndValidated();
        if (args.length > 0) verifySharedFixtures(args[0]);
        System.out.println("PASS device capability policy: " + assertions + " assertions");
    }

    private static void phoneGetsOnlyDeclaredFeatures() {
        DeviceCapabilityPolicy phone = profile(DeviceCapabilityPolicy.Surface.PHONE,
                DeviceCapabilityPolicy.Display.FULL,
                EnumSet.of(DeviceCapabilityPolicy.Input.TOUCH, DeviceCapabilityPolicy.Input.KEYBOARD),
                EnumSet.of(DeviceCapabilityPolicy.Feature.TASK_CAPTURE,
                        DeviceCapabilityPolicy.Feature.TASK_EDIT,
                        DeviceCapabilityPolicy.Feature.TASK_REVIEW,
                        DeviceCapabilityPolicy.Feature.FOCUS_TIMER,
                        DeviceCapabilityPolicy.Feature.BROWSER));
        Set<DeviceCapabilityPolicy.Action> actions = phone.availableActions();
        check(actions.contains(DeviceCapabilityPolicy.Action.CAPTURE_TASK), "phone can capture when declared");
        check(actions.contains(DeviceCapabilityPolicy.Action.EDIT_TASK), "full touch/keyboard phone can edit");
        check(actions.contains(DeviceCapabilityPolicy.Action.OPEN_BROWSER), "browser requires explicit feature");
        check(!actions.contains(DeviceCapabilityPolicy.Action.SNOOZE_REMINDER), "undeclared reminders stay absent");
    }

    private static void displaylessCompanionStaysTiny() {
        DeviceCapabilityPolicy ring = profile(DeviceCapabilityPolicy.Surface.RING,
                DeviceCapabilityPolicy.Display.NONE,
                EnumSet.of(DeviceCapabilityPolicy.Input.BUTTON),
                EnumSet.of(DeviceCapabilityPolicy.Feature.FOCUS_TIMER,
                        DeviceCapabilityPolicy.Feature.REMINDER_ACTIONS,
                        DeviceCapabilityPolicy.Feature.TASK_CAPTURE,
                        DeviceCapabilityPolicy.Feature.TASK_EDIT,
                        DeviceCapabilityPolicy.Feature.BROWSER));
        Set<DeviceCapabilityPolicy.Action> actions = ring.availableActions();
        check(actions.contains(DeviceCapabilityPolicy.Action.START_FOCUS), "button companion can start focus");
        check(actions.contains(DeviceCapabilityPolicy.Action.PAUSE_FOCUS), "button companion can pause focus");
        check(actions.contains(DeviceCapabilityPolicy.Action.ACKNOWLEDGE_REMINDER), "button companion can acknowledge");
        check(actions.contains(DeviceCapabilityPolicy.Action.CAPTURE_TASK), "explicit button capture may be supported");
        check(!actions.contains(DeviceCapabilityPolicy.Action.EDIT_TASK), "no-display companion cannot edit");
        check(!actions.contains(DeviceCapabilityPolicy.Action.REVIEW_TASKS), "no-display companion cannot review lists");
        check(!actions.contains(DeviceCapabilityPolicy.Action.OPEN_BROWSER), "no-display companion cannot browse");
    }

    private static void watchIsGlanceableNotAFullEditor() {
        DeviceCapabilityPolicy watch = profile(DeviceCapabilityPolicy.Surface.WATCH,
                DeviceCapabilityPolicy.Display.GLANCE,
                EnumSet.of(DeviceCapabilityPolicy.Input.TOUCH, DeviceCapabilityPolicy.Input.VOICE),
                EnumSet.of(DeviceCapabilityPolicy.Feature.TASK_REVIEW,
                        DeviceCapabilityPolicy.Feature.TASK_EDIT,
                        DeviceCapabilityPolicy.Feature.FOCUS_TIMER,
                        DeviceCapabilityPolicy.Feature.REMINDER_ACTIONS));
        Set<DeviceCapabilityPolicy.Action> actions = watch.availableActions();
        check(actions.contains(DeviceCapabilityPolicy.Action.REVIEW_TASKS), "glance display can review when declared");
        check(!actions.contains(DeviceCapabilityPolicy.Action.EDIT_TASK), "watch does not expose rich editing");
        check(actions.contains(DeviceCapabilityPolicy.Action.START_FOCUS), "watch can expose short focus action");
    }

    private static void carPolicyIsRestrictive() {
        DeviceCapabilityPolicy car = profile(DeviceCapabilityPolicy.Surface.CAR,
                DeviceCapabilityPolicy.Display.COMPACT,
                EnumSet.of(DeviceCapabilityPolicy.Input.TOUCH, DeviceCapabilityPolicy.Input.VOICE),
                EnumSet.of(DeviceCapabilityPolicy.Feature.TASK_CAPTURE,
                        DeviceCapabilityPolicy.Feature.TASK_EDIT,
                        DeviceCapabilityPolicy.Feature.TASK_REVIEW,
                        DeviceCapabilityPolicy.Feature.FOCUS_TIMER,
                        DeviceCapabilityPolicy.Feature.REMINDER_ACTIONS,
                        DeviceCapabilityPolicy.Feature.BROWSER,
                        DeviceCapabilityPolicy.Feature.VOICE_CAPTURE));
        Set<DeviceCapabilityPolicy.Action> actions = car.availableActions();
        check(actions.contains(DeviceCapabilityPolicy.Action.ACKNOWLEDGE_REMINDER), "car may acknowledge reminder");
        check(actions.contains(DeviceCapabilityPolicy.Action.SNOOZE_REMINDER), "car may snooze reminder");
        check(actions.size() == 2, "car blocks task editing, capture, browsing, review and focus controls");
    }

    private static void einkAndDesktopFollowDeclaredCapabilities() {
        DeviceCapabilityPolicy eink = profile(DeviceCapabilityPolicy.Surface.EINK,
                DeviceCapabilityPolicy.Display.FULL,
                EnumSet.of(DeviceCapabilityPolicy.Input.POINTER),
                EnumSet.of(DeviceCapabilityPolicy.Feature.TASK_REVIEW));
        check(eink.availableActions().equals(EnumSet.of(DeviceCapabilityPolicy.Action.REVIEW_TASKS)),
                "e-ink surface exposes only declared review action");
        DeviceCapabilityPolicy desktop = profile(DeviceCapabilityPolicy.Surface.DESKTOP,
                DeviceCapabilityPolicy.Display.FULL,
                EnumSet.of(DeviceCapabilityPolicy.Input.KEYBOARD, DeviceCapabilityPolicy.Input.POINTER),
                EnumSet.of(DeviceCapabilityPolicy.Feature.TASK_CAPTURE, DeviceCapabilityPolicy.Feature.TASK_EDIT));
        check(desktop.availableActions().contains(DeviceCapabilityPolicy.Action.EDIT_TASK),
                "desktop keyboard/pointer can edit when declared");
    }

    private static void snapshotsAreImmutableAndValidated() {
        DeviceCapabilityPolicy profile = profile(DeviceCapabilityPolicy.Surface.DISPLAYLESS,
                DeviceCapabilityPolicy.Display.NONE,
                EnumSet.of(DeviceCapabilityPolicy.Input.BUTTON),
                EnumSet.of(DeviceCapabilityPolicy.Feature.FOCUS_TIMER));
        expectUnsupported(() -> profile.inputs().clear(), "input snapshot is immutable");
        expectUnsupported(() -> profile.availableActions().clear(), "action snapshot is immutable");
        expectIllegalArgument(() -> profile(DeviceCapabilityPolicy.Surface.RING,
                DeviceCapabilityPolicy.Display.FULL, EnumSet.of(DeviceCapabilityPolicy.Input.TOUCH),
                EnumSet.noneOf(DeviceCapabilityPolicy.Feature.class)), "ring cannot claim a full display");
        expectIllegalArgument(() -> DeviceCapabilityPolicy.of(null,
                DeviceCapabilityPolicy.Display.NONE, EnumSet.noneOf(DeviceCapabilityPolicy.Input.class),
                EnumSet.noneOf(DeviceCapabilityPolicy.Feature.class)), "missing surface rejected");
    }


    private static void verifySharedFixtures(String path) throws Exception {
        int cases = 0;
        for (String line : Files.readAllLines(Paths.get(path))) {
            if (line.trim().isEmpty() || line.startsWith("#")) continue;
            String[] columns = line.split("\\|", -1);
            check(columns.length == 5, "fixture must contain five columns");
            DeviceCapabilityPolicy.Surface surface = DeviceCapabilityPolicy.Surface.valueOf(enumName(columns[0]));
            DeviceCapabilityPolicy.Display display = DeviceCapabilityPolicy.Display.valueOf(enumName(columns[1]));
            EnumSet<DeviceCapabilityPolicy.Input> inputs = EnumSet.noneOf(DeviceCapabilityPolicy.Input.class);
            for (String value : csv(columns[2])) inputs.add(DeviceCapabilityPolicy.Input.valueOf(enumName(value)));
            EnumSet<DeviceCapabilityPolicy.Feature> features = EnumSet.noneOf(DeviceCapabilityPolicy.Feature.class);
            for (String value : csv(columns[3])) features.add(DeviceCapabilityPolicy.Feature.valueOf(enumName(value)));
            EnumSet<DeviceCapabilityPolicy.Action> expected = EnumSet.noneOf(DeviceCapabilityPolicy.Action.class);
            for (String value : csv(columns[4])) expected.add(DeviceCapabilityPolicy.Action.valueOf(enumName(value)));
            DeviceCapabilityPolicy policy = DeviceCapabilityPolicy.of(surface, display, inputs, features);
            check(policy.availableActions().equals(expected), "Java policy must match shared fixture case " + (cases + 1));
            cases++;
        }
        check(cases >= 7, "shared device fixture must cover at least seven device classes");
        System.out.println("PASS shared Java device contract fixtures: " + cases + " cases");
    }

    private static String enumName(String value) {
        return value.trim().replace('-', '_').toUpperCase(Locale.ROOT);
    }

    private static String[] csv(String value) {
        if (value.isEmpty() || "-".equals(value)) return new String[0];
        return value.split(",");
    }

    private static DeviceCapabilityPolicy profile(DeviceCapabilityPolicy.Surface surface,
            DeviceCapabilityPolicy.Display display, Set<DeviceCapabilityPolicy.Input> inputs,
            Set<DeviceCapabilityPolicy.Feature> features) {
        return DeviceCapabilityPolicy.of(surface, display, inputs, features);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalArgument(Runnable action, String message) {
        assertions++;
        try { action.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError(message);
    }

    private static void expectUnsupported(Runnable action, String message) {
        assertions++;
        try { action.run(); } catch (UnsupportedOperationException expected) { return; }
        throw new AssertionError(message);
    }
}
