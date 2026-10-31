#!/usr/bin/env python3
"""Source guard for the separate Android Keystore-backed OAuth token vault."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
vault = (root / "app/src/main/java/com/abrar/daymark/OAuthTokenVault.java").read_text(encoding="utf-8")
codec = (root / "app/src/main/java/com/abrar/daymark/OAuthCredentialCodec.java").read_text(encoding="utf-8")
credential = (root / "app/src/main/java/com/abrar/daymark/OAuthCredential.java").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

for token in ("getNoBackupFilesDir()", "oauth-credentials.enc",
              "new EncryptedBlobStore(", "AndroidKeyStore",
              "daymark.oauth-token-vault.aes-gcm.v1",
              "KeyProperties.BLOCK_MODE_GCM", "KeyProperties.ENCRYPTION_PADDING_NONE",
              "setKeySize(256)", "atomic.startWrite()", "atomic.finishWrite(",
              "OAuthCredentialCodec.decode", "OAuthCredentialCodec.encode"):
    assert token in vault, f"OAuth token vault missing security boundary: {token}"
for forbidden in ("SharedPreferences", "Log.", "getExternalFilesDir", "getFilesDir()"):
    assert forbidden not in vault, f"OAuth tokens must not use {forbidden}"
for token in ("MAX_CREDENTIALS", "MAX_ACCESS_TOKEN_CHARS", "MAX_REFRESH_TOKEN_CHARS",
              "MAX_SCOPES", "MAX_VAULT_BYTES", "readFully", "input.read() != -1",
              "CodingErrorAction.REPORT"):
    assert token in codec, f"credential codec missing strict bound: {token}"
assert "toString()" not in credential, "credential secrets must not be exposed by a generated toString"
assert "OAuthCredentialCodecSmoke.java" in runner
print("PASS OAuth encrypted token vault source guard")
