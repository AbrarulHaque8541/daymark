package com.abrar.daymark;
successfully downloaded text file (SHA: f69dddecc5faddbde4ba7793323ec373506b5f9b)
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Declarative inventory of Daymark integration capabilities.
 *
 * <p>Entries distinguish integrations that actually exist in this build from roadmap candidates.
 * A provider appearing in the catalog never implies that an account is linked or that an API is
 * available. UI code must gate every action through {@link Entry#canConnect()}.
 */
final class IntegrationCatalog {
    enum Family {
        ANDROID_SHARING, FILES, CALENDAR, EMAIL, TASKS, DEVELOPER,
        MESSAGING, AUTOMATION, AI_TOOLS, DEVICES, HEALTH, SMART_HOME, BROWSER
    }

    enum Level {
        NONE, OS_HANDOFF, FILE_ACCESS, ACCOUNT_LINK, SYNC_EVENTS, NATIVE_DEVICE
    }

    enum Availability {
        AVAILABLE, PLANNED, PROVIDER_SETUP_REQUIRED, NOT_SUPPORTED
    }

    enum Direction { INBOUND, OUTBOUND, BIDIRECTIONAL }

    static final class Entry {
        final String id;
        final String name;
        final Family family;
        final Level level;
        final Availability availability;
        final Direction direction;
        final String summary;
        final String requirement;

        Entry(String id, String name, Family family, Level level, Availability availability,
              Direction direction, String summary, String requirement) {
            this.id = id;
            this.name = name;
            this.family = family;
            this.level = level;
            this.availability = availability;
            this.direction = direction;
            this.summary = summary;
            this.requirement = requirement;
        }

        boolean canConnect() {
            return availability == Availability.AVAILABLE;
        }

        String statusLabel() {
            switch (availability) {
                case AVAILABLE: return "Available";
                case PROVIDER_SETUP_REQUIRED: return "Provider setup required";
                case NOT_SUPPORTED: return "Not supported";
                case PLANNED:
                default: return "Planned";
            }
        }
    }

    private static final List<Entry> ENTRIES;
    private static final Map<String, Entry> BY_ID;

    static {
        List<Entry> entries = new ArrayList<>();
        add(entries, "android.share.text", "Android text sharing", Family.ANDROID_SHARING,
                Level.OS_HANDOFF, Availability.AVAILABLE, Direction.INBOUND,
                "Receive shared text and selected text as a reviewable task draft.",
                "Android Sharesheet / ACTION_PROCESS_TEXT");
        add(entries, "android.documents.import", "Android document picker", Family.FILES,
                Level.FILE_ACCESS, Availability.AVAILABLE, Direction.INBOUND,
                "Select a document through Android's system picker and store it encrypted.",
                "User selects a document; no account linking");
        add(entries, "android.attachments.open", "Open attachment in another app", Family.FILES,
                Level.OS_HANDOFF, Availability.AVAILABLE, Direction.OUTBOUND,
                "Share a read-only content URI for an explicitly selected safe attachment.",
                "User confirms the external handoff");

        add(entries, "google.drive", "Google Drive", Family.FILES, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Cloud file selection, import/export and optional backup.",
                "Google Cloud project, OAuth consent and approved Drive scopes");
        add(entries, "microsoft.onedrive", "Microsoft OneDrive", Family.FILES, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Cloud file selection and user-directed backup/restore.",
                "Microsoft Entra app registration and Graph permissions");
        add(entries, "dropbox", "Dropbox", Family.FILES, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Cloud file import/export and optional backup.",
                "Dropbox app registration and scoped OAuth approval");
        add(entries, "nextcloud.webdav", "Nextcloud / WebDAV", Family.FILES, Level.ACCOUNT_LINK,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "User-configured server file access with explicit endpoint trust.",
                "Credential-safe WebDAV client and server compatibility tests");

        add(entries, "google.calendar", "Google Calendar", Family.CALENDAR, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Create and synchronize task-related calendar events.",
                "Google OAuth client and Calendar scopes");
        add(entries, "microsoft.calendar", "Outlook Calendar", Family.CALENDAR, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Create and synchronize task-related calendar events.",
                "Microsoft Graph app registration and calendar scopes");
        add(entries, "caldav", "CalDAV calendars", Family.CALENDAR, Level.ACCOUNT_LINK,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Standards-based calendar sync with server-specific compatibility.",
                "CalDAV discovery, credential storage and sync conflict tests");

        add(entries, "gmail", "Gmail", Family.EMAIL, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Turn selected messages into tasks and send user-approved summaries.",
                "Google OAuth verification and minimum Gmail scopes");
        add(entries, "microsoft.outlook", "Microsoft Outlook", Family.EMAIL, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Convert selected email into tasks and send approved replies/summaries.",
                "Microsoft Graph mail permissions and tenant consent");

        add(entries, "notion", "Notion", Family.TASKS, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Import and export selected tasks and notes.",
                "Notion integration registration and page/database grants");
        add(entries, "todoist", "Todoist", Family.TASKS, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Synchronize user-selected task lists.",
                "Todoist OAuth registration and sync/conflict policy");
        add(entries, "trello", "Trello", Family.TASKS, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Map selected Daymark tasks to cards and lists.",
                "Trello developer credentials and scoped authorization");
        add(entries, "jira", "Jira", Family.TASKS, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Turn issues into tasks and publish approved status updates.",
                "Atlassian OAuth app and workspace consent");

        add(entries, "github", "GitHub", Family.DEVELOPER, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Track selected issues, pull requests and workflow events.",
                "GitHub App or OAuth registration, minimum permissions and webhook verification");
        add(entries, "gitlab", "GitLab", Family.DEVELOPER, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Track selected issues, merge requests and pipeline events.",
                "GitLab OAuth application and scoped API access");

        add(entries, "telegram", "Telegram", Family.MESSAGING, Level.OS_HANDOFF,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Share tasks and receive content through documented share/bot routes.",
                "Official Telegram integration route; bot access is not personal-account access");
        add(entries, "slack", "Slack", Family.MESSAGING, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Create tasks from selected messages and send approved notifications.",
                "Slack app registration, OAuth scopes and workspace approval");
        add(entries, "discord", "Discord", Family.MESSAGING, Level.ACCOUNT_LINK,
                Availability.PROVIDER_SETUP_REQUIRED, Direction.BIDIRECTIONAL,
                "Receive permitted bot events and send approved task notifications.",
                "Discord application/bot registration and gateway/API policy");

        add(entries, "zapier", "Zapier", Family.AUTOMATION, Level.SYNC_EVENTS,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Trigger automations and receive authorized event callbacks.",
                "Connector/webhook contract and externally reachable event relay");
        add(entries, "make", "Make", Family.AUTOMATION, Level.SYNC_EVENTS,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Connect Daymark events to user-built automation scenarios.",
                "Provider connector or signed webhook endpoint");
        add(entries, "n8n", "n8n", Family.AUTOMATION, Level.SYNC_EVENTS,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Connect self-hosted workflows through scoped webhook/API access.",
                "User-configured endpoint, authentication and request-signing strategy");
        add(entries, "ifttt", "IFTTT", Family.AUTOMATION, Level.SYNC_EVENTS,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Expose documented triggers/actions for user automations.",
                "IFTTT service onboarding and approved trigger/action definitions");

        add(entries, "mcp", "MCP tool servers", Family.AI_TOOLS, Level.ACCOUNT_LINK,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Connect explicitly trusted tool servers with per-action approval.",
                "MCP transport, server trust, OAuth/scopes and bounded tool execution");
        add(entries, "home-assistant", "Home Assistant", Family.SMART_HOME, Level.ACCOUNT_LINK,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Trigger local smart-home automations from explicit Daymark actions.",
                "User-configured local endpoint, token isolation and network trust");

        add(entries, "health-connect", "Android Health Connect", Family.HEALTH, Level.ACCOUNT_LINK,
                Availability.PLANNED, Direction.INBOUND,
                "Optional routine context with explicit health-data consent.",
                "Health Connect availability, per-record permissions and sensitive-data review");
        add(entries, "bluetooth-le", "Bluetooth LE devices", Family.DEVICES, Level.NATIVE_DEVICE,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Pair supported nearby devices and exchange bounded data.",
                "Device-specific GATT profiles, runtime permissions and physical-device QA");
        add(entries, "nfc", "NFC tags and devices", Family.DEVICES, Level.NATIVE_DEVICE,
                Availability.PLANNED, Direction.BIDIRECTIONAL,
                "Read/write supported tags for deliberate quick actions.",
                "NFC hardware, NDEF format and tag compatibility tests");

        ENTRIES = Collections.unmodifiableList(entries);
        Map<String, Entry> byId = new LinkedHashMap<>();
        for (Entry entry : entries) {
            if (byId.put(entry.id, entry) != null) {
                throw new IllegalStateException("Duplicate integration id: " + entry.id);
            }
        }
        BY_ID = Collections.unmodifiableMap(byId);
    }

    private IntegrationCatalog() { }

    private static void add(List<Entry> entries, String id, String name, Family family,
                            Level level, Availability availability, Direction direction,
                            String summary, String requirement) {
        entries.add(new Entry(id, name, family, level, availability, direction, summary, requirement));
    }

    static List<Entry> all() {
        return ENTRIES;
    }

    static Entry find(String id) {
        return id == null ? null : BY_ID.get(id);
    }

    static List<Entry> available() {
        List<Entry> result = new ArrayList<>();
        for (Entry entry : ENTRIES) if (entry.canConnect()) result.add(entry);
        return Collections.unmodifiableList(result);
    }

    static List<Entry> byFamily(Family family) {
        if (family == null) return Collections.emptyList();
        List<Entry> result = new ArrayList<>();
        for (Entry entry : ENTRIES) if (entry.family == family) result.add(entry);
        return Collections.unmodifiableList(result);
    }
}
