package com.abrar.daymark.serviceworkertest;

import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import android.app.Instrumentation;
import android.os.SystemClock;
import android.webkit.ServiceWorkerController;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runtime acceptance for Daymark's process-wide Service Worker network boundary.
 *
 * The seed WebView registers a real worker, then is destroyed. Daymark's policy is initialized
 * before the next WebView is created, modelling a persisted worker from an earlier app session.
 * The controlled server proves that ordinary page networking can be explicitly enabled while
 * worker-originated network requests remain blocked, cached responses still work, Offline
 * reassertion remains effective, and the boundary survives WebView recreation.
 *
 * This runner is separate from DaymarkPlatformInstrumentation so it does not race PR #648's
 * active Focus lifecycle changes to that shared runner.
 */
@RunWith(AndroidJUnit4.class)
public final class DaymarkServiceWorkerInstrumentation {
    private static final String TAG = "DaymarkSWRuntime";
    private static final long WAIT_MS = 15000L;
    private static final String WEB_VIEW_CLASS = "com.abrar.daymark.DaymarkWebView";

    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private int assertions;
    private String runToken;

    @Test
    public void testServiceWorkerNetworkPolicy() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        runToken = arguments == null ? null : arguments.getString("runToken");
        if (runToken == null || !runToken.matches("[A-Za-z0-9._-]{1,120}")) {
            throw new AssertionError("A unique runToken instrumentation argument is required.");
        }
        ControlledServer server = null;
        ControlledServer secondServer = null;
        WebView seed = null;
        WebView secondSeed = null;
        WebView active = null;
        WebView secondActive = null;
        WebView secondTab = null;
        WebView recreated = null;
        try {
            marker("starting controlled Service Worker request trace on API "
                    + android.os.Build.VERSION.SDK_INT);
            server = new ControlledServer();
            secondServer = new ControlledServer();

            // Seed workers on two distinct loopback origins before Daymark installs its
            // process-wide policy. Different ports are different origins and therefore have
            // independent Service Worker registrations and caches.
            seed = createWebView();
            load(seed, server.url("/register"));
            awaitBoolean(seed, "document.title === 'controlled'", WAIT_MS,
                    "the first origin must register and activate its Service Worker");
            int initialWorkerScripts = server.count("/sw.js");
            check(initialWorkerScripts > 0,
                    "the first controlled server must observe its worker script registration");

            secondSeed = createWebView();
            load(secondSeed, secondServer.url("/register"));
            awaitBoolean(secondSeed, "document.title === 'controlled'", WAIT_MS,
                    "the second origin must register and activate its Service Worker");
            int secondInitialWorkerScripts = secondServer.count("/sw.js");
            check(secondInitialWorkerScripts > 0,
                    "the second controlled server must observe its worker script registration");

            // Close both seed tabs so the workers persist without live pages. Initialize
            // Daymark's process-wide client/settings before creating the next WebViews.
            destroy(seed);
            seed = null;
            destroy(secondSeed);
            secondSeed = null;

            ClassLoader targetLoader = instrumentation.getTargetContext().getClassLoader();
            Class<?> daymarkWebView = Class.forName(WEB_VIEW_CLASS, true, targetLoader);
            Method readyMethod = daymarkWebView.getDeclaredMethod(
                    "isServiceWorkerNetworkPolicyReady");
            readyMethod.setAccessible(true);
            check(Boolean.TRUE.equals(readyMethod.invoke(null)),
                    "DaymarkWebView initialization must install Service Worker enforcement");

            ServiceWorkerController controller = ServiceWorkerController.getInstance();
            check(controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "the process-wide Service Worker network setting must be blocked");

            active = createWebView();
            load(active, server.url("/controlled"));
            awaitBoolean(active, "navigator.serviceWorker.controller !== null", WAIT_MS,
                    "the first persisted worker must control the newly created WebView");

            secondActive = createWebView();
            load(secondActive, secondServer.url("/controlled"));
            awaitBoolean(secondActive, "navigator.serviceWorker.controller !== null", WAIT_MS,
                    "the second persisted worker must control a WebView from its own origin");

            // A second tab on the first origin verifies that the global boundary is not tied
            // to the first WebView instance or its lifecycle.
            secondTab = createWebView();
            load(secondTab, server.url("/controlled"));
            awaitBoolean(secondTab, "navigator.serviceWorker.controller !== null", WAIT_MS,
                    "a second tab on the first origin must use the persisted worker");

            // Online page navigation remains usable when the user explicitly unblocks this
            // WebView. Only worker-originated network activity is globally denied.
            setPageNetworkBlocked(active, false);
            setPageNetworkBlocked(secondActive, false);
            setPageNetworkBlocked(secondTab, false);
            execute(active, "document.title='page-pending';"
                    + "fetch('/page-egress').then(r=>r.text()).then(t=>document.title=t)"
                    + ".catch(()=>document.title='page-error');");
            awaitBoolean(active, "document.title === 'page-ok'", WAIT_MS,
                    "ordinary page networking must remain available in explicit Online mode");
            execute(secondActive, "document.title='page-pending';"
                    + "fetch('/page-egress').then(r=>r.text()).then(t=>document.title=t)"
                    + ".catch(()=>document.title='page-error');");
            awaitBoolean(secondActive, "document.title === 'page-ok'", WAIT_MS,
                    "ordinary page networking must remain available on the second explicit origin");
            check(server.count("/page-egress") == 1,
                    "the first controlled server must receive the explicitly enabled page request");
            check(secondServer.count("/page-egress") == 1,
                    "the second controlled server must receive its explicitly enabled page request");

            // Take the baseline only after all seed/active/second-tab navigations and page
            // requests. Chromium may perform a normal Service Worker update check while a
            // new client is loaded; that setup traffic is not caused by an Online/Offline
            // mode transition and must not be attributed to one.
            int firstWorkerScriptsBeforeOnline = server.count("/sw.js");
            int secondWorkerScriptsBeforeOnline = secondServer.count("/sw.js");

            // The user's explicit Online navigation consent must enable worker egress on
            // both origins and all retained tabs, not just ordinary page fetches.
            Class<?> enforcementType = Class.forName(
                    "com.abrar.daymark.BrowserServiceWorkerEnforcement", true, targetLoader);
            Method allowOnline = enforcementType.getDeclaredMethod("allowNetworkAfterExplicitConsent");
            allowOnline.setAccessible(true);
            check(Boolean.TRUE.equals(allowOnline.invoke(null)),
                    "explicit Online consent must enable process-wide Service Worker network access");
            check(!controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "Online consent must clear the global Service Worker network block");
            requestWorkerEgressAllowed(active);
            requestWorkerEgressAllowed(secondActive);
            requestWorkerEgressAllowed(secondTab);
            check(server.count("/worker-egress") == 2,
                    "both first-origin tabs must reach the worker egress endpoint while Online");
            check(secondServer.count("/worker-egress") == 1,
                    "the second origin must reach the worker egress endpoint while Online");
            check(server.count("/trigger") == 0,
                    "the first-origin page trigger must still be fulfilled by its Service Worker");
            check(secondServer.count("/trigger") == 0,
                    "the second-origin page trigger must still be fulfilled by its Service Worker");

            // Cached/local Service Worker responses remain usable in both modes.
            requestCachedResponse(active);
            requestCachedResponse(secondActive);
            check(server.count("/cached") == 0,
                    "the first origin's cached Service Worker response must not require a network request");
            check(secondServer.count("/cached") == 0,
                    "the second origin's cached Service Worker response must not require a network request");
            check(server.count("/sw.js") == firstWorkerScriptsBeforeOnline,
                    "the first origin must not refetch its worker script during Online mode change"
                    + " (before=" + firstWorkerScriptsBeforeOnline
                    + ", after=" + server.count("/sw.js") + ")");
            check(secondServer.count("/sw.js") == secondWorkerScriptsBeforeOnline,
                    "the second origin must not refetch its worker script during Online mode change"
                    + " (before=" + secondWorkerScriptsBeforeOnline
                    + ", after=" + secondServer.count("/sw.js") + ")");

            // Exercise the page-level Offline transition independently of the global worker
            // policy. A page request must fail while the same worker remains network-blocked.
            setPageNetworkBlocked(active, true);
            execute(active, "document.title='offline-pending';"
                    + "fetch('/page-egress-offline').then(r=>r.text())"
                    + ".then(()=>document.title='offline-unexpected')"
                    + ".catch(()=>document.title='offline-blocked');");
            awaitBoolean(active, "document.title === 'offline-blocked'", WAIT_MS,
                    "page-level Offline mode must block ordinary network fetches");
            check(server.count("/page-egress-offline") == 0,
                    "Offline page traffic must not reach the controlled server");

            // Snapshot immediately before the process-wide Offline reassertion. This isolates
            // the policy transition from the earlier page-navigation/update-check setup.
            int firstWorkerScriptsBeforeOffline = server.count("/sw.js");
            int secondWorkerScriptsBeforeOffline = secondServer.count("/sw.js");

            // Simulate a settings reset and exercise Daymark's actual Offline reassertion method.
            // No request is issued during the temporary test reset.
            controller.getServiceWorkerWebSettings().setBlockNetworkLoads(false);
            Class<?> policyType = Class.forName(
                    "com.abrar.daymark.BrowserNetworkPolicy", true, targetLoader);
            java.lang.reflect.Constructor<?> offlineConstructor =
                    policyType.getDeclaredConstructor(boolean.class);
            offlineConstructor.setAccessible(true);
            Object offlinePolicy = offlineConstructor.newInstance(false);
            Class<?> workspaceController = Class.forName(
                    "com.abrar.daymark.BrowserWorkspaceController", true, targetLoader);
            Method enforceOffline = workspaceController.getDeclaredMethod(
                    "enforceOffline", policyType, List.class);
            enforceOffline.setAccessible(true);
            // Exercise the real production Online/Offline transition with no retained tabs.
            // Service Worker enforcement is process-wide and must not depend on a tab list.
            enforceOffline.invoke(null, offlinePolicy, Collections.emptyList());
            check(controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "Offline reassertion must restore the process-wide Service Worker block");
            check(server.count("/sw.js") == firstWorkerScriptsBeforeOffline,
                    "Offline reassertion must not refetch the first origin's worker script");
            check(secondServer.count("/sw.js") == secondWorkerScriptsBeforeOffline,
                    "Offline reassertion must not refetch the second origin's worker script");

            setPageNetworkBlocked(active, false);
            setPageNetworkBlocked(secondActive, false);
            setPageNetworkBlocked(secondTab, false);
            requestWorkerEgress(active);
            requestWorkerEgress(secondActive);
            requestWorkerEgress(secondTab);
            check(server.count("/worker-egress") == 2,
                    "Offline must not add first-origin worker egress after the two Online requests");
            check(secondServer.count("/worker-egress") == 1,
                    "Offline must not add second-origin worker egress after its Online request");
            check(server.count("/trigger") == 0 && secondServer.count("/trigger") == 0,
                    "both workers must continue intercepting their page triggers while Offline");

            // Service Workers outlive individual WebView instances. Destroy this tab and create
            // another WebView in the same app profile; the persisted worker must remain blocked.
            destroy(active);
            active = null;
            destroy(secondActive);
            secondActive = null;
            destroy(secondTab);
            secondTab = null;
            recreated = createWebView();
            load(recreated, secondServer.url("/controlled"));
            awaitBoolean(recreated, "navigator.serviceWorker.controller !== null", WAIT_MS,
                    "the second-origin persisted worker must control a recreated WebView");
            requestCachedResponse(recreated);
            requestWorkerEgress(recreated);
            check(secondServer.count("/worker-egress") == 1,
                    "a recreated tab must remain Offline until the next explicit Online navigation");
            check(secondServer.count("/trigger") == 0,
                    "the recreated tab's worker must continue to intercept its second-origin trigger");

            int secondOriginScriptsBeforeReenable = secondServer.count("/sw.js");
            check(Boolean.TRUE.equals(allowOnline.invoke(null)),
                    "a later explicit Online consent must re-enable worker network access");
            check(!controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "the recreated tab's Online transition must clear the global worker block");
            requestWorkerEgressAllowed(recreated);
            check(secondServer.count("/worker-egress") == 2,
                    "the recreated tab's worker must reach its origin after explicit Online consent");
            check(secondServer.count("/sw.js") == secondOriginScriptsBeforeReenable,
                    "the recreated tab's Online transition must not refetch its worker script");
            enforceOffline.invoke(null, offlinePolicy, Collections.emptyList());
            check(controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "the instrumentation must leave the worker policy Offline before cleanup");

            execute(recreated, "(async()=>{"
                    + "const registration=await navigator.serviceWorker.getRegistration();"
                    + "if(registration) await registration.unregister();"
                    + "await caches.delete('daymark-service-worker-runtime');"
                    + "document.title='cleanup-done';"
                    + "});");
            awaitBoolean(recreated, "document.title === 'cleanup-done'", WAIT_MS,
                    "the instrumentation must clean up its Service Worker and cache");

            verifyExtensionSpaNavigation();
            marker("all Service Worker runtime phases passed; " + assertions + " assertions");
        } catch (Throwable failure) {
            Log.e(TAG, "runtime acceptance failed after " + assertions + " assertions", failure);
            marker("FAIL after " + assertions + " assertions: " + failure);
            throw new AssertionError("Service Worker runtime acceptance failed after "
                    + assertions + " assertions", failure);
        } finally {
            if (recreated != null) destroyQuietly(recreated);
            if (secondTab != null) destroyQuietly(secondTab);
            if (secondActive != null) destroyQuietly(secondActive);
            if (active != null) destroyQuietly(active);
            if (secondSeed != null) destroyQuietly(secondSeed);
            if (seed != null) destroyQuietly(seed);
            if (secondServer != null) {
                try { secondServer.close(); }
                catch (IOException error) { Log.w(TAG, "could not close second controlled server", error); }
            }
            if (server != null) {
                try { server.close(); }
                catch (IOException error) { Log.w(TAG, "could not close controlled server", error); }
            }
        }
    }

    /**
     * Exercises the production DaymarkWebView callback with a real System WebView. This verifies
     * pushState/replaceState/back/forward route changes, per-page pack scope, and the absence of
     * page-readable extension catalogs. It deliberately uses a separate Activity/WebView so it
     * does not touch MainActivity's task, Focus, or browser-tab state.
     */
    private void verifyExtensionSpaNavigation() throws Exception {
        marker("starting Daymark WebView extension SPA route acceptance");
        ControlledServer server = new ControlledServer();
        android.app.Activity activity = null;
        WebView view = null;
        Object extensionStore = null;
        String suffix = java.util.UUID.randomUUID().toString().replace("-", "");
        String matchingPackId = "daymark.test.spa." + suffix;
        String unrelatedPackId = "daymark.test.other." + suffix;
        String matchingCss = "body{--daymark-spa-probe:1}";
        String unrelatedCss = "body{--daymark-unrelated-probe:1}";
        boolean previousGlobalEnabled = true;
        boolean globalStateCaptured = false;
        try {
            android.content.Intent launch = new android.content.Intent(
                    instrumentation.getTargetContext(),
                    Class.forName("com.abrar.daymark.MainActivity",
                            true, instrumentation.getTargetContext().getClassLoader()));
            launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                    | android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK);
            activity = instrumentation.startActivitySync(launch);
            check(activity != null, "the real Daymark Activity is available for WebView construction");
            final android.app.Activity hostActivity = activity;
            final ClassLoader targetLoader = instrumentation.getTargetContext().getClassLoader();
            AtomicReference<WebView> viewRef = new AtomicReference<>();
            AtomicReference<Object> storeRef = new AtomicReference<>();
            AtomicReference<Object> policyRef = new AtomicReference<>();
            AtomicReference<Throwable> setupFailure = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                try {
                    Class<?> policyType = Class.forName(
                            "com.abrar.daymark.BrowserNetworkPolicy", true, targetLoader);
                    java.lang.reflect.Constructor<?> policyConstructor =
                            policyType.getDeclaredConstructor();
                    policyConstructor.setAccessible(true);
                    Object policy = policyConstructor.newInstance();

                    Class<?> listenerType = Class.forName(
                            "com.abrar.daymark.DaymarkWebView$Listener", true, targetLoader);
                    Object listener = java.lang.reflect.Proxy.newProxyInstance(
                            targetLoader, new Class<?>[]{listenerType}, (proxy, method, args) -> {
                                if (method.getDeclaringClass() == Object.class) {
                                    if ("toString".equals(method.getName())) return "Daymark SPA acceptance listener";
                                    if ("hashCode".equals(method.getName())) {
                                        return System.identityHashCode(proxy);
                                    }
                                    if ("equals".equals(method.getName())) {
                                        return args != null && args.length == 1 && proxy == args[0];
                                    }
                                }
                                return null;
                            });

                    Class<?> webViewType = Class.forName(
                            "com.abrar.daymark.DaymarkWebView", true, targetLoader);
                    java.lang.reflect.Constructor<?> webViewConstructor =
                            webViewType.getDeclaredConstructor(
                                    android.app.Activity.class, policyType,
                                    boolean.class, listenerType);
                    webViewConstructor.setAccessible(true);
                    WebView testView = (WebView) webViewConstructor.newInstance(
                            hostActivity, policy, true, listener);

                    java.lang.reflect.Field runtimeField =
                            webViewType.getDeclaredField("extensionRuntime");
                    runtimeField.setAccessible(true);
                    Object runtime = runtimeField.get(testView);
                    java.lang.reflect.Method storeMethod =
                            runtime.getClass().getDeclaredMethod("store");
                    storeMethod.setAccessible(true);
                    Object store = storeMethod.invoke(runtime);

                    hostActivity.setContentView(testView, new android.widget.FrameLayout.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT));
                    testView.onResume();
                    testView.resumeTimers();
                    viewRef.set(testView);
                    storeRef.set(store);
                    policyRef.set(policy);
                } catch (Throwable failure) {
                    setupFailure.set(failure);
                }
            });
            if (setupFailure.get() != null) {
                throw new AssertionError("could not construct the production DaymarkWebView",
                        setupFailure.get());
            }
            view = viewRef.get();
            extensionStore = storeRef.get();
            Object networkPolicy = policyRef.get();
            check(view != null && extensionStore != null && networkPolicy != null,
                    "the production DaymarkWebView and its native ExtensionStore are available");

            Class<?> storeType = extensionStore.getClass();
            java.lang.reflect.Method getGlobalEnabled =
                    storeType.getDeclaredMethod("isGloballyEnabled");
            getGlobalEnabled.setAccessible(true);
            previousGlobalEnabled = (Boolean) getGlobalEnabled.invoke(extensionStore);
            globalStateCaptured = true;
            java.lang.reflect.Method setGlobalEnabled =
                    storeType.getDeclaredMethod("setGloballyEnabled", boolean.class);
            setGlobalEnabled.setAccessible(true);
            setGlobalEnabled.invoke(extensionStore, true);

            Class<?> parserType = Class.forName(
                    "com.abrar.daymark.ExtensionPackageParser", true, targetLoader);
            java.lang.reflect.Method parsePack = parserType.getDeclaredMethod(
                    "parseDaymarkJson", String.class, boolean.class);
            parsePack.setAccessible(true);
            Class<?> extensionType = Class.forName(
                    "com.abrar.daymark.BrowserExtension", true, targetLoader);
            java.lang.reflect.Method installPack = storeType.getDeclaredMethod(
                    "installUserPack", extensionType);
            installPack.setAccessible(true);

            String matchingJson = "{\"id\":\"" + matchingPackId
                    + "\",\"name\":\"SPA route probe\",\"version\":\"1.0.0\",\"enabled\":true,"
                    + "\"matches\":[\"*://127.0.0.1/private/*\"],\"excludes\":[],"
                    + "\"css\":\"" + matchingCss + "\"}";
            String unrelatedJson = "{\"id\":\"" + unrelatedPackId
                    + "\",\"name\":\"Unrelated scope probe\",\"version\":\"1.0.0\",\"enabled\":true,"
                    + "\"matches\":[\"*://example.invalid/*\"],\"excludes\":[],"
                    + "\"css\":\"" + unrelatedCss + "\"}";
            installPack.invoke(extensionStore, parsePack.invoke(null, matchingJson, false));
            installPack.invoke(extensionStore, parsePack.invoke(null, unrelatedJson, false));
            // Imported user packs are intentionally disabled until the user enables them in the
            // manager. The runtime fixture must exercise that explicit opt-in transition.
            java.lang.reflect.Method setUserPackEnabled = storeType.getDeclaredMethod(
                    "setUserPackEnabled", String.class, boolean.class);
            setUserPackEnabled.setAccessible(true);
            setUserPackEnabled.invoke(extensionStore, matchingPackId, true);
            setUserPackEnabled.invoke(extensionStore, unrelatedPackId, true);

            Class<?> workspaceController = Class.forName(
                    "com.abrar.daymark.BrowserWorkspaceController", true, targetLoader);
            java.lang.reflect.Method prepareNavigation = workspaceController.getDeclaredMethod(
                    "prepareForExplicitNavigation",
                    Class.forName("com.abrar.daymark.BrowserNetworkPolicy", true, targetLoader),
                    Class.forName("com.abrar.daymark.DaymarkWebView", true, targetLoader));
            prepareNavigation.setAccessible(true);
            final java.lang.reflect.Method prepareNavigationMethod = prepareNavigation;
            final Object prepareNavigationPolicy = networkPolicy;
            final WebView prepareNavigationView = view;
            AtomicReference<Throwable> prepareFailure = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> {
                try {
                    prepareNavigationMethod.invoke(null, prepareNavigationPolicy, prepareNavigationView);
                } catch (Throwable navigationPrepareError) {
                    prepareFailure.set(navigationPrepareError);
                }
            });
            if (prepareFailure.get() != null) {
                throw new AssertionError("could not prepare the production DaymarkWebView for explicit navigation",
                        prepareFailure.get());
            }
            load(view, server.url("/private/start"));
            String matchingSelector = "style[data-daymark-managed=\"true\"][data-daymark-pack-id=\""
                    + matchingPackId + "\"]";
            String unrelatedSelector = "style[data-daymark-managed=\"true\"][data-daymark-pack-id=\""
                    + unrelatedPackId + "\"]";
            String matchingCount = "document.querySelectorAll('" + matchingSelector + "').length";
            String unrelatedCount = "document.querySelectorAll('" + unrelatedSelector + "').length";
            awaitSpa(view, matchingCount + " === 1", WAIT_MS,
                    "a matching localhost route receives its pack CSS through production injection",
                    extensionStore);
            check(evaluateBoolean(view, unrelatedCount + " === 0"),
                    "a nonmatching installed pack is not injected into the current page");
            check(evaluateBoolean(view,
                            "typeof window.__daymarkSpaConfig === 'undefined'"
                            + " && typeof window.__daymarkSpaState === 'undefined'"
                            + " && typeof window.__daymarkLastCss === 'undefined'"),
                    "the page cannot read a global extension catalog or SPA state object");
            check(evaluateBoolean(view,
                            "document.documentElement.outerHTML.indexOf('" + unrelatedCss + "') === -1"),
                    "the page DOM does not contain CSS from a nonmatching installed pack");

            execute(view, "history.pushState({}, '', '/public/one');");
            awaitSpa(view, "location.pathname === '/public/one' && "
                            + matchingCount + " === 0", WAIT_MS,
                    "pushState to a nonmatching route removes the previously injected pack CSS",
                    extensionStore);

            execute(view, "history.pushState({}, '', '/private/again');");
            awaitSpa(view, "location.pathname === '/private/again' && "
                            + matchingCount + " === 1", WAIT_MS,
                    "pushState back into the matching scope restores only that pack's CSS",
                    extensionStore);

            execute(view, "history.replaceState({}, '', '/public/replace');");
            awaitSpa(view, "location.pathname === '/public/replace' && "
                            + matchingCount + " === 0", WAIT_MS,
                    "replaceState re-evaluates the current route and removes out-of-scope CSS",
                    extensionStore);

            execute(view, "history.pushState({}, '', '/private/back');");
            awaitSpa(view, "location.pathname === '/private/back' && "
                            + matchingCount + " === 1", WAIT_MS,
                    "a new matching history entry restores the scoped CSS",
                    extensionStore);
            execute(view, "history.back();");
            awaitSpa(view, "location.pathname === '/public/replace' && "
                            + matchingCount + " === 0", WAIT_MS,
                    "history.back re-evaluates extension scope and removes CSS",
                    extensionStore);
            execute(view, "history.forward();");
            awaitSpa(view, "location.pathname === '/private/back' && "
                            + matchingCount + " === 1", WAIT_MS,
                    "history.forward re-evaluates extension scope and restores CSS",
                    extensionStore);

            execute(view, "location.hash = '#fragment';");
            awaitSpa(view, "location.hash === '#fragment' && "
                            + matchingCount + " === 1", WAIT_MS,
                    "fragment navigation preserves CSS while the path remains in scope",
                    extensionStore);
            check(evaluateBoolean(view,
                            "typeof window.__daymarkSpaConfig === 'undefined'"
                            + " && typeof window.__daymarkSpaState === 'undefined'"
                            + " && document.documentElement.outerHTML.indexOf('" + unrelatedCss + "') === -1"),
                    "same-document transitions still expose no unrelated pack metadata");
            marker("Daymark WebView extension SPA route acceptance passed");
        } finally {
            if (view != null) destroyQuietly(view);
            try {
                Class<?> enforcement = Class.forName(
                        "com.abrar.daymark.BrowserServiceWorkerEnforcement", true,
                        instrumentation.getTargetContext().getClassLoader());
                java.lang.reflect.Method blockWorkers = enforcement.getDeclaredMethod("enforceBlocked");
                blockWorkers.setAccessible(true);
                blockWorkers.invoke(null);
            } catch (Throwable policyCleanupFailure) {
                Log.w(TAG, "could not restore the fail-closed Service Worker policy", policyCleanupFailure);
            }
            if (extensionStore != null) {
                try {
                    Class<?> storeType = extensionStore.getClass();
                    java.lang.reflect.Method uninstall =
                            storeType.getDeclaredMethod("uninstallUserPack", String.class);
                    uninstall.setAccessible(true);
                    uninstall.invoke(extensionStore, matchingPackId);
                    uninstall.invoke(extensionStore, unrelatedPackId);
                    if (globalStateCaptured) {
                        java.lang.reflect.Method setGlobalEnabled =
                                storeType.getDeclaredMethod("setGloballyEnabled", boolean.class);
                        setGlobalEnabled.setAccessible(true);
                        setGlobalEnabled.invoke(extensionStore, previousGlobalEnabled);
                    }
                } catch (Throwable cleanupFailure) {
                    Log.w(TAG, "extension SPA test pack cleanup failed", cleanupFailure);
                }
            }
            if (activity != null) {
                android.app.Activity finishedActivity = activity;
                instrumentation.runOnMainSync(finishedActivity::finish);
            }
            try { server.close(); }
            catch (IOException error) { Log.w(TAG, "could not close extension SPA server", error); }
        }
    }

    private WebView createWebView() throws Exception {
        WebView[] result = new WebView[1];
        instrumentation.runOnMainSync(() -> {
            WebView view = new WebView(instrumentation.getTargetContext());
            WebSettings settings = view.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setBlockNetworkLoads(false);
            view.setWebViewClient(new WebViewClient());
            result[0] = view;
        });
        check(result[0] != null, "WebView must be created on the main thread");
        return result[0];
    }

    private void load(WebView view, String url) throws Exception {
        instrumentation.runOnMainSync(() -> view.loadUrl(url));
        awaitBoolean(view, "document.readyState === 'complete'", WAIT_MS,
                "the controlled page must finish loading");
    }

    private void setPageNetworkBlocked(WebView view, boolean blocked) throws Exception {
        instrumentation.runOnMainSync(() -> view.getSettings().setBlockNetworkLoads(blocked));
    }

    private void execute(WebView view, String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(script, ignored -> completed.countDown()));
        if (!completed.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("WebView did not execute the acceptance script");
        }
    }

    private boolean evaluateBoolean(WebView view, String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(expression, result -> {
            value.set(result);
            completed.countDown();
        }));
        if (!completed.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("WebView JavaScript evaluation timed out");
        }
        return "true".equals(value.get());
    }

    private void awaitBoolean(WebView view, String expression, long timeoutMs, String message)
            throws Exception {
        long deadline = SystemClock.elapsedRealtime() + timeoutMs;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (evaluateBoolean(view, expression)) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError(message);
    }

    private void requestWorkerEgress(WebView view) throws Exception {
        execute(view, "document.title='trigger-pending';"
                + "fetch('/trigger').then(r=>r.text()).then(t=>document.title='trigger-'+t)"
                + ".catch(()=>document.title='trigger-error');");
        awaitBoolean(view, "document.title === 'trigger-blocked'", WAIT_MS,
                "the Service Worker must return its local blocked response for network fetch");
    }

    private void requestWorkerEgressAllowed(WebView view) throws Exception {
        execute(view, "document.title='trigger-pending';"
                + "fetch('/trigger').then(r=>r.text()).then(t=>document.title='trigger-'+t)"
                + ".catch(()=>document.title='trigger-error');");
        awaitBoolean(view, "document.title === 'trigger-unexpected-egress'", WAIT_MS,
                "the Service Worker must reach its origin while Daymark is explicitly Online");
    }

    private void requestCachedResponse(WebView view) throws Exception {
        execute(view, "document.title='cache-pending';"
                + "fetch('/cached').then(r=>r.text()).then(t=>document.title='cache-'+t)"
                + ".catch(()=>document.title='cache-error');");
        awaitBoolean(view, "document.title === 'cache-cached-ok'", WAIT_MS,
                "a previously cached Service Worker response must remain available");
    }

    /**
     * Diagnostic-only wrapper around {@link #awaitBoolean} used by the extension SPA phase.
     * On timeout it appends the observed WebView/page/store/runtime state to the failure so
     * the anonymous annotation can show why production injection did not satisfy the wait.
     * It never changes pass/fail semantics; the same condition is polled for the same time.
     */
    private void awaitSpa(WebView view, String expression, long timeoutMs, String message,
                          Object extensionStore) throws Exception {
        try {
            awaitBoolean(view, expression, timeoutMs, message);
        } catch (AssertionError timeout) {
            throw new AssertionError(message + " | spa-diag " + spaDiagnostics(view, extensionStore), timeout);
        }
    }

    private String spaDiagnostics(WebView view, Object extensionStore) {
        StringBuilder diag = new StringBuilder();
        final AtomicReference<String> viewUrl = new AtomicReference<>();
        try {
            instrumentation.runOnMainSync(() -> viewUrl.set(String.valueOf(view.getUrl())));
            diag.append("viewUrl=").append(viewUrl.get());
        } catch (Throwable error) {
            diag.append("viewUrlError=").append(error);
        }
        try {
            diag.append(" page=").append(evaluateString(view,
                    "JSON.stringify({"
                    + "href: String(window.location.href),"
                    + "ready: document.readyState,"
                    + "managed: Array.prototype.map.call("
                    + "document.querySelectorAll('style[data-daymark-managed=\"true\"]'),"
                    + "function(s){return String(s.getAttribute('data-daymark-pack-id')) + '/'"
                    + " + String(s.getAttribute('data-daymark-pack-css'));})"
                    + "})"));
        } catch (Throwable error) {
            diag.append(" pageError=").append(error);
        }
        try {
            Class<?> storeType = extensionStore.getClass();
            java.lang.reflect.Method listAll = storeType.getDeclaredMethod("listAll");
            listAll.setAccessible(true);
            java.util.List<?> packs = (java.util.List<?>) listAll.invoke(extensionStore);
            diag.append(" packs=[");
            for (Object pack : packs) {
                Class<?> packType = pack.getClass();
                java.lang.reflect.Field idField = packType.getDeclaredField("id");
                idField.setAccessible(true);
                java.lang.reflect.Field enabledField = packType.getDeclaredField("enabled");
                enabledField.setAccessible(true);
                java.lang.reflect.Field matchesField = packType.getDeclaredField("matches");
                matchesField.setAccessible(true);
                diag.append(String.valueOf(idField.get(pack))).append('|')
                        .append(enabledField.get(pack)).append('|')
                        .append(matchesField.get(pack)).append(';');
            }
            diag.append(']');
        } catch (Throwable error) {
            diag.append(" packsError=").append(error);
        }
        try {
            java.lang.reflect.Field runtimeField = view.getClass().getDeclaredField("extensionRuntime");
            runtimeField.setAccessible(true);
            Object runtime = runtimeField.get(view);
            java.lang.reflect.Field lastApplied = runtime.getClass().getDeclaredField("lastAppliedUrl");
            lastApplied.setAccessible(true);
            java.lang.reflect.Field scriptsApplied =
                    runtime.getClass().getDeclaredField("userscriptsAppliedForCurrentDocument");
            scriptsApplied.setAccessible(true);
            diag.append(" runtimeLastUrl=").append(lastApplied.get(runtime))
                    .append(" runtimeScriptsApplied=").append(scriptsApplied.get(runtime));
        } catch (Throwable error) {
            diag.append(" runtimeError=").append(error);
        }
        return diag.toString();
    }

    private String evaluateString(WebView view, String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        instrumentation.runOnMainSync(() -> view.evaluateJavascript(expression, result -> {
            value.set(result);
            completed.countDown();
        }));
        if (!completed.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("WebView JavaScript evaluation timed out");
        }
        return String.valueOf(value.get());
    }

    private void destroy(WebView view) throws Exception {
        instrumentation.runOnMainSync(() -> {
            view.stopLoading();
            view.destroy();
        });
    }

    private void destroyQuietly(WebView view) {
        try { destroy(view); }
        catch (Throwable error) { Log.w(TAG, "WebView cleanup failed", error); }
    }

    private void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private void marker(String message) {
        Log.i(TAG, "run=" + runToken + " " + message);
    }

    private static String stackTrace(Throwable failure) {
        java.io.StringWriter writer = new java.io.StringWriter();
        failure.printStackTrace(new java.io.PrintWriter(writer));
        return writer.toString();
    }

    private static final class ControlledServer implements AutoCloseable {
        private final ServerSocket socket;
        private final ExecutorService clients = Executors.newFixedThreadPool(4);
        private final Map<String, AtomicInteger> counts = new ConcurrentHashMap<>();
        private volatile boolean closed;

        ControlledServer() throws IOException {
            socket = new ServerSocket();
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            Thread acceptor = new Thread(() -> {
                while (!closed) {
                    try {
                        Socket client = socket.accept();
                        clients.execute(() -> respond(client));
                    } catch (IOException error) {
                        if (!closed) Log.e(TAG, "controlled server accept failed", error);
                    }
                }
            }, "DaymarkServiceWorkerTestServer");
            acceptor.setDaemon(true);
            acceptor.start();
        }

        String url(String path) {
            return "http://127.0.0.1:" + socket.getLocalPort() + path;
        }

        int count(String path) {
            AtomicInteger value = counts.get(path);
            return value == null ? 0 : value.get();
        }

        private void respond(Socket client) {
            try (Socket connection = client) {
                connection.setSoTimeout(5000);
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                        connection.getInputStream(), StandardCharsets.US_ASCII));
                String requestLine = reader.readLine();
                if (requestLine == null) return;
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) { }
                String[] parts = requestLine.split(" ");
                String rawPath = parts.length > 1 ? parts[1] : "/";
                String path = rawPath.split("\\?", 2)[0];
                counts.computeIfAbsent(path, ignored -> new AtomicInteger()).incrementAndGet();

                String body;
                String contentType;
                int status = 200;
                String reason = "OK";
                switch (path) {
                    case "/register":
                        body = registerPage();
                        contentType = "text/html; charset=utf-8";
                        break;
                    case "/controlled":
                        body = controlledPage();
                        contentType = "text/html; charset=utf-8";
                        break;
                    case "/private/start":
                        body = "<!doctype html><html><head><meta charset=\"utf-8\"><title>extension-spa</title></head>"
                                + "<body><main id=\"daymark-spa-probe\">Extension SPA acceptance</main></body></html>";
                        contentType = "text/html; charset=utf-8";
                        break;
                    case "/sw.js":
                        body = workerScript();
                        contentType = "application/javascript; charset=utf-8";
                        break;
                    case "/page-egress":
                        body = "page-ok";
                        contentType = "text/plain; charset=utf-8";
                        break;
                    case "/page-egress-offline":
                        body = "offline-unexpected";
                        contentType = "text/plain; charset=utf-8";
                        break;
                    case "/worker-egress":
                        body = "worker-egress-reached-server";
                        contentType = "text/plain; charset=utf-8";
                        break;
                    case "/trigger":
                        body = "network-fallback";
                        contentType = "text/plain; charset=utf-8";
                        break;
                    case "/cached":
                        body = "network-cache-miss";
                        contentType = "text/plain; charset=utf-8";
                        break;
                    default:
                        body = "not-found";
                        contentType = "text/plain; charset=utf-8";
                        status = 404;
                        reason = "Not Found";
                        break;
                }
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                OutputStream output = connection.getOutputStream();
                String headers = "HTTP/1.1 " + status + " " + reason + "\r\n"
                        + "Content-Type: " + contentType + "\r\n"
                        + "Content-Length: " + bytes.length + "\r\n"
                        + "Cache-Control: no-store\r\n"
                        + "Connection: close\r\n"
                        + "\r\n";
                output.write(headers.getBytes(StandardCharsets.US_ASCII));
                output.write(bytes);
                output.flush();
            } catch (IOException error) {
                if (!closed) Log.w(TAG, "controlled server request failed", error);
            }
        }

        private static String registerPage() {
            return """
                    <!doctype html><html><head><meta charset="utf-8"><title>starting</title></head>
                    <body><script>
                    (async function () {
                      try {
                        await navigator.serviceWorker.register('/sw.js', {scope: '/'});
                        await navigator.serviceWorker.ready;
                        if (!navigator.serviceWorker.controller) {
                          await new Promise((resolve, reject) => {
                            let finished = false;
                            const timer = setTimeout(() => {
                              if (!finished) reject(new Error('controller timeout'));
                            }, 12000);
                            const done = () => {
                              if (finished) return;
                              finished = true;
                              clearTimeout(timer);
                              resolve();
                            };
                            navigator.serviceWorker.addEventListener('controllerchange', done, {once: true});
                            if (navigator.serviceWorker.controller) done();
                          });
                        }
                        document.title = navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled';
                      } catch (error) {
                        document.title = 'registration-error';
                      }
                    })();
                    </script></body></html>
                    """;
        }

        private static String controlledPage() {
            return """
                    <!doctype html><html><head><meta charset="utf-8"><title>starting</title></head>
                    <body><script>
                    document.title = navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled';
                    </script></body></html>
                    """;
        }

        private static String workerScript() {
            return """
                    // runtime acceptance worker version 1
                    self.addEventListener('install', event => {
                      event.waitUntil((async () => {
                        const cache = await caches.open('daymark-service-worker-runtime');
                        await cache.put(
                          new URL('/cached', self.location.origin).href,
                          new Response('cached-ok', {headers: {'Content-Type': 'text/plain'}})
                        );
                        await self.skipWaiting();
                      })());
                    });
                    self.addEventListener('activate', event => {
                      event.waitUntil(self.clients.claim());
                    });
                    self.addEventListener('fetch', event => {
                      const path = new URL(event.request.url).pathname;
                      if (path === '/trigger') {
                        event.respondWith((async () => {
                          try {
                            const response = await fetch('/worker-egress');
                            return response.ok
                              ? new Response('unexpected-egress')
                              : new Response('blocked');
                          } catch (error) {
                            return new Response('blocked');
                          }
                        })());
                      } else if (path === '/cached') {
                        event.respondWith(caches.match(event.request)
                          .then(response => response || new Response('cache-miss')));
                      }
                    });
                    """;
        }

        @Override
        public void close() throws IOException {
            closed = true;
            socket.close();
            clients.shutdownNow();
        }
    }
}
