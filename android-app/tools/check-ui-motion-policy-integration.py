#!/usr/bin/env python3
"""Source guard for the production UiMotionPolicy workspace-transition integration."""
from pathlib import Path
import sys

root = Path(sys.argv[1])
activity = (root / "android-app/app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
policy = (root / "android-app/app/src/main/java/com/abrar/daymark/UiMotionPolicy.java").read_text(encoding="utf-8")
runner = (root / "android-app/tools/run-ui-motion-policy-tests.sh").read_text(encoding="utf-8")
workflow = (root / ".github/workflows/android.yml").read_text(encoding="utf-8")

start = activity.find("private void animateModeTransition(boolean enteringWeb)")
end = activity.find("private void setBrowserOnlineEnabled", start)
if start < 0 or end < 0:
    raise SystemExit("FAIL: workspace transition method not found")
method = activity[start:end]
if "target.animate().cancel();" not in method:
    raise SystemExit("FAIL: workspace transition must cancel a stale animator before resetting properties")
if "setDuration(UiMotionPolicy.TAB_SWITCH_MS)" not in method:
    raise SystemExit("FAIL: production workspace transition must use the shared motion duration")
if "animateModeTransition(enabled);" not in activity:
    raise SystemExit("FAIL: setWebMode must invoke the transition")
if "nowMs < expandStartedAtMs" not in policy:
    raise SystemExit("FAIL: motion debounce must reject reversed timestamps before subtraction")
if "UiMotionPolicy.java" not in runner or "UiMotionPolicySmoke.java" not in runner:
    raise SystemExit("FAIL: canonical host runner must compile policy and smoke")
if "check-ui-motion-policy-tests.sh" in runner:
    raise SystemExit("FAIL: incorrect UI motion test runner reference")
if "run-ui-motion-policy-tests.sh" not in workflow:
    raise SystemExit("FAIL: Android CI must invoke the canonical UI motion regression runner")
print("PASS UI motion integration source guard")
