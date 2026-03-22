import { createHash, randomBytes } from 'node:crypto';
import { randomDisplayGatePin } from '../util/display-gate-pin.js';
import type {
  DiceLogEntry,
  InitiativeState,
  NormalizedCharacter,
  NpcTemplate,
  PartySnapshot,
  PublicSessionState,
  SessionRecord,
  TableLayout,
  TableTheme,
  TimedEffect,
} from '@ddb/shared-types';
import { createDefaultTableLayout, DEFAULT_PARTY_CARD_DISPLAY_OPTIONS } from '@ddb/shared-types';
import { emptyInitiativeState, filterInitiativeExcludingEntityIds } from './initiative.service.js';

function token(): string {
  return randomBytes(18).toString('hex');
}

export function sha256HexUtf8(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

function emptyParty(): PartySnapshot {
  return {
    campaign: null,
    characters: [],
    fetchedAt: null,
    upstreamDate: null,
    error: null,
  };
}

export function mergePartyOverrides(
  party: PartySnapshot,
  overrides: Record<
    string,
    Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent'>>
  >,
): PartySnapshot {
  return {
    ...party,
    characters: party.characters.map((c) => {
      const o = overrides[String(c.id)];
      if (!o) return { ...c };
      return {
        ...c,
        ...(o.currentHp !== undefined ? { currentHp: o.currentHp } : {}),
        ...(o.tempHp !== undefined ? { tempHp: o.tempHp } : {}),
        ...(o.conditions !== undefined ? { conditions: o.conditions } : {}),
        ...(o.absent !== undefined ? { absent: o.absent } : {}),
      };
    }),
  };
}

export type SessionServiceHooks = {
  /** Called after any mutation that should be persisted (debounced by the server). */
  onMutate?: (sessionId: string) => void;
  /** Synchronous persist when a brand-new session is created (avoids losing it if the process exits immediately). */
  onCreate?: (session: SessionRecord) => void;
};

export class SessionService {
  private sessions = new Map<string, SessionRecord>();
  private byDisplay = new Map<string, string>();
  private byDm = new Map<string, string>();
  private readonly hooks: SessionServiceHooks;

  constructor(hooks: SessionServiceHooks = {}) {
    this.hooks = hooks;
  }

  /** Rebuild index maps from a row loaded from SQLite (startup only). */
  restoreSession(record: SessionRecord): void {
    if (this.sessions.has(record.sessionId)) return;
    if (this.byDisplay.has(record.displayToken) || this.byDm.has(record.dmToken)) return;
    this.sessions.set(record.sessionId, record);
    this.byDisplay.set(record.displayToken, record.sessionId);
    this.byDm.set(record.dmToken, record.sessionId);
  }

  allSessions(): SessionRecord[] {
    return [...this.sessions.values()];
  }

  markDirty(s: SessionRecord): void {
    this.hooks.onMutate?.(s.sessionId);
  }

  create(): SessionRecord {
    const sessionId = token();
    const displayToken = token();
    const dmToken = token();
    const record: SessionRecord = {
      sessionId,
      displayToken,
      dmToken,
      ownerUserId: null,
      displayGatePin: randomDisplayGatePin(),
      displayPinRevision: 1,
      theme: 'minimal',
      partyCardDisplay: { ...DEFAULT_PARTY_CARD_DISPLAY_OPTIONS },
      tableLayout: createDefaultTableLayout(),
      seedCharacterId: null,
      pollIntervalMs: 180_000,
      party: emptyParty(),
      initiative: emptyInitiativeState(),
      manualOverrides: {},
      diceLog: [],
      timedEffects: [],
      npcTemplates: [],
    };
    this.sessions.set(sessionId, record);
    this.byDisplay.set(displayToken, sessionId);
    this.byDm.set(dmToken, sessionId);
    this.hooks.onCreate?.(record);
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  getByDisplayToken(displayToken: string): SessionRecord | undefined {
    const id = this.byDisplay.get(displayToken);
    return id ? this.sessions.get(id) : undefined;
  }

  resolveDmToken(dmToken: string): SessionRecord | undefined {
    const id = this.byDm.get(dmToken);
    return id ? this.sessions.get(id) : undefined;
  }

  isDmToken(session: SessionRecord, t: string): boolean {
    return session.dmToken === t;
  }

  isDisplayToken(session: SessionRecord, t: string): boolean {
    return session.displayToken === t;
  }

  update(sessionId: string, fn: (s: SessionRecord) => void): SessionRecord | undefined {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    fn(s);
    this.hooks.onMutate?.(sessionId);
    return s;
  }

  toPublic(session: SessionRecord, role: 'dm' | 'display'): PublicSessionState {
    const merged = mergePartyOverrides(session.party ?? emptyParty(), session.manualOverrides);
    const hiddenIds = new Set(
      Object.entries(session.manualOverrides)
        .filter(([, v]) => v.hiddenFromTable === true)
        .map(([id]) => String(id)),
    );
    const hiddenPartyMembers = [...hiddenIds].map((id) => {
      const c = session.party.characters.find((x) => String(x.id) === id);
      return { id, name: c?.name ?? id };
    });
    const party: PartySnapshot =
      role === 'display'
        ? {
            ...merged,
            characters: merged.characters.filter((c) => !hiddenIds.has(String(c.id))),
          }
        : merged;
    const initiative: InitiativeState =
      role === 'display'
        ? filterInitiativeExcludingEntityIds(session.initiative, hiddenIds)
        : session.initiative;
    const diceLog =
      role === 'dm' ? session.diceLog : session.diceLog.filter((e) => !e.dmOnly);
    return {
      sessionId: session.sessionId,
      displayPinRevision: session.displayPinRevision,
      theme: session.theme,
      partyCardDisplay: session.partyCardDisplay ?? { ...DEFAULT_PARTY_CARD_DISPLAY_OPTIONS },
      tableLayout: session.tableLayout ?? createDefaultTableLayout(),
      party,
      initiative,
      diceLog,
      timedEffects: session.timedEffects,
      npcTemplates: session.npcTemplates,
      hiddenPartyMembers,
    };
  }

  appendLog(session: SessionRecord, message: string, dmOnly = false, max: number): void {
    session.diceLog.push({
      at: new Date().toISOString(),
      message,
      dmOnly,
    });
    if (session.diceLog.length > max) {
      session.diceLog.splice(0, session.diceLog.length - max);
    }
    this.markDirty(session);
  }

  setParty(session: SessionRecord, party: PartySnapshot): void {
    session.party = party;
    this.markDirty(session);
  }

  setInitiative(session: SessionRecord, next: InitiativeState): void {
    session.initiative = next;
    this.markDirty(session);
  }

  setTheme(session: SessionRecord, theme: TableTheme): void {
    session.theme = theme;
    this.markDirty(session);
  }

  setPartyCardDisplay(session: SessionRecord, options: SessionRecord['partyCardDisplay']): void {
    session.partyCardDisplay = options;
    this.markDirty(session);
  }

  setTableLayout(session: SessionRecord, layout: TableLayout): void {
    session.tableLayout = layout;
    this.markDirty(session);
  }

  setSeed(session: SessionRecord, seedCharacterId: number | null): void {
    session.seedCharacterId = seedCharacterId;
    this.markDirty(session);
  }

  setManualOverride(
    session: SessionRecord,
    characterId: string,
    patch: Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent'>> & {
      hiddenFromTable?: boolean;
    },
  ): void {
    session.manualOverrides[characterId] = {
      ...session.manualOverrides[characterId],
      ...patch,
    };
    this.markDirty(session);
  }

  addTimedEffect(session: SessionRecord, effect: TimedEffect): void {
    session.timedEffects.push(effect);
    this.markDirty(session);
  }

  removeTimedEffect(session: SessionRecord, id: string): void {
    session.timedEffects = session.timedEffects.filter((e) => e.id !== id);
    this.markDirty(session);
  }

  setTimedEffects(session: SessionRecord, effects: TimedEffect[]): void {
    session.timedEffects = effects;
    this.markDirty(session);
  }

  addNpcTemplate(session: SessionRecord, t: NpcTemplate): void {
    const idx = session.npcTemplates.findIndex((x) => x.id === t.id);
    if (idx >= 0) session.npcTemplates[idx] = t;
    else session.npcTemplates.push(t);
    this.markDirty(session);
  }
}
