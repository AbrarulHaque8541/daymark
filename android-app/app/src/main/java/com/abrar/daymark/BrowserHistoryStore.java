package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Immutable, host-testable model for the browser's local site history.
 *
 * <p>The serialized form deliberately remains compatible with {@link BrowserHistory} so a
 * later app-private preference adapter can read existing {@code history_urls} values. This
 * class does not perform I/O or wire itself into the Activity.</p>
 */
final class BrowserHistoryStore {
    private final List<String> origins;

    private BrowserHistoryStore(List<String> origins) {
        this.origins = Collections.unmodifiableList(new ArrayList<>(origins));
    }

    static BrowserHistoryStore empty() {
        return new BrowserHistoryStore(Collections.emptyList());
    }

    /** Restores and sanitizes the current legacy origin-list representation. */
    static BrowserHistoryStore restore(String serialized) {
        return new BrowserHistoryStore(BrowserHistory.decode(serialized));
    }

    /** Records a visit as a privacy-preserving HTTP(S) origin, newest first. */
    BrowserHistoryStore record(String address) {
        if (BrowserHistory.sanitizeUrl(address) == null) {
            throw new IllegalArgumentException("Only valid HTTP/HTTPS addresses can be recorded.");
        }
        return restore(BrowserHistory.add(serialize(), address));
    }

    /** Forgets the visited origin that corresponds to the supplied address. */
    BrowserHistoryStore remove(String address) {
        return restore(BrowserHistory.remove(serialize(), address));
    }

    BrowserHistoryStore clear() {
        return empty();
    }

    /** Returns a case-insensitive origin search without changing stored order. */
    List<String> search(String query) {
        return Collections.unmodifiableList(BrowserHistory.filter(origins, query));
    }

    /** Returns the immutable newest-first list of sanitized origins. */
    List<String> origins() {
        return origins;
    }

    /** Encodes origins using the existing {@link BrowserHistory} on-disk preference format. */
    String serialize() {
        return BrowserHistory.encode(origins);
    }
}
