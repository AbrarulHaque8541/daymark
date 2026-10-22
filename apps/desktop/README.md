# Daymark Browser (desktop)

Daymark ka cross-platform mini browser — ek hi codebase jo **Windows, Linux aur macOS** pe
Chromium engine ke saath identical chalta hai.

## Kaise chalayein (kisi bhi machine pe)

```bash
git clone https://github.com/AbrarulHaque8541/daymark.git
cd daymark/apps/desktop
npm install
npm start      # browser khul jayega
npm test      # unit tests (Windows/Linux/macOS sab pe hote hain)
```

Koi bhi agent ya insaan — chahe uske paas Windows ho ya Linux — repo clone karke seedha
test/chaal sakta hai. CI bhi teeno OS pe ye test automatic chalata hai
(`desktop-browser-ci` workflow).

## Features (v0.1)

- Tabs (Ctrl+T naya, Ctrl+W band, click se switch)
- Address bar with auto https:// upgrade (Ctrl+L)
- **HTTPS-only policy**: plain `http://` requests cancel — sirf localhost exception
- Tracker/ad domain blocking (starter list, expandable)
- Privacy headers: `DNT: 1`, `Sec-GPC: 1`
- Find in page (Ctrl+F)
- Downloads OS ke Downloads folder mein
- `target=_blank` / `window.open` naye tab mein khulta hai

## Design notes

- URL policy pure logic mein hai (`lib/rules.js`) — koi Electron dependency nahi,
  isliye tests har OS pe bina display ke chal jaate hain.
- Renderer aur main process isolated hain (contextIsolation on, nodeIntegration off).
- Engine scratch se nahi likha gaya — Brave/Edge bhi nahi likhte. Hum Chromium
  (Electron) use karte hain taaki har desktop pe behaviour 100% same rahe.

Roadmap aur platform matrix: `docs/DESKTOP_BROWSER_PLAN.md` dekhein.
