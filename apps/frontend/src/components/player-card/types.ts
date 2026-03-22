import type { SpellSlotSummary } from '@ddb/shared-types';

/** TV party widget: card typography/padding when fitting 3×3 or 3×4 character grids */
export type TvPartyGridDensity = 'cozy' | 'compact' | 'dense';

/** Larger parties → smaller cards on the table display (3 columns). */
export function tvPartyGridDensityFromCount(count: number): TvPartyGridDensity {
  if (count > 9) return 'dense';
  if (count > 6) return 'compact';
  return 'cozy';
}

export type PlayerCardData = {
  name: string;
  avatarUrl?: string;
  level?: number;
  race?: string;
  class?: string;
  playerName?: string;
  hp: { current: number; max: number; tempHp?: number };
  ac: number;
  initiativeMod?: number;
  speed?: { walk: number; climb?: number; swim?: number };
  abilities?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  saves?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  passives?: { perception: number; investigation: number; insight: number };
  senses?: string[];
  /** e.g. "Warlock 12" — optional extra lines */
  classSummaryLines?: string[];
  combat?: { spellSaveDC?: number; attackBonus?: number };
  spellSlots?: SpellSlotSummary[];
  conditions?: string[];
};
