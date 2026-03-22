import type { InitiativeCombatTag, InitiativeState } from './initiative.js';
import type { PartySnapshot } from './character.js';
import type { PublicSessionState, TimedEffect, NpcTemplate, DiceLogEntry } from './session.js';
import type { TableTheme } from './themes.js';
import type { PartyCardDisplayOptions } from './party-card-display.js';
import type { TableLayout } from './layout.js';

/** Client → server */
export type ClientToServerEvents = {
  'session:subscribe': (payload: { sessionId: string; token: string }) => void;
  /** DM only: advance current combatant; ticks timed effects on next. */
  'initiative:next': () => void;
  /** DM only: previous combatant in order. */
  'initiative:prev': () => void;
  /** DM + display: increment round only (no turn change). */
  'initiative:nextRound': () => void;
  /** DM + display: decrement round (min 1). */
  'initiative:prevRound': () => void;
  'initiative:roll': (payload: {
    entryId?: string;
    rollMode?: 'normal' | 'advantage' | 'disadvantage';
    mod?: number;
  }) => void;
  'initiative:sort': () => void;
  'initiative:setTotal': (payload: { entryId: string; total: number }) => void;
  'initiative:add': (payload: {
    label: string;
    entityId?: string;
    mod?: number;
    groupId?: string;
    avatarUrl?: string;
    /** Roll d20+mod for the new row only, then sort (phone quick-add). */
    rollAndSort?: boolean;
  }) => void;
  'initiative:remove': (payload: { entryId: string }) => void;
  'initiative:toggleLock': (payload: { entryId: string }) => void;
  /** DM only: set combat cue badges on one row. */
  'initiative:setCombatTags': (payload: { entryId: string; combatTags: InitiativeCombatTag[] }) => void;
  'initiative:delay': () => void;
  'initiative:clear': () => void;
  /** DM only: mark PC absent (dim party card, remove from initiative). */
  'party:setAbsent': (payload: { characterId: string; absent: boolean }) => void;
  /** DM + display: hide/unhide party member from TV/phone party + initiative. */
  'party:setHiddenFromTable': (payload: {
    characterId: string;
    hidden: boolean;
    /** When unhiding (`hidden: false`): add back to initiative with a new roll or restore snapshot. */
    unhideMode?: 'reroll' | 'saved';
  }) => void;
  /** DM + display: remove a character from the session party (not undoable via unhide). */
  'party:removeCharacter': (payload: { characterId: string }) => void;
  'party:refresh': () => void;
  'party:manualHp': (payload: { characterId: string; currentHp?: number; tempHp?: number }) => void;
  'party:setConditions': (payload: { characterId: string; conditions: string[] }) => void;
  /** DM + display: highlight who acted last / DM turn gap. */
  'initiative:markEntry': (payload: { entryId: string | null }) => void;
  /** DM + display: clear tracker, add non-absent party members, round 1, roll all, sort (initiative bonus wins ties). */
  'initiative:startCombat': () => void;
  /** DM + display: re-roll d20+mod for everyone, sort, jump to first in order. */
  'initiative:rerollAll': () => void;
  'session:setTheme': (payload: { theme: TableTheme }) => void;
  'session:setPartyCardDisplay': (payload: { partyCardDisplay: PartyCardDisplayOptions }) => void;
  'session:setTableLayout': (payload: { tableLayout: TableLayout }) => void;
  'session:setSeed': (payload: { seedCharacterId: number }) => void;
  'effects:add': (payload: Omit<TimedEffect, 'id'> & { id?: string }) => void;
  'effects:tick': () => void;
  'effects:remove': (payload: { id: string }) => void;
  'log:append': (payload: { message: string; dmOnly?: boolean }) => void;
  'npc:addTemplate': (payload: NpcTemplate) => void;
  'npc:spawnFromTemplate': (payload: { templateId: string }) => void;
};

/** Server → clients */
export type ServerToClientEvents = {
  'state:full': (state: PublicSessionState) => void;
  'party:updated': (party: PartySnapshot) => void;
  'initiative:updated': (initiative: InitiativeState) => void;
  'session:meta': (payload: { theme: TableTheme }) => void;
  'ddb:warning': (payload: { message: string }) => void;
  'effects:updated': (effects: TimedEffect[]) => void;
  'log:updated': (entries: DiceLogEntry[]) => void;
  'error': (payload: { message: string }) => void;
};

export type ServerEventPayload = {
  stateFull: PublicSessionState;
  partyUpdated: PartySnapshot;
  initiativeUpdated: InitiativeState;
};
