## Lessons

### Mistake

On Windows, `npm` lifecycle scripts that invoke workspace `.cmd` shims (e.g. `tsc`, `vitest`) failed when the repo path contained `&` (`d:\dev\d&d`), producing broken paths like `d\node_modules\.bin\`.

### Root cause

`cmd.exe` treats `&` as a command separator; generated shim paths were not safely quoted for such paths.

### Preventative rule

For Windows-sensitive repos, prefer **`node ../../node_modules/<pkg>/...`** in workspace `package.json` scripts instead of relying on `.bin` shims.

### Mistake

D&D Beyond party sync stayed at **404** after the user pasted a “cookie” in the DM console; the string looked like **Google** SSO cookies (`HSID`, `SAPISID`, `NID`, etc.), not the **`www.dndbeyond.com/character/{id}/json`** request.

### Root cause

DevTools **Network** lists many requests; copying **Cookie** from the wrong row (often Google) does not authenticate DDB’s legacy JSON or character-service calls.

### Preventative rule

Document and surface errors that distinguish **Google-heavy** pastes from **dndbeyond.com** `json` request cookies; prefer the extension or the exact **`/character/{id}/json`** row.

### Mistake

User saw `{"error":"Unauthorized"}` when saving the D&D Beyond cookie; **Socket.IO still showed “Connected.”**

### Root cause

**401** means the **DM Bearer token / sessionId** are not in the server’s in-memory store (e.g. backend restarted). The WebSocket connection succeeds independently; subscribe may fail without a prominent UI signal.

### Preventative rule

Explain **in-memory sessions** in README and DM console; on **401** from session-scoped APIs, show a clear “start a new session” path and avoid raw JSON error blobs for `error` fields.

### Mistake

Tampermonkey **Pull** used `fetch` + `credentials: 'include'` only; **character-service** returned **401** and the queue stayed empty, while community DM screens still worked.

### Root cause

D&D Beyond expects **Cobalt / Bearer** headers from `makeGetAuthorizationHeaders` (bundled in `vendors~characterTools`), not cookies alone — same pattern as [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen).

### Preventative rule

For ingest/pull against character-service, **`@require`** the current DDB vendors bundle, replay `jsonpDDBCT`, and merge those headers into GETs; keep **v5 + v4** URL fallbacks and document updating the bundle hash after DDB deploys.

### Mistake

Party card widget settings appeared to **crash** the UI (or break checkboxes) when applying or syncing options.

### Root cause

`{ ...defaults, ...partial }` **overwrites with `undefined`** when `partial` contains explicit undefined values, producing invalid booleans for React `checked` and for `PartyCardDisplayOptions`. Missing `tableLayout.widgets` or `party.characters` on bad payloads also caused runtime errors in the table layout renderer / party widget.

### Preventative rule

Merge option objects by **assigning only defined booleans per known keys** (or skip `undefined` in spread). On the client, guard `tableLayout.widgets` and `party.characters` with fallbacks; coerce checkbox `checked` with `!!` when values may be absent. Surface REST/socket failures from **Apply** with try/catch instead of silent rejections.

### Mistake

After prioritizing **character-service v5** for fresher HP, **player cards** showed **initial-letter placeholders** while initiative rows still showed portraits.

### Root cause

v5 responses often include a **slim** `data` object with `id`/`name` only; **avatarUrl** lives on **`data.character`** (or nested sheet). `unwrapCharacterPayload` returned the slim object first, so `normalizeCharacter` → `avatarUrl` was empty.

### Preventative rule

When unwrapping v5 envelopes, **prefer nested `character` / `characterSheet` / `sheet` / `characterData`** before accepting the slim `data` summary; same rule in extension and `extractCharacterFromV5Envelope` on the backend.

### Mistake

Spell slot usage on the table **never changed** after sync even with legacy + v5 merge and backend fixes.

### Root cause

Extension `spellSlotRowHasSignal` treated **`max` / `total` on a row** as “live” signal. Character-service v5 often sends **zeros for `used`/`available`** but **non-zero `max`**, so the payload looked “complete” and **overwrote** legacy `/json` `spellSlots` / `pactMagic` that still held the real usage.

### Preventative rule

When deciding whether service JSON can replace legacy spell-slot arrays, treat signal as **usage or remaining slots only** (`used` / `expended`, `remaining`, or positive `available` / `slots`)—**not** structural `max` alone.

### Mistake

Admin showed **`L1 2/2`** while the player had **one slot spent** (should read **1/2** remaining over pool).

### Root cause

Some DDB payloads put **slots remaining** in `available` but leave **`used` / `numberUsed` at 0**. After resolving pool max from `levelSpellSlots`, **mergedUsed stayed 0**, so the UI showed **full pool** for both numbers.

### Preventative rule

When **pool max** is known and **raw `available` is in (0, pool)** and no used count was collected, infer **`used = pool − rawAvail`** before emitting `SpellSlotSummary`. If multiple arrays disagree on `available`, **`Math.max` alone hides real remaining** — track **min positive** `rawAvail` per level and use it for that inference **only when `levelSpellSlots` gives a table cap** (avoids treating a smaller pact pool as “remaining” vs a full-caster row).

### Mistake

Backend-only fixes still did not show spent spell slots after extension sync.

### Root cause

Replacing whole `spellSlots` / `pactMagic` arrays from **either** legacy **or** live loses the other source’s `used` count. Character-service and `/json` often disagree; **wholesale replace** drops the higher `used`.

### Preventative rule

In the extension, **merge spell-slot arrays per spell level**: `used = max(legacy, live)`; if either side has `used > 0`, take `available` from the side with **higher** `used`. If **both** show `used === 0` and **both** `available` are positive, use **`Math.min`** (stale endpoint often echoes pool size; the smaller is usually slots remaining); if only one side is positive, use **`Math.max`**.

### Mistake

**Sir Drew** (and similar) showed **`L1 2/2`** on admin while **all** level-1 slots were expended on D&D Beyond.

### Root cause

Across `spellSlots` / `pactMagic` / `pactMagicSlots`, one row reported **`available: 0`** with **`used: 0`** (meaning **no slots left**), while another still echoed the **pool size** (e.g. **2**). Aggregating with **`Math.max`** on `rawAvail` hid the zero; **`used` stayed 0** and the UI looked full.

### Preventative rule

Track **min `rawAvail` per level (including zero)** alongside max. When **`levelSpellSlots` gives `tableCap > 0`**, **`mergedUsed === 0`**, **`rawMin === 0`**, **`rawMax > 0`**, and **`rawMax >= resolved pool`**, infer **all slots expended**: **`mergedUsed = pool`**. Do **not** apply when **`rawMax === 0`** (all-zero rows are often DDB’s default before the table fills caps).

### Mistake

Expanding **TV layout & editor** or opening the **table display** crashed the React tree with **`Cannot access 'S' before initialization`** (temporal dead zone in minified bundles).

### Root cause

Importing **`@ddb/shared-types`** via the **root barrel** pulled the **entire** compiled `index.js` graph into chunks that also load React widgets. Bundler evaluation order plus **circular / wide re-export graphs** can leave bindings uninitialized when a module reads a `const`/`let` during its own init.

### Preventative rule

Expose **`package.json` `exports` subpaths** for logical modules (`layout`, `session`, `widget-config`, `initiative`, etc.) and import from those in **hot UI paths** (layout editor, TV widgets). Reserve the root barrel for convenience or backend-only code that does not share chunks with the widget tree.

### Mistake

TDZ persisted as **`Cannot access 'S' before initialization`** on TV / layout editor even after subpath imports. The minified name **`S`** was **`renderSpellSlotLines`** in `TvPartyCombinedColumn`, but the real failure was **`effectiveInitiativeRollMode`** (also minified) imported from the **main `index` chunk** while that chunk was still initializing.

### Root cause

**`sessionRuntimeStore`** (pulled in eagerly via **`SessionRuntimeHotkeys` → `App`**) had a **runtime** import **`emptyInitiativeState`** from **`@ddb/shared-types/initiative`**, so Rollup merged **`initiative.js` into `index`**. Lazy chunks (`TvPartyCombinedColumn`, etc.) then imported initiative helpers **from `index`**, creating a **circular chunk graph**: lazy module → `index` → … → lazy module before `index` finished binding exports.

### Preventative rule

Keep **`@ddb/shared-types/initiative` (and similar shared runtime)** out of the **eager** entry graph when lazy routes/widgets also import those symbols. Prefer **`import type` only** from shared-types in the store, and **duplicate tiny defaults locally** (with a comment pointing to the canonical `emptyInitiativeState`) if needed so initiative stays in its **own** chunk or only in lazy bundles.

### Mistake

Production showed **`Cannot access 'R' before initialization`** (minified TDZ) when opening the initiative / TV layout path.

### Root cause

In **`InitiativeTrackerPanel`**, **`showDexTieHint`** was initialized with **`revealInitiativeDetail && …`** on a line **above** **`const revealInitiativeDetail = …`**. That is illegal for **`const`** (temporal dead zone). The bundler minified `revealInitiativeDetail` to **`R`**, so the runtime error named **`R`**.

### Preventative rule

In **`map` / loop bodies**, never reference a **`const` binding** before its declaration. Compute **`revealInitiativeDetail`** (and similar) **before** any derived **`const`** that uses it. Run **`eslint no-use-before-define`** on TS/React code where practical.

### Mistake

Ingest showed **every PHB condition** on a PC (ids **1…12** as `{ id, level }`) while **`extractConditions`** mapped each id to a label; **AC** on the table did not match the sheet after merges.

### Root cause

Some payloads ship the **standard condition definition catalog** (consecutive ids **1…N**) inside **`conditions`**, not sparse **active** rows. **`armorClass`** on the sheet is authoritative when **inventory** in a merged payload is incomplete, but **`normalizeCharacter`** only ran **`calculateAc(raw)`**.

### Preventative rule

In **`extractConditions`**, treat **long arrays** whose entries resolve to **consecutive standard definition ids 1…N** as **non-active** — resolve ids via **`definitionId` / nested `definition.id`** before **`id`**, plus **labels**. **UI:** merged session **party** conditions must win over **initiative row snapshots**; **`setParty`** should **`syncInitiativeConditionsFromParty`** (label + conditions). **`normalizeCharacter`**: use **`resolveDdbCharacterName`** — prefer **`character.name`** (v5) over stale top-level **`name`**; if **`name`** matches DDB’s **`…'s Character`** / **`…\u2019s Character`** placeholder, prefer **`socialName`** / **`nickname`**. Prefer **`armorClass`** via **`resolveDisplayArmorClass`**. Cover **Vitest** including **v5 `definitionId`**, **nested name**, and **socialName** escape from placeholder.

### Mistake

Tampermonkey reported **“This script hasn’t run yet”** for a userscript with **`@match …/campaigns/*`** on D&D Beyond; the panel showed **URL didn’t match** (SPA navigation).

### Root cause

DDB often **first loads** another path (e.g. **`/my-campaigns`**) and **changes the URL in JS** without a full reload, so the userscript **never injected** on a document whose initial URL matched **`/campaigns/*`**.

### Preventative rule

For DDB (and similar SPAs), use a **broad `@match`** on the site origin plus an **`@include` regex** if needed; **gate UI** on **`pathname`** inside the script. Listen for **`popstate`** and wrap **`history.pushState` / `replaceState`** (and **`urlchange`** where available) to **mount/unmount** when the route changes.

### Mistake

Initiative / party **userscript** showed **no character portraits** while names/HP worked; **`fetch`** returned **`success: true`** with **`data.id` / `data.name`**.

### Root cause

Character-service **v5** often puts **`avatarUrl`** only on **nested** **`data.character`** (full sheet). Returning **`parsed.data`** when top-level **`id`+`name`** exist **skips** **`unwrapCharacterPayload`**, so **`resolvedAvatarUrl`** never sees the nested sheet.

### Preventative rule

After a successful character GET, **always** run the same **`unwrapCharacterPayload`** (or equivalent) as **party ingest** — do not short-circuit on slim **`data`**. Add **`normalizePortraitUrl`** for **`//cdn…`** and **`/content/…`**, recurse into **`character` / `defaultBackdrop`**, and optionally **scrape** the visible campaign **card `<img>`** as a fallback. Avoid **`referrerPolicy: no-referrer`** on DDB CDN images if loads fail.
