# Chrome extension: D&D Beyond → DM Screen cookie sync

**Deprecated.** The DM Screen no longer accepts per-session browser cookies from this extension. Use **Tampermonkey + account API key** (`userscripts/`) to push party JSON, or set **`DDB_COOKIE`** only on the server for `Refresh party`.

---

Legacy description: automates sending your **logged-in** D&D Beyond cookies to the local backend so you do not have to copy the `Cookie` header from DevTools.

## Install (developer / unpacked)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder (`extensions/dndbeyond-cookie-sync`).
3. Pin the extension if you like.

## Use

1. Start the DM Screen **backend** (default `http://127.0.0.1:3001`) and create a session in the web UI.
2. Copy **Session ID** and **DM token** from the create-session response, **Settings** (`/dm/settings`), or the DM console (store them in the extension popup).
3. Log in to [dndbeyond.com](https://www.dndbeyond.com) in **Chrome** (same profile as the extension).
4. Open the extension popup → **Save settings** → **Send cookies to DM Screen**.
5. In the DM console, set your seed character ID and click **Refresh party** (cookie is configured in **Settings** if you did not use this extension).

## Security

- The extension only allows posting to `http://127.0.0.1` or `http://localhost` (not arbitrary URLs).
- Your **DM token** is stored in `chrome.storage.local` on your machine.
- Session cookies are as sensitive as your D&D Beyond login; do not use on shared PCs.

## Firefox

This build targets Chromium MV3. A Firefox port would use the same API shape with `browser.cookies` and `manifest.json` adjustments.
