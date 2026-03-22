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
