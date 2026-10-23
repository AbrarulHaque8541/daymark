# Natural-language quick add

The single-line task capture field parses supported scheduling words locally; no network call is used.

Supported examples:
- `call dentist tomorrow 4pm high #work` → title `call dentist`, tomorrow at 16:00, high priority, tag `work`
- `pay rent next week 09:30 #home` → due in seven days at 09:30, tag `home`
- `review notes Monday low` → next Monday, low priority
- `call clinic 12am` → today at 00:00

Supported date words: today, tomorrow, next week, weekday names and common three-letter weekday forms.
Supported time formats: `4pm`, `4:30pm`, and `16:00`.
Supported priorities: high, urgent, important, medium, med, low.
Tags use `#tag` syntax and are stored in the existing task tags field.

Unknown words remain part of the title. Only the quick-add capture path uses this parser; the regular task editor is not rewritten. Automated parser smoke tests run as part of `sh android-app/tools/run-core-tests.sh`.

---
Work by: ChatGPT
Model: GPT-6
Tooling: GitHub MCP tools
Timestamp (UTC): 2026-10-13T14:07:28.373Z

## Update — 2026-10-23

- Relative phrases: `pay rent in 3 days` → due in three days; `review in 2 weeks` → due in two weeks; `file taxes day after tomorrow` → due in two days.
- `next <weekday>` now advances one additional week beyond the nearest upcoming occurrence, so `Monday` and `next Monday` are no longer identical. `plan sprint next Monday` run on Sunday 2026-10-11 is due 2026-10-19.
- A boundary preposition left behind by a consumed date/time token is removed from the title: `buy milk tomorrow at 5pm` → `buy milk`, `dentist on monday` → `dentist`, `at 6am gym` → `gym`.
- Inner prepositions and date-free text are preserved: `water the plants at home tomorrow` keeps `at home`; `look at the stars` is unchanged.

---
Work by: Qoder (Qoder desktop agent)
Model: not disclosed by runtime
Tooling: Bash, git, OpenJDK 17, Node.js, Android Gradle Plugin 8.12.2
Timestamp (UTC): 2026-10-23T09:22:00Z

