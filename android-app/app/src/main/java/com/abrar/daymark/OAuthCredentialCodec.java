package com.abrar.daymark;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Strict, versioned binary codec for the separately encrypted OAuth credential vault. */
final class OAuthCredentialCodec {
    private static final int MAGIC = 0x444D4331; // DMC1
    private static final int VERSION = 1;
    static final int MAX_CREDENTIALS = 64;
    static final int MAX_ACCESS_TOKEN_CHARS = 8192;
    static final int MAX_REFRESH_TOKEN_CHARS = 8192;
    static final int MAX_SCOPES = 32;
    static final int MAX_SCOPE_CHARS = 128;
    static final int MAX_VAULT_BYTES = 1024 * 1024;
    private static final Pattern PROVIDER_ID = Pattern.compile("[a-z0-9][a-z0-9._-]{0,63}");

    private OAuthCredentialCodec() { }

    static byte[] encode(List<OAuthCredential> credentials) throws IOException {
        if (credentials == null || credentials.size() > MAX_CREDENTIALS) {
            throw new IOException("OAuth credential count is outside the safe limit.");
        }
        List<OAuthCredential> ordered = new ArrayList<>(credentials);
        ordered.sort(Comparator.comparing(item -> item == null ? "" : item.providerId));
        Set<String> providers = new HashSet<>();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeInt(MAGIC);
            output.writeInt(VERSION);
            output.writeInt(ordered.size());
            for (OAuthCredential credential : ordered) {
                validate(credential);
                if (!providers.add(credential.providerId)) {
                    throw new IOException("Duplicate OAuth provider credential.");
                }
                writeString(output, credential.providerId, 64, false);
                writeString(output, credential.accessToken, MAX_ACCESS_TOKEN_CHARS, false);
                writeString(output, credential.refreshToken, MAX_REFRESH_TOKEN_CHARS, true);
                writeString(output, credential.tokenType, 64, false);
                output.writeLong(credential.expiresAtEpochSeconds);
                output.writeInt(credential.scopes.size());
                Set<String> scopes = new HashSet<>();
                for (String scope : credential.scopes) {
                    if (!scopes.add(scope)) throw new IOException("Duplicate OAuth scope.");
                    writeString(output, scope, MAX_SCOPE_CHARS, false);
                }
                if (bytes.size() > MAX_VAULT_BYTES) {
                    throw new IOException("OAuth credential vault exceeds the safe size limit.");
                }
            }
        } catch (IllegalArgumentException exception) {
            throw new IOException("OAuth credential record is invalid.", exception);
        }
        byte[] result = bytes.toByteArray();
        if (result.length > MAX_VAULT_BYTES) throw new IOException("OAuth credential vault exceeds the safe size limit.");
        return result;
    }

    static List<OAuthCredential> decode(byte[] bytes) throws IOException {
        if (bytes == null || bytes.length < 12 || bytes.length > MAX_VAULT_BYTES) {
            throw new IOException("OAuth credential vault size is invalid.");
        }
        List<OAuthCredential> result = new ArrayList<>();
        Set<String> providers = new HashSet<>();
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(bytes))) {
            if (input.readInt() != MAGIC || input.readInt() != VERSION) {
                throw new IOException("OAuth credential vault format is unsupported.");
            }
            int count = input.readInt();
            if (count < 0 || count > MAX_CREDENTIALS) throw new IOException("OAuth credential count is invalid.");
            for (int index = 0; index < count; index++) {
                String providerId = readString(input, 64, false);
                String accessToken = readString(input, MAX_ACCESS_TOKEN_CHARS, false);
                String refreshToken = readString(input, MAX_REFRESH_TOKEN_CHARS, true);
                String tokenType = readString(input, 64, false);
                long expiresAt = input.readLong();
                int scopeCount = input.readInt();
                if (scopeCount < 0 || scopeCount > MAX_SCOPES) throw new IOException("OAuth scope count is invalid.");
                List<String> scopes = new ArrayList<>();
                Set<String> uniqueScopes = new HashSet<>();
                for (int scopeIndex = 0; scopeIndex < scopeCount; scopeIndex++) {
                    String scope = readString(input, MAX_SCOPE_CHARS, false);
                    if (!uniqueScopes.add(scope)) throw new IOException("Duplicate OAuth scope.");
                    scopes.add(scope);
                }
                OAuthCredential credential = new OAuthCredential(providerId, accessToken, refreshToken,
                        tokenType, expiresAt, scopes);
                validate(credential);
                if (!providers.add(providerId)) throw new IOException("Duplicate OAuth provider credential.");
                result.add(credential);
            }
            if (input.read() != -1) throw new IOException("OAuth credential vault has trailing data.");
        } catch (IllegalArgumentException exception) {
            throw new IOException("OAuth credential vault contains an invalid record.", exception);
        }
        return Collections.unmodifiableList(result);
    }

    private static void validate(OAuthCredential credential) throws IOException {
        if (credential == null || credential.providerId == null
                || !PROVIDER_ID.matcher(credential.providerId).matches()
                || credential.accessToken == null || credential.accessToken.isEmpty()
                || credential.accessToken.length() > MAX_ACCESS_TOKEN_CHARS
                || (credential.refreshToken != null
                    && credential.refreshToken.length() > MAX_REFRESH_TOKEN_CHARS)
                || credential.tokenType == null || credential.tokenType.isEmpty()
                || credential.tokenType.length() > 64
                || credential.expiresAtEpochSeconds < 0
                || credential.scopes == null || credential.scopes.size() > MAX_SCOPES) {
            throw new IOException("OAuth credential fields are invalid.");
        }
        validateCharacters(credential.providerId);
        validateCharacters(credential.accessToken);
        validateCharacters(credential.refreshToken);
        validateCharacters(credential.tokenType);
        for (String scope : credential.scopes) {
            if (scope == null || scope.isEmpty() || scope.length() > MAX_SCOPE_CHARS) {
                throw new IOException("OAuth scope is invalid.");
            }
            validateCharacters(scope);
        }
    }

    private static void writeString(DataOutputStream output, String value, int maxChars,
                                    boolean nullable) throws IOException {
        if (value == null) {
            if (!nullable) throw new IOException("Required OAuth credential field is missing.");
            output.writeInt(-1);
            return;
        }
        if (value.length() > maxChars) throw new IOException("OAuth credential field is too long.");
        validateCharacters(value);
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        if (encoded.length > maxChars * 4) throw new IOException("OAuth credential field is too large.");
        output.writeInt(encoded.length);
        output.write(encoded);
    }

    private static String readString(DataInputStream input, int maxChars, boolean nullable)
            throws IOException {
        int length = input.readInt();
        if (length == -1 && nullable) return null;
        if (length < 0 || length > maxChars * 4) throw new IOException("OAuth credential field length is invalid.");
        byte[] encoded = new byte[length];
        input.readFully(encoded);
        try {
            String value = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(encoded)).toString();
            if (value.length() > maxChars) throw new IOException("OAuth credential field is too long.");
            validateCharacters(value);
            return value;
        } catch (CharacterCodingException exception) {
            throw new IOException("OAuth credential field is not valid UTF-8.", exception);
        }
    }

    private static void validateCharacters(String value) throws IOException {
        if (value == null) return;
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (Character.isISOControl(current)) throw new IOException("OAuth credential contains control characters.");
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    throw new IOException("OAuth credential contains invalid Unicode.");
                }
                index++;
            } else if (Character.isLowSurrogate(current)) {
                throw new IOException("OAuth credential contains invalid Unicode.");
            }
        }
    }
}
