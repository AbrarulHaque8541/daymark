// Quick Translate: send a small, user-selected snippet to the background worker.
// The worker requests only the MyMemory host permission and bounds the HTTPS response.

const BTN_ID = "uccl-translate-btn";

async function targetLanguage() {
  const stored = await chrome.storage.sync.get("settings");
  return (stored.settings && stored.settings.language) || "hi";
}

function selectedText() {
  const sel = window.getSelection && window.getSelection();
  return sel ? String(sel).trim() : "";
}

function onEnable() {
  if (document.getElementById(BTN_ID)) return;
  const btn = document.createElement("div");
  btn.id = BTN_ID;
  btn.textContent = "译";
  btn.title = "Quick translate selection";
  btn.setAttribute("style", [
    "position:absolute", "z-index:2147483646", "padding:4px 8px",
    "background:#0b7285", "color:#fff", "border-radius:6px",
    "font:13px sans-serif", "cursor:pointer", "display:none", "user-select:none",
  ].join(";"));
  document.addEventListener("selectionchange", () => {
    const text = selectedText();
    if (!text || text.length > 500) { btn.style.display = "none"; return; }
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect() : null;
    if (!rect) { btn.style.display = "none"; return; }
    btn.style.left = Math.max(4, rect.right + 4) + "px";
    btn.style.top = Math.max(4, rect.top - 32) + "px";
    btn.style.display = "block";
  });
  btn.onclick = async (event) => {
    if (!event || event.isTrusted !== true) return;
    const text = selectedText();
    if (!text || text.length > 500) return;
    let lang = "hi";
    try { lang = await targetLanguage(); } catch (error) { /* use the safe default */ }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "translateRequest",
        text,
        language: lang,
      });
      if (response && response.text) {
        alert(text + "\n→ " + response.text);
        return;
      }
    } catch (error) {
      // Fall back to the explicit browser translation page below.
    }
    window.open("https://translate.google.com/?sl=auto&tl=" + encodeURIComponent(lang)
      + "&text=" + encodeURIComponent(text) + "&op=translate", "_blank");
  };
  document.documentElement.appendChild(btn);
}

function onDisable() {
  document.getElementById(BTN_ID)?.remove();
}

export { onEnable, onDisable };
export default { id: "translate", name: "Quick Translate", icon: "🌐", description: "Translate selected text (MyMemory / Google fallback).", defaultEnabled: false, onEnable, onDisable };
