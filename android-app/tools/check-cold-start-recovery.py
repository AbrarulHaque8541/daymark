#!/usr/bin/env python3
"""Guard the cold-start failure boundary and user-facing recovery message."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
source = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
start = source.index("protected void onCreate(Bundle savedInstanceState)")
end = source.index("    /** Keeps the process open", start)
create = source[start:end]
assert "catch (Throwable startupFailure)" in create, "startup initialization must have a broad failure boundary"
assert 'Log.e("Daymark-ColdStart", "Crash details", startupFailure);' in create, "cold-start failures must be logged with the diagnostic contract"
assert "showStartupFailureScreen(startupFailure);" in create, "cold-start failures must reach the safe UI fallback"
ui = source[source.index("private void showStartupFailureScreen"):source.index("    @Override\n    protected void onNewIntent", start)]
assert "App initialization failed." in ui, "startup fallback must be user-friendly"
assert "Please restart" in ui, "startup fallback must suggest a non-destructive restart"
assert ui.count("Do not clear app data or reinstall") == 2, \
    "both startup fallbacks must warn against deleting encrypted task data"
assert "or clear app data" not in ui, "startup recovery must not recommend deleting app data"
assert ".setMessage(" in ui and ".show();" in ui, "startup fallback must use a dialog"
print("PASS cold-start recovery: logged failure boundary and graceful dialog fallback")
