'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const importer = require('../import-logic.js');
const logic = require('../task-logic.js');
const ui = require('../import-ui.js');

const NOW = '2026-11-09T05:00:00.000Z';

function freshCtx() {
  let n = 0;
  return { now: NOW, makeId: () => 'gen-' + String(++n) };
}

const googleLikeIcs = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Example Corp//Calendar//EN',
  'BEGIN:VTODO',
  'UID:todo-1@example.com',
  'SUMMARY:Submit tax paperwork',
  'DUE;VALUE=DATE:20261123',
  'DESCRIPTION:Bring the folder\\, ID card\\; keep it ready\\nDo not forget the stapler.',
  'CATEGORIES:admin,finance',
  'PRIORITY:2',
  'END:VTODO',
  'BEGIN:VEVENT',
  'UID:event-1@example.com',
  'SUMMARY:Team sync',
  'DTSTART;TZID=Asia/Kolkata:20261110T093000',
  'RRULE:FREQ=WEEKLY;COUNT=10',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-2@example.com',
  'SUMMARY:Dentist appointment',
  'DTSTART:20261112T143000Z',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-3@example.com',
  'SUMMARY:Cancelled standup',
  'DTSTART;VALUE=DATE:20261111',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-4@example.com',
  'SUMMARY:Alarm carrier',
  'DTSTART;VALUE=DATE:20261113',
  'BEGIN:VALARM',
  'SUMMARY:This alarm summary must never become a task',
  'ACTION:DISPLAY',
  'TRIGGER:-PT15M',
  'END:VALARM',
  'END:VEVENT',
  'END:VCALENDAR',
  ''
].join('\r\n');

// ... existing tests remain the same until the new ones ...

test('CATEGORIES splits on unescaped commas and semicolons; escaped delimiters stay inside values', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VTODO',
    'UID:cats@example.com',
    'SUMMARY:Tagged',
    'CATEGORIES:work,personal\\,private;urgent',
    'END:VTODO',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].tags, ['work', 'urgent'], 'escaped comma stays inside a value that fails the tag contract and is safely omitted');
});

test('skipped recurring components do not inflate the recurrence or timezone counts', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:bad@example.com',
    'SUMMARY:',
    'RRULE:FREQ=DAILY',
    'DTSTART;TZID=America/New_York:20261110T090000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:good@example.com',
    'SUMMARY:Valid',
    'RDATE:20261111T100000Z',
    'DTSTART:20261111T100000Z',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.skippedRows, 1);
  assert.equal(result.recurring, 1, 'only the successfully imported RDATE item is counted');
  assert.equal(result.timezoneDropped, 1, 'only the successful item with Z is counted');
});

test('RDATE and RECURRENCE-ID are recognized as recurrence-bearing', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:rid@example.com',
    'SUMMARY:Instance',
    'RECURRENCE-ID:20261112T090000',
    'DTSTART;VALUE=DATE:20261112',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.recurring, 1);
});

test('invalid clock times are dropped without counting a timezone simplification', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:badtime@example.com',
    'SUMMARY:Bad time',
    'DTSTART;TZID=UTC:20261110T256000',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\n');
  const result = importer.fromIcs(ics, freshCtx());
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].dueDate, '2026-11-10');
  assert.equal(result.tasks[0].dueTime, null);
  assert.equal(result.timezoneDropped, 0);
});
