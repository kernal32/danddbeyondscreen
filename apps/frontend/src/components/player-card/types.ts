import type {
  ClassResourceSummary,
  SpellSlotSourceDebug,
  SpellSlotSummary,
} from '@ddb/shared-types/character';

/** TV party widget: card typography/padding when fitting 3×3 or 3×4 character grids */
export type TvPartyGridDensity = 'cozy' | 'compact' | 'dense';

/** Larger parties → smaller cards on the table display (3 columns). */
export function tvPartyGridDensityFromCount(count: number): TvPartyGridDensity {
  if (count > 9) return 'dense';
  if (count > 6) return 'compact';
  return 'cozy';
}

const DENSITY_ORDER: TvPartyGridDensity[] = ['cozy', 'compact', 'dense'];

/**
 * When the party widget’s grid cell is small (layout designer / resized TV cells), step up density so typography
 * matches the allocated space before the party widget’s fit-content zoom runs.
 */
export function tightenPartyDensityForGridCell(
  base: TvPartyGridDensity,
  gridW: number,
  gridH: number,
  layoutRowCount: number,
): TvPartyGridDensity {
  let idx = DENSITY_ORDER.indexOf(base);
  if (idx < 0) idx = 0;

  const rows = Math.max(1, layoutRowCount);
  const verticalShare = gridH / rows;
  const widthShare = gridW / 12;

  if (verticalShare <= 1 / 3) idx = Math.min(2, idx + 2);
  else if (verticalShare <= 0.55) idx = Math.min(2, idx + 1);

  if (widthShare < 0.36) idx = Math.min(2, idx + 2);
  else if (widthShare < 0.48) idx = Math.min(2, idx + 1);

  return DENSITY_ORDER[idx];
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
  /** Raw DDB slot arrays from last ingest (when server attached `spellSlotSourceDebug`). */
  spellSlotSourceDebug?: SpellSlotSourceDebug;
  /** Ki, Rage, Bardic Inspiration, etc. (D&D Beyond `actions.*.limitedUse`) */
  classResources?: ClassResourceSummary[];
  conditions?: string[];
};
