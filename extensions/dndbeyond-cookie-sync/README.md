# Chrome extension: D&D Beyond campaign poller (API key upload)

This extension polls a D&D Beyond campaign directly from Chrome background context and uploads the party snapshot to your account stash using your website-generated API key.

## What it does

- Reads your logged-in D&D Beyond cookies from Chrome.
- Resolves character IDs from the configured campaign.
- Fetches each character JSON payload.
- Uploads to your backend via `POST /api/ingest/party` with:
  - `Authorization: Bearer dnd_...`
  - body `{ format: "ddb_characters", replaceParty: true, characters: [...] }`

This runs without keeping a DDB tab open.

## Install (developer / unpacked)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. Click **Load unpacked** and select `extensions/dndbeyond-cookie-sync`.
3. Pin the extension.

## Setup

1. Start backend (default `http://127.0.0.1:3001`).
2. In your app account page, generate an API key (`dnd_...`).
3. Sign in to [dndbeyond.com](https://www.dndbeyond.com) in the same Chrome profile.
4. Open extension popup and fill:
   - Backend is fixed to `https://dnd.saltbushlabs.com`
   - Campaign ID or campaign URL
   - API key
   - Poll interval (ms)
5. Enable polling and click **Save settings**.
6. Optional: click **Refresh now** to force an immediate cycle.

## DM session usage

Uploads go to your account stash, not directly into a live table.  
In DM console, use your existing **Load upload** / auto-load upload workflow to bring the latest stash into the active table.

## Test checklist

1. Save settings with valid API key and campaign URL.
2. Click **Refresh now** and verify success status.
3. Confirm backend receives `/api/ingest/party` with `format: ddb_characters`.
4. Turn polling on, close popup, wait one interval, confirm another upload occurs.
5. Disable polling and verify uploads stop.
6. Use an invalid API key and verify 401 appears in popup status.
7. Log out from DDB and verify error reports missing/invalid auth cookies.

## Security notes

- Backend is fixed to `https://dnd.saltbushlabs.com`.
- API key is stored in `chrome.storage.local` on your machine.
- DDB cookies are read at poll time and are not persisted in extension storage.
- Treat API keys and cookies as secrets.

## Chrome Web Store

For a complete submission checklist and required policy/listing artifacts, see `CHROME_WEB_STORE_SUBMISSION.md` in this folder.

## Debug / troubleshooting

1. Open the extension popup and click the **⚙** button to open **Settings**.
2. Enable **Verbose debug logging**.
3. Go to `chrome://extensions` → **DDB DM Screen — campaign poller** → **Service worker** → **Inspect**.
4. In the console, filter or search for `[ddb-campaign-sync]`.
5. Run **Sync now** from the popup — you will see poll milestones and each HTTP endpoint trace line.
6. In the popup, expand Settings to copy a **debug snapshot** (JSON) after a sync for bug reports.

- **v2.0.12:** Debug panel shows an **activity log** (same lines as the service worker: poll milestones + HTTP rows) after each sync; stored in `telemetry.lastDebugFeed`. Buttons: **Copy full debug JSON** (includes `activityLog` array) and **Copy activity log** (plain text).
- **v2.0.13:** Character-service merge **always prefers v5** for `conditions`, `temporaryHitPoints` / `tempHitPoints`, `currentHitPoints`, and `removedHitPoints` (avoids stale legacy arrays when v5 is shorter or “slim” heuristics skipped an overlay). Verbose mode adds **`characterMerge`** rows to the activity log: `mergeKind` (e.g. `parallel-legacy+v5`, `legacy-only-v5-failed-or-absent`), `conditionsCount`, `tempHp` — use these to confirm whether ingested JSON actually contains conditions (if `conditionsCount` is `0` or `absent` while the DDB sheet shows a CONDITIONS block, legacy JSON often omits them and **character-service v5** may be 403 until sharing/access is fixed).
- **v2.0.14:** **Content script** on DDB character sheet URLs (`/characters/{id}`, `/character/{id}` — not `/json`) scrapes active **CONDITIONS** from the page (heuristic selectors + debounced updates) and stores labels for **15 minutes** in extension storage. Each **Sync now** / poll **merges** those labels into the matching character payload before upload (toggle under ⚙ **Scrape CONDITIONS from open character sheets**, on by default). With **verbose debug**, the activity log shows **`domScrapeReport`** (tab reported labels) and **`domScrapeMerge`** (applied on upload). **Reload DDB tabs** after updating the extension so the script injects. If DDB changes the DOM, update [`content-ddb-conditions.js`](content-ddb-conditions.js).
- **v2.0.15:** Scraper walks **open shadow roots**, runs in **all frames**, retries at **0.4s–20s** for late SPA paint, matches **PHB condition names** near a **“Conditions”** heading, and adds broader **class / data-testid** hints. Debug log **`domScrapeHint`** explains when no tab cache matched the party (open sheets / reload tabs).
- **v2.0.16:** **Inspiration** merge uses character-service `inspiration` when present (including **`false`**) and syncs `hasInspiration` / `isInspired` / `heroicInspiration` so cleared inspiration is not stuck on by legacy `/json` + old OR-merge. Backend: explicit **`inspiration: false|0`** overrides conflicting alias fields.
- **v2.0.17:** **Spell slots:** merged `used` is `min(live, legacy)` when live &lt; legacy (rest/sync), else `max` — fixes legacy `/json` lagging high `used` after a rest. **Temp HP:** slim v5 no longer overwrites positive legacy `temporaryHitPoints` / `tempHitPoints` with `0` unless the v5 body looks like a full sheet (key count / size / inventory heuristics). Removed always-on authoritative overlay for current/removed HP (same primitive path as temp).
- **v2.0.32:** Name lift also treats DDB’s **`Username's Character`** / **`Username\u2019s Character`** placeholder as non-final and prefers **`socialName`** / **`nickname`** (matches backend) so renamed PCs are not stuck on the default label.
- **v2.0.31:** After legacy+v5 merge (and right before upload), **`liftMergedCharacterNameFromNested`** copies the live display name from **`character.name`** / **`characterSheet.name`** (etc.) onto top-level **`name`** when DDB leaves a stale legacy label — matches backend **`resolveDdbCharacterName`**. Reload DDB tabs after update.
- **v2.0.30:** **Lay on Hands:** `actionRowLimitedUseDedupeKey` / server `classResourceDedupeKey` now bucket a standalone **`Healing Pool`** action title with **Lay on Hands** (DDB often omits “Lay on Hands” on the slim row), so merge uses **max pool** (e.g. 25) instead of showing only the 5-pip UI row.
- **v2.0.29:** **Spell row as separate chips:** if a character’s scraped labels include both **`Heal`** and **`Damage`** (whole-label match), the merge drops those plus **numeric** and **dash placeholder** tokens — fixes TV cards showing four gray tags. Server: `stripGroupedDdbSpellTableScrapeNoise`.
- **v2.0.28:** **Spell-row noise (tighter):** same as v2.0.27 plus **dash variants** (en/em/minus runs), **numeric / dice** last columns (`Heal, Damage, 13` without `--`), empty/`…` placeholders. Matches server-side filter.
- **v2.0.27:** **DOM conditions:** filters spell/cantrip **table rows** scraped as text (e.g. **`Heal, Damage, 13, --`**) — same heuristic as the server’s `isDdbSpellDamageTableRowNoise` (comma-separated, a **`Damage`** segment, last segment **`--`**). Stops false “conditions” on ingest when class-hint scraping grabs the spells block.
- **v2.0.26:** **Temp HP reconcile:** same “omit = 0” rule as v2.0.25, but detection is broader — treats **`removedHitPoints`** (not only `currentHitPoints`) as an HP signal and accepts smaller v5 bodies (**≥25** keys, **≥4k** JSON, non-empty **`actions`**, **`spellSlots`**, or **`classes`**) so stale legacy temp is cleared when v5 omits temp keys.
- **v2.0.25:** **Temp HP:** when character-service JSON **omits** `temporaryHitPoints`/`tempHitPoints` for 0, legacy `/json` no longer keeps a stale positive temp — post-merge clears temp if live is a full-enough snapshot or includes `currentHitPoints`.
- **v2.0.24:** **Temp HP:** removed legacy-only preservation when v5 sends `0` (stale `/json` could keep +10 after temp expired). **Lay on Hands:** live `limitedUse` merge now buckets all **“lay on hands”** display names like the server (Healing Pool + main row) so `min(used)` / `max(pool)` applies. **`used`/`max` aliases** on `limitedUse` objects.
- **v2.0.22:** Server **`extractClassResources`** merges duplicate feature names with **`min(numberUsed)`** (DDB often ships two Lay on Hands rows; the first was stale). Live `limitedUse` maps in the extension **combine** duplicate stable keys / names the same way before patching legacy.
- **v2.0.21:** `limitedUse` patch also matches **`entityTypeId`+`componentId`** and **display name** (e.g. “Lay on Hands”) when ids differ between `/json` and v5. Server **`extractSpellSlots`** now takes the **minimum** `used` across duplicate slot rows and prefers **lower** `used` when merging per-level rows (stale “higher used” no longer wins).
- **v2.0.20:** When v5 looks “slim” vs legacy we **keep** the big legacy `actions.*` arrays but now **patch `limitedUse` from v5** row-by-row (matched by `id` / `componentId` / `definition.id`). Fixes stale **Lay on Hands**, Ki, Channel Divinity, etc., when the old merge skipped replacing `actions.class` entirely.
- **v2.0.19:** When character-service **v5** is missing (403/absent), the extension waits **~750ms** and fetches legacy `/json` again, then merges the two snapshots with the same rules as legacy+v5 (fresher spell slots / `actions` usage). Debug **Activity** lines for **`characterMerge`** now include **`slotsUsedΣ`** and **`limitedUse`** counts.
- **v2.0.18:** DOM scrape + server **`extractConditions`** ignore DDB UI strings such as **“Add Active Conditions”** (empty-state CTA), so they are not stored as real conditions.

### Conditions not appearing on DM Screen

D&D Beyond’s **sheet UI** can show conditions from the **client rules engine** while **legacy `/character/{id}/json`** leaves `conditions: []`. The poller merges **legacy + character-service v5** when both succeed; if **v5 returns 403** (character not shared for API access), only legacy is uploaded — there is nothing to normalize into the conditions column.

1. Enable **Verbose debug logging**, sync, and check **`characterMerge`** lines: `legacy-only-v5-failed-or-absent` with `conditionsCount: 0` matches that situation.
2. Fix **v5 access** (character/campaign sharing, correct DDB account in Chrome) so `parallel-legacy+v5` appears and `conditionsCount` reflects the service payload when DDB exposes it.
3. **Manual workaround:** In a live DM session, the app supports setting conditions out-of-band (WebSocket **`party:setConditions`** or the REST patch used by the DM tools) so the table stays accurate when JSON never includes conditions.
