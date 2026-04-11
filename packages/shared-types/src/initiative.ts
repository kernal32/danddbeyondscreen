export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export const ROLL_MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage'] as const;

export function isRollMode(x: string): x is RollMode {
  return (ROLL_MODES as readonly string[]).includes(x);
}

/** DM-set reminders on an initiative row (not synced from DDB). */
export type InitiativeCombatTag = 'firstNextRound' | 'lastNextRound' | 'advNextAttack' | 'disNextAttack';

export const INITIATIVE_COMBAT_TAGS: readonly InitiativeCombatTag[] = [
  'firstNextRound',
  'lastNextRound',
  'advNextAttack',
  'disNextAttack',
] as const;

export function isInitiativeCombatTag(x: string): x is InitiativeCombatTag {
  return (INITIATIVE_COMBAT_TAGS as readonly string[]).includes(x);
}

/**
 * Initiative rolls: **Adv** / **Dis** cues (`advNextAttack` / `disNextAttack`) force two d20s (keep high / low).
 * Otherwise uses the entry's stored `rollMode` (usually `normal`). `initiative:roll` may still pass an override.
 */
export function effectiveInitiativeRollMode(e: {
  rollMode: RollMode;
  combatTags?: InitiativeCombatTag[];
}): RollMode {
  const tags = e.combatTags ?? [];
  if (tags.includes('advNextAttack')) return 'advantage';
  if (tags.includes('disNextAttack')) return 'disadvantage';
  return e.rollMode;
}

export interface InitiativeRollBreakdown {
  rolls: number[];
  kept: number;
  mod: number;
}

export interface InitiativeEntry {
  id: string;
  entityId: string;
  label: string;
  initiativeTotal: number;
  rollMode: RollMode;
  /** Initiative bonus (matches character.initiativeBonus when synced from party). */
  mod: number;
  /** Dexterity modifier when known (party / DDB); used for tiebreak after equal initiative totals. */
  dexMod?: number;
  locked: boolean;
  delayed: boolean;
  ready: boolean;
  groupId?: string;
  rollBreakdown?: InitiativeRollBreakdown;
  avatarUrl?: string;
  /** Snapshot at add time; UI may prefer live party conditions when entityId matches a PC. */
  conditions?: string[];
  /** DM-only cues (first/last next round, next attack adv/dis). */
  combatTags?: InitiativeCombatTag[];
}

export interface InitiativeState {
  round: number;
  /** Index into `turnOrder` */
  currentTurnIndex: number;
  /** Entry ids in combat order */
  turnOrder: string[];
  entries: Record<string, InitiativeEntry>;
  /** DM/TV: optional marker for “went last” / DM turn gap (click a row to set). */
  markedEntryId: string | null;
}

/** Default tracker state (server + client use the same shape). */
export function emptyInitiativeState(): InitiativeState {
  return {
    round: 1,
    currentTurnIndex: 0,
    turnOrder: [],
    entries: {},
    markedEntryId: null,
  };
}

/** Minimum `initiativeTotal` among entries listed in `turnOrder` (ignores missing ids). */
export function lowestInitiativeTotalInOrder(init: InitiativeState): number | null {
  const order = init?.turnOrder;
  const entries = init?.entries;
  if (!Array.isArray(order) || !entries || typeof entries !== 'object') return null;
  let min: number | null = null;
  for (const id of order) {
    const e = entries[id];
    if (!e) continue;
    const t = e.initiativeTotal;
    if (min === null || t < min) min = t;
  }
  return min;
}

/**
 * When `maskTotals` is false, always true (show full detail).
 * When true (display privacy): reveal leader (`turnOrder[0]`) and, if `revealLowest`, every entry tied for
 * {@link lowestInitiativeTotalInOrder}. If `turnOrder` is empty, all rows are revealed.
 */
export function shouldRevealInitiativeDetailOnDisplay(
  entry: InitiativeEntry,
  init: InitiativeState,
  opts: { maskTotals: boolean; revealLowest: boolean },
): boolean {
  if (!opts.maskTotals) return true;
  const order = init?.turnOrder;
  if (!Array.isArray(order) || order.length === 0) return true;
  const leaderId = order[0];
  if (!leaderId) return true;
  if (entry.id === leaderId) return true;
  if (opts.revealLowest) {
    const low = lowestInitiativeTotalInOrder(init);
    if (low !== null && entry.initiativeTotal === low) return true;
  }
  return false;
}
