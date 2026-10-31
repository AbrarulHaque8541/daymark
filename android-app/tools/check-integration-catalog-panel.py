#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
panel = (root / "app/src/main/java/com/abrar/daymark/IntegrationCatalogPanel.java").read_text(encoding="utf-8")
catalog = (root / "app/src/main/java/com/abrar/daymark/IntegrationCatalog.java").read_text(encoding="utf-8")
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")

for token in ("Search integrations", "renderEntries()", "renderFamilies()",
              "IntegrationCatalog.all()", "entry.canConnect() && listener != null",
              "current.onUse(entry)", "action.setEnabled(false)",
              "entry.statusLabel()", "No matching integrations."):
    assert token in panel, f"Connections panel missing contract: {token}"
assert "return availability == Availability.AVAILABLE;" in catalog
for token in ('"Apps & services"', 'showIntegrationCatalogDialog()',
              'new IntegrationCatalogPanel(this, null)', 'panel.setListener(entry ->',
              'case "android.share.text":', 'case "android.documents.import":',
              'case "android.attachments.open":', 'showIntegrationTaskPicker(false)',
              'showIntegrationTaskPicker(true)', 'openAttachmentPicker(latest.id)',
              'showAttachmentManager(latest)'):
    assert token in activity, f"Connections panel is not fully wired: {token}"
assert "if (entry.canConnect() && listener != null)" in panel and "action.setEnabled(true)" in panel, "only an available entry with a live host callback may enable an action"
assert "if (current != null && entry.canConnect()) current.onUse(entry);" in panel, \
    "the click must recheck the current host callback and availability"
families = panel.split("private void renderFamilies()", 1)[1].split("private void renderEntries()", 1)[0]
assert "if (familyRow.getChildCount() == 0)" in families and "familyRow.removeAllViews()" not in families, \
    "filter selection must not replace the focused chip"
for token in ('selected ? ", selected" : ", not selected"', 'chip.setMinimumHeight(dp(48))',
              'search.setMinimumHeight(dp(48))', 'action.setMinimumHeight(dp(48))',
              'action.setContentDescription("Use " + entry.name)',
              'view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)',
              'LayoutParams.WRAP_CONTENT'):
    assert token in panel, f"Connections accessibility/responsiveness contract missing: {token}"
instrumentation = (root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java").read_text(encoding="utf-8")
assert 'runPhase("connections-panel-accessibility", this::connectionsPanelAccessibility)' in instrumentation, \
    "Android instrumentation must exercise the Connections panel contract"
for forbidden in ("HttpURLConnection", "SharedPreferences", "OAuthTokenVault", "startActivity("):
    assert forbidden not in panel, f"catalog UI must not perform hidden connection work: {forbidden}"
print("PASS Connections catalog UI source guard")
