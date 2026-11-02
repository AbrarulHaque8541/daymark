#!/usr/bin/env python3
"""Source guard for the open-format task export feature (Markdown/CSV/iCal).

Verifies that:
  * the Android host parity class TaskOpenExport stays pure Java (no android,
    no java.io, no network) and exposes the same renderers as the web logic,
  * run-core-tests.sh compiles and runs the export smoke against the shared
    contract fixture and runs this guard,
  * the web prototype files (logic, UI, tests, fixture) exist and the
    prototype index.html wires the export UI.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1])
repo = root.parent
checks = 0


def check(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


export_java = (root / "app/src/main/java/com/abrar/daymark/TaskOpenExport.java").read_text(encoding="utf-8")
smoke_java = (root / "tools/TaskOpenExportSmoke.java").read_text(encoding="utf-8")
core_tests = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

# Host parity class: pure Java, offline, no placeholders.
check("package com.abrar.daymark;" in export_java, "export host class keeps the app package")
for token in ("toMarkdown", "toCsv", "toIcs", "MAX_EXPORT_CHARS", "ICS_LINE_OCTETS = 75",
              "daymark.export", '"\\r\\n"', "enforceCap", "foldLine", "EXPORT_ORDER"):
    check(token in export_java, f"TaskOpenExport.java provides {token}")
for banned in ("import android", "java.io.", "HttpURLConnection", "TODO", "FIXME",
               "import java.net", "placeholder"):
    check(banned not in export_java, f"TaskOpenExport.java must not contain {banned}")

# Smoke test exercises the shared contract fixture.
check("task-export-fixture.json" in smoke_java, "export smoke reads the shared contract fixture")
for fmt in ('render("markdown"', 'render("csv"', 'render("ics"'):
    check(fmt in smoke_java, f"export smoke asserts the {fmt} renderer")

# CI wiring: guard + compile + run.
check("check-task-open-export.py" in core_tests, "run-core-tests.sh runs the open-export guard")
check("TaskOpenExport.java" in core_tests, "run-core-tests.sh compiles TaskOpenExport.java")
check("TaskOpenExportSmoke.java" in core_tests, "run-core-tests.sh compiles TaskOpenExportSmoke.java")
check("TaskOpenExportSmoke" in core_tests and "task-export-fixture.json" in core_tests,
      "run-core-tests.sh runs the export smoke against the contract fixture")

# Web prototype wiring.
logic_js = (repo / "export-logic.js").read_text(encoding="utf-8")
ui_js = (repo / "export-ui.js").read_text(encoding="utf-8")
index_html = (repo / "index.html").read_text(encoding="utf-8")
fixture = (repo / "contracts/task-export-fixture.json").read_text(encoding="utf-8")
test_logic = (repo / "tests/export-logic.test.js").read_text(encoding="utf-8")
test_ui = (repo / "tests/export-ui.test.js").read_text(encoding="utf-8")

for token in ("toMarkdown", "toCsv", "toIcs", "MAX_EXPORT_CHARS", "ICS_LINE_OCTETS"):
    check(token in logic_js, f"export-logic.js provides {token}")
check("TODO" not in logic_js and "TODO" not in ui_js, "export web files contain no TODO")
check('export-ui.js' in index_html, "index.html loads export-ui.js")
check('id="export-format"' in index_html and 'id="export-tasks"' in index_html,
      "index.html wires the export format picker and export button")
check("export-format" in ui_js and "export-tasks" in ui_js,
      "export-ui.js drives the export format picker and export button")
check("task-export-fixture.json" in test_logic, "export logic tests use the contract fixture")
check("export-format" in test_ui, "export UI tests cover the format picker")
check('"expected"' in fixture and '"markdown"' in fixture and '"csv"' in fixture and '"ics"' in fixture,
      "contract fixture carries expected outputs for all three formats")

print(f"PASS task-open-export source checks: {checks} assertions")
