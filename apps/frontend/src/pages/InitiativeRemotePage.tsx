import { useEffect, useLayoutEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicSessionState } from '@ddb/shared-types/session';
import { apiGet, apiPost } from '../api';
import DisplayPinOverlay from '../components/DisplayPinOverlay';
import InitiativeRemoteMoreSheet from '../components/InitiativeRemoteMoreSheet';
import InitiativeRemoteSettingsSheet from '../components/InitiativeRemoteSettingsSheet';
import InitiativeTrackerPanel from '../components/InitiativeTrackerPanel';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import { applySessionVisualTheme } from '../theme/tableTheme';
import { TableThemeProvider } from '../theme/TableThemeContext';
import { readStoredDisplayUnlockRev, writeStoredDisplayUnlockRev } from '../util/displayPinUnlock';
import { tryDisplayUnlockWithAccount } from '../util/displayAccountUnlock';

type DisplayMeta = { sessionId: string; displayPinRevision: number };

/** Mobile / phone initiative controls — same display token + Socket.IO ACL as the table TV. */
export default function InitiativeRemotePage() {
  const { displayToken } = useParams<{ displayToken: string }>();
  const publicSession = useSessionRuntimeStore((s) => s.publicSession);
  const connected = useSessionRuntimeStore((s) => s.connected);
  const [meta, setMeta] = useState<DisplayMeta | null>(null);
  const [boot, setBoot] = useState<PublicSessionState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pinGateOpen, setPinGateOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCharacterId, setSettingsCharacterId] = useState<string | null>(null);
  const [density, setDensity] = useState<'compact' | 'normal' | 'large'>(() => {
    const saved = localStorage.getItem('ddb-remote-density');
    return (saved === 'compact' || saved === 'normal' || saved === 'large') ? saved : 'compact';
  });

  const cycleDensity = () => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'normal' : prev === 'normal' ? 'large' : 'compact';
      localStorage.setItem('ddb-remote-density', next);
      return next;
    });
  };

  useLayoutEffect(() => {
    setMeta(null);
    setBoot(null);
    setLoadErr(null);
    setPinGateOpen(true);
    useSessionRuntimeStore.getState().resetSession();
  }, [displayToken]);

  useEffect(() => {
    if (!displayToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const m = await apiGet<DisplayMeta>(`/api/public/display/${displayToken}/meta`);
        if (cancelled) return;
        setMeta(m);
      } catch {
        if (!cancelled) setLoadErr('Invalid link');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayToken]);

  useEffect(() => {
    if (!displayToken || !meta || !pinGateOpen) return;
    let cancelled = false;
    void (async () => {
      const stored = readStoredDisplayUnlockRev(displayToken);
      if (stored === meta.displayPinRevision) {
        try {
          const s = await apiGet<PublicSessionState>(`/api/public/display/${displayToken}`);
          if (cancelled) return;
          useSessionRuntimeStore.getState().hydrateDisplayBootstrap(s);
          setBoot(s);
          setPinGateOpen(false);
        } catch {
          /* stay gated */
        }
        return;
      }
      const acct = await tryDisplayUnlockWithAccount(displayToken);
      if (cancelled) return;
      if (acct) {
        writeStoredDisplayUnlockRev(displayToken, acct.displayPinRevision);
        try {
          const s = await apiGet<PublicSessionState>(`/api/public/display/${displayToken}`);
          if (cancelled) return;
          useSessionRuntimeStore.getState().hydrateDisplayBootstrap(s);
          setBoot(s);
          setPinGateOpen(false);
        } catch {
          /* stay gated */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [displayToken, meta, pinGateOpen]);

  const live = publicSession ?? boot;
  const sessionId = pinGateOpen ? null : (live?.sessionId ?? null);

  useEffect(() => {
    if (!displayToken || !live?.displayPinRevision || pinGateOpen) return;
    const stored = readStoredDisplayUnlockRev(displayToken);
    if (stored !== live.displayPinRevision) {
      setPinGateOpen(true);
      useSessionRuntimeStore.getState().resetSession();
      setBoot(null);
      setMeta((prev) =>
        live.sessionId
          ? { sessionId: live.sessionId, displayPinRevision: live.displayPinRevision }
          : prev,
      );
    }
  }, [displayToken, live?.displayPinRevision, live?.sessionId, pinGateOpen]);

  const { emit } = useSessionSocket(sessionId, displayToken ?? null, { uiMode: 'display' });

  useEffect(() => {
    applySessionVisualTheme(live?.theme ?? 'minimal', live?.themePalette ?? null);
  }, [live?.theme, live?.themePalette]);

  const unlockDisplay = async (pin: string) => {
    if (!displayToken || !meta) return;
    const r = await apiPost<{ ok: true; displayPinRevision: number }>(
      `/api/public/display/${displayToken}/unlock`,
      { pin },
    );
    writeStoredDisplayUnlockRev(displayToken, r.displayPinRevision);
    setMeta((prev) =>
      prev ? { ...prev, displayPinRevision: r.displayPinRevision } : prev,
    );
    const s = await apiGet<PublicSessionState>(`/api/public/display/${displayToken}`);
    useSessionRuntimeStore.getState().hydrateDisplayBootstrap(s);
    setBoot(s);
    setPinGateOpen(false);
  };

  if (loadErr) {
    return (
      <div className="theme-minimal min-h-dvh flex items-center justify-center px-4 text-center text-lg text-red-400">
        {loadErr}
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="theme-minimal min-h-dvh flex items-center justify-center text-xl text-[var(--muted)]">Loading…</div>
    );
  }

  return (
    <div className="min-h-dvh box-border flex flex-col bg-[var(--bg)] px-3 py-3 pb-16 relative">
      {pinGateOpen ? (
        <DisplayPinOverlay
          title="Phone controls"
          description="Enter the same 4-digit code as the table display (DM Settings). If you use account sign-in and created this game while signed in, you can open this page without the code. Unlocks this browser until the DM changes the code."
          onSubmit={unlockDisplay}
        />
      ) : null}
      {live && !pinGateOpen ? (
        <TableThemeProvider theme={live.theme}>
        <>
          <header className="mb-3 shrink-0">
            <h1 className="font-display text-lg font-bold text-[var(--accent)]">Initiative</h1>
            <p className="text-xs text-[var(--muted)]">
              Rounds, rolls, marks, and cues: <strong className="text-[var(--text)]">1st</strong> /{' '}
              <strong className="text-[var(--text)]">Last</strong> / <strong className="text-[var(--text)]">Adv</strong> /{' '}
              <strong className="text-[var(--text)]">Dis</strong> (Adv/Dis = two initiative d20s, keep high/low) — same
              session as the TV.
            </p>
          </header>

          <div className="min-h-0 min-w-0 flex-1">
            <InitiativeTrackerPanel
              init={live.initiative}
              party={live.party}
              sessionUiMode="display"
              large={density === 'large'}
              rowDensity={density === 'compact' ? 'compact' : 'normal'}
              emit={emit}
              allowCombatCueControls
              displayInitiativeMaskTotals={live.displayInitiativeMaskTotals === true}
              displayInitiativeRevealLowest={live.displayInitiativeRevealLowest === true}
              onOpenConditionsForCharacter={(characterId) => {
                setSettingsCharacterId(characterId);
                setSettingsOpen(true);
              }}
            />
          </div>

          <div
            className="fixed bottom-3 right-3 z-50 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100vw-1.5rem)]"
            style={{ marginBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <div
              className={`rounded-full border px-3 py-1.5 text-sm shadow-lg backdrop-blur-sm ${
                connected ? 'border-emerald-500/50 text-emerald-400 bg-black/40' : 'border-amber-500/50 text-amber-400 bg-black/40'
              }`}
            >
              {connected ? 'Live' : 'Reconnecting…'}
            </div>
            <button
              type="button"
              title="Cycle card size"
              className="rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-sm text-[var(--text)] shadow-lg backdrop-blur-sm hover:bg-black/60"
              onClick={cycleDensity}
            >
              {density === 'compact' ? 'S' : density === 'normal' ? 'M' : 'L'}
            </button>
            <button
              type="button"
              className="rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-sm text-[var(--text)] shadow-lg backdrop-blur-sm hover:bg-black/60"
              onClick={() => setMoreOpen(true)}
            >
              More
            </button>
          </div>
          <InitiativeRemoteMoreSheet
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            live={live}
            emit={emit}
          />
          <InitiativeRemoteSettingsSheet
            open={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsCharacterId(null);
            }}
            live={live}
            emit={emit}
            selectedCharacterId={settingsCharacterId}
          />
        </>
        </TableThemeProvider>
      ) : null}
    </div>
  );
}
