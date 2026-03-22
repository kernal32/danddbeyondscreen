# Userscripts (Tampermonkey / Violentmonkey)

These scripts run on **all `https://www.dndbeyond.com/...` and `https://dndbeyond.com/...` pages** (`@match` + regex `@include` in the userscript header) and `POST` party data to **your** DM Screen backend using an **account API key** (not a per-table token).

## Security

- The API key can **replace your stored party upload** for that account. **Revoke** keys you do not need.
- Prefer **`GM_xmlhttpRequest`** (see template) so requests are not blocked by browser CORS.
- Only install scripts you trust; see also [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen) security note.

## Setup

1. **Register** on your DM Screen instance and open **Account** (`/account`).
2. Copy **Backend URL** (your site origin, e.g. `https://dnd.saltbushlabs.com`).
3. **Generate API key** — copy the full `dnd_…` secret once.
4. Install [ddb-party-ingest.user.js](./ddb-party-ingest.user.js) in Tampermonkey. Set `BACKEND_URL` and `DND_API_KEY`.
5. Add a matching `// @connect` line for your hostname if the app is not on `localhost`.
6. **v0.4+** hooks **`fetch`** / **`XMLHttpRequest`** on the real page (`@grant unsafeWindow`, `@run-at document-start`). **v0.4.1+** unwraps `{ success: true, data: { … } }`. **v0.5+** adds **Pull from page** (scrape `/characters/{id}` links). **v0.6+** matches [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen) / [ootz0rz](https://github.com/ootz0rz/DNDBeyond-DM-Screen): **`@require`** of DDB’s `vendors~characterTools` bundle, webpack bootstrap, **`makeGetAuthorizationHeaders`** (Cobalt), then **GET** `…/character/v5/character/{id}` and fall back to **`…/v4/character/{id}`**. Campaign cards: `.ddb-campaigns-character-card-footer-links-item-view` / `-edit`. If Pull breaks after a DDB deploy, update the `@require` URL to match the current bundle filename on `media.dndbeyond.com`. Then **Push now**.

### Auto pull→push (v0.7+)

While a **campaign** or **character** URL is open (`/campaigns/…` or `/characters/…`), enable **Auto pull→push** in the ingest panel (or Tampermonkey menu **toggle auto pull→push**). The script runs **pull then push** immediately, then every **3 minutes** (see `AUTO_SYNC_EVERY_MS` in the script). It does **not** run on other DDB pages (avoids pushing a stale queue). Choice is stored in `localStorage` (`ddbIngestAutoSync`).

On the **DM Console**, enable **Auto-load when account upload changes** so the live table picks up new pushes without clicking **Load upload** (polls about every **45s**).

### Debug panel

On **www.dndbeyond.com** (top frame only) a **DM Screen ingest** panel appears bottom-right (shadow DOM). If you do not see it: enable the script on the site, hard-refresh, menu **show / hide debug panel**. Console: `[ddb-party-ingest]`.

### Debugging when Pull or Push misbehaves

If **nothing** runs (no panel, queue always empty): confirm **Tampermonkey is enabled** for the tab and that scripts are **not** disabled for `dndbeyond.com` (extension icon / per-site toggle).

**Do not paste your DM Screen API key into chats** — say only whether `apiKeyLooksConfigured` is true in the snapshot below (revoke keys if you already exposed one).

1. **Update** to **v0.7.0+** of `ddb-party-ingest.user.js` in Tampermonkey (save, hard-refresh DDB).
2. **Verbose logging** (optional): open DevTools on the DDB tab → **Console** (top frame), run:
   ```javascript
   localStorage.setItem('ddbIngestDebug', '1');
   location.reload();
   ```
3. Reproduce: open your **campaign → Characters** (or a character sheet), click **Pull from page**, then **Debug snapshot** (panel button) or Tampermonkey menu **print debug snapshot**.
4. In the same console, you can also run:
   ```javascript
   __ddbPartyIngestDebug.snapshot().then(console.log);
   ```
5. **Interpret `snapshot()`** (no secrets in output) — **yes, pasting the whole JSON is correct** for debugging:
   - **`scrapedCharacterIds`**: empty → DOM selectors did not find links; try the exact campaign “active party” view or a `/characters/{id}` URL.
   - **`sandboxJsonpDDBCTLength`**: `0` → `@require` bundle may have failed to load (blocked, 404, or wrong hash); fix the `// @require` URL in the script header to match `media.dndbeyond.com` (compare [TeaWithLucas script](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/blob/master/ddb-dm-screen.user.js)).
   - **`hasWebpackAuthShim`**: `false` → Cobalt bootstrap did not attach; same as above or a webpack/module error (check console for red errors).
   - **`cobaltHeaderKeys`**: empty → no Cobalt headers; Pull will usually 401.
   - **`queueLength`**: after a successful Pull, should be > 0 before **Push now**.
   - **`queueSummary`**: portrait hints (`hasAvatarUrl`, `avatarUrlPreview`).
   - **`queueCharacterShape`**: **`topLevelKeys`** in the dozens/hundreds = full sheet; ~20 or less = slim API (often no `avatarUrl`). **`hasInventoryArray`** should be true for a full sheet.
   - **`lastPullByCharacterId`**: which endpoint won on the last **Pull** (`legacy`, `legacy-plural`, `v5`, `v4`). If you only see **`v5`/`v4`** and keys stay low, legacy JSON may be 404/HTML — check Network for **`/character/…/json`** and **`/characters/…/json`**.
   - **v0.6.7+** tries both legacy paths, then v5/v4. **v0.6.5+** unwrap prefers nested **`data.character`**; **v0.6.4+** merge reduces slim overwrites.
6. **Network tab**: filter `character-service` — open a character sheet and confirm a `v5` or `v4` character request returns **200** in the browser without the userscript; if the site itself gets 401, log in again or check DDB account access to that character.
7. Turn verbose off: `localStorage.removeItem('ddbIngestDebug'); location.reload();`

### curl test (no Tampermonkey)

To verify the API and API key, POST JSON with `format: ddb_characters` and at least one DDB-shaped character object (see `apps/backend/src/__fixtures__/minimal-character.json` in this repo).

## Using data in a live table

Tampermonkey updates the **account stash** only. To show it on the TV/table, open a **DM session**, stay **signed in** in the same browser, and click **Load upload into this table** on the DM console.

## API reference

- `POST {BACKEND}/api/ingest/party`
- Header: `Authorization: Bearer <API key>` (must start with `dnd_`)
- Header: `Content-Type: application/json`
- Body: see backend `registerApiRoutes` in `apps/backend/src/routes/api.ts` (`format` + `party` or `characters`).
- **Merge vs replace (account stash):** If the JSON has **exactly one** character, the server **merges** into the previous stash by character id (other characters stay). If it has **two or more**, the stash is **replaced** with that payload. Optional flags: `mergeParty: true` (always merge by id) or `replaceParty: true` (always wipe and replace). For the same id, the **newer ingest** wins (server timestamp per batch).

Requires **`AUTH_SECRET`** (32+ chars) on the server so accounts exist.

Rate limit: **45 requests per minute** per key (in-memory on the Node process).
