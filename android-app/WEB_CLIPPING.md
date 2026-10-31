# Offline web clips

Daymark can turn an article that is already open in its browser into a task with an offline excerpt. There is no account, service, API key, background sync, or new network request for the clipping action.

## Use it

1. In the Web workspace, explicitly enable online browsing if necessary and open a page. Wait until it finishes loading.
2. Open **Reader mode**, then tap **Clip to task**.
3. Review and edit the title, source, and excerpt. Tap **Save task**, or **Cancel** to discard the draft. A duplicate title requires confirmation.
4. The task appears in Tasks with the `#web-clip` tag, no due date or reminder, and medium priority. Change these later with the normal task editor. The note can be read and searched offline; a tappable HTTPS source opens through the usual browser consent flow.

The existing **Save page as task** action is different: it opens the normal task editor with the complete current address in the note, including any query or fragment. Review it before saving. It does not extract page text.

## Privacy and limits

- Reader Mode extracts plain text locally from the already loaded page; it does not modify the page. Extraction is heuristic and bounded to 60,000 UTF-16 code units and 10,000 visited DOM nodes. Some pages, images, formatting, embedded content, or later article sections may not be represented.
- A task note holds at most 4,000 UTF-16 code units **including the source address**. If the extracted text does not fit, the review shows that only the beginning will be saved. Edit the excerpt or use Reader Mode's copy action if a different part is needed.
- Clip source URLs exclude query parameters and fragments. Very long paths fall back to the site origin; invalid or credential-bearing addresses are omitted. The review explains when the source was shortened. The remaining path and page text can themselves contain private information; inspect both before saving. The clip model preserves an HTTP source as plain text rather than converting it to HTTPS, but actual HTTP page loading is not verified and is expected to be blocked by the current manifest; see the [HTTP policy audit](../docs/BROWSER_HTTP_POLICY_AUDIT.md).
- Saving uses the same app-private, authenticated encrypted task snapshot and encrypted portable-backup flow as other tasks. The write runs off the UI thread. A storage failure is reported and does not reset existing task data. Opening a source page later may require network access and online consent.
- An unsaved clip draft is kept **in memory** across an Activity configuration change, not written to the task store or saved-instance state. Cancel/Back discards it, and process death can lose it. Save the task before leaving if it matters.

## Verification scope

`sh android-app/tools/check-v1-source.sh` runs host tests for URL redaction, length and Unicode boundaries, task validation/search, encrypted snapshot round-trip, failed-write preservation, and tamper detection, plus source guards for the Reader/UI/save wiring. These checks do not replace Android device testing. Exercise the review on API 26 and a current API with light/dark/high-contrast themes, large text, TalkBack, rotation, unavailable storage, no network after saving, and pages with very long URLs or text before treating the feature as device-accepted.
