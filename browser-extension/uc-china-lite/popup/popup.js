// Popup: auto-builds the toggle list from the feature registry.
// Adding a feature module requires zero changes here.

import { REGISTRY, ORDER, getSettings } from "../features/registry.js";

const TRANSLATE_ORIGIN = "https://api.mymemory.translated.net";

const list = document.getElementById("features");
const settings = await getSettings();

// Persist merged defaults so loader/background see explicit values.
await chrome.storage.sync.set({ settings });

for (const id of ORDER) {
  const feature = REGISTRY[id];
  const row = document.createElement("div");
  row.className = "feature";
  const meta = document.createElement("div");
  meta.className = "meta";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = feature.icon + " " + feature.name;
  const desc = document.createElement("div");
  desc.className = "desc";
  desc.textContent = feature.description;
  meta.appendChild(name);
  meta.appendChild(desc);

  const label = document.createElement("label");
  label.className = "switch";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.dataset.id = id;
  toggle.checked = !!settings.features[id];
  toggle.setAttribute("aria-label", feature.name);
  const slider = document.createElement("span");
  slider.className = "slider";
  label.appendChild(toggle);
  label.appendChild(slider);

  toggle.onchange = async () => {
    const enabled = toggle.checked;
    if (id === "translate" && enabled) {
      let granted = false;
      try {
        // This request is made in the popup's direct user-gesture handler.
        granted = await chrome.permissions.request({ origins: [TRANSLATE_ORIGIN + "/*"] });
      } catch (error) {
        granted = false;
      }
      if (!granted) {
        toggle.checked = false;
        settings.features[id] = false;
        return;
      }
    }
    settings.features[id] = enabled;
    await chrome.storage.sync.set({ settings });
    await chrome.runtime.sendMessage({ type: "setFeature", id, enabled });
  };

  row.appendChild(meta);
  row.appendChild(label);
  list.appendChild(row);
}

document.getElementById("open-options").onclick = () => {
  chrome.runtime.openOptionsPage();
};
