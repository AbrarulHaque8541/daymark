package com.abrar.daymark;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** In-memory OAuth credential record. Secret fields are package-scoped and never included in toString. */
final class OAuthCredential {
    final String providerId;
    final String accessToken;
    final String refreshToken;
    final String tokenType;
    final long expiresAtEpochSeconds;
    final List<String> scopes;

    OAuthCredential(String providerId, String accessToken, String refreshToken, String tokenType,
                    long expiresAtEpochSeconds, List<String> scopes) {
        this.providerId = providerId;
        this.accessToken = accessToken;
        this.refreshToken = refreshToken == null || refreshToken.isEmpty() ? null : refreshToken;
        this.tokenType = tokenType == null || tokenType.isEmpty() ? "Bearer" : tokenType;
        this.expiresAtEpochSeconds = expiresAtEpochSeconds;
        this.scopes = scopes == null ? Collections.emptyList()
                : Collections.unmodifiableList(new ArrayList<>(scopes));
    }

    boolean isExpiredAt(long nowEpochSeconds) {
        return expiresAtEpochSeconds > 0 && nowEpochSeconds >= expiresAtEpochSeconds;
    }
}
