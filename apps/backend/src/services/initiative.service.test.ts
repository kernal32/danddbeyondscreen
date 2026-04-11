import { describe, it, expect } from 'vitest';
import type { NormalizedCharacter, PartySnapshot } from '@ddb/shared-types';
import {
  emptyInitiativeState,
  addCombatant,
  sortInitiative,
  setInitiativeTotal,
  toggleLock,
  nextTurn,
  removeCombatant,
  delayCurrent,
  clearInitiative,
  tickTimedEffects,
  startCombatFromParty,
  removeByEntityId,
  filterInitiativeExcludingEntityIds,
  advanceRoundAndRerollInitiative,
  setEntryCombatTags,
  stripRoundPlanCombatTags,
  rollInitiative,
  syncInitiativeConditionsFromParty,
} from './initiative.service.js';

function ch(partial: Partial<NormalizedCharacter> & Pick<NormalizedCharacter, 'id' | 'name'>): NormalizedCharacter {
  return {
    avatarUrl: '',
    ac: 10,
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    passivePerception: 10,
    passiveInvestigation: 10,
    passiveInsight: 10,
    conditions: [],
    source: 'manual',
    ...partial,
  };
}

describe('initiative.service', () => {
  it('rollInitiative uses Adv/Dis combat tags for two-d20 rolls', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', mod: 2, rollMode: 'normal' });
    const id = s.turnOrder[0]!;
    s = setEntryCombatTags(s, id, ['advNextAttack']);
    s = rollInitiative(s, id);
    expect(s.entries[id]!.rollBreakdown?.rolls.length).toBe(2);
    expect(s.entries[id]!.rollMode).toBe('advantage');
    s = setEntryCombatTags(s, id, ['disNextAttack']);
    s = rollInitiative(s, id);
    expect(s.entries[id]!.rollBreakdown?.rolls.length).toBe(2);
    expect(s.entries[id]!.rollMode).toBe('disadvantage');
  });

  it('rollInitiative override bypasses combat tags', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', mod: 0, rollMode: 'normal' });
    const id = s.turnOrder[0]!;
    s = setEntryCombatTags(s, id, ['advNextAttack']);
    s = rollInitiative(s, id, 'disadvantage');
    expect(s.entries[id]!.rollMode).toBe('disadvantage');
    expect(s.entries[id]!.rollBreakdown?.rolls.length).toBe(2);
  });

  it('advanceRoundAndReroll keeps adv combat tag for two-dice rolls', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', mod: 0 });
    s = addCombatant(s, { label: 'B', mod: 0 });
    const idA = s.turnOrder[0]!;
    const idB = s.turnOrder[1]!;
    s = setEntryCombatTags(s, idA, ['advNextAttack']);
    s = setInitiativeTotal(s, idA, 10);
    s = setInitiativeTotal(s, idB, 9);
    s = advanceRoundAndRerollInitiative(s);
    expect(s.entries[idA]!.rollBreakdown?.rolls.length).toBe(2);
    expect(s.entries[idA]!.rollMode).toBe('advantage');
    expect(s.entries[idB]!.rollBreakdown?.rolls.length).toBe(1);
    expect(s.entries[idB]!.rollMode).toBe('normal');
  });

  it('setEntryCombatTags stores tags and stripRoundPlanCombatTags removes first/last', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A' });
    const id = s.turnOrder[0]!;
    s = setEntryCombatTags(s, id, ['firstNextRound', 'advNextAttack']);
    expect(s.entries[id]!.combatTags).toEqual(['firstNextRound', 'advNextAttack']);
    s = stripRoundPlanCombatTags(s);
    expect(s.entries[id]!.combatTags).toEqual(['advNextAttack']);
  });

  it('advanceRoundAndRerollInitiative increments round and re-rolls everyone', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', mod: 2 });
    s = addCombatant(s, { label: 'B', mod: 5 });
    const idA = s.turnOrder[0]!;
    const idB = s.turnOrder[1]!;
    s = setInitiativeTotal(s, idA, 99);
    s = setInitiativeTotal(s, idB, 98);
    expect(s.entries[idA]!.rollBreakdown).toBeUndefined();
    s = { ...s, round: 1, currentTurnIndex: 1, markedEntryId: idA };

    s = advanceRoundAndRerollInitiative(s);

    expect(s.round).toBe(2);
    expect(s.currentTurnIndex).toBe(0);
    expect(s.markedEntryId).toBeNull();
    for (const id of s.turnOrder) {
      const e = s.entries[id]!;
      expect(e.rollBreakdown?.rolls?.length).toBeGreaterThan(0);
      expect(e.initiativeTotal).toBeGreaterThanOrEqual(e.mod + 1);
    }
  });

  it('adds combatants and advances round on wrap', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', initiativeTotal: 15 });
    s = addCombatant(s, { label: 'B', initiativeTotal: 10 });
    s = sortInitiative(s);
    expect(s.turnOrder.length).toBe(2);
    s = nextTurn(s);
    expect(s.currentTurnIndex).toBe(1);
    s = nextTurn(s);
    expect(s.round).toBe(2);
    expect(s.currentTurnIndex).toBe(0);
  });

  it('keeps locked positions when sorting', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'Low', initiativeTotal: 5 });
    s = addCombatant(s, { label: 'High', initiativeTotal: 20 });
    const lowId = s.turnOrder[0]!;
    const highId = s.turnOrder[1]!;
    s = setInitiativeTotal(s, lowId, 25);
    s = toggleLock(s, lowId);
    s = sortInitiative(s);
    expect(s.turnOrder[0]).toBe(lowId);
    expect(s.turnOrder[1]).toBe(highId);
  });

  it('removes combatant and clamps index', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A' });
    s = addCombatant(s, { label: 'B' });
    const a = s.turnOrder[0]!;
    s = removeCombatant(s, a);
    expect(s.turnOrder.length).toBe(1);
  });

  it('delay moves current to end', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', initiativeTotal: 20 });
    s = addCombatant(s, { label: 'B', initiativeTotal: 10 });
    s = sortInitiative(s);
    const first = s.turnOrder[0]!;
    s = delayCurrent(s);
    expect(s.turnOrder[s.turnOrder.length - 1]).toBe(first);
  });

  it('clears state', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A' });
    s = clearInitiative(s);
    expect(s.turnOrder.length).toBe(0);
    expect(Object.keys(s.entries).length).toBe(0);
  });

  it('ticks timed effects', () => {
    const next = tickTimedEffects([
      { id: '1', label: 'Bless', roundsRemaining: 1, entityId: 'x' },
      { id: '2', label: 'Hex', roundsRemaining: 3, entityId: 'y' },
    ]);
    expect(next.map((e) => e.id).sort()).toEqual(['2']);
    expect(next[0]!.roundsRemaining).toBe(2);
  });

  it('sorts ties by higher initiative bonus (mod) when dexMod is absent', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'LowBonus', initiativeTotal: 18, mod: 1 });
    s = addCombatant(s, { label: 'HighBonus', initiativeTotal: 18, mod: 5 });
    const lowId = s.turnOrder[0]!;
    const highId = s.turnOrder[1]!;
    s = sortInitiative(s);
    expect(s.turnOrder[0]).toBe(highId);
    expect(s.turnOrder[1]).toBe(lowId);
  });

  it('sorts same total by higher dexMod before initiative bonus (mod)', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'HighDexLowMod', initiativeTotal: 20, mod: 1, dexMod: 5 });
    s = addCombatant(s, { label: 'LowDexHighMod', initiativeTotal: 20, mod: 8, dexMod: 0 });
    const highDexId = s.turnOrder[0]!;
    const lowDexId = s.turnOrder[1]!;
    s = sortInitiative(s);
    expect(s.turnOrder[0]).toBe(highDexId);
    expect(s.turnOrder[1]).toBe(lowDexId);
  });

  it('startCombatFromParty skips absent characters', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'Old' });
    const chars = [
      ch({ id: '1', name: 'Present', initiativeBonus: 3 }),
      ch({ id: '2', name: 'Gone', absent: true, initiativeBonus: 10 }),
    ];
    s = startCombatFromParty(s, chars);
    expect(s.turnOrder.length).toBe(1);
    expect(s.entries[s.turnOrder[0]!]?.entityId).toBe('1');
  });

  it('startCombatFromParty skips skipCharacterIds', () => {
    let s = emptyInitiativeState();
    const chars = [
      ch({ id: 'a', name: 'A', initiativeBonus: 1 }),
      ch({ id: 'b', name: 'B', initiativeBonus: 2 }),
    ];
    s = startCombatFromParty(s, chars, { skipCharacterIds: new Set(['b']) });
    expect(s.turnOrder.length).toBe(1);
    expect(s.entries[s.turnOrder[0]!]?.entityId).toBe('a');
  });

  it('removeByEntityId drops matching rows', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', entityId: 'x' });
    s = addCombatant(s, { label: 'B', entityId: 'y' });
    s = removeByEntityId(s, 'x');
    expect(s.turnOrder.length).toBe(1);
    expect(s.entries[s.turnOrder[0]!]?.entityId).toBe('y');
  });

  it('filterInitiativeExcludingEntityIds removes by entityId set', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'A', entityId: 'p1' });
    s = addCombatant(s, { label: 'B', entityId: 'npc-1' });
    s = filterInitiativeExcludingEntityIds(s, new Set(['p1']));
    expect(s.turnOrder.length).toBe(1);
    expect(s.entries[s.turnOrder[0]!]?.entityId).toBe('npc-1');
  });

  it('syncInitiativeConditionsFromParty overwrites stale row conditions from merged party', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, {
      label: 'Drevan',
      entityId: '42',
      mod: 0,
      conditions: ['Blinded', 'Charmed', 'Deafened'],
    });
    const entryId = s.turnOrder[0]!;
    const party: PartySnapshot = {
      campaign: null,
      characters: [ch({ id: '42', name: 'Drevan', conditions: [] })],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    s = syncInitiativeConditionsFromParty(s, party);
    expect(s.entries[entryId]?.conditions).toBeUndefined();
  });

  it('syncInitiativeConditionsFromParty updates stale initiative labels from merged party', () => {
    let s = emptyInitiativeState();
    s = addCombatant(s, { label: 'Old Name', entityId: '7', mod: 0 });
    const entryId = s.turnOrder[0]!;
    const party: PartySnapshot = {
      campaign: null,
      characters: [ch({ id: '7', name: 'Renamed PC', conditions: [] })],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    s = syncInitiativeConditionsFromParty(s, party);
    expect(s.entries[entryId]?.label).toBe('Renamed PC');
  });
});
