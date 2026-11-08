// UC China Lite — background service worker (module).
// Responsibilities: toggle the static DNR ruleset, rebuild dynamic rules
// from the user's custom filter list, and proxy bounded HTTPS API requests.

import { REGISTRY } from "./features/registry.js";
import {
  requestAiCompletion,
  requestTranslation,
  validateAiEndpointConfig,
} from "./lib/network.mjs";

const SETTINGS_KEY = "settings";
const MYMEMORY_ORIGIN = "https://api.mymemory.translated.net";

/** Read settings, applying each feature's defaultEnabled when unset. */
async function getSettings() {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  settings.features = settings.features || {};
  for (const feature of Object.values(REGISTRY)) {
    if (settings.features[feature.id] === undefined) {
      settings.features[feature.id] = feature.defaultEnabled;
    }
  }
  return settings;
}

/** Turn the shipped adblock ruleset on/off. */
async function setAdblockEnabled(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enabled ? ["rules_1"] : [],
    disableRulesetIds: enabled ? [] : ["rules_1"],
  });
}

/** Convert one custom filter line into a DNR rule.
 *  Supported forms:
 *    ||domain.com^   -> block any request whose host ends with domain.com
 *    /path/segment/  -> block URLs containing the path segment
 *    anything else  -> treated as a plain substring of the URL
 */
function ruleFromLine(line, index) {
  const raw = line.trim();
  if (!raw || raw.startsWith("!") || raw.startsWith("[")) return null;
  const condition = { isUrlFilterCaseSensitive: false, resourceTypes: undefined };
  let urlFilter = raw;
  if (urlFilter.startsWith("||")) {
    urlFilter = urlFilter.slice(2);
    if (urlFilter.endsWith("^")) urlFilter = urlFilter.slice(0, -1);
    condition.requestDomains = [urlFilter];
    urlFilter = null;
  } else {
    if (urlFilter.startsWith("|")) urlFilter = urlFilter.slice(1);
    if (urlFilter.endsWith("^") || urlFilter.endsWith("|")) urlFilter = urlFilter.slice(0, -1);
    if (!urlFilter) return null;
    condition.urlFilter = urlFilter;
  }
  return {
    id: 1000 + index,
    priority: 1,
    action: { type: "block" },
    condition,
  };
}

/** Replace all dynamic rules built from the user's custom filter list. */
async function rebuildCustomRules(filterText) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  const rules = (filterText || "")
    .split("\n")
    .map(ruleFromLine)
    .filter(Boolean)
    .slice(0, 5000); // stay far below MV3 dynamic rule limits
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: rules,
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setAdblockEnabled(settings.features.adblock !== false);
  await rebuildCustomRules(settings.customFilters || "");
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  await setAdblockEnabled(settings.features.adblock !== false);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const settings = await getSettings();
    switch (message && message.type) {
      case "getSettings":
        sendResponse(settings);
        break;
      case "setFeature": {
        const { id, enabled } = message;
        if (!Object.prototype.hasOwnProperty.call(REGISTRY, id) || typeof enabled !== "boolean") {
          sendResponse({ error: "invalid-feature" });
          break;
        }
        settings.features[id] = enabled;
        await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
        if (id === "adblock") await setAdblockEnabled(enabled);
        if (id === "adblock" && enabled) await rebuildCustomRules(settings.customFilters || "");
        sendResponse({ ok: true });
        break;
      }
      case "saveOptions": {
        const options = message.options && typeof message.options === "object" && !Array.isArray(message.options)
          ? message.options : {};
        const nextSettings = { ...settings, ...options };
        const endpoint = validateAiEndpointConfig(
          nextSettings.apiUrl,
          nextSettings.apiOrigin,
          nextSettings.apiKey
        );
        if (!endpoint.ok) {
          sendResponse({ error: "invalid-api-endpoint", message: endpoint.error });
          break;
        }
        if (endpoint.origin) {
          const permission = await chrome.permissions.contains({
            origins: [endpoint.origin + "/*"],
          });
          if (!permission) {
            sendResponse({ error: "host-permission-required" });
            break;
          }
        }
        nextSettings.apiUrl = endpoint.endpoint;
        nextSettings.apiOrigin = endpoint.origin;
        await chrome.storage.sync.set({ [SETTINGS_KEY]: nextSettings });
        await rebuildCustomRules(nextSettings.customFilters || "");
        sendResponse({ ok: true });
        break;
      }
      case "aiRequest": {
        if (!settings.apiKey) {
          sendResponse({ error: "no-api-key" });
          break;
        }
        const endpoint = validateAiEndpointConfig(
          settings.apiUrl,
          settings.apiOrigin,
          settings.apiKey
        );
        if (!endpoint.ok || !endpoint.origin) {
          sendResponse({ error: "invalid-api-endpoint" });
          break;
        }
        const permission = await chrome.permissions.contains({
          origins: [endpoint.origin + "/*"],
        });
        if (!permission) {
          sendResponse({ error: "host-permission-required" });
          break;
        }
        try {
          const text = await requestAiCompletion(settings, message && message.prompt);
          sendResponse({ text });
        } catch (error) {
          const known = new Set([
            "prompt-too-large", "response-too-large", "invalid-api-endpoint",
            "no-api-key", "bad-response", "timeout",
          ]);
          sendResponse({ error: known.has(error && error.code) ? error.code : "request-failed" });
        }
        break;
      }
      case "translateRequest": {
        const permission = await chrome.permissions.contains({
          origins: [MYMEMORY_ORIGIN + "/*"],
        });
        if (!permission) {
          sendResponse({ error: "host-permission-required" });
          break;
        }
        try {
          const text = await requestTranslation(message && message.text, message && message.language);
          sendResponse({ text });
        } catch (error) {
          sendResponse({
            error: error && error.code === "text-too-large" ? "text-too-large" : "translation-failed",
          });
        }
        break;
      }
      default:
        sendResponse({ error: "unknown-message" });
    }
  })().catch(() => {
    // Never echo provider URLs, response bodies, or credentials into extension UI.
    sendResponse({ error: "request-failed" });
  });
  return true; // keep the message channel open for the async sendResponse
});
