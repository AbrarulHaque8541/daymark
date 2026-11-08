// AI Assistant button: a small floating button appears when the user
// selects text. Clicking it opens Explain / Summarize / Translate.
// Search fallback is used only when no API key is configured; a failed
// configured request never forwards selected text to another provider.

const BTN_ID = "uccl-ai-btn";
const PANEL_ID = "uccl-ai-panel";
const MAX_SELECTED_TEXT_CHARS = 11800;

function selectedText() {
  const sel = window.getSelection && window.getSelection();
  return sel ? String(sel).trim() : "";
}

function buildButton() {
  const btn = document.createElement("div");
  btn.id = BTN_ID;
  btn.textContent = "✨";
  btn.title = "UC China Lite AI";
  btn.setAttribute("style", [
    "position:absolute", "z-index:2147483646", "width:34px", "height:34px",
    "line-height:34px", "text-align:center", "border-radius:50%",
    "background:#4f46e5", "color:#fff", "font-size:16px", "cursor:pointer",
    "box-shadow:0 2px 6px rgba(0,0,0,.3)", "user-select:none", "display:none",
  ].join(";"));
  return btn;
}

function buildPanel(text) {
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("style", [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483646",
    "width:320px", "max-height:50vh", "overflow:auto", "padding:12px",
    "background:#fff", "color:#111", "border:1px solid #ddd", "border-radius:10px",
    "box-shadow:0 6px 24px rgba(0,0,0,.2)", "font:14px/1.5 sans-serif",
  ].join(";"));
  const row = document.createElement("div");
  row.setAttribute("style", "display:flex;gap:6px;margin-bottom:8px");
  for (const action of ["Explain", "Summarize", "Translate"]) {
    const b = document.createElement("button");
    b.textContent = action;
    b.setAttribute("style", "flex:1;border:1px solid #ccc;background:#f5f5f5;border-radius:6px;padding:6px;font:13px sans-serif;cursor:pointer");
    b.onclick = (event) => {
      if (!event || event.isTrusted !== true) return;
      runAction(action, text);
    };
    row.appendChild(b);
  }
  const snippet = document.createElement("div");
  snippet.textContent = text.length > 120 ? text.slice(0, 120) + "…" : text;
  snippet.setAttribute("style", "color:#666;font-size:12px");
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("style", "position:absolute;top:4px;right:6px;border:0;background:none;cursor:pointer;color:#999");
  close.onclick = () => panel.remove();
  panel.appendChild(close);
  panel.appendChild(snippet);
  panel.appendChild(row);
  const out = document.createElement("div");
  out.id = PANEL_ID + "-out";
  panel.appendChild(out);
  return panel;
}

async function runAction(action, text) {
  const out = document.getElementById(PANEL_ID + "-out");
  if (text.length > MAX_SELECTED_TEXT_CHARS) {
    if (out) out.textContent = "Select a shorter passage (maximum 11,800 characters).";
    return;
  }
  if (out) out.textContent = "…";
  const prompt = action === "Explain"
    ? "Explain this clearly:\n\n" + text
    : action === "Summarize"
      ? "Summarize this in a few bullet points:\n\n" + text
      : "Translate this to the user's preferred language:\n\n" + text;
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "aiRequest", prompt });
  } catch (error) {
    response = { error: "request-failed" };
  }
  if (response && response.text) {
    if (out) out.textContent = response.text;
    return;
  }
  const code = response && response.error;
  if (code === "no-api-key") {
    if (out) out.textContent = "No API key configured. Opening a search tab.";
    window.open("https://www.google.com/search?q=" + encodeURIComponent(prompt), "_blank");
    return;
  }
  const messages = {
    "invalid-api-endpoint": "Configure a matching HTTPS API endpoint and origin in extension options.",
    "host-permission-required": "Grant the configured API host permission in extension options.",
    "prompt-too-large": "Select a shorter passage (maximum 12,000 characters).",
    "response-too-large": "The AI response exceeded the safety limit.",
    timeout: "The AI request timed out. Your selection was not sent to a search provider.",
  };
  if (out) out.textContent = messages[code] || "AI request failed. Your selection was not sent to a search provider.";
}

function onEnable() {
  if (document.getElementById(BTN_ID)) return;
  const btn = buildButton();
  document.addEventListener("selectionchange", () => {
    const text = selectedText();
    if (!text) { btn.style.display = "none"; return; }
    const selection = window.getSelection();
    const rect = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect() : null;
    if (rect && rect.width + rect.height > 0) {
      btn.style.left = Math.max(4, rect.left) + "px";
      btn.style.top = Math.max(4, rect.top - 40) + "px";
      btn.style.display = "block";
    } else {
      btn.style.display = "none";
    }
  });
  btn.onclick = (event) => {
    if (!event || event.isTrusted !== true) return;
    const text = selectedText();
    if (!text) return;
    document.getElementById(PANEL_ID)?.remove();
    document.documentElement.appendChild(buildPanel(text));
  };
  document.documentElement.appendChild(btn);
}

function onDisable() {
  document.getElementById(BTN_ID)?.remove();
  document.getElementById(PANEL_ID)?.remove();
}

export { onEnable, onDisable };
export default { id: "aibutton", name: "AI Assistant", icon: "✨", description: "Floating AI button for selected text.", defaultEnabled: false, onEnable, onDisable };
