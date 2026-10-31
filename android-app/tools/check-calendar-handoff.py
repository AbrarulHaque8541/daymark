#!/usr/bin/env python3
"""Source guard for permissionless, user-confirmed Android calendar handoff."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
adapter = (root / "app/src/main/java/com/abrar/daymark/TaskCalendarHandoff.java").read_text(encoding="utf-8")
draft = (root / "app/src/main/java/com/abrar/daymark/CalendarEventDraft.java").read_text(encoding="utf-8")
manifest = (root / "app/src/main/AndroidManifest.xml").read_text(encoding="utf-8")
runner = (root / "tools/run-core-tests.sh").read_text(encoding="utf-8")

for token in ("Intent.ACTION_INSERT", "CalendarContract.Events.CONTENT_URI",
              "CalendarContract.Events.TITLE", "CalendarContract.Events.DESCRIPTION",
              "CalendarContract.EXTRA_EVENT_BEGIN_TIME", "CalendarContract.EXTRA_EVENT_END_TIME",
              "CalendarContract.Events.ALL_DAY", "CalendarContract.Events.EVENT_TIMEZONE"):
    assert token in adapter, f"calendar handoff missing {token}"
for forbidden in ("READ_CALENDAR", "WRITE_CALENDAR", "ContentResolver", "startActivity("):
    assert forbidden not in adapter, f"calendar handoff must not request/read/write calendars directly: {forbidden}"
for token in ("date.atStartOfDay(zone)", "date.plusDays(1).atStartOfDay(zone)",
              "DEFAULT_DURATION_MINUTES", "FREQ=DAILY", "FREQ=WEEKLY",
              "FREQ=MONTHLY;BYMONTHDAY="):
    assert token in draft, f"calendar event mapping missing {token}"
assert "CalendarEventDraftSmoke.java" in runner and "CalendarEventDraft.java" in runner
assert "READ_CALENDAR" not in manifest and "WRITE_CALENDAR" not in manifest
print("PASS permissionless calendar handoff source guard")
