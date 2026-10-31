package com.abrar.daymark;
import android.content.Intent;
import android.provider.CalendarContract;

import java.time.ZoneId;

/**
 * OS-mediated calendar handoff. No calendar permission or account credential is requested;
 * the selected calendar application presents the event draft for user review and save.
 */
final class TaskCalendarHandoff {
    private TaskCalendarHandoff() { }

    static Intent createInsertIntent(Task task) {
        return createInsertIntent(task, ZoneId.systemDefault());
    }

    static Intent createInsertIntent(Task task, ZoneId zone) {
        CalendarEventDraft draft = CalendarEventDraft.fromTask(task, zone);
        Intent insert = new Intent(Intent.ACTION_INSERT);
        insert.setData(CalendarContract.Events.CONTENT_URI);
        insert.putExtra(CalendarContract.Events.TITLE, draft.title);
        insert.putExtra(CalendarContract.Events.DESCRIPTION, draft.description);
        insert.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, draft.beginMillis);
        insert.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, draft.endMillis);
        insert.putExtra(CalendarContract.Events.ALL_DAY, draft.allDay);
        insert.putExtra(CalendarContract.Events.EVENT_TIMEZONE, draft.timeZoneId);
        if (draft.recurrenceRule != null) {
            insert.putExtra(CalendarContract.Events.RRULE, draft.recurrenceRule);
        }
        return insert;
    }
}
