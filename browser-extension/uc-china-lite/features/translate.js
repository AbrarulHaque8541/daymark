import "./response-body.js";

const responseBody = globalThis.DaymarkExtensionResponseBody;

// Quick Translate: floating button next to a text selection that calls
// the free MyMemory API; falls back to a Google Translate tab on error.

const BTN_ID = "uccl-translate-btn";
const MYMEMORY = "https://api.mymemory.translated.net/get";

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
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    btn.style.left = Math.max(4, rect.right + 4) + "px";
    btn.style.top = Math.max(4, rect.top - 32) + "px";
    btn.style.display = "block";
  });
  btn.onclick = async () => {
    const text = selectedText();
    if (!text || text.length > 500) return;
    const lang = await targetLanguage();
    const url = MYMEMORY + "?q=" + encodeURIComponent(text) + "&langpair=en|" + lang;
    try {
      const data = await responseBody.fetchJson(url, {}, {
        timeoutMs: 8000,
        maxBytes: 64 * 1024,
        maxChars: 64 * 1024,
        tooLargeMessage: "Translation response exceeded the safe size limit.",
        timeoutMessage: "Translation request timed out.",
        malformedJsonMessage: "Translation provider returned invalid JSON."
      });
      const translated =
        data && data.responseData && data.responseData.translatedText;
      if (translated) {
        alert(text + "\n→ " + translated);
        return;
      }
    } catch (e) { /* fall through to Google Translate */ }
    window.open("https://translate.google.com/?sl=auto&tl=" + lang + "&text=" + encodeURIComponent(text) + "&op=translate", "_blank");
  };
  document.documentElement.appendChild(btn);
}

function onDisable() {
  document.getElementById(BTN_ID)?.remove();
}

export { onEnable, onDisable };
export default { id: "translate", name: "Quick Translate", icon: "🌐", description: "Translate selected text (MyMemory / Google fallback).", defaultEnabled: false, onEnable, onDisable };
