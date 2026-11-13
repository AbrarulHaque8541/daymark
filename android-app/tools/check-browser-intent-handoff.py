#!/usr/bin/env python3
"""Guard the Android intent:// handoff boundary against subframe/script-triggered launches."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
webview = (root / "app/src/main/java/com/abrar/daymark/DaymarkWebView.java").read_text(encoding="utf-8")
policy = (root / "app/src/main/java/com/abrar/daymark/BrowserIntentHandoffPolicy.java").read_text(encoding="utf-8")
smoke = (root / "tools/BrowserIntentHandoffPolicySmoke.java").read_text(encoding="utf-8")
core_runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")
source_guard = (root / "tools/check-v1-source.sh").read_text(encoding="utf-8")

start = webview.index('if ("intent".equalsIgnoreCase(scheme))')
end = webview.index("// Verified HTTP(S) App Links", start)
intent_branch = webview[start:end]
gate = "BrowserIntentHandoffPolicy.allows(request.isForMainFrame(), request.hasGesture())"
assert gate in intent_branch, "intent:// dispatch must require both a main-frame request and a user gesture"
assert intent_branch.index(gate) < intent_branch.index("return handleIntentLink(view, url);"), (
    "untrusted intent navigations must be consumed before the parser/handler can run"
)
assert "if (!" + gate + ") {" in intent_branch and "return true;" in intent_branch, (
    "subframe and no-gesture intent navigations must be consumed without side effects"
)
assert intent_branch.count("handleIntentLink(view, url)") == 1, "intent handler must have one gated call site"

assert "return isForMainFrame && hasUserGesture;" in policy, (
    "intent handoff policy must require both independent navigation properties"
)
for expression in (
    "allows(true, true)",
    "allows(true, false)",
    "allows(false, true)",
    "allows(false, false)",
):
    assert expression in smoke, f"missing frame/gesture truth-table regression: {expression}"
compile_start = core_runner.index('javac -encoding UTF-8 --release 17 -d "$BUILD_DIR"')
compile_end = core_runner.index('java -ea -cp "$BUILD_DIR" com.abrar.daymark.SharedAttachmentPolicySmoke', compile_start)
compile_block = core_runner[compile_start:compile_end]
assert '"$ROOT/app/src/main/java/com/abrar/daymark/BrowserIntentHandoffPolicy.java"' in compile_block, (
    "canonical host compile must include the intent handoff policy source"
)
assert '"$ROOT/tools/BrowserIntentHandoffPolicySmoke.java"' in compile_block, (
    "canonical host compile must include the intent handoff smoke source before executing it"
)
assert "java -ea -cp \"$BUILD_DIR\" com.abrar.daymark.BrowserIntentHandoffPolicySmoke" in core_runner, (
    "canonical host runner must execute the compiled intent handoff regression"
)
assert "check-browser-intent-handoff.py" in source_guard, "canonical source guard must execute this wiring check"

print("PASS Android intent handoff boundary: main-frame + user gesture required; all four combinations covered")
