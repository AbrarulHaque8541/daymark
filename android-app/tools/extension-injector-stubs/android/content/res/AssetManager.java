package android.content.res;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Host-only asset loader stub for ExtensionInjectorSmoke. */
public final class AssetManager {
    public InputStream open(String name) throws IOException {
        String directory = System.getProperty("daymark.asset.dir");
        if (directory == null || directory.isEmpty()) {
            throw new IOException("daymark.asset.dir is not configured");
        }
        return new FileInputStream(new File(directory, name));
    }
}
