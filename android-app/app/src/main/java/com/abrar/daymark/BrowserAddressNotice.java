package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * UI-independent state contract for compact address-bar notices.
 *
 * <p>The address-bar view owns animation, anchoring and timeout scheduling. This class owns
 * the rules for whether a notice is inline, expanded into its action panel, or cleared.
 * It deliberately performs no I/O, navigation, permission request or Android UI work.
 */
final class BrowserAddressNotice {
    enum Severity {
        INFO,
        WARNING,
        CRITICAL
    }

    enum Presentation {
        HIDDEN,
        INLINE,
        PANEL
    }

    static final class Action {
        final String id;
        final String label;

        Action(String id, String label) {
            this.id = requireText(id, "action id");
            this.label = requireText(label, "action label");
        }
    }

    static final class Notice {
        final String id;
        final String title;
        final String message;
        final Severity severity;
        final boolean dismissible;
        final List<Action> actions;

        Notice(String id, String title, String message, Severity severity,
               boolean dismissible, List<Action> actions) {
            this.id = requireText(id, "notice id");
            this.title = requireText(title, "notice title");
            this.message = requireText(message, "notice message");
            if (severity == null) throw new IllegalArgumentException("notice severity is required");
            this.severity = severity;
            // Critical notices are never dismissible through a timeout or generic close action.
            this.dismissible = severity != Severity.CRITICAL && dismissible;
            List<Action> safeActions = new ArrayList<>();
            if (actions != null) {
                for (Action action : actions) {
                    if (action == null) throw new IllegalArgumentException("notice action is required");
                    for (Action existing : safeActions) {
                        if (existing.id.equals(action.id)) {
                            throw new IllegalArgumentException("duplicate notice action id");
                        }
                    }
                    safeActions.add(action);
                }
            }
            this.actions = Collections.unmodifiableList(safeActions);
        }
    }

    private Notice current;
    private Presentation presentation = Presentation.HIDDEN;

    /** Shows a new notice inline. Repeated delivery of the same notice id is suppressed. */
    boolean show(Notice notice) {
        if (notice == null) throw new IllegalArgumentException("notice is required");
        if (current != null) {
            if (current.id.equals(notice.id)) return false;
            // Never let a later informational event hide an unresolved security-critical notice.
            if (current.severity == Severity.CRITICAL) return false;
        }
        current = notice;
        presentation = Presentation.INLINE;
        return true;
    }

    /** Opens the anchored action panel for the current notice, if one exists. */
    boolean openPanel() {
        if (current == null) return false;
        presentation = Presentation.PANEL;
        return true;
    }

    /** Returns a non-critical notice to its compact inline state. */
    boolean collapsePanel() {
        if (current == null || presentation != Presentation.PANEL) return false;
        presentation = Presentation.INLINE;
        return true;
    }

    /** Timeout may collapse informational/warning notices, but never clears critical notices. */
    boolean onInlineTimeout() {
        if (current == null || presentation != Presentation.INLINE
                || current.severity == Severity.CRITICAL) return false;
        current = null;
        presentation = Presentation.HIDDEN;
        return true;
    }

    /** Generic dismissal is unavailable for critical or explicitly non-dismissible notices. */
    boolean dismiss() {
        if (current == null || !current.dismissible) return false;
        current = null;
        presentation = Presentation.HIDDEN;
        return true;
    }

    /** Explicitly resolves a notice after its owning feature confirms the event is handled. */
    boolean resolve(String noticeId) {
        if (current == null || noticeId == null || !current.id.equals(noticeId)) return false;
        current = null;
        presentation = Presentation.HIDDEN;
        return true;
    }

    Notice current() {
        return current;
    }

    Presentation presentation() {
        return presentation;
    }

    private static String requireText(String value, String field) {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
    }
}
