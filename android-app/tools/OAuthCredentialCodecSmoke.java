package com.abrar.daymark;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Host-side tests for the strict, versioned OAuth credential vault codec. */
public final class OAuthCredentialCodecSmoke {
    public static void main(String[] args) throws Exception {
        OAuthCredential google = new OAuthCredential("google.drive", "access-token-A",
                "refresh-token-A", "Bearer", 1_800_000_000L,
                Arrays.asList("drive.file", "openid"));
        OAuthCredential github = new OAuthCredential("github", "access-token-B",
                null, "Bearer", 0L, Collections.singletonList("read:user"));
        byte[] encoded = OAuthCredentialCodec.encode(Arrays.asList(google, github));
        List<OAuthCredential> decoded = OAuthCredentialCodec.decode(encoded);
        check(decoded.size() == 2, "credential count round-trips");
        check("github".equals(decoded.get(0).providerId)
                        && "google.drive".equals(decoded.get(1).providerId),
                "encoding is deterministic and sorted by provider id");
        check("access-token-A".equals(decoded.get(1).accessToken)
                        && "refresh-token-A".equals(decoded.get(1).refreshToken),
                "access and refresh tokens round-trip");
        check(decoded.get(0).refreshToken == null, "missing refresh tokens remain null");
        check(decoded.get(1).scopes.equals(Arrays.asList("drive.file", "openid")),
                "scopes round-trip without reordering");
        check(decoded.get(1).isExpiredAt(1_800_000_000L), "expiry boundary is inclusive");
        check(!decoded.get(0).isExpiredAt(1_800_000_000L), "zero expiry is treated as provider-managed");

        byte[] empty = OAuthCredentialCodec.encode(Collections.emptyList());
        check(OAuthCredentialCodec.decode(empty).isEmpty(), "empty vault snapshot round-trips");
        byte[] withTrailing = Arrays.copyOf(encoded, encoded.length + 1);
        expectFailure(() -> OAuthCredentialCodec.decode(withTrailing), "trailing bytes are rejected");
        byte[] wrongMagic = Arrays.copyOf(encoded, encoded.length);
        wrongMagic[0] ^= 0x01;
        expectFailure(() -> OAuthCredentialCodec.decode(wrongMagic), "unknown vault magic is rejected");
        expectFailure(() -> OAuthCredentialCodec.decode(new byte[0]), "empty byte array is rejected");

        expectFailure(() -> OAuthCredentialCodec.encode(Arrays.asList(google, google)),
                "duplicate provider credentials are rejected");
        OAuthCredential duplicateScopes = new OAuthCredential("example", "token", null, "Bearer",
                0L, Arrays.asList("read", "read"));
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.singletonList(duplicateScopes)),
                "duplicate scopes are rejected");
        OAuthCredential invalidProvider = new OAuthCredential("../provider", "token", null, "Bearer",
                0L, Collections.emptyList());
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.singletonList(invalidProvider)),
                "provider IDs cannot contain path traversal");
        OAuthCredential invalidControl = new OAuthCredential("provider", "token\nsecret", null, "Bearer",
                0L, Collections.emptyList());
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.singletonList(invalidControl)),
                "control characters are rejected");
        OAuthCredential invalidUnicode = new OAuthCredential("provider", "token" + String.valueOf((char) 0xD800), null, "Bearer",
                0L, Collections.emptyList());
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.singletonList(invalidUnicode)),
                "unpaired Unicode surrogates are rejected");
        OAuthCredential tooManyScopes = new OAuthCredential("provider", "token", null, "Bearer",
                0L, Collections.nCopies(OAuthCredentialCodec.MAX_SCOPES + 1, "scope"));
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.singletonList(tooManyScopes)),
                "scope count is bounded");
        OAuthCredential tooManyCredentials = new OAuthCredential("provider", "token", null, "Bearer",
                0L, Collections.emptyList());
        expectFailure(() -> OAuthCredentialCodec.encode(Collections.nCopies(
                OAuthCredentialCodec.MAX_CREDENTIALS + 1, tooManyCredentials)),
                "credential count is bounded");

        System.out.println("PASS OAuth credential codec");
    }

    private static void expectFailure(Throwing operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (IOException expected) {
            // Expected fail-closed behavior.
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private interface Throwing { void run() throws Exception; }
}
