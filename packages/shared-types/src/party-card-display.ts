import {
  type PlayerCardLayoutMode,
  type PlayerCardLayoutSchema,
  parsePlayerCardLayoutSchemaField,
} from './player-card-layout-schema.js';

/** Vertical sections on the player card (order is configurable). */
export type PlayerCardSectionId =
  | 'header'
  | 'primaryStats'
  | 'movement'
  | 'abilities'
  | 'savingThrows'
  | 'senses'
  | 'classSummary'
  | 'spellSlots'
  | 'conditions';

export const DEFAULT_PLAYER_CARD_SECTION_ORDER: PlayerCardSectionId[] = [
  'header',
  'primaryStats',
  'movement',
  'abilities',
  'savingThrows',
  'senses',
  'classSummary',
  'spellSlots',
  'conditions',
];

const SECTION_ID_SET = new Set<PlayerCardSectionId>(DEFAULT_PLAYER_CARD_SECTION_ORDER);

/** Dedupe, drop unknowns, append any missing sections in default order. */
export function normalizePlayerCardSectionOrder(input: unknown): PlayerCardSectionId[] {
  if (!Array.isArray(input)) return [...DEFAULT_PLAYER_CARD_SECTION_ORDER];
  const seen = new Set<PlayerCardSectionId>();
  const out: PlayerCardSectionId[] = [];
  for (const x of input) {
    if (typeof x !== 'string') continue;
    if (!SECTION_ID_SET.has(x as PlayerCardSectionId)) continue;
    const id = x as PlayerCardSectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of DEFAULT_PLAYER_CARD_SECTION_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function effectivePlayerCardSectionOrder(o: PartyCardDisplayOptions): PlayerCardSectionId[] {
  if (o.sectionOrder && o.sectionOrder.length > 0) return o.sectionOrder;
  return [...DEFAULT_PLAYER_CARD_SECTION_ORDER];
}

/** Allowed range for {@link PartyCardDisplayOptions.primaryStatNumeralScalePercent} and `primaryStatIconScalePercent`. */
export const PRIMARY_STAT_SCALE_PERCENT_MIN = 25;
export const PRIMARY_STAT_SCALE_PERCENT_MAX = 400;

export function clampPrimaryStatScalePercent(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(PRIMARY_STAT_SCALE_PERCENT_MAX, Math.max(PRIMARY_STAT_SCALE_PERCENT_MIN, n));
}

/** Extra vertical margin (px) above and below the hairline between heart HP current vs max. Negative tightens. */
export const HP_HEART_NUMERAL_SPACING_PX_MIN = -32;
export const HP_HEART_NUMERAL_SPACING_PX_MAX = 32;

export function clampHpHeartNumeralSpacingPx(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(HP_HEART_NUMERAL_SPACING_PX_MAX, Math.max(HP_HEART_NUMERAL_SPACING_PX_MIN, Math.round(n)));
}

function mergeOptionalStatPercent(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return clampPrimaryStatScalePercent(n);
}

/** @returns `null` if present but not a valid number */
function parseStatPercentField(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return clampPrimaryStatScalePercent(n);
}

function mergeOptionalHpHeartSpacingPx(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return clampHpHeartNumeralSpacingPx(n);
}

function parseHpHeartSpacingPxField(raw: unknown): number | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return clampHpHeartNumeralSpacingPx(n);
}

/** DM/TV: which blocks appear on each party character card + section order. */
export interface PartyCardDisplayOptions {
  showAvatar: boolean;
  showCharacterName: boolean;
  showLevelRaceClass: boolean;
  showPlayerName: boolean;
  showHitPoints: boolean;
  /**
   * When true, show only current HP (e.g. `12`) in the heart and above the bar — not `12/15`.
   * Aligns visually with AC and spell save DC numerals.
   */
  hitPointsCurrentOnly: boolean;
  showHitPointsBar: boolean;
  showArmorClass: boolean;
  /** Primary row: spell save DC when `combat.spellSaveDC` is set (table/TV default). */
  showSpellSaveDC: boolean;
  /** Primary row: initiative modifier (usually redundant with initiative widget). */
  showInitiative: boolean;
  showMovement: boolean;
  showAbilities: boolean;
  showSavingThrows: boolean;
  showPassivePerception: boolean;
  showPassiveInvestigation: boolean;
  showPassiveInsight: boolean;
  showClassCombatSummary: boolean;
  showSpellSlots: boolean;
  /**
   * When true, show raw DDB `spellSlots` / `pactMagic` JSON from ingest under the normalized slot UI (debug).
   */
  showSpellSlotIngestRaw: boolean;
  /** Spell slot progress bars under slot counts. */
  showSpellSlotBars: boolean;
  /** Spell slots show as filled/unfilled pips instead of numeric counts. */
  showSpellSlotPips: boolean;
  /** Class resource progress bars under resource counts. */
  showClassResourceBars: boolean;
  /** Class resources show as filled/unfilled pips instead of numeric counts. */
  showClassResourcePips: boolean;
  showConditions: boolean;
  /** When false, hide temporary HP under the heart and the combined-card Temp HP block. */
  showTemporaryHitPoints: boolean;
  /** Full vertical section order; omitted or empty → canonical default. */
  sectionOrder?: PlayerCardSectionId[];
  /**
   * HP / AC / spell DC / initiative text in the primary row — percentage of the density-based size.
   * Omitted → 100% (follow TV/desktop density only).
   */
  primaryStatNumeralScalePercent?: number;
  /**
   * Heart / shield / spell SVG graphics in the primary row — percentage of the density-based frame.
   * Omitted → 100%.
   */
  primaryStatIconScalePercent?: number;
  /**
   * Heart HP overlay: added to `margin-top` and `margin-bottom` of the rule between current and max.
   * Omitted → 0. Negative values pull the two numbers closer together.
   */
  hpHeartNumeralSpacingPx?: number;
  /**
   * `schema` uses `playerCardLayoutSchema` when valid (see player-card-layout).
   * Omitted or `legacy` keeps the classic vertical PlayerCard.
   */
  playerCardLayoutMode?: PlayerCardLayoutMode;
  playerCardLayoutSchema?: PlayerCardLayoutSchema | null;
}

export const DEFAULT_PARTY_CARD_DISPLAY_OPTIONS: PartyCardDisplayOptions = {
  showAvatar: true,
  showCharacterName: true,
  showLevelRaceClass: true,
  showPlayerName: true,
  showHitPoints: true,
  hitPointsCurrentOnly: false,
  showHitPointsBar: true,
  showArmorClass: true,
  showSpellSaveDC: true,
  showInitiative: false,
  showMovement: true,
  showAbilities: true,
  showSavingThrows: true,
  showPassivePerception: true,
  showPassiveInvestigation: true,
  showPassiveInsight: true,
  showClassCombatSummary: true,
  showSpellSlots: true,
  showSpellSlotIngestRaw: false,
  showSpellSlotBars: true,
  showSpellSlotPips: false,
  showClassResourceBars: true,
  showClassResourcePips: false,
  showConditions: true,
  showTemporaryHitPoints: true,
};

const BOOLEAN_KEYS = [
  'showAvatar',
  'showCharacterName',
  'showLevelRaceClass',
  'showPlayerName',
  'showHitPoints',
  'hitPointsCurrentOnly',
  'showHitPointsBar',
  'showArmorClass',
  'showSpellSaveDC',
  'showInitiative',
  'showMovement',
  'showAbilities',
  'showSavingThrows',
  'showPassivePerception',
  'showPassiveInvestigation',
  'showPassiveInsight',
  'showClassCombatSummary',
  'showSpellSlots',
  'showSpellSlotIngestRaw',
  'showSpellSlotBars',
  'showSpellSlotPips',
  'showClassResourceBars',
  'showClassResourcePips',
  'showConditions',
  'showTemporaryHitPoints',
] as const satisfies readonly (keyof PartyCardDisplayOptions)[];

type BooleanKey = (typeof BOOLEAN_KEYS)[number];

function applyLegacyStatSizeAliases(partial: Partial<PartyCardDisplayOptions>, out: PartyCardDisplayOptions): void {
  const rec = partial as Record<string, unknown>;
  if (partial.primaryStatNumeralScalePercent === undefined) {
    const leg = rec.primaryStatNumeralSize;
    if (leg === 'smaller') out.primaryStatNumeralScalePercent = 85;
    else if (leg === 'larger') out.primaryStatNumeralScalePercent = 115;
  }
  if (partial.primaryStatIconScalePercent === undefined) {
    const leg = rec.primaryStatIconSize;
    if (leg === 'smaller') out.primaryStatIconScalePercent = 85;
    else if (leg === 'larger') out.primaryStatIconScalePercent = 115;
  }
}

export function mergePartyCardDisplayOptions(
  partial: Partial<PartyCardDisplayOptions> | null | undefined,
): PartyCardDisplayOptions {
  const out: PartyCardDisplayOptions = { ...DEFAULT_PARTY_CARD_DISPLAY_OPTIONS };
  if (partial == null || typeof partial !== 'object') return out;
  for (const k of BOOLEAN_KEYS) {
    const v = partial[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  if (partial.sectionOrder !== undefined) {
    out.sectionOrder = normalizePlayerCardSectionOrder(partial.sectionOrder);
  }
  const nNum = mergeOptionalStatPercent(partial.primaryStatNumeralScalePercent);
  if (nNum !== undefined) out.primaryStatNumeralScalePercent = nNum;
  const nIcon = mergeOptionalStatPercent(partial.primaryStatIconScalePercent);
  if (nIcon !== undefined) out.primaryStatIconScalePercent = nIcon;
  const hpSp = mergeOptionalHpHeartSpacingPx(partial.hpHeartNumeralSpacingPx);
  if (hpSp !== undefined) out.hpHeartNumeralSpacingPx = hpSp;
  applyLegacyStatSizeAliases(partial, out);
  return out;
}

/** Validate API/socket payload; returns merged options or null if invalid. */
export function parsePartyCardDisplayPayload(raw: unknown): PartyCardDisplayOptions | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const patch: Partial<PartyCardDisplayOptions> = {};
  for (const k of BOOLEAN_KEYS) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'boolean') return null;
    patch[k] = o[k];
  }
  if (o.sectionOrder !== undefined) {
    if (!Array.isArray(o.sectionOrder)) return null;
    patch.sectionOrder = normalizePlayerCardSectionOrder(o.sectionOrder);
  }
  if (o.primaryStatNumeralScalePercent !== undefined) {
    const p = parseStatPercentField(o.primaryStatNumeralScalePercent);
    if (p === null) return null;
    patch.primaryStatNumeralScalePercent = p;
  }
  if (o.primaryStatIconScalePercent !== undefined) {
    const p = parseStatPercentField(o.primaryStatIconScalePercent);
    if (p === null) return null;
    patch.primaryStatIconScalePercent = p;
  }
  if (o.hpHeartNumeralSpacingPx !== undefined) {
    const p = parseHpHeartSpacingPxField(o.hpHeartNumeralSpacingPx);
    if (p === null) return null;
    patch.hpHeartNumeralSpacingPx = p;
  }
  if (o.playerCardLayoutMode !== undefined) {
    const m = o.playerCardLayoutMode;
    if (m !== 'legacy' && m !== 'schema' && m !== 'auto') return null;
    patch.playerCardLayoutMode = m;
  }
  if (o.playerCardLayoutSchema !== undefined) {
    if (o.playerCardLayoutSchema === null) {
      patch.playerCardLayoutSchema = null;
    } else {
      const parsed = parsePlayerCardLayoutSchemaField(o.playerCardLayoutSchema);
      if (!parsed) return null;
      patch.playerCardLayoutSchema = parsed;
    }
  }
  return mergePartyCardDisplayOptions({
    ...patch,
    primaryStatNumeralSize: o.primaryStatNumeralSize,
    primaryStatIconSize: o.primaryStatIconSize,
  } as Partial<PartyCardDisplayOptions>);
}
