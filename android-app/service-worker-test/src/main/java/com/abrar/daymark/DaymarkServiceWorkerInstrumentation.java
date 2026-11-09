package com.abrar.daymark;

import android.app.Activity;
import android.app.Instrumentation;
import android.os.Bundle;
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
public final class DaymarkServiceWorkerInstrumentation extends Instrumentation {
    private static final String TAG = "DaymarkSWRuntime";
    private static final long WAIT_MS = 15000L;
    private static final String WEB_VIEW_CLASS = "com.abrar.daymark.DaymarkWebView";
    private static final String ENFORCEMENT_CLASS =
            "com.abrar.daymark.BrowserServiceWorkerEnforcement";

    private int assertions;

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle result = new Bundle();
        int resultCode = Activity.RESULT_OK;
        ControlledServer server = null;
        WebView seed = null;
        WebView active = null;
        WebView recreated = null;
        try {
            marker("starting controlled Service Worker request trace on API "
                    + android.os.Build.VERSION.SDK_INT);
            server = new ControlledServer();

            // Seed a worker in the app's WebView profile before the Daymark policy is loaded.
            seed = createWebView();
            load(seed, server.url("/register"));
            awaitBoolean(seed, "document.title === 'controlled'", WAIT_MS,
                    "the local page must register and activate its Service Worker");
            int initialWorkerScripts = server.count("/sw.js");
            check(initialWorkerScripts > 0,
                    "the controlled server must observe the initial worker script registration");

            // Close the seed tab so the worker is persisted without a live page. Initialize
            // Daymark's process-wide client/settings before creating the next WebView.
            destroy(seed);
            seed = null;

            ClassLoader targetLoader = getTargetContext().getClassLoader();
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
                    "the persisted worker must control the newly created WebView");

            // Online page navigation remains usable when the user explicitly unblocks this
            // WebView. Only worker-originated network activity is globally denied.
            setPageNetworkBlocked(active, false);
            execute(active, "document.title='page-pending';"
                    + "fetch('/page-egress').then(r=>r.text()).then(t=>document.title=t)"
                    + ".catch(()=>document.title='page-error');");
            awaitBoolean(active, "document.title === 'page-ok'", WAIT_MS,
                    "ordinary page networking must remain available in explicit Online mode");
            check(server.count("/page-egress") == 1,
                    "the controlled server must receive the explicitly enabled page request");

            // Cached/local Service Worker responses remain usable even though worker network
            // fetches are denied.
            requestCachedResponse(active);
            check(server.count("/cached") == 0,
                    "a cached Service Worker response must not require a network request");

            requestWorkerEgress(active);
            check(server.count("/trigger") == 0,
                    "the page trigger must be fulfilled by the active Service Worker");
            check(server.count("/worker-egress") == 0,
                    "a Service Worker fetch must never reach the controlled network server");
            check(server.count("/sw.js") == initialWorkerScripts,
                    "a controlled tab must not fetch the worker script around the global block");

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

            // Simulate a settings reset and exercise Daymark's actual Offline reassertion method.
            // No request is issued during the temporary test reset.
            controller.getServiceWorkerWebSettings().setBlockNetworkLoads(false);
            Class<?> enforcement = Class.forName(ENFORCEMENT_CLASS, true, targetLoader);
            Method reassert = enforcement.getDeclaredMethod("enforceBlocked");
            reassert.setAccessible(true);
            check(Boolean.TRUE.equals(reassert.invoke(null)),
                    "Daymark Offline reassertion must report an installed enforcement layer");
            check(controller.getServiceWorkerWebSettings().getBlockNetworkLoads(),
                    "Offline reassertion must restore the process-wide Service Worker block");

            setPageNetworkBlocked(active, false);
            requestWorkerEgress(active);
            check(server.count("/worker-egress") == 0,
                    "worker egress must remain blocked after Online page access and Offline reassertion");

            // Service Workers outlive individual WebView instances. Destroy this tab and create
            // another WebView in the same app profile; the persisted worker must remain blocked.
            destroy(active);
            active = null;
            recreated = createWebView();
            load(recreated, server.url("/controlled"));
            awaitBoolean(recreated, "navigator.serviceWorker.controller !== null", WAIT_MS,
                    "the persisted worker must control a recreated WebView");
            requestCachedResponse(recreated);
            requestWorkerEgress(recreated);
            check(server.count("/worker-egress") == 0,
                    "a recreated tab must not regain Service Worker network access");
            check(server.count("/trigger") == 0,
                    "the recreated tab's worker must continue to intercept its trigger request");

            execute(recreated, "(async()=>{"
                    + "const registration=await navigator.serviceWorker.getRegistration();"
                    + "if(registration) await registration.unregister();"
                    + "await caches.delete('daymark-service-worker-runtime');"
                    + "document.title='cleanup-done';"
                    + "})();");
            awaitBoolean(recreated, "document.title === 'cleanup-done'", WAIT_MS,
                    "the instrumentation must clean up its Service Worker and cache");

            result.putString("service_worker_runtime", "passed");
            result.putInt("api_level", android.os.Build.VERSION.SDK_INT);
            result.putInt("assertions", assertions);
            marker("all Service Worker runtime phases passed; " + assertions + " assertions");
        } catch (Throwable failure) {
            resultCode = Activity.RESULT_CANCELED;
            result.putString("service_worker_runtime", "failed");
            result.putInt("api_level", android.os.Build.VERSION.SDK_INT);
            result.putInt("assertions", assertions);
            result.putString("failure", stackTrace(failure));
            Log.e(TAG, "runtime acceptance failed after " + assertions + " assertions", failure);
            marker("FAIL after " + assertions + " assertions: " + failure);
        } finally {
            if (recreated != null) destroyQuietly(recreated);
            if (active != null) destroyQuietly(active);
            if (seed != null) destroyQuietly(seed);
            if (server != null) {
                try { server.close(); }
                catch (IOException error) { Log.w(TAG, "could not close controlled server", error); }
            }
        }
        finish(resultCode, result);
    }

    private WebView createWebView() throws Exception {
        WebView[] result = new WebView[1];
        runOnMainSync(() -> {
            WebView view = new WebView(getTargetContext());
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
        runOnMainSync(() -> view.loadUrl(url));
        awaitBoolean(view, "document.readyState === 'complete'", WAIT_MS,
                "the controlled page must finish loading");
    }

    private void setPageNetworkBlocked(WebView view, boolean blocked) throws Exception {
        runOnMainSync(() -> view.getSettings().setBlockNetworkLoads(blocked));
    }

    private void execute(WebView view, String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        runOnMainSync(() -> view.evaluateJavascript(script, ignored -> completed.countDown()));
        if (!completed.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("WebView did not execute the acceptance script");
        }
    }

    private boolean evaluateBoolean(WebView view, String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch completed = new CountDownLatch(1);
        runOnMainSync(() -> view.evaluateJavascript(expression, result -> {
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

    private void requestCachedResponse(WebView view) throws Exception {
        execute(view, "document.title='cache-pending';"
                + "fetch('/cached').then(r=>r.text()).then(t=>document.title='cache-'+t)"
                + ".catch(()=>document.title='cache-error');");
        awaitBoolean(view, "document.title === 'cache-cached-ok'", WAIT_MS,
                "a previously cached Service Worker response must remain available");
    }

    private void destroy(WebView view) throws Exception {
        runOnMainSync(() -> {
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
        Log.i(TAG, message);
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
