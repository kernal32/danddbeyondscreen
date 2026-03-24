export type CharacterSource = 'ddb' | 'manual';

/** Spell slots from D&D Beyond `spellSlots` (levels 1–9 with used/available). */
export interface SpellSlotSummary {
  level: number;
  available: number;
  used: number;
}

/**
 * Limited-use pools from D&D Beyond `actions` (class/race/feat/etc.): Ki, Rage, Bardic Inspiration,
 * Sorcery Points, Arcane Recovery, and similar `limitedUse` rows.
 */
export interface ClassResourceSummary {
  label: string;
  available: number;
  used: number;
}

export interface NormalizedCharacter {
  id: string;
  name: string;
  avatarUrl: string;
  ac: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  conditions: string[];
  /** Heroic inspiration from D&D Beyond (`inspiration`); table/phone can override via session manual overrides. */
  inspired?: boolean;
  /** When true (usually via DM override), hidden from initiative sync and dimmed on party UI. */
  absent?: boolean;
  /** Dex + proficiency + bonuses for initiative (D&D Beyond); defaults to 0 if omitted. */
  initiativeBonus?: number;
  /** Dexterity ability modifier only (for initiative tiebreaks / UI); set from D&D Beyond ingest. */
  dexterityModifier?: number;
  /** 8 + PB + spellcasting ability mod when the sheet has a spellcasting class (server / DDB). */
  spellSaveDC?: number;
  source: CharacterSource;
  /** Present when imported from D&D Beyond */
  ddbCharacterId?: number;
  /** Omitted or empty when character has no leveled spell slots in the payload. */
  spellSlots?: SpellSlotSummary[];
  /** Omitted or empty when no `actions.*.limitedUse` pools appear in the DDB payload. */
  classResources?: ClassResourceSummary[];
  /**
   * Server-set Unix ms when this row was last written from `/api/ingest/party` merge.
   * Used to pick the newest payload when the same character id is uploaded again.
   */
  ingestedAt?: number;
}

export interface CampaignRef {
  id: number | null;
  name: string;
  link: string;
  description: string;
  characterIds: number[];
}

export interface PartySnapshot {
  campaign: CampaignRef | null;
  characters: NormalizedCharacter[];
  fetchedAt: string | null;
  upstreamDate: string | null;
  error: string | null;
}
