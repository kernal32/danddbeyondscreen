import { create } from 'zustand';
import type { PublicSessionState } from '@ddb/shared-types/session';
import type { InitiativeState } from '@ddb/shared-types/initiative';
import type { SessionUiMode } from '../types/sessionUiMode';

/**
 * Local default tracker shape — must match {@link emptyInitiativeState} in `@ddb/shared-types/initiative`.
 * We avoid a **runtime** import from that module here so the eager App bundle does not pull `initiative.js` into
 * `index` (fixes circular chunk TDZ: lazy TV/party chunks imported `effectiveInitiativeRollMode` from index while
 * index was still initializing).
 */
function emptyInitiativeStateLocal(): InitiativeState {
  return {
    round: 1,
    currentTurnIndex: 0,
    turnOrder: [],
    entries: {},
    markedEntryId: null,
  };
}

/** Socket/REST payloads may omit or partially include `initiative`; never throw in the store. */
function normalizeSessionInitiative(raw: unknown): InitiativeState {
  const base = emptyInitiativeStateLocal();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Partial<InitiativeState>;
  return {
    ...base,
    ...o,
    turnOrder: Array.isArray(o.turnOrder) ? o.turnOrder.map(String) : base.turnOrder,
    entries:
      o.entries && typeof o.entries === 'object' && !Array.isArray(o.entries)
        ? (o.entries as InitiativeState['entries'])
        : base.entries,
    markedEntryId: o.markedEntryId ?? null,
  };
}

export type { SessionUiMode };

export type TvScale = 'normal' | 'large';

const DEBUG_LAYOUT_KEY = 'ddb_ui_debugLayout';

function readDebugLayout(): boolean {
  try {
    return sessionStorage.getItem(DEBUG_LAYOUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDebugLayout(on: boolean) {
  try {
    sessionStorage.setItem(DEBUG_LAYOUT_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

type SessionRuntimeState = {
  publicSession: PublicSessionState | null;
  connected: boolean;
  uiMode: SessionUiMode;
  tvScale: TvScale;
  debugLayout: boolean;

  setFromFullState: (s: PublicSessionState) => void;
  /** REST bootstrap for display route; does not overwrite an existing socket snapshot for the same session. */
  hydrateDisplayBootstrap: (s: PublicSessionState) => void;
  setConnected: (c: boolean) => void;
  resetSession: () => void;
  setUiMode: (m: SessionUiMode) => void;
  setTvScale: (t: TvScale) => void;
  setDebugLayout: (on: boolean) => void;
  toggleDebugLayout: () => void;
};

export const useSessionRuntimeStore = create<SessionRuntimeState>((set, get) => ({
  publicSession: null,
  connected: false,
  uiMode: 'display',
  tvScale: 'normal',
  debugLayout: readDebugLayout(),

  setFromFullState: (s) =>
    set({
      publicSession: {
        ...s,
        themePalette: s.themePalette ?? null,
        displayInitiativeMaskTotals: s.displayInitiativeMaskTotals === true,
        displayInitiativeRevealLowest: s.displayInitiativeRevealLowest === true,
        initiative: normalizeSessionInitiative(s.initiative),
      },
    }),

  hydrateDisplayBootstrap: (boot) => {
    const cur = get().publicSession;
    if (cur?.sessionId === boot.sessionId) return;
    set({
      publicSession: {
        ...boot,
        themePalette: boot.themePalette ?? null,
        displayInitiativeMaskTotals: boot.displayInitiativeMaskTotals === true,
        displayInitiativeRevealLowest: boot.displayInitiativeRevealLowest === true,
        initiative: normalizeSessionInitiative(boot.initiative),
      },
    });
  },

  setConnected: (c) => set({ connected: c }),

  resetSession: () => set({ publicSession: null, connected: false }),

  setUiMode: (m) => set({ uiMode: m }),

  setTvScale: (t) => set({ tvScale: t }),

  setDebugLayout: (on) => {
    writeDebugLayout(on);
    set({ debugLayout: on });
  },

  toggleDebugLayout: () => {
    const next = !get().debugLayout;
    writeDebugLayout(next);
    set({ debugLayout: next });
  },
}));
