import type { CampaignRef, NormalizedCharacter, PartySnapshot, SpellSlotSummary } from '@ddb/shared-types';
import {
  calculateAc,
  getInitiativeBonus,
  getMaxHp,
  getPassiveScore,
  getSpellSaveDc,
  type DdbCharacter,
} from './character-calculator.js';
import { DdbError, type DndBeyondService } from './dndbeyond.service.js';

/**
 * DDB sometimes leaks spell-slot rows (`{ id, level: null }`) into `conditions`; those are not display labels.
 */
function isLikelySpellSlotLeakInConditions(o: Record<string, unknown>): boolean {
  if (typeof o.name === 'string' && o.name.trim()) return false;
  if (typeof o.label === 'string' && o.label.trim()) return false;
  const def = o.definition;
  if (def && typeof def === 'object' && typeof (def as Record<string, unknown>).name === 'string') return false;
  if (typeof o.id !== 'number' || !Number.isFinite(o.id)) return false;
  const lv = o.level;
  if (lv !== null && lv !== undefined && typeof lv !== 'number') return false;
  return true;
}

/** Turn DDB condition entries (string or rich object) into display labels. */
export function conditionToLabel(x: unknown): string {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
    if (typeof o.label === 'string' && o.label.trim()) return o.label.trim();
    const def = o.definition;
    if (def && typeof def === 'object') {
      const d = def as Record<string, unknown>;
      if (typeof d.name === 'string' && d.name.trim()) return d.name.trim();
    }
    if (isLikelySpellSlotLeakInConditions(o)) return '';
  }
  if (x == null) return '';
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function extractConditions(raw: DdbCharacter): string[] {
  const direct = raw.conditions;
  if (Array.isArray(direct)) {
    return direct.map((x) => conditionToLabel(x)).filter(Boolean);
  }
  return [];
}

function httpUrl(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return /^https?:\/\//i.test(t) ? t : null;
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

function readSpellSlotArrayEntry(item: unknown, inferredLevel?: number): { level: number; used: number; available: number } | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  let level = Math.floor(Number(o.level ?? o.spellLevel ?? o.slotLevel));
  if (!Number.isFinite(level) || level < 1 || level > 9) {
    if (inferredLevel != null && inferredLevel >= 1 && inferredLevel <= 9) level = inferredLevel;
    else return null;
  }
  let available = Math.max(
    0,
    Math.floor(Number(o.available ?? o.numberAvailable ?? o.slots) || 0),
  );
  const used = Math.max(0, Math.floor(Number(o.used ?? o.numberUsed) || 0));
  if (available === 0) {
    const max = o.max ?? o.total ?? o.maximum;
    if (typeof max === 'number' && Number.isFinite(max)) {
      available = Math.max(0, Math.floor(max));
    }
  }
  return { level, used, available };
}

function parseSpellSlotRow(item: unknown, inferredLevel?: number): SpellSlotSummary | null {
  const e = readSpellSlotArrayEntry(item, inferredLevel);
  if (!e) return null;
  if (e.available === 0 && e.used === 0) return null;
  return { level: e.level, available: e.available, used: e.used };
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

function collectUsedAndApiCapacityFromSlotArrays(r: Record<string, unknown>): {
  usedByLevel: Map<number, number>;
  apiCapByLevel: Map<number, number>;
} {
  const usedByLevel = new Map<number, number>();
  const apiCapByLevel = new Map<number, number>();
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
      const e = readSpellSlotArrayEntry(arr[i], useNine ? i + 1 : undefined);
      if (!e) continue;
      usedByLevel.set(e.level, Math.max(usedByLevel.get(e.level) ?? 0, e.used));
      if (e.available > 0) {
        apiCapByLevel.set(e.level, Math.max(apiCapByLevel.get(e.level) ?? 0, e.available));
      }
    }
  }
  return { usedByLevel, apiCapByLevel };
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

  const { usedByLevel, apiCapByLevel } = collectUsedAndApiCapacityFromSlotArrays(r);

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

  const arrayMerged = new Map<number, SpellSlotSummary>();
  for (const { key, inferLevelFromNineLengthArray } of SPELL_SLOT_ARRAY_KEYS) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    const useNine = inferLevelFromNineLengthArray === true && arr.length === 9;
    for (let i = 0; i < arr.length; i++) {
      const row = parseSpellSlotRow(arr[i], useNine ? i + 1 : undefined);
      if (!row) continue;
      const prev = arrayMerged.get(row.level);
      if (!prev) arrayMerged.set(row.level, row);
      else {
        const prefer =
          row.available > prev.available ||
          (row.available === prev.available && row.used > prev.used);
        if (prefer) arrayMerged.set(row.level, row);
      }
    }
  }

  const levels = new Set<number>([
    ...usedByLevel.keys(),
    ...apiCapByLevel.keys(),
    ...capFromTable.keys(),
    ...arrayMerged.keys(),
  ]);

  const out: SpellSlotSummary[] = [];
  for (const level of [...levels].sort((a, b) => a - b)) {
    const tableCap = capFromTable.get(level) ?? 0;
    const apiCap = apiCapByLevel.get(level) ?? 0;
    const used = usedByLevel.get(level) ?? 0;
    const fromArr = arrayMerged.get(level);
    const arrayCap = fromArr?.available ?? 0;
    const arrayUsed = fromArr?.used ?? 0;
    const available = Math.max(tableCap, apiCap, arrayCap, used, arrayUsed);
    if (available <= 0 && used <= 0 && arrayUsed <= 0) continue;
    const mergedUsed = Math.max(used, arrayUsed);
    out.push({
      level,
      available,
      used: Math.min(mergedUsed, available),
    });
  }
  return out;
}

export function normalizeCharacter(raw: DdbCharacter): NormalizedCharacter {
  const id = Number(raw.id);
  const maxHp = getMaxHp(raw);
  const removed = Number(raw.removedHitPoints) || 0;
  const tempHp = Number(raw.temporaryHitPoints) || 0;
  const spellSlots = extractSpellSlots(raw);
  const spellSaveDC = getSpellSaveDc(raw);
  return {
    id: String(id),
    name: String(raw.name ?? 'Unknown'),
    avatarUrl: resolveDdbPortraitUrl(raw) || String(raw.avatarUrl ?? ''),
    ac: calculateAc(raw),
    maxHp,
    currentHp: Math.max(0, maxHp - removed),
    tempHp,
    initiativeBonus: getInitiativeBonus(raw),
    passivePerception: getPassiveScore(raw, 'perception'),
    passiveInvestigation: getPassiveScore(raw, 'investigation'),
    passiveInsight: getPassiveScore(raw, 'insight'),
    conditions: extractConditions(raw),
    source: 'ddb',
    ddbCharacterId: id,
    ...(spellSlots.length > 0 ? { spellSlots } : {}),
    ...(spellSaveDC != null ? { spellSaveDC } : {}),
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
