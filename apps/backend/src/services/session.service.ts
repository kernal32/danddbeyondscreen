import { createHash, randomBytes } from 'node:crypto';
import { randomDisplayGatePin } from '../util/display-gate-pin.js';
import type {
  DiceLogEntry,
  HiddenInitiativeSnapshot,
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
import {
  emptyInitiativeState,
  filterInitiativeExcludingEntityIds,
  syncInitiativeConditionsFromParty,
} from './initiative.service.js';

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

/** Drop bulky raw DDB payloads before attaching a party to a live session (WS / SQLite). */
export function stripDdbSheetJsonFromParty(party: PartySnapshot): PartySnapshot {
  return {
    ...party,
    characters: party.characters.map((c) => {
      const { ddbSheetJson: _drop, ...rest } = c;
      return rest;
    }),
  };
}

/**
 * Merge `party:manualHp` without freezing stale temp HP: if the client sends `currentHp` but omits
 * `tempHp`, drop any prior `tempHp` override so the live party row (DDB ingest) supplies temp again.
 */
export function applyManualHpPatch(
  overrides: SessionRecord['manualOverrides'],
  characterId: string,
  payload: { currentHp?: number; tempHp?: number },
): void {
  const rid = String(characterId);
  const hasCur = payload.currentHp !== undefined && Number.isFinite(payload.currentHp);
  const hasTmp = payload.tempHp !== undefined && Number.isFinite(payload.tempHp);
  if (!hasCur && !hasTmp) return;
  const prev = overrides[rid] ?? {};
  const next = { ...prev };
  if (hasCur) next.currentHp = Math.floor(Number(payload.currentHp));
  if (hasTmp) next.tempHp = Math.max(0, Math.floor(Number(payload.tempHp)));
  else if (hasCur) delete next.tempHp;
  overrides[rid] = next;
}

/** After replacing `session.party`, drop manual `tempHp` so the new sheet snapshot controls temp HP. */
export function clearManualTempHpOverridesForParty(session: Pick<SessionRecord, 'party' | 'manualOverrides'>): void {
  for (const c of session.party.characters) {
    const id = String(c.id);
    const o = session.manualOverrides[id];
    if (!o || o.tempHp === undefined) continue;
    const { tempHp: _drop, ...rest } = o;
    if (Object.keys(rest).length < 1) {
      delete session.manualOverrides[id];
    } else {
      session.manualOverrides[id] = rest;
    }
  }
}

export function mergePartyOverrides(
  party: PartySnapshot,
  overrides: Record<
    string,
    Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent' | 'inspired'>>
  >,
): PartySnapshot {
  return {
    ...party,
    characters: party.characters.map((c) => {
      const o = overrides[String(c.id)];
      if (!o) return { ...c };
      const baseConds = c.conditions ?? [];
      /** Empty override must not wipe newer ingest (stale `[]` persisted from older clients). Prefer party when it has labels. */
      const useConditionsOverride =
        o.conditions !== undefined && !(o.conditions.length === 0 && baseConds.length > 0);
      return {
        ...c,
        ...(o.currentHp !== undefined ? { currentHp: o.currentHp } : {}),
        ...(o.tempHp !== undefined ? { tempHp: o.tempHp } : {}),
        ...(useConditionsOverride ? { conditions: o.conditions } : {}),
        ...(o.absent !== undefined ? { absent: o.absent } : {}),
        ...(o.inspired !== undefined ? { inspired: o.inspired } : {}),
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
    const stored: SessionRecord = {
      ...record,
      party: record.party ? stripDdbSheetJsonFromParty(record.party) : record.party,
    };
    this.sessions.set(record.sessionId, stored);
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
      displayInitiativeMaskTotals: false,
      displayInitiativeRevealLowest: false,
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
      const snap = session.manualOverrides[id]?.hiddenInitiativeSnapshot;
      const hasSavedSnapshot = !!snap;
      return {
        id,
        name: c?.name ?? id,
        ...(hasSavedSnapshot
          ? { hasSavedSnapshot: true, savedInitiativeTotal: snap!.initiativeTotal }
          : {}),
      };
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
      themePalette: session.themePalette?.length ? session.themePalette : null,
      partyCardDisplay: session.partyCardDisplay ?? { ...DEFAULT_PARTY_CARD_DISPLAY_OPTIONS },
      displayInitiativeMaskTotals: session.displayInitiativeMaskTotals === true,
      displayInitiativeRevealLowest: session.displayInitiativeRevealLowest === true,
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
    session.party = stripDdbSheetJsonFromParty(party);
    clearManualTempHpOverridesForParty(session);
    const merged = mergePartyOverrides(session.party, session.manualOverrides);
    session.initiative = syncInitiativeConditionsFromParty(session.initiative, merged);
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

  /** Replace or clear palette-derived UI tokens (`null` or `[]` = built-in CSS only). */
  setThemePalette(session: SessionRecord, palette: string[] | null): void {
    if (palette == null || palette.length === 0) {
      delete session.themePalette;
    } else {
      session.themePalette = palette;
    }
    this.markDirty(session);
  }

  setPartyCardDisplay(session: SessionRecord, options: SessionRecord['partyCardDisplay']): void {
    session.partyCardDisplay = options;
    this.markDirty(session);
  }

  setDisplayInitiativeMaskSettings(
    session: SessionRecord,
    patch: { displayInitiativeMaskTotals?: boolean; displayInitiativeRevealLowest?: boolean },
  ): void {
    if (patch.displayInitiativeMaskTotals !== undefined) {
      session.displayInitiativeMaskTotals = patch.displayInitiativeMaskTotals;
    }
    if (patch.displayInitiativeRevealLowest !== undefined) {
      session.displayInitiativeRevealLowest = patch.displayInitiativeRevealLowest;
    }
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
    patch: Partial<Pick<NormalizedCharacter, 'currentHp' | 'tempHp' | 'conditions' | 'absent' | 'inspired'>> & {
      hiddenFromTable?: boolean;
      hiddenInitiativeSnapshot?: HiddenInitiativeSnapshot | null;
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
