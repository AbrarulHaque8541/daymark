
import java.util.HashSet;
import java.util.Set;

/** Host-side contract checks for the integration catalog. */
public final class IntegrationCatalogSmoke {
    public static void main(String[] args) {
        Set<String> ids = new HashSet<>();
        int available = 0;
        for (IntegrationCatalog.Entry entry : IntegrationCatalog.all()) {
            check(entry != null, "catalog entries cannot be null");
            check(entry.id != null && !entry.id.trim().isEmpty(), "every integration needs a stable id");
            check(ids.add(entry.id), "integration ids must be unique");
            check(entry.name != null && !entry.name.trim().isEmpty(), "every integration needs a display name");
            check(entry.summary != null && !entry.summary.trim().isEmpty(), "every integration needs a summary");
            check(entry.requirement != null && !entry.requirement.trim().isEmpty(),
                    "every integration needs a truthful setup/permission requirement");
            if (entry.canConnect()) available++;
            check(entry.canConnect() == (entry.availability == IntegrationCatalog.Availability.AVAILABLE),
                    "only implemented entries may enable a Connect action");
        }

        check(IntegrationCatalog.find("android.share.text") != null
                        && IntegrationCatalog.find("android.share.text").canConnect(),
                "existing Android text sharing must be marked available");
        check(IntegrationCatalog.find("android.documents.import") != null
                        && IntegrationCatalog.find("android.documents.import").canConnect(),
                "existing system document picker must be marked available");
        check(IntegrationCatalog.find("android.attachments.open") != null
                        && IntegrationCatalog.find("android.attachments.open").canConnect(),
                "existing safe attachment handoff must be marked available");
        check(IntegrationCatalog.find("google.drive") != null
                        && !IntegrationCatalog.find("google.drive").canConnect()
                        && IntegrationCatalog.find("google.drive").availability
                        == IntegrationCatalog.Availability.PROVIDER_SETUP_REQUIRED,
                "Google Drive must not appear connectable before its OAuth/API adapter exists");
        check(IntegrationCatalog.find("mcp") != null && !IntegrationCatalog.find("mcp").canConnect(),
                "MCP must not appear connectable before its trusted transport exists");
        check(IntegrationCatalog.find("health-connect") != null
                        && !IntegrationCatalog.find("health-connect").canConnect(),
                "Health Connect must remain unavailable until consent and data handling are implemented");
        check(IntegrationCatalog.find("missing-provider") == null,
                "unknown provider IDs must fail closed");
        check(IntegrationCatalog.byFamily(IntegrationCatalog.Family.FILES).size() >= 4,
                "file integration family should include OS and cloud options");
        check(IntegrationCatalog.byFamily(null).isEmpty(),
                "missing category filters return an empty immutable result");
        check(available == IntegrationCatalog.available().size() && available == 3,
                "only the three currently implemented Android handoff routes are available");
        try {
            IntegrationCatalog.all().clear();
            throw new AssertionError("the canonical catalog must be immutable");
        } catch (UnsupportedOperationException expected) {
            // Expected: UI consumers cannot mutate the canonical provider registry.
        }
        System.out.println("PASS integration catalog: " + ids.size() + " entries, " + available + " available");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
