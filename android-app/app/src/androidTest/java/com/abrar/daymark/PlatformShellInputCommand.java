package com.abrar.daymark;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Builds bounded shell input commands for platform-only instrumentation. */
final class PlatformShellInputCommand {
    static final String STATUS_MARKER = "__DAYMARK_INPUT_STATUS__=";
    private static final int MAX_COORDINATE = 10000;
    private static final int MAX_DURATION_MS = 5000;
    private static final Pattern TAP_PATTERN = Pattern.compile("input tap ([0-9]{1,5}) ([0-9]{1,5})");
    private static final Pattern SWIPE_PATTERN =
            Pattern.compile("input swipe ([0-9]{1,5}) ([0-9]{1,5}) ([0-9]{1,5}) ([0-9]{1,5}) ([0-9]{1,4})");
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
        if (command == null) throw new IllegalArgumentException("shell input command is required");
        Matcher tap = TAP_PATTERN.matcher(command);
        if (tap.matches()) {
            tap(Integer.parseInt(tap.group(1)), Integer.parseInt(tap.group(2)));
        } else {
            Matcher swipe = SWIPE_PATTERN.matcher(command);
            if (!swipe.matches()) throw new IllegalArgumentException("unsupported shell input command");
            swipe(Integer.parseInt(swipe.group(1)), Integer.parseInt(swipe.group(2)),
                    Integer.parseInt(swipe.group(3)), Integer.parseInt(swipe.group(4)),
                    Integer.parseInt(swipe.group(5)));
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
