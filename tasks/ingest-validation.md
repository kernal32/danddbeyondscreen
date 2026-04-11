# DDB Ingest Completeness Validation

## What was validated

- Ingest mode `format: "ddb_characters"` normalization path:
  - `apps/backend/src/routes/api.ts` -> `characters.partyFromDdbJsonArray(...)`
- HP normalization logic:
  - `apps/backend/src/services/character.service.ts`
  - `apps/backend/src/services/character-calculator.ts`
- Frontend HP consumption:
  - `apps/frontend/src/components/player-card/mapPlayerCardData.ts`

## Captured payload sample used

- Source: `docs/examplejson.json` (real DDB character JSON shape, character id `163111290`).
- This payload includes all required health-source fields used by normalization:
  - `removedHitPoints`
  - `temporaryHitPoints`
  - `overrideHitPoints`
  - `baseHitPoints`
  - `bonusHitPoints`
  - `classes`
  - `preferences`
  - `stats` / `overrideStats`
  - `modifiers`

## Findings

1. The sample payload shape is complete for HP normalization.
2. Stored upload data currently has normalized HP fields present for all characters (`maxHp`, `currentHp`, `tempHp`).
3. Added guard-rail normalization support for an alternate DDB HP shape:
   - If `removedHitPoints` is absent but `currentHitPoints` is present, use `currentHitPoints`.
4. Added tests to prevent regressions for:
   - Real fixture HP normalization.
   - `currentHitPoints` fallback behavior.

## Admin full ingest snapshot

`GET /api/admin/users/:id/ingest` returns **every** character in the stash with combat/passive/slot/resource fields plus `hasAvatarUrl`, `avatarUrlPrefix`, and `conditionsPreview`. Use the Admin UI **Load ingest snapshot** table (wide, scrollable) to verify data without SQL.

## How to re-run this validation

1. Run backend tests:

```bash
npm test --workspace=@ddb/backend
```

2. Capture a live userscript snapshot on dndbeyond.com:

```js
__ddbPartyIngestDebug.snapshot().then(console.log)
```

3. Confirm queue characters contain HP source fields before push.
4. Push ingest payload and confirm table import shows matching values for:
   - `maxHp`
   - `currentHp`
   - `tempHp`
