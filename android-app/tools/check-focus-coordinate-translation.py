#!/usr/bin/env python3
"""Guard Focus instrumentation coordinates before UiAutomation pointer injection."""
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1])
source_path = root / "app/src/androidTest/java/com/abrar/daymark/DaymarkPlatformInstrumentation.java"
source = source_path.read_text(encoding="utf-8")
start = source.find("private android.graphics.Rect visibleBounds")
end = source.find("private void checkFocusModeState", start)
if start < 0 or end < 0:
    raise SystemExit("FAIL: Focus visibleBounds instrumentation method is missing")
method = source[start:end]
required = [
    "view.getGlobalVisibleRect(bounds[0]);",
    "android.view.View rootView = view.getRootView();",
    "rootView.getLocationOnScreen(rootLocation)",
    "bounds[0].offset(rootLocation[0], rootLocation[1]);",
]
for marker in required:
    if marker not in method:
        raise SystemExit("FAIL: Focus touch bounds are not translated into screen coordinates: " + marker)
if method.index("view.getGlobalVisibleRect(bounds[0]);") > method.index("bounds[0].offset(rootLocation[0], rootLocation[1]);"):
    raise SystemExit("FAIL: screen offset must be applied after obtaining root-relative visible bounds")
print("PASS Focus instrumentation: root-relative visible bounds are translated before screen-space UiAutomation pointer injection")
