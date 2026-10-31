package com.abrar.daymark;
/** Bounded JSON payload for an explicitly user-approved outbound task webhook. */
final class TaskWebhookPayload {
    static final int MAX_PAYLOAD_CHARS = 16_384;

    private TaskWebhookPayload() { }

    static String create(Task task, boolean includeNotes) {
        if (task == null) throw new IllegalArgumentException("A task is required.");
        StringBuilder json = new StringBuilder(512);
        json.append("{\"event\":\"daymark.task.shared\",\"task\":{");
        field(json, "title", task.title, true);
        field(json, "dueDate", task.dueDate, false);
        field(json, "dueTime", task.dueTime, false);
        field(json, "priority", task.priority, false);
        json.append(",\"completed\":").append(task.completed);
        if (includeNotes) field(json, "notes", task.notes, false);
        json.append("}}");
        if (json.length() > MAX_PAYLOAD_CHARS) {
            throw new IllegalArgumentException("The selected task is too large to send.");
        }
        return json.toString();
    }

    private static void field(StringBuilder json, String name, String value, boolean first) {
        if (!first) json.append(',');
        quote(json, name);
        json.append(':');
        if (value == null) json.append("null");
        else quote(json, value);
    }

    private static void quote(StringBuilder json, String value) {
        json.append('"');
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            switch (current) {
                case '"': json.append("\\\""); break;
                case '\\': json.append("\\\\"); break;
                case '\b': json.append("\\b"); break;
                case '\f': json.append("\\f"); break;
                case '\n': json.append("\\n"); break;
                case '\r': json.append("\\r"); break;
                case '\t': json.append("\\t"); break;
                default:
                    if (current < 0x20) {
                        String hex = Integer.toHexString(current);
                        json.append("\\u");
                        for (int pad = hex.length(); pad < 4; pad++) json.append('0');
                        json.append(hex);
                    } else if (Character.isHighSurrogate(current)) {
                        if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                            throw new IllegalArgumentException("Task text contains invalid Unicode.");
                        }
                        json.append(current).append(value.charAt(++index));
                    } else if (Character.isLowSurrogate(current)) {
                        throw new IllegalArgumentException("Task text contains invalid Unicode.");
                    } else {
                        json.append(current);
                    }
            }
        }
        json.append('"');
    }
}
