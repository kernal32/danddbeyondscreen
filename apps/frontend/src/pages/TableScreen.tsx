import { useEffect, useLayoutEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicSessionState } from '@ddb/shared-types';
import { apiGet, apiPost } from '../api';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import TableLayoutView from '../components/TableLayoutView';
import DisplayPinOverlay from '../components/DisplayPinOverlay';
import { applyRootTableTheme } from '../theme/tableTheme';
import { readStoredDisplayUnlockRev, writeStoredDisplayUnlockRev } from '../util/displayPinUnlock';
import { tryDisplayUnlockWithAccount } from '../util/displayAccountUnlock';

type DisplayMeta = { sessionId: string; displayPinRevision: number };

export default function TableScreen() {
  const { displayToken } = useParams<{ displayToken: string }>();
  const debugLayout = useSessionRuntimeStore((s) => s.debugLayout);
  const publicSession = useSessionRuntimeStore((s) => s.publicSession);
  const connected = useSessionRuntimeStore((s) => s.connected);
  const [meta, setMeta] = useState<DisplayMeta | null>(null);
  const [boot, setBoot] = useState<PublicSessionState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pinGateOpen, setPinGateOpen] = useState(true);

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
        if (!cancelled) setLoadErr('Invalid display link');
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
    applyRootTableTheme(live?.theme ?? 'minimal');
  }, [live?.theme]);

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
    return <div className="theme-minimal min-h-screen flex items-center justify-center text-xl text-red-400">{loadErr}</div>;
  }
  if (!meta) {
    return <div className="theme-minimal min-h-screen flex items-center justify-center text-2xl text-[var(--muted)]">Loading…</div>;
  }

  return (
    <div className="theme-minimal h-dvh max-h-dvh box-border flex flex-col overflow-hidden px-2 pt-2 pb-2 relative">
      {pinGateOpen ? (
        <DisplayPinOverlay
          title="Table display"
          description="Enter the 4-digit code from DM Settings. If you use account sign-in and created this game while signed in, you can open the display without the code. This device only asks once per code version."
          onSubmit={unlockDisplay}
        />
      ) : null}
      {live && !pinGateOpen ? (
        <>
          <div className="flex flex-1 min-h-0 min-w-0 flex-col pb-12">
            <TableLayoutView
              className="flex flex-1 min-h-0 min-w-0 flex-col"
              state={live}
              large
              fillViewport
              debugLayout={debugLayout}
              emit={emit}
            />
          </div>

          <p className="pointer-events-none shrink-0 px-1 text-[10px] leading-tight text-[var(--muted)] opacity-80">
            Layout debug: Ctrl+Shift+D
          </p>

          <div
            className={`fixed bottom-3 right-3 z-50 max-w-[calc(100vw-1rem)] text-base sm:text-lg px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-sm ${
              connected ? 'border-emerald-500/50 text-emerald-400 bg-black/40' : 'border-amber-500/50 text-amber-400 bg-black/40'
            }`}
            style={{ marginBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
          >
            {connected ? 'Live' : 'Reconnecting…'}
          </div>
        </>
      ) : null}
    </div>
  );
}
