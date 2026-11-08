# UC China Lite — Chromium extension (Manifest V3)

Lightweight, modular client-side features for Chrome / Edge / Brave:
adblock (declarativeNetRequest), reader mode, no-image mode, smart dark mode,
AI assistant button (own API key, OpenAI-compatible), quick translate,
optional speed-dial new tab and mouse gestures.

- Pure vanilla JS, no frameworks, no CDNs, no telemetry. Total size ~60 KB.
- One content loader lazily imports only the feature modules you enable.
- Settings live in `chrome.storage.sync`.

## Install (Chrome / Edge / Brave)

1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn **Developer mode** ON (top-right toggle).
3. Click **Load unpacked**.
4. Select this `uc-china-lite` folder (the one containing `manifest.json`).

## Network and data safety

- The OpenAI-compatible API endpoint and permission origin must both use HTTPS and match exactly. API requests do not follow redirects, omit ambient browser credentials, and require the exact optional host permission.
- AI selections are limited to 12,000 prompt characters. Provider responses are streamed with a 256 KiB byte cap and a 12,000-character display cap; requests time out rather than waiting indefinitely.
- Quick Translate sends the selected snippet through the extension background worker to MyMemory only after the user enables the feature and grants that exact host permission. Its response is capped at 64 KiB. If the request cannot complete, the user-initiated Translate action can open Google Translate as a fallback.
- The API key is stored in `chrome.storage.sync`, which may sync it across signed-in browser profiles. Treat it as sensitive and do not configure it in a shared browser profile.
- If no AI API key is configured, the documented AI action opens a Google Search tab. If a configured AI request fails, the selected text is not silently forwarded to another provider.

## Adding a new feature later

1. Create `features/yourfeature.js`:

   export default { id: "yourfeature", name: "Your Feature", icon: "⭐",
                    description: "What it does.", defaultEnabled: false,
                    onEnable() { /* DOM work here */ }, onDisable() { } };

2. Register it in `features/registry.js` (one import + one REGISTRY entry + ORDER slot).
3. If it should run on pages, add its filename to `contentFeatures` in
   `content/loader.js`.

That's the whole pattern — popup UI, options and storage all follow the
registry automatically.
