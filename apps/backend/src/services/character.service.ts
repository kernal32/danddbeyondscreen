import type {
  CampaignRef,
  ClassResourceSummary,
  NormalizedCharacter,
  PartySnapshot,
  SpellSlotSourceDebug,
  SpellSlotSummary,
} from '@ddb/shared-types';
import {
  getInitiativeBonus,
  getMaxHp,
  getPassiveScore,
  getSpellSaveDc,
  getStatMod,
  resolveDisplayArmorClass,
  type DdbCharacter,
} from './character-calculator.js';
import { DdbError, type DndBeyondService } from './dndbeyond.service.js';

/**
 * Legacy `/json` often lists PHB conditions as `{ id, level }` with no `name` (see Hope Istiny sample).
 * Ids follow alphabetical PHB condition order on D&D Beyond’s SRD-style table (1–15).
 */
const DDB_STANDARD_CONDITION_DEFINITION_ID_TO_LABEL: Record<number, string> = {
  1: 'Blinded',
  2: 'Charmed',
  3: 'Deafened',
  4: 'Exhaustion',
  5: 'Frightened',
  6: 'Grappled',
  7: 'Incapacitated',
  8: 'Invisible',
  9: 'Paralyzed',
  10: 'Petrified',
  11: 'Poisoned',
  12: 'Prone',
  13: 'Restrained',
  14: 'Stunned',
  15: 'Unconscious',
};

function tryStandardConditionDefId(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return DDB_STANDARD_CONDITION_DEFINITION_ID_TO_LABEL[v] ? v : null;
}

/**
 * PHB standard condition id (1–15) from legacy `{ id: 7 }` rows **or** character-service instance rows
 * (`definitionId` / nested `definition.id` with large `id`).
 */
function resolveDdbStandardConditionDefinitionId(o: Record<string, unknown>): number | null {
  for (const key of ['definitionId', 'conditionDefinitionId', 'standardConditionDefinitionId']) {
    const t = tryStandardConditionDefId(o[key]);
    if (t != null) return t;
  }
  const def = o.definition;
  if (def && typeof def === 'object' && !Array.isArray(def)) {
    const d = def as Record<string, unknown>;
    for (const key of ['id', 'definitionId']) {
      const t = tryStandardConditionDefId(d[key]);
      if (t != null) return t;
    }
  }
  return tryStandardConditionDefId(o.id);
}

function labelFromDdbStandardConditionRef(o: Record<string, unknown>): string | null {
  const defId = resolveDdbStandardConditionDefinitionId(o);
  if (defId == null) return null;
  const base = DDB_STANDARD_CONDITION_DEFINITION_ID_TO_LABEL[defId];
  if (!base) return null;
  if (base === 'Exhaustion') {
    const lv = o.level;
    if (typeof lv === 'number' && lv >= 1 && lv <= 6) return `Exhaustion ${lv}`;
    return 'Exhaustion';
  }
  return base;
}

/** Lowercase display name → standard definition id (for catalog-leak detection on string arrays). */
const STANDARD_CONDITION_LABEL_TO_ID: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const [idStr, lab] of Object.entries(DDB_STANDARD_CONDITION_DEFINITION_ID_TO_LABEL)) {
    m[lab.toLowerCase()] = Number(idStr);
  }
  return m;
})();

function labelToStandardConditionDefinitionId(label: string): number | null {
  const t = String(label || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!t) return null;
  if (t === 'exhaustion' || /^exhaustion\s+[1-6]$/.test(t)) return 4;
  return STANDARD_CONDITION_LABEL_TO_ID[t] ?? null;
}

/**
 * DDB sometimes leaks spell-slot-shaped rows into `conditions` (numeric `id`, no name).
 * Only treat as leak when the id is **not** a known standard condition definition id.
 */
function isLikelySpellSlotLeakInConditions(o: Record<string, unknown>): boolean {
  if (typeof o.name === 'string' && o.name.trim()) return false;
  if (typeof o.label === 'string' && o.label.trim()) return false;
  const def = o.definition;
  if (def && typeof def === 'object' && typeof (def as Record<string, unknown>).name === 'string') return false;
  if (typeof o.id !== 'number' || !Number.isFinite(o.id)) return false;
  if (DDB_STANDARD_CONDITION_DEFINITION_ID_TO_LABEL[o.id]) return false;
  const lv = o.level;
  if (lv !== null && lv !== undefined && typeof lv !== 'number') return false;
  return true;
}

/** Character-sheet sidebar / tab labels that sometimes leak into `conditions` or DOM scrapes. */
const DDB_SHEET_NAV_LABELS = new Set([
  'proficiencies & training',
  'actions',
  'inventory',
  'features & traits',
  'extras',
  'all',
  'attack',
  'action',
  'bonus action',
  'reaction',
  'other',
  'limited use',
  'spells',
]);

/** Tokens from `[A-Z][a-z]+` runs we treat as separate conditions when glued together (e.g. DOM scrape). */
const CONDITION_TOKEN_WORDS = new Set([
  'blinded',
  'blessed',
  'charmed',
  'concentrating',
  'concentration',
  'cursed',
  'deafened',
  'exhausted',
  'exhaustion',
  'frightened',
  'grappled',
  'hasted',
  'haste',
  'hidden',
  'hiding',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'raging',
  'rage',
  'restrained',
  'sanctuary',
  'slowed',
  'slow',
  'stunned',
  'unconscious',
  'hex',
  'web',
]);

/** Last column in DDB spell tables: `--`, em/en dashes, minus, ellipsis, or empty. */
function isDdbSpellTablePlaceholderSegment(raw: string): boolean {
  const t = String(raw || '').trim();
  if (t === '' || t === '…' || t === '...') return true;
  const low = t.toLowerCase();
  if (low === '--' || low === '—' || low === '–') return true;
  // Any short run of dash / minus characters (DDB / fonts vary)
  if (/^[\u002d\u2010\u2011\u2012\u2013\u2014\u2015\u2212]{1,6}$/.test(t)) return true;
  return false;
}

/**
 * DDB spell blocks sometimes scrape as comma-separated rows like `Heal, Damage, 13, --`
 * (upcasting / damage column layout — not PHB conditions).
 */
export function isDdbSpellDamageTableRowNoise(label: string): boolean {
  const s = String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s.includes(',')) return false;
  const parts = s.split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 0);
  if (parts.length < 3) return false;
  if (!parts.some((p) => p.toLowerCase() === 'damage')) return false;
  const last = parts[parts.length - 1];
  if (isDdbSpellTablePlaceholderSegment(last)) return true;
  // Row ends with dice or slot count column, no trailing placeholder in scrape
  if (/^\d+$/.test(last)) return true;
  if (/^\d+d\d+$/i.test(last)) return true;
  return false;
}

/**
 * DOM sometimes reports spell table cells as **separate** "conditions" (`Heal`, `Damage`, `13`, `--`).
 * When both `heal` and `damage` appear as whole labels, drop those tokens plus numeric / placeholder columns.
 */
export function stripGroupedDdbSpellTableScrapeNoise(labels: string[]): string[] {
  const trimmed = labels.map((l) => String(l).trim()).filter((l) => l.length > 0);
  if (trimmed.length < 2) return trimmed;
  const lower = new Set(trimmed.map((l) => l.toLowerCase()));
  if (!lower.has('heal') || !lower.has('damage')) return trimmed;
  return trimmed.filter((l) => {
    const t = l.toLowerCase();
    if (t === 'heal' || t === 'damage') return false;
    if (/^\d+$/.test(l)) return false;
    if (isDdbSpellTablePlaceholderSegment(l)) return false;
    return true;
  });
}

/**
 * Drop known scrap noise from stored party rows (ingest may predate new filters).
 * Call on read and/or after merge before persisting.
 */
export function sanitizeNormalizedPartyConditions(party: PartySnapshot): PartySnapshot {
  return {
    ...party,
    characters: party.characters.map((c) => ({
      ...c,
      conditions: stripGroupedDdbSpellTableScrapeNoise(
        stripLikelyStandardConditionCatalogLeak(
          (c.conditions ?? []).filter(
            (lb) => String(lb).trim().length > 0 && !isDdbConditionUiPlaceholder(String(lb)),
          ),
        ),
      ),
    })),
  };
}

/** DDB sheet / DOM noise that is not a real game condition (empty-state CTAs, etc.). */
export function isDdbConditionUiPlaceholder(label: string): boolean {
  if (isDdbSpellDamageTableRowNoise(label)) return true;
  const trimmed = String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (trimmed && isDdbSpellTablePlaceholderSegment(trimmed)) return true;
  const t = trimmed.toLowerCase();
  if (!t) return true;
  if (DDB_SHEET_NAV_LABELS.has(t)) return true;
  if (t === 'add active conditions') return true;
  if (t === 'manage conditions') return true;
  if (t === 'no active conditions' || t === 'no conditions') return true;
  if (t.startsWith('add ') && t.includes('condition')) return true;
  if (t.includes('add active conditions')) return true;
  if (t === '0' || t === '+0') return true;
  return false;
}

/** Split `IncapacitatedProneRestrained` into separate PHB-style labels when every word is known. */
export function expandGluedConditionLabel(label: string): string[] {
  const s = String(label || '').trim();
  if (!s || s.includes(' ') || s.includes(',')) return [s];
  const parts = s.match(/[A-Z][a-z]+/g);
  if (!parts || parts.length < 2) return [s];
  const lower = parts.map((p) => p.toLowerCase());
  if (!lower.every((w) => CONDITION_TOKEN_WORDS.has(w))) return [s];
  return parts;
}

/** Turn DDB condition entries (string or rich object) into display labels. */
export function conditionToLabel(x: unknown): string {
  if (typeof x === 'string') return String(x).trim();
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
    if (typeof o.label === 'string' && o.label.trim()) return o.label.trim();
    const def = o.definition;
    if (def && typeof def === 'object') {
      const d = def as Record<string, unknown>;
      if (typeof d.name === 'string' && d.name.trim()) return d.name.trim();
    }
    const fromStdRef = labelFromDdbStandardConditionRef(o);
    if (fromStdRef) return fromStdRef;
    if (isLikelySpellSlotLeakInConditions(o)) return '';
  }
  if (x == null) return '';
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/**
 * Map one `conditions` / `activeConditions` entry to a PHB standard definition id when possible.
 * Used to detect the full definition catalog (ids 1…N) whether rows are `{ id }`, `{ id, name }`, or strings.
 */
function standardCatalogConditionIdFromEntry(x: unknown): number | null {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    const std = resolveDdbStandardConditionDefinitionId(x as Record<string, unknown>);
    if (std != null) return std;
  }
  const lb = conditionToLabel(x);
  if (!lb || isDdbConditionUiPlaceholder(lb)) return null;
  return labelToStandardConditionDefinitionId(lb);
}

/**
 * DDB exposes the full PHB condition *definition* list (ids 1…N) as if it were actives — often with
 * `name` on each row. Real sheets are sparse (e.g. Hope: 7, 12, 13). Same pattern can appear as strings.
 */
function isLikelyConsecutiveStandardConditionCatalogLeak(arr: unknown[]): boolean {
  if (arr.length < 8) return false;
  const ids: number[] = [];
  for (const x of arr) {
    const sid = standardCatalogConditionIdFromEntry(x);
    if (sid == null) return false;
    ids.push(sid);
  }
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length !== arr.length) return false;
  return sorted.every((v, i) => v === i + 1);
}

/** Drop a stored normalized `conditions` list that is the full standard catalog (already stringified). */
export function stripLikelyStandardConditionCatalogLeak(labels: string[]): string[] {
  if (labels.length < 8) return labels;
  const ids: number[] = [];
  for (const lb of labels) {
    const t = String(lb || '')
      .replace(/\s+/g, ' ')
      .trim();
    const sid = labelToStandardConditionDefinitionId(t);
    if (sid == null) return labels;
    ids.push(sid);
  }
  const sorted = [...ids].sort((a, b) => a - b);
  if (sorted.length !== labels.length) return labels;
  if (!sorted.every((v, i) => v === i + 1)) return labels;
  return [];
}

/** Labels from DDB condition arrays (top-level and known alternates). Exported for tests. */
export function extractConditions(raw: DdbCharacter): string[] {
  const r = raw as Record<string, unknown>;
  const labels = new Set<string>();
  const consume = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    if (isLikelyConsecutiveStandardConditionCatalogLeak(arr)) return;
    for (const x of arr) {
      const lb = conditionToLabel(x);
      if (!lb || isDdbConditionUiPlaceholder(lb)) continue;
      for (const piece of expandGluedConditionLabel(lb)) {
        if (piece && !isDdbConditionUiPlaceholder(piece)) labels.add(piece);
      }
    }
  };
  consume(r.conditions);
  /** Some character-service payloads use this key instead of `conditions`. */
  consume(r.activeConditions);
  return stripGroupedDdbSpellTableScrapeNoise([...labels]);
}

function httpUrl(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : null;
}

function ddbNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/** D&D Beyond default row before the player sets a real name (`WardenMain049's Character`, typographic apostrophe). */
export function isDdbGeneratedDefaultCharacterName(name: string): boolean {
  const t = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^.+?['\u2019]s Character$/i.test(t);
}

function ddbSocialOrNickname(o: Record<string, unknown>): string | null {
  return (
    ddbNonEmptyString(o.socialName) ??
    ddbNonEmptyString(o.social_name) ??
    ddbNonEmptyString(o.nickname)
  );
}

/**
 * STT / embedded `campaign.characters[]` rows often set **`characterName`** to DDB’s default
 * **`Username's Character`** while the name shown on the campaign card lives on **`displayName`**,
 * **`socialName`**, or **`name`** on the same object.
 */
function pickDdbCampaignRosterRowDisplayName(o: Record<string, unknown>): string | null {
  const keys = ['characterName', 'displayName', 'socialName', 'social_name', 'nickname', 'name'] as const;
  for (const k of keys) {
    const t = ddbNonEmptyString(o[k]);
    if (t && !isDdbGeneratedDefaultCharacterName(t)) return t;
  }
  return null;
}

/**
 * Campaign payload embeds `campaign.characters[]` with `characterId` + display fields. That roster can
 * update before the sheet’s top-level `name` (still **`Username's Character`**).
 */
function characterNameFromCampaignRoster(raw: DdbCharacter): string | null {
  const r = raw as Record<string, unknown>;
  const id = Number(r.id);
  if (!Number.isFinite(id)) return null;
  const camp = r.campaign;
  if (!camp || typeof camp !== 'object' || Array.isArray(camp)) return null;
  const chars = (camp as Record<string, unknown>).characters;
  if (!Array.isArray(chars)) return null;
  for (const row of chars) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const cid = Number(o.characterId ?? o.id);
    if (!Number.isFinite(cid) || cid !== id) continue;
    return pickDdbCampaignRosterRowDisplayName(o);
  }
  return null;
}

/**
 * Legacy `/json` + character-service merges often keep a stale top-level `name` while v5 puts the live
 * label on `character.name` / `characterSheet.name`. DDB also leaves **`Username's Character`** on `name`
 * while the chosen adventurer name lives on **`socialName`** / **`nickname`**, or only on **`campaign.characters[].characterName`** until the sheet syncs.
 */
export function resolveDdbCharacterName(raw: DdbCharacter): string {
  const r = raw as Record<string, unknown>;
  for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
    const sub = r[key];
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) continue;
    const rec = sub as Record<string, unknown>;
    const n = ddbNonEmptyString(rec.name);
    if (n && !isDdbGeneratedDefaultCharacterName(n)) return n;
    const soc = ddbSocialOrNickname(rec);
    if (soc) return soc;
    if (n) return n;
  }
  const top = ddbNonEmptyString(r.name);
  const topSoc = ddbSocialOrNickname(r);
  if (top && !isDdbGeneratedDefaultCharacterName(top)) return top;
  if (topSoc) return topSoc;

  const fromCamp = characterNameFromCampaignRoster(raw);
  if (fromCamp) return fromCamp;

  for (const key of ['displayName', 'characterName']) {
    const n = ddbNonEmptyString(r[key]);
    if (n && !isDdbGeneratedDefaultCharacterName(n)) return n;
  }

  if (top) return top;
  return 'Unknown';
}

/**
 * Re-run {@link resolveDdbCharacterName} on each row’s `ddbSheetJson` so account uploads pick up
 * `socialName` / nested v5 names without requiring a new extension sync (ingest may predate resolver fixes).
 */
export function refreshDdbCharacterNamesFromSheetJson(party: PartySnapshot): PartySnapshot {
  return {
    ...party,
    characters: party.characters.map((c) => {
      if (c.source !== 'ddb' || !c.ddbSheetJson || typeof c.ddbSheetJson !== 'object' || Array.isArray(c.ddbSheetJson)) {
        return c;
      }
      const next = resolveDdbCharacterName(c.ddbSheetJson as unknown as DdbCharacter);
      if (next === 'Unknown' || next === c.name) return c;
      return { ...c, name: next };
    }),
  };
}

/** Match userscript / DDB shapes: portrait may live on defaultBackdrop when avatarUrl is empty. */
export function resolveDdbPortraitUrl(raw: DdbCharacter): string {
  const r = raw as Record<string, unknown>;
  for (const k of ['avatarUrl', 'portraitUrl', 'thumbnailUrl', 'imageUrl']) {
    const u = httpUrl(r[k]);
    if (u) return u;
  }
  const db = r.defaultBackdrop;
  if (db && typeof db === 'object') {
    const d = db as Record<string, unknown>;
    for (const k of [
      'thumbnailBackdropAvatarUrl',
      'backdropAvatarUrl',
      'largeBackdropAvatarUrl',
      'smallBackdropAvatarUrl',
    ]) {
      const u = httpUrl(d[k]);
      if (u) return u;
    }
  }
  return '';
}

type SpellSlotParts = {
  level: number;
  used: number;
  /** Raw `available` / `numberAvailable` / `slots` from DDB (may mean max pool *or* slots remaining). */
  rawAvail: number;
  explicitMax: number;
  /** When DDB sends `remaining` / `slotsRemaining`, slots left for this row. */
  remainingField: number | null;
};

function readSpellSlotParts(item: unknown, inferredLevel?: number): SpellSlotParts | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  let level = Math.floor(Number(o.level ?? o.spellLevel ?? o.slotLevel));
  if (!Number.isFinite(level) || level < 1 || level > 9) {
    if (inferredLevel != null && inferredLevel >= 1 && inferredLevel <= 9) level = inferredLevel;
    else return null;
  }
  const used = Math.max(
    0,
    Math.floor(Number(o.used ?? o.numberUsed ?? o.expended ?? o.spent ?? o.numberExpended) || 0),
  );
  const rawAvail = Math.max(
    0,
    Math.floor(Number(o.available ?? o.numberAvailable ?? o.slots) || 0),
  );
  const remRaw = o.remaining ?? o.slotsRemaining;
  let remainingField: number | null = null;
  if (remRaw != null && remRaw !== '' && Number.isFinite(Number(remRaw))) {
    remainingField = Math.max(0, Math.floor(Number(remRaw) || 0));
  }
  const maxField = o.max ?? o.total ?? o.maximum;
  const explicitMax =
    typeof maxField === 'number' && Number.isFinite(maxField) && maxField > 0
      ? Math.max(0, Math.floor(maxField))
      : 0;
  return { level, used, rawAvail, explicitMax, remainingField };
}

/**
 * DDB is inconsistent: `available` is sometimes the **max pool** and sometimes **slots remaining**.
 * Use class `levelSpellSlots` row (`tableCap`) and explicit `max` / `total` on the row to disambiguate.
 */
function computeSpellPoolForLevel(
  tableCap: number,
  used: number,
  rawAvail: number,
  explicitMax: number,
  remainingDerivedPool: number,
): number {
  if (remainingDerivedPool > 0) {
    return Math.max(tableCap, explicitMax, remainingDerivedPool);
  }

  if (tableCap > 0 && used > 0 && rawAvail > 0) {
    if (rawAvail + used === tableCap) return tableCap;
    if (rawAvail === tableCap) return tableCap;
  }

  if (tableCap === 0 && explicitMax > 0) {
    if (used > 0 && rawAvail + used === explicitMax) return explicitMax;
    if (rawAvail === explicitMax) return explicitMax;
  }

  let pool = Math.max(tableCap, explicitMax, rawAvail);
  if (used > 0 && rawAvail > 0) {
    pool = Math.max(pool, rawAvail + used);
  }
  return pool;
}

type SpellClassRow = Record<string, unknown>;

function filterSpellcastingClasses(classes: unknown[]): SpellClassRow[] {
  if (!Array.isArray(classes)) return [];
  return classes.filter((c) => {
    const x = c as SpellClassRow;
    const def = x?.definition as Record<string, unknown> | undefined;
    const sr = def?.spellRules as Record<string, unknown> | undefined;
    return Array.isArray(sr?.levelSpellSlots);
  }) as SpellClassRow[];
}

/** Multiclass: sum of floor(classLevel / multiClassSpellSlotDivisor) for spellcasting classes. */
function getCombinedSpellcasterLevel(allClasses: unknown[]): number {
  let sum = 0;
  for (const c of allClasses) {
    const x = c as SpellClassRow;
    const def = x?.definition as Record<string, unknown> | undefined;
    if (!def) continue;
    const sr = def.spellRules as Record<string, unknown> | undefined;
    if (!Array.isArray(sr?.levelSpellSlots)) continue;
    const classLevel = Math.floor(Number(x.level) || 0);
    if (classLevel < 1) continue;
    const divisor = Math.max(1, Math.floor(Number(sr.multiClassSpellSlotDivisor) || 1));
    sum += Math.floor(classLevel / divisor);
  }
  return sum;
}

function getFirstLevelSpellSlotsTable(allClasses: unknown[]): number[][] | null {
  for (const c of allClasses) {
    const x = c as SpellClassRow;
    const def = x?.definition as Record<string, unknown> | undefined;
    const sr = def?.spellRules as Record<string, unknown> | undefined;
    const t = sr?.levelSpellSlots;
    if (Array.isArray(t) && t.length > 0) return t as number[][];
  }
  return null;
}

/** Row index = class level (single-class) or combined spellcaster level (multiclass). Index 0 is unused in DDB. */
function capacityBySpellLevelFromTable(table: number[][], rowIndex: number): Map<number, number> {
  const m = new Map<number, number>();
  if (rowIndex < 1 || rowIndex >= table.length) return m;
  const row = table[rowIndex];
  if (!Array.isArray(row)) return m;
  for (let i = 0; i < Math.min(9, row.length); i++) {
    const n = Math.max(0, Math.floor(Number(row[i]) || 0));
    if (n > 0) m.set(i + 1, n);
  }
  return m;
}

function collectSpellSlotSignals(r: Record<string, unknown>): {
  usedByLevel: Map<number, number>;
  rawAvailByLevel: Map<number, number>;
  /** Min of `rawAvail` per level (including 0) across spell slot arrays — detects “0 remaining” vs stale “pool” rows. */
  rawAvailMinByLevel: Map<number, number>;
  /** Min of positive `rawAvail` per level — “remaining” reads can be lower than structural duplicates in other arrays. */
  rawAvailMinPositiveByLevel: Map<number, number>;
  explicitMaxByLevel: Map<number, number>;
  remainingPoolByLevel: Map<number, number>;
} {
  const usedByLevel = new Map<number, number>();
  const rawAvailByLevel = new Map<number, number>();
  const rawAvailMinByLevel = new Map<number, number>();
  const rawAvailMinPositiveByLevel = new Map<number, number>();
  const explicitMaxByLevel = new Map<number, number>();
  const remainingPoolByLevel = new Map<number, number>();
  const keys: { key: string; inferNine?: boolean }[] = [
    { key: 'spellSlots', inferNine: true },
    { key: 'pactMagic' },
    { key: 'pactMagicSlots' },
  ];
  for (const { key, inferNine } of keys) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    const useNine = inferNine === true && arr.length === 9;
    for (let i = 0; i < arr.length; i++) {
      const p = readSpellSlotParts(arr[i], useNine ? i + 1 : undefined);
      if (!p) continue;
      const lv = p.level;
      /** Prefer **minimum** `used` across rows: stale endpoints often echo higher expended counts; the live sheet is lower. */
      const prevU = usedByLevel.get(lv);
      usedByLevel.set(lv, prevU === undefined ? p.used : Math.min(prevU, p.used));
      rawAvailByLevel.set(lv, Math.max(rawAvailByLevel.get(lv) ?? 0, p.rawAvail));
      {
        const prevAll = rawAvailMinByLevel.get(lv);
        rawAvailMinByLevel.set(
          lv,
          prevAll === undefined ? p.rawAvail : Math.min(prevAll, p.rawAvail),
        );
      }
      if (p.rawAvail > 0) {
        const prevMin = rawAvailMinPositiveByLevel.get(lv);
        rawAvailMinPositiveByLevel.set(
          lv,
          prevMin === undefined ? p.rawAvail : Math.min(prevMin, p.rawAvail),
        );
      }
      explicitMaxByLevel.set(lv, Math.max(explicitMaxByLevel.get(lv) ?? 0, p.explicitMax));
      if (p.remainingField != null) {
        const rp = p.remainingField + p.used;
        remainingPoolByLevel.set(lv, Math.max(remainingPoolByLevel.get(lv) ?? 0, rp));
      }
    }
  }
  return {
    usedByLevel,
    rawAvailByLevel,
    rawAvailMinByLevel,
    rawAvailMinPositiveByLevel,
    explicitMaxByLevel,
    remainingPoolByLevel,
  };
}

/**
 * D&D Beyond:
 * - `spellSlots` arrays often have `available: 0` while **slot counts** are in `levelSpellSlots[classLevel]`.
 * - Also merge `pactMagic` / `pactMagicSlots` and 9-length `spellSlots` index inference.
 */
const SPELL_SLOT_ARRAY_KEYS: { key: string; inferLevelFromNineLengthArray?: boolean }[] = [
  { key: 'spellSlots', inferLevelFromNineLengthArray: true },
  { key: 'pactMagic' },
  { key: 'pactMagicSlots' },
];

export function extractSpellSlots(raw: DdbCharacter): SpellSlotSummary[] {
  const r = raw as Record<string, unknown>;
  const allClasses = Array.isArray(r.classes) ? r.classes : [];
  const spellClasses = filterSpellcastingClasses(allClasses);

  const capFromTable = new Map<number, number>();
  const table = getFirstLevelSpellSlotsTable(allClasses);
  if (table && spellClasses.length > 0) {
    const rowIndex =
      spellClasses.length === 1
        ? Math.floor(Number(spellClasses[0].level) || 0)
        : getCombinedSpellcasterLevel(allClasses);
    for (const [lv, cap] of capacityBySpellLevelFromTable(table, rowIndex)) {
      capFromTable.set(lv, cap);
    }
  }

  const {
    usedByLevel,
    rawAvailByLevel,
    rawAvailMinByLevel,
    rawAvailMinPositiveByLevel,
    explicitMaxByLevel,
    remainingPoolByLevel,
  } = collectSpellSlotSignals(r);

  const arrayMerged = new Map<number, SpellSlotSummary>();
  for (const { key, inferLevelFromNineLengthArray } of SPELL_SLOT_ARRAY_KEYS) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    const useNine = inferLevelFromNineLengthArray === true && arr.length === 9;
    for (let i = 0; i < arr.length; i++) {
      const p = readSpellSlotParts(arr[i], useNine ? i + 1 : undefined);
      if (!p) continue;
      const tc = capFromTable.get(p.level) ?? 0;
      const remDerived = p.remainingField != null ? p.remainingField + p.used : 0;
      const pool = computeSpellPoolForLevel(tc, p.used, p.rawAvail, p.explicitMax, remDerived);
      if (pool <= 0 && p.used <= 0) continue;
      const row: SpellSlotSummary = { level: p.level, available: pool, used: p.used };
      const prev = arrayMerged.get(row.level);
      if (!prev) arrayMerged.set(row.level, row);
      else {
        /** Higher pool wins; at same pool prefer **lower** `used` (more slots remaining / fresher). */
        const prefer =
          row.available > prev.available ||
          (row.available === prev.available && row.used < prev.used);
        if (prefer) arrayMerged.set(row.level, row);
      }
    }
  }

  const levels = new Set<number>([
    ...usedByLevel.keys(),
    ...rawAvailByLevel.keys(),
    ...explicitMaxByLevel.keys(),
    ...remainingPoolByLevel.keys(),
    ...capFromTable.keys(),
    ...arrayMerged.keys(),
  ]);

  const out: SpellSlotSummary[] = [];
  for (const level of [...levels].sort((a, b) => a - b)) {
    const tableCap = capFromTable.get(level) ?? 0;
    const used = usedByLevel.get(level) ?? 0;
    const rawAvail = rawAvailByLevel.get(level) ?? 0;
    const explicitMax = explicitMaxByLevel.get(level) ?? 0;
    const remPool = remainingPoolByLevel.get(level) ?? 0;
    const fromArr = arrayMerged.get(level);
    const poolFromSignals = computeSpellPoolForLevel(tableCap, used, rawAvail, explicitMax, remPool);
    const arrayCap = fromArr?.available ?? 0;
    const arrayUsed = fromArr?.used ?? 0;
    const available = Math.max(poolFromSignals, arrayCap, used, arrayUsed);
    if (available <= 0 && used <= 0 && arrayUsed <= 0) continue;
    let mergedUsed = Math.max(used, arrayUsed);
    /**
     * DDB often puts **slots left** in `available` / `numberAvailable` but omits `used`. We already
     * resolved `available` (pool max). When rawAvail is strictly between 0 and pool, treat it as
     * remaining → used = pool − rawAvail (e.g. 1 left of 2 → 1 expended).
     */
    if (mergedUsed === 0 && available > 0) {
      const rawMax = rawAvailByLevel.get(level) ?? 0;
      const rawMinAll = rawAvailMinByLevel.get(level);
      const minPos = rawAvailMinPositiveByLevel.get(level);
      /**
       * One array/endpoint sends **0 remaining** as `available: 0` with `used: 0`; another still echoes the
       * **pool size** (e.g. 2). `Math.max` alone keeps the stale pool — infer **all slots expended**.
       * Skip when every source is 0 (`rawMax === 0`): DDB often uses all-zero rows until the table fills caps.
       */
      if (
        tableCap > 0 &&
        rawMinAll === 0 &&
        rawMax >= available &&
        rawMax > 0
      ) {
        mergedUsed = available;
      }
      if (mergedUsed === 0) {
        /**
         * When `spellSlots` and `pactMagic` disagree, `Math.max` keeps a structural “pool” read (e.g. 2)
         * that hides real remaining (e.g. 1). Prefer **min** only if we have a **class slot table** for this
         * character — otherwise a smaller pact row (2) vs full-caster row (4) would look like “remaining”.
         */
        let rawTop = rawMax;
        if (tableCap > 0 && minPos !== undefined && minPos > 0 && rawMax > minPos) {
          rawTop = minPos;
        }
        if (rawTop > 0 && rawTop < available) {
          const inferred = available - rawTop;
          if (inferred > 0 && inferred <= available) mergedUsed = inferred;
        }
      }
    }
    out.push({
      level,
      available,
      used: Math.min(mergedUsed, available),
    });
  }
  return out;
}

const LIMITED_USE_ACTION_BUCKETS = [
  'class',
  'race',
  'feat',
  'background',
  'bonusAction',
  'special',
] as const;

/** Merge "Lay on Hands" with "Lay On Hands: Healing Pool" into one pool. */
function classResourceDedupeKey(displayName: string): string {
  const n = displayName.toLowerCase().replace(/\s+/g, ' ').trim();
  if (n.includes('lay on hands')) return 'lay on hands';
  /** DDB often titles the slim row only "Healing Pool" (same resource as Lay on Hands). */
  if (n === 'healing pool') return 'lay on hands';
  /** Subtitle / colon variants without the phrase "lay on hands" in the action title. */
  if (/\bhealing pool\b/.test(n)) return 'lay on hands';
  return n;
}

/** PHB: Lay on Hands pool = 5 × paladin level (multiclass: sum paladin levels only). */
function getPaladinLayOnHandsPoolCap(raw: DdbCharacter): number {
  const r = raw as Record<string, unknown>;
  const classes = r.classes;
  if (!Array.isArray(classes)) return 0;
  let paladinLevels = 0;
  for (const c of classes) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const lv = Math.floor(Number(o.level) || 0);
    if (lv <= 0) continue;
    const def = o.definition;
    const cn =
      def && typeof def === 'object' && typeof (def as Record<string, unknown>).name === 'string'
        ? String((def as Record<string, unknown>).name)
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim()
        : '';
    if (cn.includes('paladin')) paladinLevels += lv;
  }
  return paladinLevels > 0 ? paladinLevels * 5 : 0;
}

/**
 * Collect `actions.*` entries with D&D Beyond `limitedUse` (Ki, Rage, Bardic Inspiration, etc.).
 * Skips spell-slot-cast rows (`usesSpellSlot`) to avoid duplicating slot UI.
 */
export function extractClassResources(raw: DdbCharacter): ClassResourceSummary[] {
  const r = raw as Record<string, unknown>;
  const actions = r.actions;
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) return [];

  const byDedupeKey = new Map<string, ClassResourceSummary>();
  const paladinLohCap = getPaladinLayOnHandsPoolCap(raw);

  for (const bucket of LIMITED_USE_ACTION_BUCKETS) {
    const arr = (actions as Record<string, unknown>)[bucket];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (o.usesSpellSlot === true) continue;
      const lu = o.limitedUse;
      if (!lu || typeof lu !== 'object') continue;
      const l = lu as Record<string, unknown>;
      const maxUses = Math.floor(
        Number(l.maxUses ?? l.numberAvailable ?? l.max ?? l.uses) || 0,
      );
      if (!Number.isFinite(maxUses) || maxUses <= 0) continue;
      const numberUsed = Math.max(
        0,
        Math.floor(
          Number(l.numberUsed ?? l.used ?? l.numberExpended ?? l.expended) || 0,
        ),
      );
      const def = o.definition;
      const defName =
        def && typeof def === 'object' && typeof (def as Record<string, unknown>).name === 'string'
          ? String((def as Record<string, unknown>).name).trim()
          : '';
      const name =
        (typeof o.name === 'string' && o.name.trim()) || defName || 'Resource';
      const dedupeKey = classResourceDedupeKey(name);
      let available = maxUses;
      let used = Math.min(numberUsed, available);
      if (dedupeKey === 'lay on hands' && paladinLohCap > 0) {
        available = Math.max(available, paladinLohCap);
        used = Math.min(used, available);
      }
      const prev = byDedupeKey.get(dedupeKey);
      if (!prev) {
        byDedupeKey.set(dedupeKey, { label: name, available, used });
      } else {
        /**
         * DDB often emits multiple `limitedUse` rows for one feature (e.g. Lay on Hands pool + UI copy).
         * First row can lag; prefer **minimum** `used` and **maximum** pool when keys collide.
         */
        let mergedAvail = Math.max(prev.available, available);
        let mergedUsed = Math.min(prev.used, used);
        if (dedupeKey === 'lay on hands' && paladinLohCap > 0) {
          mergedAvail = Math.max(mergedAvail, paladinLohCap);
          mergedUsed = Math.min(mergedUsed, mergedAvail);
        }
        const longerLabel = name.length > prev.label.length ? name : prev.label;
        byDedupeKey.set(dedupeKey, {
          label: longerLabel,
          available: mergedAvail,
          used: Math.min(mergedUsed, mergedAvail),
        });
      }
    }
  }

  const PRIORITY = ['ki', 'rage', 'bardic inspiration', 'sorcery points', 'superiority dice'];
  const rank = (label: string) => {
    const low = label.toLowerCase();
    const i = PRIORITY.findIndex((p) => low.includes(p));
    return i === -1 ? PRIORITY.length : i;
  };
  return [...byDedupeKey.values()].sort((a, b) => {
    const dr = rank(a.label) - rank(b.label);
    if (dr !== 0) return dr;
    return a.label.localeCompare(b.label);
  });
}

function cloneJsonRecord(raw: DdbCharacter): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    return { ...(raw as unknown as Record<string, unknown>) };
  }
}

/** Small clone of raw DDB spell-slot arrays for session-safe debug (full sheet is stripped). */
function pickSpellSlotSourceDebug(raw: DdbCharacter): SpellSlotSourceDebug | undefined {
  const r = raw as Record<string, unknown>;
  const out: SpellSlotSourceDebug = {};
  try {
    if (Array.isArray(r.spellSlots)) out.spellSlots = JSON.parse(JSON.stringify(r.spellSlots));
    if (Array.isArray(r.pactMagic)) out.pactMagic = JSON.parse(JSON.stringify(r.pactMagic));
    if (Array.isArray(r.pactMagicSlots)) out.pactMagicSlots = JSON.parse(JSON.stringify(r.pactMagicSlots));
  } catch {
    return undefined;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** True if any DDB field we know about indicates inspiration (merge clients may send aliases). */
function isDdbInspirationActive(raw: DdbCharacter): boolean {
  const r = raw as Record<string, unknown>;
  const i = r.inspiration;
  /** Explicit false clears inspired even if stale alias keys remain on the payload. */
  if (i === false || i === 0) return false;
  if (i === true || i === 1) return true;
  const h = r.hasInspiration ?? r.heroicInspiration ?? r.isInspired;
  return h === true || h === 1;
}

export function normalizeCharacter(raw: DdbCharacter): NormalizedCharacter {
  const id = Number(raw.id);
  const maxHp = getMaxHp(raw);
  const removed = Number(raw.removedHitPoints);
  const currentDirect = Number((raw as Record<string, unknown>).currentHitPoints);
  const tempHp = Math.max(
    0,
    Number(raw.temporaryHitPoints ?? (raw as Record<string, unknown>).tempHitPoints) || 0,
  );
  const currentHp = Number.isFinite(currentDirect) && currentDirect >= 0
    ? Math.min(Math.floor(currentDirect), maxHp)
    : Number.isFinite(removed) && removed >= 0
      ? Math.max(0, maxHp - removed)
      : maxHp;
  const spellSlots = extractSpellSlots(raw);
  const classResources = extractClassResources(raw);
  const spellSaveDC = getSpellSaveDc(raw);
  const spellSlotSourceDebug = pickSpellSlotSourceDebug(raw);
  return {
    id: String(id),
    name: resolveDdbCharacterName(raw),
    avatarUrl: resolveDdbPortraitUrl(raw) || String(raw.avatarUrl ?? ''),
    ac: resolveDisplayArmorClass(raw),
    maxHp,
    currentHp,
    tempHp,
    initiativeBonus: getInitiativeBonus(raw),
    dexterityModifier: getStatMod(raw, 'dex'),
    passivePerception: getPassiveScore(raw, 'perception'),
    passiveInvestigation: getPassiveScore(raw, 'investigation'),
    passiveInsight: getPassiveScore(raw, 'insight'),
    conditions: extractConditions(raw),
    ...(isDdbInspirationActive(raw) ? { inspired: true } : {}),
    source: 'ddb',
    ddbCharacterId: id,
    ...(spellSlots.length > 0 ? { spellSlots } : {}),
    ...(classResources.length > 0 ? { classResources } : {}),
    ...(spellSaveDC != null ? { spellSaveDC } : {}),
    ...(spellSlotSourceDebug ? { spellSlotSourceDebug } : {}),
    ddbSheetJson: cloneJsonRecord(raw),
  };
}

function campaignFromSeed(raw: DdbCharacter): CampaignRef | null {
  const camp = raw.campaign as Record<string, unknown> | undefined;
  if (!camp || typeof camp !== 'object') return null;
  const chars = (camp.characters as { characterId?: number }[]) ?? [];
  return {
    id: (camp.id as number) ?? null,
    name: String(camp.name ?? ''),
    link: String(camp.link ?? ''),
    description: String(camp.description ?? ''),
    characterIds: chars.map((c) => Number(c.characterId)).filter(Boolean),
  };
}

export class CharacterService {
  constructor(private ddb: DndBeyondService) {}

  /**
   * @param cookieHeader - Merged Cookie header for D&D Beyond (session override or env); omit for env-only default inside DndBeyondService.
   */
  async loadParty(
    seedCharacterId: number,
    bypassCache = false,
    cookieHeader?: string | undefined,
  ): Promise<PartySnapshot> {
    let upstreamDate: string | null = null;
    try {
      const seed = await this.ddb.getCharacterJson(seedCharacterId, bypassCache, cookieHeader);
      const d = seed.headers.date ?? seed.headers.Date;
      upstreamDate = Array.isArray(d) ? d[0] ?? null : d ?? null;
      const seedRaw = seed.json as DdbCharacter;
      const campaign = campaignFromSeed(seedRaw);

      const ids = new Set<number>([seedCharacterId]);
      if (campaign?.characterIds?.length) {
        for (const id of campaign.characterIds) ids.add(id);
      }

      const characters: NormalizedCharacter[] = [];
      const errors: string[] = [];

      const fetchOne = async (id: number) => {
        try {
          const { json } = await this.ddb.getCharacterJson(id, bypassCache, cookieHeader);
          characters.push(normalizeCharacter(json as DdbCharacter));
        } catch (e) {
          if (e instanceof DdbError) {
            errors.push(`Character ${id}: ${e.message}`);
          } else {
            errors.push(`Character ${id}: ${String(e)}`);
          }
        }
      };

      const concurrency = 3;
      const idList = [...ids];
      for (let i = 0; i < idList.length; i += concurrency) {
        const chunk = idList.slice(i, i + concurrency);
        await Promise.all(chunk.map(fetchOne));
      }

      characters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      return {
        campaign,
        characters,
        fetchedAt: new Date().toISOString(),
        upstreamDate,
        error: errors.length ? errors.join('; ') : null,
      };
    } catch (e) {
      const message = e instanceof DdbError ? e.message : String(e);
      return {
        campaign: null,
        characters: [],
        fetchedAt: new Date().toISOString(),
        upstreamDate,
        error: message,
      };
    }
  }

  /** Build party from D&D Beyond–shaped JSON objects (e.g. Tampermonkey scraping). */
  partyFromDdbJsonArray(rawCharacters: unknown[]): PartySnapshot {
    const characters: NormalizedCharacter[] = [];
    const errors: string[] = [];
    const max = Math.min(rawCharacters.length, 50);
    for (let i = 0; i < max; i++) {
      try {
        characters.push(normalizeCharacter(rawCharacters[i] as DdbCharacter));
      } catch {
        errors.push(`Index ${i}: not a valid DDB character JSON`);
      }
    }
    characters.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return {
      campaign: null,
      characters,
      fetchedAt: new Date().toISOString(),
      upstreamDate: null,
      error: errors.length ? errors.join('; ') : null,
    };
  }
}
