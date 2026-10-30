package com.daymark.core;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * Deterministic, platform-neutral action policy for Daymark device surfaces.
 *
 * <p>Platform adapters must report capabilities they actually verified. This class never infers
 * hardware, permission, network, secure-storage, or background-execution support from a device
 * name. It only decides which Daymark actions fit the declared surface and input affordances.
 */
public final class DeviceCapabilityPolicy {
    public enum Surface { PHONE, TABLET, DESKTOP, WATCH, RING, DISPLAYLESS, CAR, EINK, SMART_DISPLAY }
    public enum Display { NONE, GLANCE, COMPACT, FULL }
    public enum Input { TOUCH, KEYBOARD, POINTER, VOICE, BUTTON }
    public enum Feature {
        TASK_CAPTURE, TASK_EDIT, TASK_REVIEW, FOCUS_TIMER, REMINDER_ACTIONS, BROWSER, VOICE_CAPTURE
    }
    public enum Action {
        CAPTURE_TASK, EDIT_TASK, REVIEW_TASKS, START_FOCUS, PAUSE_FOCUS, FINISH_FOCUS,
        ACKNOWLEDGE_REMINDER, SNOOZE_REMINDER, OPEN_BROWSER, VOICE_CAPTURE
    }

    private final Surface surface;
    private final Display display;
    private final Set<Input> inputs;
    private final Set<Feature> features;

    private DeviceCapabilityPolicy(Surface surface, Display display,
                                   Set<Input> inputs, Set<Feature> features) {
        if (surface == null || display == null || inputs == null || features == null) {
            throw new IllegalArgumentException("Surface, display, inputs and features are required.");
        }
        if (surface == Surface.RING || surface == Surface.DISPLAYLESS) {
            if (display != Display.NONE && display != Display.GLANCE) {
                throw new IllegalArgumentException("A ring or display-less surface cannot declare a rich display.");
            }
        }
        this.surface = surface;
        this.display = display;
        this.inputs = immutableEnumCopy(inputs, Input.class);
        this.features = immutableEnumCopy(features, Feature.class);
    }

    public static DeviceCapabilityPolicy of(Surface surface, Display display,
                                            Set<Input> inputs, Set<Feature> features) {
        return new DeviceCapabilityPolicy(surface, display, inputs, features);
    }

    public Surface surface() { return surface; }
    public Display display() { return display; }
    public Set<Input> inputs() { return inputs; }
    public Set<Feature> features() { return features; }

    /** Returns an immutable action set. Recompute when the platform capability snapshot changes. */
    public Set<Action> availableActions() {
        EnumSet<Action> actions = EnumSet.noneOf(Action.class);
        boolean richInput = hasAny(Input.TOUCH, Input.KEYBOARD, Input.POINTER);
        boolean simpleInput = richInput || inputs.contains(Input.VOICE) || inputs.contains(Input.BUTTON);
        boolean visible = display != Display.NONE;

        if (surface != Surface.CAR && features.contains(Feature.TASK_CAPTURE) && simpleInput) {
            actions.add(Action.CAPTURE_TASK);
        }
        if (surface != Surface.CAR && features.contains(Feature.TASK_EDIT)
                && display == Display.FULL && richInput) {
            actions.add(Action.EDIT_TASK);
        }
        if (surface != Surface.CAR && features.contains(Feature.TASK_REVIEW)
                && visible && (richInput || inputs.contains(Input.VOICE))) {
            actions.add(Action.REVIEW_TASKS);
        }

        // Driving surfaces expose only brief, low-distraction reminder actions.
        if (features.contains(Feature.REMINDER_ACTIONS)
                && (inputs.contains(Input.BUTTON) || inputs.contains(Input.VOICE)
                    || inputs.contains(Input.TOUCH))) {
            actions.add(Action.ACKNOWLEDGE_REMINDER);
            actions.add(Action.SNOOZE_REMINDER);
        }

        // Focus controls are available on personal surfaces, including button-only companions,
        // but never on a declared in-car surface.
        if (surface != Surface.CAR && features.contains(Feature.FOCUS_TIMER) && simpleInput) {
            actions.add(Action.START_FOCUS);
            actions.add(Action.PAUSE_FOCUS);
            actions.add(Action.FINISH_FOCUS);
        }
        if (surface != Surface.CAR && features.contains(Feature.BROWSER)
                && display == Display.FULL && richInput) {
            actions.add(Action.OPEN_BROWSER);
        }
        if (surface != Surface.CAR && features.contains(Feature.VOICE_CAPTURE)
                && inputs.contains(Input.VOICE)) {
            actions.add(Action.VOICE_CAPTURE);
        }
        return Collections.unmodifiableSet(actions);
    }

    private boolean hasAny(Input... candidates) {
        for (Input candidate : candidates) if (inputs.contains(candidate)) return true;
        return false;
    }

    private static <E extends Enum<E>> Set<E> immutableEnumCopy(Set<E> values, Class<E> type) {
        EnumSet<E> copy = EnumSet.noneOf(type);
        copy.addAll(values);
        return Collections.unmodifiableSet(copy);
    }
}
