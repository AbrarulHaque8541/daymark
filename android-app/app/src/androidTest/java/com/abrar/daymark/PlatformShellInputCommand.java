package com.abrar.daymark;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Builds bounded shell input commands for platform-only instrumentation. */
final class PlatformShellInputCommand {
    static final String STATUS_MARKER = "__DAYMARK_INPUT_STATUS__=";
    private static final int MAX_COORDINATE = 10000;
    private static final int MAX_DURATION_MS = 5000;
    private static final Pattern STATUS_PATTERN =
            Pattern.compile("(?m)^" + Pattern.quote(STATUS_MARKER) + "([0-9]{1,3})$");

    private PlatformShellInputCommand() { }

    static String tap(int x, int y) {
        checkCoordinate(x, "tap x");
        checkCoordinate(y, "tap y");
        return "input tap " + x + " " + y;
    }

    static String swipe(int startX, int startY, int endX, int endY, int durationMs) {
        checkCoordinate(startX, "swipe start x");
        checkCoordinate(startY, "swipe start y");
        checkCoordinate(endX, "swipe end x");
        checkCoordinate(endY, "swipe end y");
        if (durationMs < 1 || durationMs > MAX_DURATION_MS) {
            throw new IllegalArgumentException("swipe duration is outside 1.." + MAX_DURATION_MS);
        }
        return "input swipe " + startX + " " + startY + " " + endX + " " + endY + " " + durationMs;
    }

    static String withStatus(String command) {
        if (command == null || !(command.startsWith("input tap ") || command.startsWith("input swipe "))) {
            throw new IllegalArgumentException("unsupported shell input command");
        }
        return command + "; code=$?; printf '\\n" + STATUS_MARKER + "%s\\n' \"$code\"";
    }

    static int parseStatus(String output) {
        if (output == null) throw new IllegalArgumentException("shell input returned no output");
        Matcher matcher = STATUS_PATTERN.matcher(output.replace("\r", ""));
        int status = -1;
        while (matcher.find()) status = Integer.parseInt(matcher.group(1));
        if (status < 0 || status > 255) {
            throw new IllegalArgumentException("shell input status marker missing or invalid");
        }
        return status;
    }

    private static void checkCoordinate(int value, String label) {
        if (value < 0 || value > MAX_COORDINATE) {
            throw new IllegalArgumentException(label + " is outside 0.." + MAX_COORDINATE);
        }
    }
}
