import { create } from 'zustand';
import type { PublicSessionState } from '@ddb/shared-types';

export type SessionUiMode = 'dm' | 'display';

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
        initiative: {
          ...s.initiative,
          markedEntryId: s.initiative.markedEntryId ?? null,
        },
      },
    }),

  hydrateDisplayBootstrap: (boot) => {
    const cur = get().publicSession;
    if (cur?.sessionId === boot.sessionId) return;
    set({
      publicSession: {
        ...boot,
        themePalette: boot.themePalette ?? null,
        initiative: {
          ...boot.initiative,
          markedEntryId: boot.initiative.markedEntryId ?? null,
        },
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
