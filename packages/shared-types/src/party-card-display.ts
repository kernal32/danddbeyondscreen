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

/** DM/TV: which blocks appear on each party character card + section order. */
export interface PartyCardDisplayOptions {
  showAvatar: boolean;
  showCharacterName: boolean;
  showLevelRaceClass: boolean;
  showPlayerName: boolean;
  showHitPoints: boolean;
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
  showConditions: boolean;
  /** Full vertical section order; omitted or empty → canonical default. */
  sectionOrder?: PlayerCardSectionId[];
}

export const DEFAULT_PARTY_CARD_DISPLAY_OPTIONS: PartyCardDisplayOptions = {
  showAvatar: true,
  showCharacterName: true,
  showLevelRaceClass: true,
  showPlayerName: true,
  showHitPoints: true,
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
  showConditions: true,
};

const BOOLEAN_KEYS = [
  'showAvatar',
  'showCharacterName',
  'showLevelRaceClass',
  'showPlayerName',
  'showHitPoints',
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
  'showConditions',
] as const satisfies readonly (keyof PartyCardDisplayOptions)[];

type BooleanKey = (typeof BOOLEAN_KEYS)[number];

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
  return mergePartyCardDisplayOptions(patch);
}
