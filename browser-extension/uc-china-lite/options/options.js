// Options page: saves API key / language / custom filters into storage.sync.
// The background worker validates the same-origin HTTPS endpoint before saving.

import { validateAiEndpointConfig } from "../lib/network.mjs";

const $ = (id) => document.getElementById(id);

const stored = await chrome.storage.sync.get("settings");
const settings = stored.settings || {};

$("api-url").value = settings.apiUrl || "";
$("api-origin").value = settings.apiOrigin || "";
$("api-key").value = settings.apiKey || "";
$("model").value = settings.model || "";
$("language").value = settings.language || "hi";
$("custom-filters").value = settings.customFilters || "";

$("save").onclick = async () => {
  const apiUrl = $("api-url").value.trim();
  let apiOrigin = $("api-origin").value.trim().replace(/\/$/, "");
  const apiKey = $("api-key").value.trim();
  if (apiUrl && !apiOrigin) {
    try {
      apiOrigin = new URL(apiUrl).origin;
      $("api-origin").value = apiOrigin;
    } catch (error) {
      // The shared validator below presents the user-facing error.
    }
  }
  const endpoint = validateAiEndpointConfig(apiUrl, apiOrigin, apiKey);
  if (!endpoint.ok) {
    $("status").textContent = endpoint.error;
    return;
  }
  if (endpoint.origin) {
    let granted = false;
    try {
      // Called directly from the Save click so Chromium can honor the user gesture.
      granted = await chrome.permissions.request({ origins: [endpoint.origin + "/*"] });
    } catch (error) {
      granted = false;
    }
    if (!granted) {
      $("status").textContent = "API host permission was not granted; settings were not saved.";
      return;
    }
  }
  const options = {
    apiUrl: endpoint.endpoint,
    apiOrigin: endpoint.origin,
    apiKey,
    model: $("model").value.trim(),
    language: $("language").value.trim() || "hi",
    customFilters: $("custom-filters").value,
  };
  const response = await chrome.runtime.sendMessage({ type: "saveOptions", options });
  if (!response || response.error) {
    $("status").textContent = response && response.error === "host-permission-required"
      ? "Grant the API host permission, then save again."
      : (response && response.message || "Settings could not be saved.");
    return;
  }
  $("status").textContent = "Saved ✓";
  setTimeout(() => ($("status").textContent = ""), 2000);
};
