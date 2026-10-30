# Daymark Universal App Connectivity Architecture

**Status:** proposal and implementation contract; this document does not claim that any provider integration is implemented.

## Product outcome

Daymark should be able to participate in as many legitimate app, service, device, and automation ecosystems as their owners permit. A connection is supported only when there is a documented platform mechanism, public/partner API, user-authorized protocol, or OS-mediated handoff. No app can make itself appear in every company's "Connect an app" directory automatically.

The design goal is broad interoperability without turning Daymark into a cloud-dependent app, weakening local-first privacy, or pretending that a share target is a full API integration.

## What "connect" means

Treat these as distinct capabilities. A provider may support one, several, or none:

1. **Receive/share target:** another app sends text, URLs, files, images, or supported MIME types to Daymark through Android Sharesheet / intents.
2. **Send/share outward:** Daymark hands user-selected content to another installed app through Android intents and the system chooser.
3. **Open/deep-link handoff:** Daymark opens a provider's documented URI/deep link, with a safe fallback if the app is absent.
4. **File/document access:** Storage Access Framework document picker, content:// URIs, document providers, and user-granted URI permissions.
5. **Local device/system integration:** Android intents, app shortcuts, widgets, notifications/actions, Bluetooth, NFC, QR, USB/accessory APIs, and supported local-network protocols.
6. **Account-linked cloud API:** OAuth 2.0/OAuth 2.1 authorization-code + PKCE where supported, scoped access tokens, refresh/revocation, and provider REST/GraphQL APIs.
7. **Event delivery:** provider webhooks, callback/deep links, polling or sync APIs. Webhooks generally require a reachable relay/service; a local-only Android app cannot receive arbitrary inbound internet webhooks while offline or behind NAT.
8. **Automation connector:** user-authorized integrations through systems such as n8n, Make, Zapier, IFTTT, Home Assistant, or compatible automation endpoints.
9. **Agent/tool protocol:** explicitly configured MCP-compatible servers or other documented tool protocols, with per-server trust, scopes, and user approval.
10. **Cross-device/platform bridge:** documented browser, desktop, watch, car, tablet, or companion-device APIs. A capability contract is not proof that a native adapter exists on every device.

## Connection families to support over time

This is a discovery taxonomy, not a promise of provider availability.

| Family | Examples / protocols | Useful Daymark flows |
|---|---|---|
| Cloud files and backup | Google Drive, OneDrive, Dropbox, Box, Nextcloud, WebDAV, SAF | Export/import, attach, backup/restore |
| Messaging and sharing | Android Sharesheet, Telegram, Slack, Discord, WhatsApp-supported share/API routes, email | Send task/link/file; receive shared content |
| Calendar and time | Android Calendar Provider, Google Calendar API, Microsoft Graph, CalDAV | Create/update events with consent; read availability where permitted |
| Email | Gmail API, Microsoft Graph, IMAP/SMTP where appropriate | Convert selected messages to tasks; send approved summaries |
| Task/project systems | Todoist, Notion, Jira, Trello, Linear, GitHub/GitLab | Import tasks/issues; push explicitly selected updates |
| Developer ecosystems | GitHub/GitLab APIs, repository webhooks, CI providers | Turn issues/PR events into tasks; review status |
| Automation and smart home | n8n, Make, Zapier, IFTTT, Home Assistant, MQTT | Trigger or receive approved automations |
| AI and agent tools | OpenAI/other provider APIs, MCP servers, local models | User-approved task drafting, summarization and tool actions |
| Health and fitness | Android Health Connect and vendor-approved APIs | Optional, user-consented routine/activity context |
| Nearby and physical devices | Bluetooth LE, NFC, QR, USB, local network | Pairing, quick transfer, device triggers |
| Browser and web | Android App Links, custom schemes, Web Share Target, documented extensions | Open task links, share pages, browser handoff |
| Desktop and companion | OS share/open protocols, browser bridge, vendor SDKs | Cross-device task capture and status |

## Integration levels and honest UI

Every provider must declare the highest level actually implemented:

- **L0 — Not supported:** no connector; do not show a fake Connect button.
- **L1 — OS handoff:** share/open/chooser only. Label it "Share with" or "Open in", not "Account connected".
- **L2 — File access:** user selects a file/provider through SAF or a documented file API. Explain the granted scope.
- **L3 — Account linked:** verified OAuth/API integration with explicit scopes, token lifecycle, disconnect and revocation.
- **L4 — Two-way sync/events:** documented inbound/outbound sync, webhook or polling semantics, conflict handling and retry.
- **L5 — Native device/partner integration:** vendor/platform-specific adapter that has passed real-device qualification.

A provider can have multiple capability rows (for example, share-out at L1 and account sync at L3). Never infer L3/L4 from an installed app or successful deep link.

## Android participation requirements

- Declare only the intent filters and MIME types Daymark actually handles. Implement both inbound and outbound paths where useful.
- Validate all incoming intents, URI schemes, MIME types, sizes, filenames and URI permissions. Never trust caller-supplied display names or paths.
- Prefer content:// plus ContentResolver/SAF over raw filesystem paths. Copy into app-private storage only after user action and enforce size limits.
- Use verified Android App Links only for domains Daymark owns and can associate through Digital Asset Links. Do not claim another company's domain.
- Use custom schemes only when the target provider documents them; treat them as unverified and retain chooser/fallback behavior.
- Avoid broad exported components and implicit-intent data leakage. Explicitly scope outbound intents and use chooser UX when the destination is ambiguous.
- Do not add broad JavaScript bridges to untrusted WebView pages.

## Cloud account-linking requirements

- Use provider-approved developer registration and official API documentation. An app does not become available in a provider's "Connect" catalogue merely by adding an Android intent filter.
- Prefer OAuth authorization-code with PKCE for public mobile clients. Do not embed client secrets in the APK.
- Request the minimum scopes, explain each scope before consent, store tokens using platform-backed protected storage, redact credentials from logs, support expiry/refresh, disconnect and provider revocation.
- Keep provider tokens separate from encrypted task records. Never put tokens in task exports, backups, notifications, analytics or crash logs.
- Verify redirect URI ownership, state/nonce and PKCE; defend against callback interception and account mix-up.
- Some providers require app review, verified domains, privacy policy, security assessment, paid/partner approval or production allowlisting. Mark these as external blockers, not engineering failures.
- OAuth does not mean Daymark receives unrestricted access: the provider's scopes, API quotas, user consent and policies remain authoritative.

## Local-first and privacy boundaries

- Core tasks and focus sessions continue to work with no connected account and no network.
- Every integration is opt-in, independently disconnectable, and off by default unless the user explicitly starts a one-time share.
- Make direction and data visible: what is sent, what is read, which account, which scope, and whether sync is one-way or two-way.
- No silent background upload, analytics/ad SDK, hidden routing, contact scraping, notification scraping, credential harvesting or private/undocumented API.
- Support manual export/import and OS share handoff when a provider has no API.
- Network clients use HTTPS; never weaken the browser's separately documented HTTP/HTTPS policy.
- Sync must be idempotent, cancellable, bounded, retry-safe and conflict-aware. Never overwrite/delete local task data on remote errors or partial sync.
- Keep audit/debug information local and redact content, tokens, private URLs and personal data.

## Provider connector contract

Before adding a provider, record:

- Stable provider ID, display name, category, official documentation URL and developer-registration URL.
- Supported capabilities and integration level (L1-L5), direction (inbound/outbound/bidirectional), data types and MIME types.
- Auth method, scopes, redirect/callback model, token storage and revocation behavior.
- Required Android API levels, optional app installation, network requirements and offline behavior.
- Rate limits, pagination, retries, idempotency keys, webhook verification and conflict policy.
- Data minimization, retention, export/delete semantics, privacy policy and provider terms.
- Test strategy: deterministic contract tests, mocked provider tests, security tests, emulator tests and physical-device qualification.
- Explicit unsupported cases and user-facing fallback.

Provider adapters must sit behind a narrow typed interface; provider-specific SDKs and credentials must not leak into task-domain models or the UI. Use capability metadata to render only actions whose adapters are genuinely available.

## Suggested architecture

1. **Integration Catalog:** static, versioned metadata for built-in providers and their actual capabilities.
2. **OS Handoff Adapter:** intents, sharesheet, document picker, app links and safe fallbacks.
3. **Auth Broker:** OAuth/PKCE browser flow, callback validation, token lifecycle and disconnect.
4. **Provider Adapters:** small isolated implementations of documented provider APIs.
5. **Sync Coordinator:** bounded work, cancellation, idempotency, backoff and conflict policy.
6. **Local Integration Store:** encrypted account metadata and protected token references, separate from task snapshots.
7. **Permission & Consent UI:** per-provider scopes, data-direction preview, connection status and disconnect.
8. **Contract/QA layer:** fake providers, fixtures, security guards and platform/device matrix.

Do not add a generic plugin runtime that downloads and executes arbitrary code. Connector metadata is declarative; executable provider code remains shipped, reviewed and permission-bounded.

## Delivery sequence

1. Establish L1 OS sharing and file handoff as a reliable universal baseline, including receive-side validation and MIME/URI tests.
2. Add a provider catalog with explicit L0-L5 status and honest "not available" behavior.
3. Implement one high-value L3 provider at a time after checking the owner's priority and provider registration requirements.
4. Add sync/webhooks only with a real event delivery design, retry/conflict semantics and privacy review.
5. Expand to automation/MCP and device ecosystems behind explicit trust and capability boundaries.
6. Qualify each supported Android/API/device route; CI alone does not prove that another app or OEM will accept the handoff.

## Current implementation status

This document is an architecture contract only. It does not add provider SDKs, account linking, new permissions, background services, network endpoints, UI, or runtime connectors. Existing Daymark capabilities must be verified from current source and tests before being labelled implemented.

---

Work by: ChatGPT
Model: GPT-6
Tooling: GitHub connector (repository policy/source/status inspection; new-file commit)
Timestamp (UTC): 2026-10-31T00:48:00Z
