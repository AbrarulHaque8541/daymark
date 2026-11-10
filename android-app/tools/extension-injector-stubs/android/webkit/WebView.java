package android.webkit;

import android.content.Context;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Host-only WebView stub for ExtensionInjectorSmoke. */
public final class WebView {
    private String url;
    private final Context context = new Context();
    private final List<String> evaluatedScripts = new ArrayList<>();

    public WebView(String url) {
        this.url = url;
    }

    public String getUrl() {
        return url;
    }

    public Context getContext() {
        return context;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public void evaluateJavascript(String script, Object callback) {
        evaluatedScripts.add(script);
    }

    public List<String> getEvaluatedScripts() {
        return Collections.unmodifiableList(evaluatedScripts);
    }
}
