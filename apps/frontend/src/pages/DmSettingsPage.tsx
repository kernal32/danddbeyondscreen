import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { PartyCardDisplayOptions, TableLayout } from '@ddb/shared-types';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types';
import { apiGet, apiPatch, apiPost, apiPut, ApiHttpError } from '../api';
import PartyWidgetOptionsPanel from '../components/settings/PartyWidgetOptionsPanel';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { applyRootTableTheme } from '../theme/tableTheme';

const UNAUTH_DM_HINT =
  'The server does not recognize this DM session (sessions are stored in memory). This usually happens after restarting the backend—open the home page and start a new session.';

export default function DmSettingsPage() {
  const nav = useNavigate();
  const location = useLocation();
  const sessionId = sessionStorage.getItem('ddb_sessionId');
  const dmToken = sessionStorage.getItem('ddb_dmToken');
  const displayToken = sessionStorage.getItem('ddb_displayToken');

  const { state, connected, emit } = useSessionSocket(sessionId, dmToken, { uiMode: 'dm' });
  const [seedInput, setSeedInput] = useState('');
  const [sessionLost, setSessionLost] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem(USER_EMAIL_KEY));
  const [partyCardOpts, setPartyCardOpts] = useState<PartyCardDisplayOptions>(() =>
    mergePartyCardDisplayOptions(undefined),
  );
  const [partyOptsErr, setPartyOptsErr] = useState<string | null>(null);
  const [displayGatePin, setDisplayGatePin] = useState('');
  const [displayPinRevision, setDisplayPinRevision] = useState<number | null>(null);
  const [gatePinErr, setGatePinErr] = useState<string | null>(null);
  const [gatePinOk, setGatePinOk] = useState<string | null>(null);

  const partyCardSig =
    state?.partyCardDisplay != null ? JSON.stringify(state.partyCardDisplay) : '';
  useEffect(() => {
    setPartyCardOpts(mergePartyCardDisplayOptions(state?.partyCardDisplay));
  }, [partyCardSig]);

  useEffect(() => {
    if (!sessionId || !dmToken) nav('/');
  }, [sessionId, dmToken, nav]);

  useEffect(() => {
    if (location.hash !== '#display-pin') return;
    const id = window.setTimeout(() => {
      document.getElementById('display-pin')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('ddb-display-gate-pin')?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [location.pathname, location.hash, location.key]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiGet<{ enabled: boolean }>('/api/auth/enabled');
        setAuthEnabled(r.enabled);
      } catch {
        setAuthEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId || !dmToken) return;
    void (async () => {
      try {
        const meta = await apiGet<{
          seedCharacterId?: number | null;
          displayGatePin?: string;
          displayPinRevision?: number;
        }>(`/api/sessions/${sessionId}`, dmToken);
        if (meta.seedCharacterId != null && Number.isFinite(meta.seedCharacterId)) {
          setSeedInput(String(meta.seedCharacterId));
        }
        if (typeof meta.displayGatePin === 'string') setDisplayGatePin(meta.displayGatePin);
        if (typeof meta.displayPinRevision === 'number') setDisplayPinRevision(meta.displayPinRevision);
        setSessionLost(false);
      } catch (e) {
        setSessionLost(e instanceof ApiHttpError && e.status === 401);
      }
    })();
  }, [sessionId, dmToken]);

  useEffect(() => {
    applyRootTableTheme(state?.theme ?? 'minimal');
  }, [state?.theme]);

  const displayUrl = useMemo(() => {
    if (!displayToken) return '';
    return `${window.location.origin}/display/${displayToken}`;
  }, [displayToken]);

  const apiBase = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);

  const pushSeed = async () => {
    if (!sessionId || !dmToken) return;
    const n = Number(seedInput);
    if (!Number.isFinite(n)) return;
    await apiPatch(`/api/sessions/${sessionId}`, { seedCharacterId: n }, dmToken);
    emit('session:setSeed', { seedCharacterId: n });
  };

  const refreshParty = () => emit('party:refresh');

  const saveDisplayGatePin = async () => {
    if (!sessionId || !dmToken) return;
    setGatePinErr(null);
    setGatePinOk(null);
    const digits = displayGatePin.replace(/\D/g, '').slice(-4);
    if (digits.length !== 4) {
      setGatePinErr('Use exactly 4 digits.');
      return;
    }
    try {
      const r = await apiPatch<{ ok: true; displayPinRevision: number }>(
        `/api/sessions/${sessionId}`,
        { displayGatePin: digits },
        dmToken,
      );
      setDisplayGatePin(digits);
      setDisplayPinRevision(r.displayPinRevision);
      setGatePinOk('Saved. TV and phones will ask again on their next visit (or immediately if already open).');
    } catch (e) {
      setGatePinErr(e instanceof ApiHttpError ? e.message : 'Could not save code');
    }
  };

  const randomizeDisplayGatePin = () => {
    const n = Math.floor(Math.random() * 10000);
    setDisplayGatePin(String(n).padStart(4, '0'));
    setGatePinErr(null);
    setGatePinOk(null);
  };

  const applyPartyCardOpts = async () => {
    if (!sessionId || !dmToken) return;
    setPartyOptsErr(null);
    try {
      await apiPatch(`/api/sessions/${sessionId}`, { partyCardDisplay: partyCardOpts }, dmToken);
      emit('session:setPartyCardDisplay', { partyCardDisplay: partyCardOpts });
    } catch (e) {
      const msg =
        e instanceof ApiHttpError
          ? `${e.message} (${e.status})`
          : e instanceof Error
            ? e.message
            : 'Could not update party card options';
      setPartyOptsErr(msg);
    }
  };

  const userToken = typeof window !== 'undefined' ? localStorage.getItem(USER_TOKEN_KEY) : null;

  const saveToAccount = () => {
    if (!userToken) return;
    setAccountFeedback(null);
    void (async () => {
      try {
        const n = Number(seedInput);
        await apiPut(
          '/api/me/preferences',
          {
            defaultSeedCharacterId: Number.isFinite(n) ? Math.floor(n) : null,
            tableLayout: state?.tableLayout ?? null,
            partyCardDisplay: partyCardOpts,
          },
          userToken,
        );
        setAccountFeedback({
          text: 'Saved to your account (seed, layout, party card options). New sessions preload these when you stay signed in.',
          ok: true,
        });
      } catch (e) {
        setAccountFeedback({
          text: e instanceof Error ? e.message : 'Save failed',
          ok: false,
        });
      }
    })();
  };

  const loadFromAccount = () => {
    if (!userToken || !sessionId || !dmToken) return;
    setAccountFeedback(null);
    void (async () => {
      try {
        const me = await apiGet<{
          email: string;
          preferences: {
            defaultSeedCharacterId: number | null;
            tableLayout: TableLayout | null;
            partyCardDisplay: PartyCardDisplayOptions | null;
          };
        }>('/api/me', userToken);
        localStorage.setItem(USER_EMAIL_KEY, me.email);
        setUserEmail(me.email);
        const sid = me.preferences.defaultSeedCharacterId;
        setSeedInput(sid != null && Number.isFinite(sid) ? String(sid) : '');
        if (me.preferences.tableLayout) {
          await apiPatch(`/api/sessions/${sessionId}`, { tableLayout: me.preferences.tableLayout }, dmToken);
          emit('session:setTableLayout', { tableLayout: me.preferences.tableLayout });
        }
        if (me.preferences?.partyCardDisplay) {
          const merged = mergePartyCardDisplayOptions(me.preferences.partyCardDisplay);
          setPartyCardOpts(merged);
          await apiPatch(`/api/sessions/${sessionId}`, { partyCardDisplay: merged }, dmToken);
          emit('session:setPartyCardDisplay', { partyCardDisplay: merged });
        }
        setAccountFeedback({
          text: 'Loaded from account. Use Save seed if you want this game to use the seed now.',
          ok: true,
        });
      } catch (e) {
        setAccountFeedback({
          text: e instanceof Error ? e.message : 'Load failed',
          ok: false,
        });
      }
    })();
  };

  if (!sessionId || !dmToken) return null;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-wrap gap-4 justify-between items-center mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/dm"
            className="text-sm text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
          >
            ← DM Console
          </Link>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-[var(--accent)]">Settings</h1>
        </div>
        <span
          className={`text-sm px-3 py-1 rounded-full border ${
            connected ? 'border-emerald-500/50 text-emerald-400' : 'border-amber-500/50 text-amber-300'
          }`}
        >
          {connected ? 'Connected' : 'Offline'}
        </span>
      </header>

      {sessionLost && (
        <div
          className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <strong className="text-amber-200">DM session missing on the server.</strong> The API rejected your saved
          tokens—often because the Node backend was restarted and in-memory sessions were cleared. Socket.IO can still
          show &quot;Connected&quot; even though REST calls fail.{' '}
          <button type="button" className="text-sky-300 underline font-medium" onClick={() => nav('/')}>
            Go to home → new session
          </button>
        </div>
      )}

      {authEnabled && (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 md:p-6 space-y-3">
          <h2 className="font-semibold text-lg text-[var(--accent)]">Your account</h2>
          {!userToken ? (
            <p className="text-sm text-[var(--muted)]">
              <Link to="/login" className="text-sky-400 hover:underline">
                Sign in
              </Link>{' '}
              or{' '}
              <Link to="/register" className="text-sky-400 hover:underline">
                register
              </Link>{' '}
              to save seed and table layout, manage{' '}
              <Link to="/account" className="text-sky-400 hover:underline">
                Tampermonkey API keys
              </Link>
              , and pull uploads into this table from the DM console.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                Signed in as <span className="text-[var(--text)]">{userEmail ?? '—'}</span>
                {' · '}
                <Link to="/account" className="text-sky-400 hover:underline">
                  API keys & uploads
                </Link>
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded bg-emerald-800 px-3 py-2 text-white text-sm" onClick={saveToAccount}>
                  Save seed, layout &amp; party options
                </button>
                <button type="button" className="rounded bg-slate-700 px-3 py-2 text-white text-sm" onClick={loadFromAccount}>
                  Load from account
                </button>
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--muted)]"
                  onClick={() => {
                    localStorage.removeItem(USER_TOKEN_KEY);
                    localStorage.removeItem(USER_EMAIL_KEY);
                    setUserEmail(null);
                    setAccountFeedback({ text: 'Signed out of account (this game session is unchanged).', ok: true });
                  }}
                >
                  Sign out of account
                </button>
              </div>
            </>
          )}
          {accountFeedback && (
            <p
              className={`text-sm ${accountFeedback.ok ? 'text-sky-300' : 'text-amber-300'}`}
              role={accountFeedback.ok ? 'status' : 'alert'}
            >
              {accountFeedback.text}
            </p>
          )}
        </section>
      )}

      <PartyWidgetOptionsPanel
        value={partyCardOpts}
        onChange={(next) => {
          setPartyOptsErr(null);
          setPartyCardOpts(next);
        }}
        onApplyToSession={() => void applyPartyCardOpts()}
        applyDisabled={sessionLost}
        error={partyOptsErr}
      />

      <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 md:p-6 space-y-3">
        <h2 className="font-semibold text-lg text-[var(--accent)]">Display link</h2>
        <p className="text-sm text-[var(--muted)] break-all">{displayUrl || '—'}</p>
        <button
          type="button"
          className="rounded bg-sky-700 px-3 py-2 text-white text-sm disabled:opacity-50"
          disabled={!displayUrl}
          onClick={() => void navigator.clipboard.writeText(displayUrl)}
        >
          Copy link
        </button>
      </section>

      <section
        id="display-pin"
        className="scroll-mt-4 rounded-xl border border-amber-500/25 bg-[var(--surface)] p-4 md:p-6 space-y-3"
        aria-labelledby="display-pin-heading"
      >
        <h2 id="display-pin-heading" className="font-semibold text-lg text-[var(--accent)]">
          Display &amp; phone 4-digit code
        </h2>
        <p className="text-sm text-[var(--muted)]">
          The table URL and phone initiative link ask for this code the <strong className="text-[var(--text)]">first time</strong>{' '}
          on each browser (stored locally until you change the code here). New sessions get a random code automatically.
        </p>
        <p className="text-sm text-[var(--muted)]">
          If account sign-in is enabled on your server and you <strong className="text-[var(--text)]">create the session while signed in</strong>, that
          account can open the TV display and phone page without entering the code. Sessions created while logged out still require the code (or a
          remembered unlock).
        </p>
        {displayPinRevision != null ? (
          <p className="text-xs text-[var(--muted)]">
            Revision <span className="font-mono text-[var(--text)]">{displayPinRevision}</span> — bumping it invalidates
            remembered devices (happens when you save a new code).
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-[var(--muted)]" htmlFor="ddb-display-gate-pin">
              Code
            </label>
            <input
              id="ddb-display-gate-pin"
              className="mt-0.5 w-36 rounded-lg border border-white/20 bg-black/30 px-3 py-2 font-mono text-lg tracking-widest"
              inputMode="numeric"
              maxLength={8}
              value={displayGatePin}
              onChange={(e) => {
                setDisplayGatePin(e.target.value);
                setGatePinErr(null);
                setGatePinOk(null);
              }}
              disabled={sessionLost}
              aria-label="Four digit display and phone lock code"
            />
          </div>
          <button
            type="button"
            className="rounded-lg bg-amber-800 px-3 py-2 text-sm text-white disabled:opacity-50"
            disabled={sessionLost}
            onClick={() => void saveDisplayGatePin()}
          >
            Save code
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-[var(--muted)] disabled:opacity-50"
            disabled={sessionLost}
            onClick={randomizeDisplayGatePin}
          >
            Randomize
          </button>
        </div>
        {gatePinErr ? (
          <p className="text-sm text-amber-300" role="alert">
            {gatePinErr}
          </p>
        ) : null}
        {gatePinOk ? (
          <p className="text-sm text-sky-300" role="status">
            {gatePinOk}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-teal-500/25 bg-[var(--surface)] p-4 md:p-6 space-y-2">
        <h2 className="font-semibold text-lg text-[var(--accent)]">D&amp;D Beyond data (Tampermonkey)</h2>
        <p className="text-sm text-[var(--muted)]">
          Party JSON is sent to your account with an <strong className="text-[var(--text)]">API key</strong> (not this DM
          session). Configure keys and copy your backend URL on the{' '}
          <Link to="/account" className="text-sky-400 hover:underline">
            Account
          </Link>{' '}
          page. Then use <strong className="text-[var(--text)]">Load upload into this table</strong> on the DM console
          (while signed in).
        </p>
        <p className="text-xs text-[var(--muted)]">
          Backend base URL for scripts: <code className="text-[var(--text)] break-all">{apiBase || '—'}</code>
        </p>
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-2 text-white text-sm"
          disabled={!apiBase}
          onClick={() => void navigator.clipboard.writeText(apiBase)}
        >
          Copy backend URL
        </button>
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 md:p-6 space-y-3">
        <h2 className="font-semibold text-lg text-[var(--accent)]">D&amp;D Beyond seed (optional)</h2>
        <p className="text-xs text-[var(--muted)]">
          Numeric character ID from the sheet URL (<code className="text-[var(--text)]">…/characters/89992293</code>).
          <strong className="text-[var(--text)]"> Refresh party</strong> only works if the server has{' '}
          <code className="text-[var(--text)]">DDB_COOKIE</code> in <code className="text-[var(--text)]">.env</code> (no
          browser cookie flow anymore).
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded bg-black/30 border border-white/20 px-3 py-2 w-40"
            placeholder="Character ID"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            aria-label="D&D Beyond seed character ID"
          />
          <button type="button" className="rounded bg-amber-700 px-3 py-2 text-white text-sm" onClick={() => void pushSeed()}>
            Save seed
          </button>
          <button type="button" className="rounded bg-emerald-700 px-3 py-2 text-white text-sm" onClick={refreshParty}>
            Refresh party
          </button>
        </div>
      </section>
    </div>
  );
}
