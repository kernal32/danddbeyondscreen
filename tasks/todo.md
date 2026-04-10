# DDB DM Screen — implementation tracker

**Roadmap / phased backlog:** [docs/IMPLEMENTATION_TODO.md](../docs/IMPLEMENTATION_TODO.md). **Progress log:** [docs/PROJECT_PROGRESS.md](../docs/PROJECT_PROGRESS.md). **UI platform (widgets / layout / TV):** [docs/UI_ARCHITECTURE.md](../docs/UI_ARCHITECTURE.md), [docs/UI_TODO.md](../docs/UI_TODO.md), [docs/UI_PROGRESS.md](../docs/UI_PROGRESS.md).

## Plan verification

- [x] Phase 1: `docs/analysis.md` documents reference PHP project behaviour.
- [x] Phase 2: Monorepo, `@ddb/shared-types`, Fastify + CORS + Socket.IO rooms.
- [x] Phase 3: `dndbeyond.service`, `character.service`, calculator port, fixture + tests.
- [x] Phase 4: `initiative.service` + REST + WS + Vitest coverage.
- [x] Phase 5: React DM + table display, Tailwind TV-oriented layout.
- [x] Phase 6: Docker Compose, Dockerfiles, `.env.example`, `docs/DEPLOY.md`.
- [x] Phase 7: Timed effects, dice log (`dmOnly`), NPC templates, DM vs display tokens.

## Combined initiative widget + customizer (current)

**Goal:** Add a new Party widget `combined` mode that behaves as an initiative tracker with vertically-stacked player columns, ordered by initiative, and backed by a dedicated **Initiative Tracker Customizer** page for drag/snap component layout + sizing controls.

### Specification (verify before coding)

1. **Combined mode behavior**
   - New Party widget `view` option: `combined` (alongside `full` / `compact`).
   - Treat combined mode as an initiative-tracker presentation:
     - columns ordered by initiative ranking
     - dev option `highestRollSide` = `left` | `right` (flip horizontal order)
   - Card/column content defaults:
     - initiative area (formula/tie space)
     - header (name + portrait)
     - HP + AC
     - spell save DC + spell slots
     - passives (Perception / Investigation / Insight)
     - class resources
     - conditions first at bottom.

2. **Customizer scope (phase: full now, combined-only target)**
   - New page/menu: **Initiative Tracker Customizer**.
   - Snap grid canvas with draggable/resizable components for combined card layout.
   - Side inspector for component options (text/icon sizes, spacing, visibility).
   - Live preview using current initiative + party data.

3. **Persistence model**
   - Save both:
     - **per-session layout config** (active widget config)
     - **named presets** reusable across sessions.
   - Ability to apply preset to current combined widget.

4. **Safety / compatibility**
   - Preserve existing `party` full/compact behavior.
   - Preserve existing initiative tie-break logic (already implemented in tracker).
   - Backward compatibility for layouts that do not specify combined config.

### Implementation todos

- [ ] **Shared types:** extend `PartyWidgetView` with `combined`; add combined widget config schema (`highestRollSide`, component placements, size/display options).
- [ ] **Preset model/APIs:** add backend persistence + endpoints for named combined-layout presets (list/create/update/delete/apply).
- [ ] **Frontend state wiring:** load/save preset data and per-session combined config.
- [ ] **Customizer page:** add `/dm/settings/initiative-customizer` (or equivalent), grid editor, palette, inspector, live preview, preset actions.
- [ ] **Renderer:** implement `combined` branch in Party widget runtime with initiative-ordered columns and side-direction toggle.
- [ ] **Default combined template:** ship a sensible default layout matching requested section order.
- [ ] **Widget settings UI:** expose `combined` selector + `highestRollSide` in Party widget options.
- [ ] **Validation:** frontend build, shared-types build, backend tests, manual TV checks for 3/6/8+ characters.

## Review

- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.6.7:** Party refresh **`fetchCharacterSheet`** now **parallel legacy + v5** and **`mergeDdbLegacyAndV5Character`** (union `conditions` / `activeConditions` / `modifiers` buckets; deep-merge HP/death-save info) so live v5 is not dropped when legacy `/json` wins first. **`extractDdbConditionLabels`:** `modifiers` rows with `type === 'condition'`, cap **24** labels. **Death saves:** boolean **`deathSaveSuccesses` / `deathSaveFailures`** (incl. `hitPointInfo`) + array **`successes` / `fails`**; final **`pickDeathSaveCountsFromObject(c)`** on root. Public `apps/frontend/public/userscripts/` copy synced; `node --check` OK.
- **2026-04-02:** **Stat SVGs — Lucide + d20:** Heart/shield use **Lucide** paths (ISC, lucide-static 0.460) in [`PartyCardStatIcons.tsx`](apps/frontend/src/components/party/PartyCardStatIcons.tsx) + userscript **v1.5.9** (aligned `viewBox` `0 0 24`). Spell save: **`IconSpellSaveD20`** wireframe; `spellStar` decor preset unchanged id. `npm run build` shared-types + frontend OK.
- **2026-04-02:** **Shield asset (PDF plan):** Documented **no WotC PDF vector extraction**; **original** heater `d` path + **`SHIELD_VIEWBOX` = heart crop** in [`PartyCardStatIcons.tsx`](apps/frontend/src/components/party/PartyCardStatIcons.tsx); [`ArmorClassShieldBadge.tsx`](apps/frontend/src/components/player-card/ArmorClassShieldBadge.tsx) comment; userscript **v1.5.8** AC SVG aligned. `npm run build -w @ddb/frontend` OK.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.5.7:** Removed spell **modifier / spell attack** strip + class banner; **class features** use same **●/○** compact rows as spell slots (proportional dots when max > 12); tighter stack padding + block margins. Dead spell-attack helpers removed. Public copy synced.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.5.6:** Inline merge of TeaWithLucas [module-output](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output) spell pipeline (`spellSlots` 9-array + `pactMagic` / `pactMagicSlots` + `levelSpellSlots` table) via `__ddbExtractSpellSlotSummariesUsr`; class resources from `actions.*` `limitedUse` + inventory with Lay on Hands / healing-pool dedupe. Public copy synced; temp `_ddb_spell_resource_port.js` removed.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.4.0:** **Two-column** layout (`dib-main` / `dib-col-init` | `dib-col-party`); **red/black** DM-console palette; party **card rows** + **HP pill**; `partySubtitleLine` (lvl · race · classes). Responsive stack below **700px**. Panel ~**920px** wide.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.3.2 — portraits:** `tryGet` always **`unwrapCharacterPayload`** (fixes v5 slim `data` vs nested `data.character` + `avatarUrl`). **`normalizePortraitUrl`**, deeper **`resolvedAvatarUrl`** (`character` / backdrop keys), **campaign card img scrape** fallback, **`referrerPolicy`** not `no-referrer` on portraits.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.3.1:** Character fetch order **legacy /json (plural+singular) → v5 → v4** so **v4** (often **400**) is not hit on every poll when legacy/v5 succeed; matches party ingest. README + panel footer text updated.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.3 — initiative cards:** Large framed rows (64px portrait / initial placeholder), rank + name + roll math + DEX tiebreak + prominent total; active-turn cyan border. **`hydrateInitiativeAvatarsFromParty`** + re-render after party refresh. Panel ~360px; taller init scroll area.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.2 — SPA @match:** Broad `@match` / `@include` on `dndbeyond.com`; **`syncBarToRoute`** + **`popstate`** + **`history.pushState`/`replaceState`** hooks (+ optional `urlchange`); **`teardownBar`** when leaving `/campaigns/`. Fixes Tampermonkey “script hasn’t run yet” when the tab never did a full load on `/campaigns/*`.
- **2026-04-02:** **`ddb-campaign-initiative-bar.user.js` v1.1 — TeaWithLucas alignment:** Character fetch **v4 → v5 → legacy** (same v4 base as [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen)); auth order **`moduleExport.getAuthHeaders`** (TeaWithLucas installed) → **`__ddbDmScreenIngestAuth`** (ingest) → webpack **999080** shim. Sandbox **`fetch`** + `credentials:'include'`; **MutationObserver** + 1.5s/4.5s rescans for SPA cards. Public userscript copy + README **Campaign-only left bar** updated.
- **2026-04-02:** **Legacy `/json` conditions as `{ id, level }` only (Hope 163111554):** `conditionToLabel` now maps DDB **standard PHB condition definition ids 1–15** before spell-slot leak filter; `isLikelySpellSlotLeakInConditions` only drops **unknown** ids. Fixes ingest when API omits `name` on `conditions[]`. Vitest: Hope triple + exhaustion + leak id `240678`.
- **2026-04-02:** **Lay on Hands pool floor (Drevan 3/5):** [`getPaladinLayOnHandsPoolCap`](apps/backend/src/services/character.service.ts) = sum **Paladin** `classes[].level` × **5**; for dedupe key `lay on hands`, `available = max(merged, cap)`. [`classResourceDedupeKey`](apps/backend/src/services/character.service.ts) also buckets any label matching **`\bhealing pool\b`**. Vitest: solo 5-pip row + Paladin 5 → 25; multiclass Paladin 3 only → 15 cap.
- **2026-04-02:** **Lay on Hands — orphan `Healing Pool` row:** [`classResourceDedupeKey`](apps/backend/src/services/character.service.ts) treats exact **`healing pool`** like **`lay on hands`**; extension **2.0.30** + userscript **0.8.11** `actionRowLimitedUseDedupeKey` parity. Vitest: merge `Healing Pool` 5 + `Lay on Hands` 25 → one row 25 / `min(used)`.
- **2026-04-02:** **Split spell-table chips (`Heal` / `Damage` / `#` / `--`):** [`stripGroupedDdbSpellTableScrapeNoise`](apps/backend/src/services/character.service.ts) when both `heal` and `damage` appear as labels; extension **2.0.29** `stripGroupedDomSpellTableScrapeNoise` on DOM cache + merge; placeholder-only labels filtered in `isDdbConditionUiPlaceholder` / `isDomConditionNoiseLabel`.
- **2026-04-02:** **Spell-row filter v2 + stash read sanitize:** Broader `isDdbSpellDamageTableRowNoise` (dash runs, numeric/dice last column); [`sanitizeNormalizedPartyConditions`](apps/backend/src/services/character.service.ts) in [`user-ddb-upload.service.ts`](apps/backend/src/services/user-ddb-upload.service.ts) on **save + get** so admin ingest and imports drop old junk without requiring re-poll. Extension **2.0.28** parity in background + content script.
- **2026-04-02:** **False conditions — DDB spell rows (`Heal, Damage, N, --`):** [`isDdbSpellDamageTableRowNoise`](apps/backend/src/services/character.service.ts) + [`isDdbConditionUiPlaceholder`](apps/backend/src/services/character.service.ts); extension [`background.js`](extensions/dndbeyond-cookie-sync/background.js) `isDomSpellDamageTableRowNoise` + [`content-ddb-conditions.js`](extensions/dndbeyond-cookie-sync/content-ddb-conditions.js) `looksLikeSpellDamageTableRow` in `addLabel`. Manifest **2.0.27**, README bullet. Vitest `character.service.test.ts` extended.
- **2026-04-02:** **Temp HP reconcile — broader v5 detection (extension 2.0.26 / userscript 0.8.10):** `liveLooksLikeAuthoritativeSheet` + `liveHasRootHpSignal` (`removedHitPoints`, lower key/size thresholds, `actions`/`spellSlots`/`classes`) in [`extensions/dndbeyond-cookie-sync/background.js`](extensions/dndbeyond-cookie-sync/background.js) and [`userscripts/ddb-party-ingest.user.js`](userscripts/ddb-party-ingest.user.js) so omitted `temporaryHitPoints` still clears stale legacy temp when v5 had no root `currentHitPoints`. Public userscript copy updated; [`README.md`](extensions/dndbeyond-cookie-sync/README.md) **v2.0.26**.
- **2026-04-02:** **Userscript temp HP parity (extension v2.0.25):** [`userscripts/ddb-party-ingest.user.js`](userscripts/ddb-party-ingest.user.js) **0.8.9** — `__reconcileOmittedTempHpAfterLiveOverlay` after `__overlayLiveCharacterOntoLegacyTarget` in `__deepMergeLiveOntoLegacy` and `mergeCapturedCharacter` so omitted-zero v5 does not preserve stale legacy temp. Copied to [`apps/frontend/public/userscripts/ddb-party-ingest.user.js`](apps/frontend/public/userscripts/ddb-party-ingest.user.js). Extension README **v2.0.25** bullet for the same behavior.
- **2026-03-26:** **Combined column — section gap + SVG z-order:** [`CombinedCardLayoutConfig.sectionGapPx`](packages/shared-types/src/widget-config.ts) (0–32px, optional; default gap still ~6px × text scale). [`decorSendToBack`](packages/shared-types/src/widget-config.ts) on `decorSvg` blocks → `z-index: 0` vs `1` in [`TvPartyCombinedColumn`](apps/frontend/src/widgets/TvPartyCombinedColumn.tsx) so overlaps paint SVG under text. Customizer: **Section gap (px)** + **Behind text (z-order)**; canvas stack sorts send-to-back decors first. `npm run build` shared-types + frontend OK.
- **2026-03-26:** **Initiative customizer — decor SVG + borderless:** [`InitiativeCustomizerPage`](apps/frontend/src/pages/InitiativeCustomizerPage.tsx) — **Borderless (no box)** on every component row (persists via `borderless` on layout). **`decorSvg`** palette block defaults to `heart` + `decorColorMode: theme`, taller default height (2 rows), canvas label `decorSvg · <preset>`. Inspector: SVG preset dropdown (`COMBINED_DECOR_SVG_IDS`), color mode (`theme` / accent / text / muted / spell bar / ok / **custom hex**), hex field when custom. `normalizePreset` restores `borderless` and decor fields; `updateComponent` patches geometry + visibility + scale + borderless + decor without dropping unrelated props. Renderer/types were already in [`widget-config.ts`](packages/shared-types/src/widget-config.ts), [`TvPartyCombinedColumn`](apps/frontend/src/widgets/TvPartyCombinedColumn.tsx), [`CombinedDecorSvgGraphic`](apps/frontend/src/widgets/CombinedDecorSvgGraphic.tsx). `npm run build` — `@ddb/shared-types`, `@ddb/frontend` OK.
- **2026-03-22:** **Master Console UX (`/master`, compact party strip, phone HP):** Renamed DM console to **Master Console** — [`MasterConsole.tsx`](apps/frontend/src/pages/MasterConsole.tsx) replaces `DmConsole`; [`App.tsx`](apps/frontend/src/App.tsx) registers `/master` and redirects `/dm` → `/master`. [`HomePage`](apps/frontend/src/pages/HomePage.tsx) continues to `/master`; [`DmSettingsPage`](apps/frontend/src/pages/DmSettingsPage.tsx) back link **Master Console**. Party: [`MasterPartyStrip.tsx`](apps/frontend/src/components/MasterPartyStrip.tsx) (avatar, hide/unhide via [`UnhideCharacterDialog`](apps/frontend/src/components/UnhideCharacterDialog.tsx), absent, conditions; no HP). Shared [`VisibilityEyes`](apps/frontend/src/components/icons/VisibilityEyes.tsx); [`InitiativeTrackerPanel`](apps/frontend/src/components/InitiativeTrackerPanel.tsx) imports `IconEyeOff`. Master UI trimmed: no initiative extras / timed effects / NPC templates blocks. Phone [`InitiativeRemoteMoreSheet`](apps/frontend/src/components/InitiativeRemoteMoreSheet.tsx): collapsible **Party HP** (`party:manualHp`), NPC templates section removed, unhide uses shared dialog. `npm run build --workspace=@ddb/frontend` OK.
- **2026-03-22:** **DM party collapse, phone More, hide-from-table, default TV layout:** Party column in [`DmConsole`](apps/frontend/src/pages/DmConsole.tsx) wrapped in `<details>`; dice log manual note buttons removed. [`InitiativeRemotePage`](apps/frontend/src/pages/InitiativeRemotePage.tsx) **More** + [`InitiativeRemoteMoreSheet`](apps/frontend/src/components/InitiativeRemoteMoreSheet.tsx) (NPC spawn, remove character, hidden list + unhide, extra combatants). [`hiddenFromTable`](packages/shared-types/src/session.ts) manual override + [`hiddenPartyMembers`](packages/shared-types/src/session.ts) on [`PublicSessionState`](packages/shared-types/src/session.ts); [`toPublic`](apps/backend/src/services/session.service.ts) filters display party/initiative; [`filterInitiativeExcludingEntityIds`](apps/backend/src/services/initiative.service.ts); [`startCombatFromParty`](apps/backend/src/services/initiative.service.ts) `skipCharacterIds`. Socket: [`party:removeCharacter`](apps/backend/src/ws/socket.ts), [`party:setHiddenFromTable`](apps/backend/src/ws/socket.ts), [`initiative:remove`](apps/backend/src/ws/socket.ts) / [`npc:spawnFromTemplate`](apps/backend/src/ws/socket.ts) **displayOrDm**; phone row **hide** control in [`InitiativeTrackerPanel`](apps/frontend/src/components/InitiativeTrackerPanel.tsx). Default TV layout: initiative left / party right in [`createDefaultTableLayout`](packages/shared-types/src/layout.ts). `npm run build` + backend Vitest OK.
- **2026-03-22:** **Persistent game sessions + resume after sign-in:** SQLite [`game_sessions`](apps/backend/src/db/sqlite.ts) stores full [`SessionRecord`](packages/shared-types/src/session.ts) JSON; [`GameSessionPersistence`](apps/backend/src/services/game-session-persistence.service.ts) load on startup + debounced upsert (~900ms) + immediate upsert on create; [`SessionService`](apps/backend/src/services/session.service.ts) `restoreSession`, `markDirty`, hooks. [`server.ts`](apps/backend/src/server.ts) always opens DB (`DATABASE_PATH`); SIGINT/SIGTERM flush. Auth: [`GET /api/me/table-sessions`](apps/backend/src/routes/auth.ts), [`POST …/resume`](apps/backend/src/routes/auth.ts) returns DM/display tokens for `ownerUserId`. [`HomePage`](apps/frontend/src/pages/HomePage.tsx) — continue-in-browser, list + Resume, New session. `npm run build` + backend Vitest OK.
- **2026-03-22:** **Display PIN bypass for session owner (signed in):** [`SessionRecord.ownerUserId`](packages/shared-types/src/session.ts) set on [`POST /api/sessions`](apps/backend/src/routes/api.ts) when `Authorization: Bearer` user JWT verifies; new public [`POST …/display/:displayToken/unlock-account`](apps/backend/src/routes/api.ts) returns current `displayPinRevision` when JWT user matches owner (403 otherwise). [`tryDisplayUnlockWithAccount`](apps/frontend/src/util/displayAccountUnlock.ts); [`TableScreen`](apps/frontend/src/pages/TableScreen.tsx) / [`InitiativeRemotePage`](apps/frontend/src/pages/InitiativeRemotePage.tsx) auto-unlock when gate is open (stored revision miss or after DM pin change). Settings copy in [`DmSettingsPage`](apps/frontend/src/pages/DmSettingsPage.tsx). `npm run build` + backend Vitest OK.
- **2026-03-22:** **Display / phone 4-digit gate + DM launch:** Session [`displayGatePin`](packages/shared-types/src/session.ts) + [`displayPinRevision`](packages/shared-types/src/session.ts) (random pin on create); public [`GET …/display/:token/meta`](apps/backend/src/routes/api.ts), [`POST …/unlock`](apps/backend/src/routes/api.ts); [`toPublic`](apps/backend/src/services/session.service.ts) includes revision. [`TableScreen`](apps/frontend/src/pages/TableScreen.tsx) / [`InitiativeRemotePage`](apps/frontend/src/pages/InitiativeRemotePage.tsx) use [`DisplayPinOverlay`](apps/frontend/src/components/DisplayPinOverlay.tsx) + [`displayPinUnlock`](apps/frontend/src/util/displayPinUnlock.ts). DM [`DmConsole`](apps/frontend/src/pages/DmConsole.tsx) **Launch display** + **Show QR (phone)**; Settings section to edit code. Vitest [`display-gate-pin`](apps/backend/src/util/display-gate-pin.test.ts). `npm run build` + backend tests OK.
- **2026-03-22:** **Initiative adv/dis (glow + dual dice):** **`Adv` / `Dis`** combat cues ([`advNextAttack` / `disNextAttack`](packages/shared-types/src/initiative.ts)) drive two d20s via [`effectiveInitiativeRollMode`](packages/shared-types/src/initiative.ts) in [`rollInitiative`](apps/backend/src/services/initiative.service.ts); row **glow** + **[`InitiativeDualRollReveal`](apps/frontend/src/components/initiative/InitiativeDualRollReveal.tsx)** use the same helper. Removed separate N/A+/D− UI and **`initiative:setRollMode`**. `npm run test --workspace=@ddb/backend` + `npm run build` OK.
- **2026-03-22:** **Player card HP layout:** [`PlayerCard`](apps/frontend/src/components/player-card/PlayerCard.tsx) — heart shows **current HP** only at **`acValueNumeral`** (same size as AC); **`current/max`** is centered above the hit point bar (`HpBarWithFraction`). Heart-only tiles show the fraction below the heart; AC / DC / initiative columns use **`HpBarFootprintSpacer`** so icons stay aligned when the bar is on. `npm run build --workspace=@ddb/frontend` OK.
- **2026-03-22:** **Conditions UI + initiative combat cues:** [`conditionDisplay`](apps/frontend/src/util/conditionDisplay.ts) + [`ConditionTile`](apps/frontend/src/components/conditions/ConditionTile.tsx); [`PlayerCard`](apps/frontend/src/components/player-card/PlayerCard.tsx) conditions section matches spell-slot header styling. [`InitiativeTrackerPanel`](apps/frontend/src/components/InitiativeTrackerPanel.tsx) uses the same tiles plus violet **combat cue** badges and a **DM-only** right-hand toggle strip (`initiative:setCombatTags`); layout preview sample cleric shows tags. Shared type [`InitiativeEntry.combatTags`](packages/shared-types/src/initiative.ts); backend merge + round strip in [`initiative.service`](apps/backend/src/services/initiative.service.ts). DM console copy + [`ideas.md`](ideas.md) document DDB vs future player edit. `npm run build` + backend Vitest pass.
- **2026-03-22:** **Table display 1920×1080:** [`TableScreen`](apps/frontend/src/pages/TableScreen.tsx) uses `h-dvh` + [`fillViewport`](apps/frontend/src/components/TableLayoutView.tsx) so [`TableLayoutRenderer`](apps/frontend/src/layout/TableLayoutRenderer.tsx) applies `grid-template-rows: repeat(N, minmax(0,1fr))` and **in-cell** `overflow-y-auto` (tighter `gap` in `.table-layout-grid--fill`). Debug overlay uses `min-[1024px]:` to match the CSS stack breakpoint.
- **2026-03-22:** **TV party grid (3×3 / 3×4):** [`PartyWidget`](apps/frontend/src/widgets/PartyWidget.tsx) uses **3 columns** on the table display (`large`), with **cozy / compact / dense** card scaling from [`tvPartyGridDensityFromCount`](apps/frontend/src/components/player-card/types.ts) (7–9 → compact, 10+ → dense). [`PlayerCard`](apps/frontend/src/components/player-card/PlayerCard.tsx) reads `tvDensity` via shared scale tokens; DM console / demo unchanged (no `large`).
- **2026-03-22:** **Player cards (TV + settings):** Modular [`PlayerCard`](apps/frontend/src/components/player-card/PlayerCard.tsx) with section order + toggles from extended [`PartyCardDisplayOptions`](packages/shared-types/src/party-card-display.ts) (`PlayerCardSectionId`, `sectionOrder`, `normalizePlayerCardSectionOrder`). [`PartyCard`](apps/frontend/src/components/PartyCard.tsx) maps [`NormalizedCharacter`](packages/shared-types/src/character.ts) via [`mapPlayerCardData`](apps/frontend/src/components/player-card/mapPlayerCardData.ts). DM Settings — single **Party / player cards** panel: grouped checkboxes, Up/Down section order, reset order / reset all, live preview + sample picker. Demo: [`/demo/player-cards`](apps/frontend/src/pages/PlayerCardDemoPage.tsx). Backend tests still pass; ingest unchanged (rich fields optional until normalization follow-up).
- **2026-03-22:** **TV table + initiative (display):** `TableScreen` — removed top campaign/“Party” title; **Live** pill fixed **bottom-right** with extra page padding. `InitiativeTrackerPanel` — controls moved **below** the list; **display** uses **Prev round / Next round** (`initiative:prevRound` / `initiative:nextRound`) and hides **(turn)** highlight from `currentTurnIndex`; **DM** keeps **Prev / Next turn**. Row tap → **(last)** / amber highlight unchanged. REST `PATCH …/initiative` accepts **`nextRound`** / **`prevRound`**. Widget registry copy updated.
- **2026-03-22:** **UI Phase 1–4:** layout renderer, widget registry, Zustand store, **DM layout editor** (apply/socket) — `docs/UI_PROGRESS.md`, `docs/UI_TODO.md`.
- **2026-03-21:** **Docker SQLite persistence:** `docker-compose.yml` binds `./data:/app/data`, `DATABASE_PATH=/app/data/ddb-screen.db`; docs updated.
- **2025-03-21:** **Canon documentation:** Added `docs/PROJECT_CANON.md`, `RUNBOOK.md`, `ARCHITECTURE.md`, `SECURITY.md`, `IMPLEMENTATION_TODO.md`, `PROJECT_PROGRESS.md`; cross-linked README, `DEPLOY.md`, `ARCHITECTURE_SUMMARY.md`; `tasks/todo.md` points to roadmap/progress docs.
- **2026-03-21:** **Party ingest (Tampermonkey):** hashed session token (`ingestTokenHash`), `POST /api/ingest/party` with rate limit + body cap, Settings UI (generate / copy once / revoke), template in `userscripts/`, Vitest for `validate-party-ingest`. Root `npm run build` orders workspaces: shared-types → backend → frontend.
- **2026-03-21:** **Ingest 413 fixes:** CrimsonAuth edge nginx `client_max_body_size 32m` on `dnd.saltbushlabs.com` (`nginx/conf.d/default.conf`, `ssl.conf`, `ssl.conf.example`); `/api/ingest/party` route `bodyLimit` raised to **32 MiB** (was 1 MiB, blocked large party JSON after edge). `nginx -t` + reload verified; public POST over **1 MB** returns **401** not **413**.
- **2026-03-21:** **Automated ingest sync:** Tampermonkey **v0.7** panel checkbox + menu — auto **pull→push** every 3 min on campaign/character URLs (`ddbIngestAutoSync`). DM Console checkbox **Auto-load when account upload changes** (~45s poll vs `GET /api/me/ddb-upload`); `POST …/import-upload` returns **`uploadUpdatedAt`** for `sessionStorage` de-dupe.
- **2026-03-21:** **Account API keys** replace session ingest tokens: `user_api_keys` + `user_ddb_uploads` SQLite tables, `POST /api/ingest/party` with `dnd_*` key, `/account` UI, **Load upload into this table** on DM console (`X-User-Authorization`). Removed session cookie API + extension flow from product (server `DDB_COOKIE` only for DDB fetch).
- **2025-03-21:** DM **Settings** page at `/dm/settings` — D&D Beyond cookie save/clear + extension session ID; linked from DM console. Build: `npm run build --workspace=@ddb/frontend`.
- **2025-03-21:** **`tableLayout`** on session + `PublicSessionState`; default 12-col grid; `TableLayoutView` on display; `PATCH` + `session:setTableLayout`; **Reset TV layout** in DM console. Tests: `table-layout.test.ts`.
- **2025-03-21:** Optional **user accounts**: SQLite (`better-sqlite3`), `AUTH_SECRET` (32+), register/login JWT, `GET/PUT /api/me`, encrypted DDB cookie in DB, new session preloads prefs when Bearer user JWT sent. Frontend: `/login`, `/register`, Settings account panel, Home uses user JWT on **New session**.
- Backend unit tests: `npm run test --workspace=@ddb/backend` (initiative + calculator).
- Production build: `npm run build` (shared-types, backend, frontend).
- Local dev: backend `:3001`, frontend `:5173` with Vite proxy.

## Admin interface + operator accounts

**Goal:** A secure, server-enforced admin area for account lifecycle and operational tooling, with a path to subscriptions (Stripe or similar) without painting the product into a corner.

### Specification (verify before coding)

1. **Authorization model**
   - **Never** trust the frontend for admin: every admin action is `requireAdmin` on the backend (JWT verified + role/allowlist check).
   - **Phase A (bootstrap):** `ADMIN_EMAIL_ALLOWLIST` (comma-separated, normalized like login) or `ADMIN_USER_IDS` — only these identities get admin claims. Your operator address is set in deployment env (not committed).
   - **Phase B (scalable):** `user_roles` table or `users.role` / `is_admin` with explicit promotion workflow; optional **break-glass** second factor for destructive actions later.
   - **JWT:** Either short-lived access tokens with an `admin` scope/claim issued only after a dedicated admin step, or separate **admin session** cookie with stricter flags — decide in implementation; avoid long-lived single token that grants admin everywhere.

2. **Data model (subscription-ready)**
   - Add nullable columns or a **`billing_customers`** / **`subscriptions`** table keyed by `user_id`: `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`, `status`, `current_period_end`, etc. Even before Stripe, stub read-only “plan: free” in admin user detail.
   - Webhook endpoint placeholder (disabled until keys exist): verify Stripe signature, idempotent updates — document in `docs/SECURITY.md` when added.

3. **Admin API surface (Fastify)**
   - Prefix `/api/admin/*` behind shared guard.
   - **Users:** `GET` list (pagination, search by email), `GET :id` summary (no password hash; optional aggregate counts: sessions, api keys), `DELETE :id` (soft-delete vs hard-delete policy — prefer soft + anonymize for compliance).
   - **Safety:** Cannot delete last admin; cannot demote self if sole admin; optional **typed confirmation** body for delete (`DELETE` with JSON `{ "confirmEmail": "..." }`).
   - **Audit:** `admin_audit_log` table (actor_user_id, action, target_type, target_id, ip, user_agent, payload hash, created_at) for deletes and role changes.

4. **Frontend (`/admin`)**
   - Route gated: if not admin, redirect or 403 from API drives UX.
   - Pages: dashboard (counts), user list + detail drawer, destructive actions with confirmation modals.
   - **Dev / ops section (ideas):** feature flags env readout (sanitized), rate-limit stats if available, “invalidate sessions” (future), link to health — keep behind admin only.

5. **Security checklist**
   - Rate limit `/api/admin/*` aggressively; log failures; no detailed stack traces to client.
   - CSRF: if using cookies for admin, use SameSite + CSRF token; if Bearer-only from SPA, ensure XSS hardening (CSP, no `dangerouslySetInnerHTML` on user content).
   - Principle of least privilege: admin API returns minimal PII; no `ddb_cookie` or full party JSON in list endpoints.

### Implementation todos

- [x] **Auth & schema:** Admin allowlist env (`ADMIN_EMAIL_ALLOWLIST`); `users.deleted_at`; `admin_audit_log`; `user_billing` stub; `.env.example` + `docs/SECURITY.md`.
- [x] **Backend guard:** `resolveAdmin` on all `/api/admin/*` routes; JWT + allowlist + per-user rate limit; 401 / 403 / 429.
- [x] **Admin user APIs:** `GET /api/admin/overview`, `GET /api/admin/users`, `GET /api/admin/users/:id`, soft-delete via `POST .../deactivate` + confirm email; Vitest suite skips if native `better-sqlite3` fails to load (e.g. wrong arch) — run `npm rebuild better-sqlite3` locally.
- [x] **Audit logging:** Deactivate actions logged to `admin_audit_log`.
- [x] **Frontend `/admin`:** User table, detail, billing stub panel, deactivate modal; `isAdmin` on `/api/me` + link from Account.
- [x] **Subscription stubs:** `user_billing` table + admin detail JSON (empty until Stripe).
- [ ] **Review:** STRIDE-lite pass when billing/webhooks ship; manual QA on production allowlist.

### Agent roles (one focused task per agent)

| Role | Responsibility |
|------|----------------|
| **Security / auth architect** | Allowlist vs roles, JWT/admin session strategy, threat model, audit log schema, delete safety rules. |
| **Backend admin API** | `requireAdmin`, `/api/admin/users` CRUD, pagination, tests, rate limits. |
| **Database / migrations** | SQLite migrations, subscription placeholder schema, audit log, indexes. |
| **Frontend admin UI** | `/admin` routes, table, detail, confirmations, error states, align with existing Dark Arcane / app patterns. |
| **Billing (future spike)** | Stripe customer + subscription + webhook sketch, idempotency, no double-charging — separate from first admin ship if desired. |

---

## Review — shared-types barrel / TV TDZ (2026-03-26)

- **Symptom:** Error boundary on Master when expanding **TV layout & editor** or on **table display** — `Cannot access '<id>' before initialization` (minified TDZ).
- **Change:** Added `@ddb/shared-types` subpath `exports` (`layout`, `session`, `widget-config`, `party-card-display`, `character`, `themes`, `theme-preferences`, `avatars`, plus existing `initiative`) and pointed `apps/frontend` at those entry points instead of the package root barrel so layout/TV chunks load a smaller, acyclic JS graph.
- **Follow-up (same symptom):** Eager **`sessionRuntimeStore`** imported **`emptyInitiativeState`** from `@ddb/shared-types/initiative`, which pulled **`initiative.js` into the main `index` chunk**. Lazy **`TvPartyCombinedColumn`** then imported **`effectiveInitiativeRollMode` from `index`**, causing a **circular chunk** and TDZ (`S` in minified output pointed at spell-slot UI, but the broken binding was initiative code re-exported from `index`). **Fix:** `emptyInitiativeStateLocal()` in `sessionRuntimeStore` + `import type` only from initiative; production build now emits a separate `initiative-*.js` chunk.

---

## Follow-ups (not in scope)

- Redis-backed sessions / multi-instance.
- Full NPC stat blocks on table display (templates only add initiative entries today).

---

## Layout Designer v2 (compatibility-first) — current

**Goal:** Upgrade the table layout editor to WYSIWYG/free-move + alignment guides + responsive/anchor-capable positioning **without breaking existing layouts**.

### Specification (verify before coding)

1. **Compatibility**
   - Existing `TableLayout.widgets[].{x,y,w,h}` remains valid and renderable.
   - New positioning data is additive in `widget.config.layoutV2` (no breaking schema change).
   - Renderer prefers V2 when present; legacy values remain fallback.

2. **Positioning + responsiveness**
   - Add normalized rect support (`xPct/yPct/wPct/hPct`) and anchors (`left/center/right`, `top/center/bottom`).
   - Resolve final pixel rect from container bounds + anchor, then project to CSS grid placement for current renderer path.
   - Maintain stable alignment on resize (no drift from recalculation).

3. **Editor interaction**
   - Add free movement mode and configurable snap-to-grid (px).
   - Keep grid mode available for current behavior.
   - Shift key locks drag axis.
   - Add selection state, drag/resize handles, and alignment guides.

4. **Alignment engine**
   - Support snapping to container edges/centers and peer edges/centers.
   - Configurable threshold in px.

5. **Text/number/icon stability**
   - Standardize numeric stability for volatile values (`tabular-nums` + min width container).
   - Use shared icon+text alignment container for stat badge overlays to ensure real center alignment.

### Implementation todos

- [x] **Types + parsing:** add `layoutV2` helper module with clamps/defaults + legacy conversion (`apps/frontend/src/layout/layoutV2.ts`).
- [x] **Resolver:** add legacy->V2 normalization and V2->legacy projection utility with anchors.
- [x] **Renderer integration:** wire resolver into table layout renderer with backward compatibility.
- [x] **Editor interactions:** add free-move/snap toggle, shift axis-lock, drag/resize handles, selection outline.
- [x] **Alignment guides:** implement edge/center + peer alignment guide generation and snap application (editor move path).
- [x] **Properties panel:** expose selected-widget anchor and position percentage controls.
- [x] **Badge alignment:** unify icon+text alignment shell for AC/spell stat badges.
- [x] **Number stability:** add `.numeric-stable` utility and apply to shared badge value layer.
- [ ] **Validation:** targeted manual checks (drag precision, resize stability, responsive resize, legacy layout parity).

## Review (to fill after implementation)

- **2026-03-26:** Layout editor/renderer compatibility upgrade landed with additive `layoutV2` model and dual-write behavior in editor move/resize flows. Added free/grid movement modes, snap toggle + configurable snap px, shift axis lock, selection highlight, lightweight alignment guides, and selected-widget anchor/percent panel in `TableLayoutEditor`. Renderer now resolves through `layoutV2` (when present) and falls back to legacy spans. Icon/text centering for AC/spell badges consolidated via new `StatBadgeShell`; numeric stability utility `.numeric-stable` added in `index.css`. **Verification:** `npm run build --workspace=@ddb/frontend` passes.

## Review — DDB ingest fidelity (2026-04-02)

- **Extension** ([../extensions/dndbeyond-cookie-sync/background.js](../extensions/dndbeyond-cookie-sync/background.js)): `spellSlotRowRawAvail` now uses `remaining` / `slotsRemaining` when `available` is 0 (matches backend `readSpellSlotParts`). `overlayLiveCharacterOntoLegacyTarget` OR-merges `inspiration` so v5 cannot clobber legacy `true`. Manifest **2.0.10**.
- **Userscript** ([../apps/frontend/public/userscripts/ddb-party-ingest.user.js](../apps/frontend/public/userscripts/ddb-party-ingest.user.js), mirror [../userscripts/ddb-party-ingest.user.js](../userscripts/ddb-party-ingest.user.js)): Ported extension-style `__deepMergeLiveOntoLegacy` + spell-slot merge + inspiration OR into `mergeCapturedCharacter` (richer payload as base). **Pull** now fetches legacy `/json` and v5 in parallel and merges like the extension; v4 fallback. Version **0.8.0**.
- **Backend** ([../apps/backend/src/services/character.service.ts](../apps/backend/src/services/character.service.ts)): `isDdbInspirationActive` accepts `hasInspiration` / `heroicInspiration` / `isInspired` aliases.
- **Verification:** `npm test --workspace=@ddb/backend -- src/services/character.service.test.ts` (24 tests) passes.

**Limitation:** Values that only exist inside DDB’s client rules engine (not in REST JSON) still cannot be ingested without a heavier client pipeline.

## Review — DDB conditions ingest (2026-04-02)

- **Extension** v**2.0.13**: `applyLiveAuthoritativeOverlay` — character-service always wins for `conditions`, `temporaryHitPoints` / `tempHitPoints`, `currentHitPoints`, `removedHitPoints`. Verbose activity log adds **`characterMerge`** rows (`mergeKind`, `conditionsCount`, `tempHp`). README: conditions troubleshooting + `party:setConditions` workaround.
- **Userscript** v**0.8.1**: `__applyLiveAuthoritativeOverlay` in `__overlayLiveCharacterOntoLegacyTarget` (same keys). `userscripts/README.md`: conditions + manual workaround note.
- **Backend**: `extractConditions` unions `conditions` + `activeConditions` (deduped labels); exported for tests; Vitest `extractConditions` describe block.
- **Verification:** `npm test --workspace=@ddb/backend -- src/services/character.service.test.ts` (28 tests) passes.

## Review — DDB conditions DOM scrape + Lay on Hands (2026-04-02)

- **Backend** ([`character.service.ts`](../apps/backend/src/services/character.service.ts)): Sheet nav label filter, `expandGluedConditionLabel`, Lay on Hands dedupe key + `min(used)` / `max(available)` merge across titled variants. Vitest: nav stripped, glued split, healing-pool merge.
- **Extension** v**2.0.23**: [`content-ddb-conditions.js`](../extensions/dndbeyond-cookie-sync/content-ddb-conditions.js) rejects nav labels in `addLabel`. [`background.js`](../extensions/dndbeyond-cookie-sync/background.js) — filter noise before cache; if scrape is all noise, drop cache entry; merge **unions** DOM + JSON instead of replacing; skip merge when no valid DOM labels (preserves API conditions like Hope’s glued string).
- **Verification:** `npm test --workspace=@ddb/backend` (81 tests) passes.
