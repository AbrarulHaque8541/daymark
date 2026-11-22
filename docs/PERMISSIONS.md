- **More permission settings** — exact-alarm screen + system accessibility settings
- **Settings → Permission status** — live grant summary + **Allow notifications**
- `ACCESS_NETWORK_STATE` — sideload flavor (updater network check)
- `INTERNET` — in-app browser only
- `onRequestPermissionsResult` shows a short Toast
- `POST_NOTIFICATIONS` — task reminders (Android 13+)
- `RECEIVE_BOOT_COMPLETED` — reschedule reminders after reboot
- `VIBRATE` — reminder feedback
- Reminders still call `requestNotificationPermissionIfNeeded` when a reminder is enabled
---
# Daymark permissions
## Declared (manifest)
## Not declared (by design)
## Runtime UX
Accessibility services cannot be auto-granted; the app only opens the system Accessibility screen.
Camera, microphone, location, contacts, SMS, broad storage — privacy-first V1.
Model:
Timestamp (UTC): 2026-10-11T18:50:00Z
Tooling: GitHub MCP tools
Work by: Grok
