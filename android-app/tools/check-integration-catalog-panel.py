#!/usr/bin/env python3
"""Source guard for honest, searchable Connections catalog UI."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
panel = (root / "app/src/main/java/com/abrar/daymark/IntegrationCatalogPanel.java").read_text(encoding="utf-8")
catalog = (root / "app/src/main/java/com/abrar/daymark/IntegrationCatalog.java").read_text(encoding="utf-8")

for token in ("Search integrations", "renderEntries()", "renderFamilies()",
              "IntegrationCatalog.all()", "entry.canConnect() && listener != null",
              "listener.onUse(entry)", "action.setEnabled(false)",
              "entry.statusLabel()", "No matching integrations."):
    assert token in panel, f"Connections panel missing contract: {token}"
assert "return availability == Availability.AVAILABLE;" in catalog
assert "if (entry.canConnect() && listener != null)" in panel and "action.setEnabled(true)" in panel, "only an available entry with a live host callback may enable an action"
for forbidden in ("HttpURLConnection", "SharedPreferences", "OAuthTokenVault", "startActivity("):
    assert forbidden not in panel, f"catalog UI must not perform hidden connection work: {forbidden}"
print("PASS Connections catalog UI source guard")
