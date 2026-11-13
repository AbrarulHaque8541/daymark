package android.content;

import android.content.res.AssetManager;

/** Host-only Context stub for ExtensionInjectorSmoke. */
public final class Context {
    private final AssetManager assets = new AssetManager();

    public AssetManager getAssets() {
        return assets;
    }
}
