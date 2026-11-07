package com.abrar.daymark;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Pure-Java model and versioned codec for a browser tab-session snapshot.
 *
 * <p>A snapshot stores only stable tab IDs, validated HTTP(S) navigation addresses, selection,
 * and the next ID. It does not store page titles, WebView history, cookies, page content, or
 * credentials. Addresses can include paths, queries, and fragments needed to restore a page and
 * may themselves contain sensitive data. A future integration must choose app-private storage,
 * disclose the persistence behavior, and continue to gate actual network loads on explicit
 * Online consent. This class performs no persistence I/O and is not connected to the UI.</p>
 */
final class BrowserTabStore {
    static final int MAX_SERIALIZED_CHARS = 32_768;
    private static final String HEADER = "DAYMARK_BROWSER_TABS\t1";
    private static final int MAX_ADDRESS_CHARS = 2_056;

    private BrowserTabStore() { }

    static Snapshot empty() {
        return new Snapshot(Collections.emptyList(), 0L, 1L);
    }

    /** Encodes a bounded snapshot as a deterministic, versioned UTF-8 text record. */
    static String encode(Snapshot snapshot) {
        if (snapshot == null) throw new IllegalArgumentException("A tab snapshot is required.");
        StringBuilder output = new StringBuilder(HEADER)
                .append('\n').append("selected\t").append(snapshot.selectedId)
                .append('\n').append("next\t").append(snapshot.nextId);
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        for (Tab tab : snapshot.tabs) {
            String encodedAddress = encoder.encodeToString(tab.address.getBytes(StandardCharsets.UTF_8));
            output.append('\n').append("tab\t").append(tab.id).append('\t').append(encodedAddress);
        }
        if (output.length() > MAX_SERIALIZED_CHARS) {
            throw new IllegalArgumentException("The browser tab snapshot is too large.");
        }
        return output.toString();
    }

    /**
     * Decodes a snapshot. Empty input means no saved session; malformed or unsupported non-empty
     * input throws so a caller can avoid overwriting a value it could not safely restore.
     */
    static Snapshot decode(String serialized) {
        if (serialized == null || serialized.isEmpty()) return empty();
        if (serialized.length() > MAX_SERIALIZED_CHARS || serialized.indexOf('\r') >= 0) {
            throw new IllegalArgumentException("The browser tab snapshot is malformed or too large.");
        }
        String[] lines = serialized.split("\\n", -1);
        if (lines.length < 3 || !HEADER.equals(lines[0]) || lines[lines.length - 1].isEmpty()) {
            throw new IllegalArgumentException("The browser tab snapshot version or framing is invalid.");
        }
        long selectedId = parseIdField(lines[1], "selected", true);
        long nextId = parseIdField(lines[2], "next", false);
        List<Tab> tabs = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();
        Base64.Decoder decoder = Base64.getUrlDecoder();
        Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
        for (int lineIndex = 3; lineIndex < lines.length; lineIndex++) {
            String[] fields = lines[lineIndex].split("\\t", -1);
            if (fields.length != 3 || !"tab".equals(fields[0])) {
                throw new IllegalArgumentException("A browser tab record is malformed.");
            }
            long id = parseDecimal(fields[1], false);
            if (!seenIds.add(id)) throw new IllegalArgumentException("Duplicate browser tab ID.");
            byte[] addressBytes;
            try {
                addressBytes = decoder.decode(fields[2]);
            } catch (IllegalArgumentException malformedBase64) {
                throw new IllegalArgumentException("A browser tab address is malformed.", malformedBase64);
            }
            if (!encoder.encodeToString(addressBytes).equals(fields[2])) {
                throw new IllegalArgumentException("A browser tab address is not canonically encoded.");
            }
            String address = decodeUtf8(addressBytes);
            tabs.add(new Tab(id, address));
            if (tabs.size() > BrowserTabPolicy.MAX_TABS) {
                throw new IllegalArgumentException("The browser tab snapshot exceeds the tab limit.");
            }
        }
        return new Snapshot(tabs, selectedId, nextId);
    }

    private static long parseIdField(String line, String name, boolean allowZero) {
        String[] fields = line.split("\\t", -1);
        if (fields.length != 2 || !name.equals(fields[0])) {
            throw new IllegalArgumentException("The browser tab snapshot is missing " + name + ".");
        }
        return parseDecimal(fields[1], allowZero);
    }

    private static long parseDecimal(String value, boolean allowZero) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("A tab ID is missing.");
        for (int i = 0; i < value.length(); i++) {
            char digit = value.charAt(i);
            if (digit < '0' || digit > '9') throw new IllegalArgumentException("A tab ID is not decimal.");
        }
        final long parsed;
        try {
            parsed = Long.parseLong(value);
        } catch (NumberFormatException overflow) {
            throw new IllegalArgumentException("A tab ID is out of range.", overflow);
        }
        if ((!allowZero && parsed == 0L) || !Long.toString(parsed).equals(value)) {
            throw new IllegalArgumentException("A tab ID is not canonical.");
        }
        return parsed;
    }

    private static String decodeUtf8(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException malformedUtf8) {
            throw new IllegalArgumentException("A browser tab address is not valid UTF-8.", malformedUtf8);
        }
    }

    private static String normalizeAddress(String address) {
        if (address == null || address.trim().isEmpty()) return "";
        String normalized = BrowserAddress.requireAllowedWebUrl(address);
        if (normalized.length() > MAX_ADDRESS_CHARS) {
            throw new IllegalArgumentException("A browser tab address is too long to persist.");
        }
        return normalized;
    }

    static final class Tab {
        private final long id;
        private final String address;

        private Tab(long id, String address) {
            if (id <= 0L) throw new IllegalArgumentException("Tab IDs must be positive.");
            this.id = id;
            this.address = normalizeAddress(address);
        }

        long id() { return id; }
        String address() { return address; }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Tab)) return false;
            Tab that = (Tab) other;
            return id == that.id && address.equals(that.address);
        }

        @Override
        public int hashCode() {
            return 31 * Long.hashCode(id) + address.hashCode();
        }
    }

    static final class Snapshot {
        private final List<Tab> tabs;
        private final long selectedId;
        private final long nextId;

        private Snapshot(List<Tab> tabs, long selectedId, long nextId) {
            if (tabs == null || tabs.size() > BrowserTabPolicy.MAX_TABS) {
                throw new IllegalArgumentException("The browser tab count is invalid.");
            }
            if (nextId <= 0L) throw new IllegalArgumentException("The next browser tab ID must be positive.");
            List<Tab> copy = new ArrayList<>(tabs.size());
            Set<Long> ids = new HashSet<>();
            long maximumId = 0L;
            for (Tab tab : tabs) {
                if (tab == null || !ids.add(tab.id)) {
                    throw new IllegalArgumentException("Browser tab IDs must be unique.");
                }
                copy.add(tab);
                maximumId = Math.max(maximumId, tab.id);
            }
            if (maximumId == Long.MAX_VALUE || nextId <= maximumId) {
                throw new IllegalArgumentException("The next browser tab ID must be newer than saved IDs.");
            }
            if (copy.isEmpty()) {
                if (selectedId != 0L) throw new IllegalArgumentException("An empty tab list cannot have a selection.");
            } else if (!ids.contains(selectedId)) {
                throw new IllegalArgumentException("The selected browser tab does not exist.");
            }
            this.tabs = Collections.unmodifiableList(copy);
            this.selectedId = selectedId;
            this.nextId = nextId;
        }

        List<Tab> tabs() { return tabs; }
        long selectedId() { return selectedId; }
        long nextId() { return nextId; }

        Snapshot open(String address) {
            if (!BrowserTabPolicy.canCreate(tabs.size())) {
                throw new IllegalStateException("The browser tab limit has been reached.");
            }
            if (nextId == Long.MAX_VALUE) {
                throw new IllegalStateException("No further browser tab IDs are available.");
            }
            List<Tab> updated = new ArrayList<>(tabs);
            Tab created = new Tab(nextId, address);
            updated.add(created);
            return new Snapshot(updated, created.id, nextId + 1L);
        }

        Snapshot updateAddress(long id, String address) {
            List<Tab> updated = new ArrayList<>(tabs.size());
            boolean found = false;
            for (Tab tab : tabs) {
                if (tab.id == id) {
                    updated.add(new Tab(tab.id, address));
                    found = true;
                } else {
                    updated.add(tab);
                }
            }
            if (!found) throw new IllegalArgumentException("The browser tab to update does not exist.");
            return new Snapshot(updated, selectedId, nextId);
        }

        Snapshot select(long id) {
            if (!contains(id)) throw new IllegalArgumentException("The browser tab to select does not exist.");
            return new Snapshot(tabs, id, nextId);
        }

        Snapshot close(long id) {
            int oldIndex = indexOf(id);
            if (oldIndex < 0) return this;
            List<Tab> updated = new ArrayList<>(tabs);
            updated.remove(oldIndex);
            long updatedSelection = selectedId;
            if (updated.isEmpty()) {
                updatedSelection = 0L;
            } else if (selectedId == id) {
                int nextIndex = BrowserTabPolicy.indexAfterClose(oldIndex, updated.size());
                updatedSelection = updated.get(nextIndex).id;
            }
            return new Snapshot(updated, updatedSelection, nextId);
        }

        private boolean contains(long id) {
            return indexOf(id) >= 0;
        }

        private int indexOf(long id) {
            for (int i = 0; i < tabs.size(); i++) {
                if (tabs.get(i).id == id) return i;
            }
            return -1;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Snapshot)) return false;
            Snapshot that = (Snapshot) other;
            return selectedId == that.selectedId && nextId == that.nextId && tabs.equals(that.tabs);
        }

        @Override
        public int hashCode() {
            int result = tabs.hashCode();
            result = 31 * result + Long.hashCode(selectedId);
            result = 31 * result + Long.hashCode(nextId);
            return result;
        }
    }
}
