#!/usr/bin/env python3
"""Guard the scroll-responsive theme wiring and its host regression coverage."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
activity = (root / "app/src/main/java/com/abrar/daymark/MainActivity.java").read_text(encoding="utf-8")
core = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
source_guard = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")
assert (root / "app/src/main/java/com/abrar/daymark/ScrollThemeColor.java").is_file(), "scroll theme helper is missing"
assert (root / "tools/ScrollThemeColorSmoke.java").is_file(), "scroll theme smoke test is missing"
assert "ScrollThemeColor.gradientColors(" in activity, "task content must use the scroll gradient"
assert "palette.background, palette.accentSoft, palette.surfaceAlt, highContrast" in activity, "gradient must honor active palette and high-contrast mode"
assert "setOnScrollChangeListener" in activity and "setTaskChromeHidden(true)" in activity, "existing task scroll chrome behavior must remain wired"
assert "ScrollThemeColor.java" in core and "ScrollThemeColorSmoke.java" in core, "core test script must compile helper and smoke test"
assert "com.abrar.daymark.ScrollThemeColorSmoke" in core, "core test script must execute the smoke test"
assert "check-scroll-theme.py" in source_guard, "canonical source checks must run the scroll theme guard"
# The standalone motion/accessibility layer must actually be loaded by the web prototype.
web_root = root.parent
index_html = (web_root / "index.html").read_text(encoding="utf-8")
base_css_link = index_html.find('href="styles.css"')
motion_css_link = index_html.find('href="styles-motion-efficiency.css"')
assert base_css_link >= 0, "index.html must load the base stylesheet"
assert motion_css_link >= 0, "index.html must load motion efficiency stylesheet"
assert motion_css_link > base_css_link, "motion efficiency stylesheet must load after styles.css so its cascade overrides apply"
motion_css_path = web_root / "styles-motion-efficiency.css"
assert motion_css_path.is_file(), "motion efficiency stylesheet is missing"
motion_css = motion_css_path.read_text(encoding="utf-8")
assert "@media (prefers-reduced-motion: reduce)" in motion_css, "motion layer must honor reduced motion"
assert "content-visibility: auto" in motion_css, "motion layer must retain list rendering optimization"
assert "touch-action: manipulation" in motion_css, "motion layer must retain responsive tap behavior"

print("PASS scroll theme wiring and regression guard")
