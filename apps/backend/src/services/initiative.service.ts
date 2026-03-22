import {
  effectiveInitiativeRollMode,
  isInitiativeCombatTag,
  type InitiativeCombatTag,
  type InitiativeEntry,
  type InitiativeState,
  type NormalizedCharacter,
  type RollMode,
} from '@ddb/shared-types';
import { randomInt } from 'node:crypto';

export function emptyInitiativeState(): InitiativeState {
  return {
    round: 1,
    currentTurnIndex: 0,
    turnOrder: [],
    entries: {},
    markedEntryId: null,
  };
}

function newId(): string {
  return randomInt(1, 2 ** 31).toString(36) + Date.now().toString(36);
}

function rollD20(): number {
  return randomInt(1, 20);
}

export function rollWithMode(mode: RollMode): { rolls: number[]; kept: number } {
  if (mode === 'advantage') {
    const a = rollD20();
    const b = rollD20();
    return { rolls: [a, b], kept: Math.max(a, b) };
  }
  if (mode === 'disadvantage') {
    const a = rollD20();
    const b = rollD20();
    return { rolls: [a, b], kept: Math.min(a, b) };
  }
  const v = rollD20();
  return { rolls: [v], kept: v };
}

export function addCombatant(
  state: InitiativeState,
  input: {
    label: string;
    entityId?: string;
    mod?: number;
    groupId?: string;
    initiativeTotal?: number;
    rollMode?: RollMode;
    avatarUrl?: string;
    conditions?: string[];
  },
): InitiativeState {
  const id = newId();
  const entityId = input.entityId ?? id;
  const mod = input.mod ?? 0;
  const rollMode = input.rollMode ?? 'normal';
  const entry: InitiativeEntry = {
    id,
    entityId,
    label: input.label,
    initiativeTotal: input.initiativeTotal ?? 0,
    rollMode,
    mod,
    locked: false,
    delayed: false,
    ready: false,
    groupId: input.groupId,
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.conditions?.length ? { conditions: [...input.conditions] } : {}),
  };
  return {
    ...state,
    markedEntryId: state.markedEntryId ?? null,
    entries: { ...state.entries, [id]: entry },
    turnOrder: [...state.turnOrder, id],
  };
}

export function removeCombatant(state: InitiativeState, entryId: string): InitiativeState {
  const { [entryId]: _removed, ...restEntries } = state.entries;
  const oldOrder = state.turnOrder;
  const idx = oldOrder.indexOf(entryId);
  const turnOrder = oldOrder.filter((id) => id !== entryId);
  let currentTurnIndex = state.currentTurnIndex;
  if (idx === -1) {
    return {
      ...state,
      entries: restEntries,
      turnOrder,
      markedEntryId: state.markedEntryId === entryId ? null : (state.markedEntryId ?? null),
    };
  }
  if (idx < currentTurnIndex) {
    currentTurnIndex -= 1;
  } else if (idx === currentTurnIndex) {
    currentTurnIndex = Math.min(currentTurnIndex, Math.max(0, turnOrder.length - 1));
  }
  if (turnOrder.length === 0) {
    currentTurnIndex = 0;
  } else if (currentTurnIndex >= turnOrder.length) {
    currentTurnIndex = turnOrder.length - 1;
  }
  const markedEntryId = state.markedEntryId === entryId ? null : (state.markedEntryId ?? null);
  return { ...state, entries: restEntries, turnOrder, currentTurnIndex, markedEntryId };
}

/** Remove every initiative row tied to a character id (e.g. player marked absent). */
export function removeByEntityId(state: InitiativeState, entityId: string): InitiativeState {
  const want = String(entityId);
  const toRemove = state.turnOrder.filter((id) => String(state.entries[id]?.entityId ?? '') === want);
  let next = state;
  for (const id of toRemove) {
    next = removeCombatant(next, id);
  }
  return next;
}

/** Strip rows whose `entityId` is in `excludeEntityIds` (e.g. hidden-from-table party members for display clients). */
export function filterInitiativeExcludingEntityIds(
  state: InitiativeState,
  excludeEntityIds: Set<string>,
): InitiativeState {
  if (excludeEntityIds.size === 0) return state;
  const toRemove = state.turnOrder.filter((id) => {
    const e = state.entries[id];
    return e && excludeEntityIds.has(String(e.entityId));
  });
  let next = state;
  for (const id of toRemove) {
    next = removeCombatant(next, id);
  }
  return next;
}

export function rollInitiative(
  state: InitiativeState,
  entryId?: string,
  overrideMode?: RollMode,
  overrideMod?: number,
): InitiativeState {
  const ids = entryId ? [entryId] : state.turnOrder;
  const nextEntries = { ...state.entries };
  for (const id of ids) {
    const e = nextEntries[id];
    if (!e) continue;
    const mode = overrideMode ?? effectiveInitiativeRollMode(e);
    const { rolls, kept } = rollWithMode(mode);
    const mod = overrideMod ?? e.mod;
    const total = kept + mod;
    nextEntries[id] = {
      ...e,
      rollMode: mode,
      initiativeTotal: total,
      rollBreakdown: { rolls, kept, mod },
    };
  }
  return { ...state, entries: nextEntries, markedEntryId: state.markedEntryId ?? null };
}

/** Sort by initiative (desc). Ties: higher initiative bonus (`mod`) first. Locked combatants stay at their index. */
export function sortInitiative(state: InitiativeState): InitiativeState {
  const order = [...state.turnOrder];
  if (!order.length) return state;

  const unlockedIds = order.filter((id) => !state.entries[id]?.locked);
  const sortedUnlocked = [...unlockedIds].sort((a, b) => {
    const ea = state.entries[a];
    const eb = state.entries[b];
    const ta = ea?.initiativeTotal ?? 0;
    const tb = eb?.initiativeTotal ?? 0;
    if (tb !== ta) return tb - ta;
    const ma = ea?.mod ?? 0;
    const mb = eb?.mod ?? 0;
    if (mb !== ma) return mb - ma;
    return a.localeCompare(b);
  });

  let u = 0;
  const nextOrder = order.map((id) => {
    if (state.entries[id]?.locked) return id;
    return sortedUnlocked[u++]!;
  });

  return { ...state, turnOrder: nextOrder, markedEntryId: state.markedEntryId ?? null };
}

export function setInitiativeTotal(
  state: InitiativeState,
  entryId: string,
  total: number,
): InitiativeState {
  const e = state.entries[entryId];
  if (!e) return state;
  return {
    ...state,
    entries: {
      ...state.entries,
      [entryId]: { ...e, initiativeTotal: total, rollBreakdown: undefined },
    },
    markedEntryId: state.markedEntryId ?? null,
  };
}

export function toggleLock(state: InitiativeState, entryId: string): InitiativeState {
  const e = state.entries[entryId];
  if (!e) return state;
  return {
    ...state,
    entries: {
      ...state.entries,
      [entryId]: { ...e, locked: !e.locked },
    },
    markedEntryId: state.markedEntryId ?? null,
  };
}

export function nextTurn(state: InitiativeState): InitiativeState {
  if (!state.turnOrder.length) return state;
  let nextIndex = state.currentTurnIndex + 1;
  let round = state.round;
  if (nextIndex >= state.turnOrder.length) {
    nextIndex = 0;
    round += 1;
  }
  return {
    ...state,
    currentTurnIndex: nextIndex,
    round,
    markedEntryId: state.markedEntryId ?? null,
  };
}

export function prevTurn(state: InitiativeState): InitiativeState {
  if (!state.turnOrder.length) return state;
  let nextIndex = state.currentTurnIndex - 1;
  let round = state.round;
  if (nextIndex < 0) {
    nextIndex = state.turnOrder.length - 1;
    round = Math.max(1, round - 1);
  }
  return {
    ...state,
    currentTurnIndex: nextIndex,
    round,
    markedEntryId: state.markedEntryId ?? null,
  };
}

/** Increase round counter only (TV / manual pacing); does not change turn index or tick effects. */
export function incrementRoundOnly(state: InitiativeState): InitiativeState {
  return {
    ...state,
    round: state.round + 1,
    markedEntryId: state.markedEntryId ?? null,
  };
}

/** Decrease round counter only; floor at 1. */
export function decrementRoundOnly(state: InitiativeState): InitiativeState {
  return {
    ...state,
    round: Math.max(1, state.round - 1),
    markedEntryId: state.markedEntryId ?? null,
  };
}

/** Move current combatant to end of this round's order (acts last before wrap). */
export function delayCurrent(state: InitiativeState): InitiativeState {
  if (!state.turnOrder.length) return state;
  const currentId = state.turnOrder[state.currentTurnIndex];
  if (!currentId) return state;
  const rest = state.turnOrder.filter((_, i) => i !== state.currentTurnIndex);
  const nextOrder = [...rest, currentId];
  const nextIndex = Math.min(state.currentTurnIndex, nextOrder.length - 1);
  const e = state.entries[currentId];
  const entries = {
    ...state.entries,
    ...(e ? { [currentId]: { ...e, delayed: true } } : {}),
  };
  return {
    ...state,
    turnOrder: nextOrder,
    currentTurnIndex: nextIndex,
    entries,
    markedEntryId: state.markedEntryId ?? null,
  };
}

export function clearInitiative(_state: InitiativeState): InitiativeState {
  return emptyInitiativeState();
}

/** Clear tracker and add non-absent party members (mods from character.initiativeBonus). */
export function startCombatFromParty(
  state: InitiativeState,
  characters: NormalizedCharacter[],
  options?: { skipCharacterIds?: Set<string> },
): InitiativeState {
  const skip = options?.skipCharacterIds;
  let next = clearInitiative(state);
  for (const c of characters) {
    if (c.absent) continue;
    if (skip?.has(String(c.id))) continue;
    const mod =
      typeof c.initiativeBonus === 'number' && Number.isFinite(c.initiativeBonus)
        ? c.initiativeBonus
        : 0;
    next = addCombatant(next, {
      label: c.name,
      entityId: c.id,
      mod,
      avatarUrl: c.avatarUrl || undefined,
      conditions: c.conditions.length ? [...c.conditions] : undefined,
    });
  }
  return { ...next, round: 1, currentTurnIndex: 0, markedEntryId: null };
}

export function rerollAllInitiative(state: InitiativeState): InitiativeState {
  let next = rollInitiative(state);
  next = sortInitiative(next);
  return { ...next, currentTurnIndex: 0, markedEntryId: null };
}

const ROUND_PLAN_COMBAT_TAGS: InitiativeCombatTag[] = ['firstNextRound', 'lastNextRound'];

/** Clears first/last-next-round tags once those rounds begin (paired with advanceRoundAndRerollInitiative). */
export function stripRoundPlanCombatTags(state: InitiativeState): InitiativeState {
  const entries = { ...state.entries };
  for (const id of Object.keys(entries)) {
    const e = entries[id]!;
    const nextTags = e.combatTags?.filter((t) => !ROUND_PLAN_COMBAT_TAGS.includes(t));
    entries[id] = { ...e, combatTags: nextTags?.length ? nextTags : undefined };
  }
  return { ...state, entries, markedEntryId: state.markedEntryId ?? null };
}

/** TV/display "Next round": increment round, re-roll all combatants, sort, top of order. */
export function advanceRoundAndRerollInitiative(state: InitiativeState): InitiativeState {
  let next = incrementRoundOnly(state);
  next = stripRoundPlanCombatTags(next);
  next = rollInitiative(next);
  next = sortInitiative(next);
  return { ...next, currentTurnIndex: 0, markedEntryId: null };
}

export function setEntryCombatTags(
  state: InitiativeState,
  entryId: string,
  combatTags: InitiativeCombatTag[],
): InitiativeState {
  const e = state.entries[entryId];
  if (!e) return state;
  const valid = [...new Set(combatTags.filter(isInitiativeCombatTag))];
  return {
    ...state,
    entries: {
      ...state.entries,
      [entryId]: { ...e, combatTags: valid.length ? valid : undefined },
    },
    markedEntryId: state.markedEntryId ?? null,
  };
}

export function setMarkedEntry(state: InitiativeState, entryId: string | null): InitiativeState {
  return { ...state, markedEntryId: entryId };
}

/** Decrement timed effects; remove expired. */
export function tickTimedEffects(
  effects: { id: string; label: string; roundsRemaining: number; entityId: string }[],
): { id: string; label: string; roundsRemaining: number; entityId: string }[] {
  return effects
    .map((e) => ({ ...e, roundsRemaining: e.roundsRemaining - 1 }))
    .filter((e) => e.roundsRemaining > 0);
}
