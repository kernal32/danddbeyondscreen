import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TableLayout } from '@ddb/shared-types/layout';
import type { PartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { apiGet, apiPatch, apiPost, apiPut, ApiHttpError } from '../api';
import { DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY } from '../debug/displayInitiativePrivacy';
import PartyWidgetOptionsPanel from '../components/settings/PartyWidgetOptionsPanel';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { applySessionVisualTheme } from '../theme/tableTheme';

const UNAUTH_DM_HINT =
  'The server does not recognize this DM session (sessions are stored in memory). This usually happens after restarting the backend—open the home page and start a new session.';

const SETTINGS_DEV_MODE_LS = 'ddb_settings_dev_mode';

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
  const [devMode, setDevMode] = useState(() => {
    try {
      return localStorage.getItem(SETTINGS_DEV_MODE_LS) === '1';
    } catch {
      return false;
    }
  });

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
    applySessionVisualTheme(state?.theme ?? 'minimal', state?.themePalette ?? null);
  }, [state?.theme, state?.themePalette]);

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

  const patchDisplayInitiativeMask = async (next: {
    displayInitiativeMaskTotals: boolean;
    displayInitiativeRevealLowest: boolean;
  }) => {
    if (!sessionId || !dmToken || sessionLost) return;
    await apiPatch(`/api/sessions/${sessionId}`, next, dmToken);
    emit('session:setDisplayInitiativeMask', next);
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
          isAdmin?: boolean;
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

  if (!sessionId || !dmToken) {
    return (
      <div className="theme-dark-arcane min-h-dvh flex flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="max-w-md text-base text-[var(--text)]">
          No table session in this browser tab. Open{' '}
          <Link to="/" className="text-sky-400 underline hover:text-sky-300">
            Home
          </Link>{' '}
          and start or continue a table first.
        </p>
        <Link
          to="/"
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-wrap gap-4 justify-between items-center mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/master"
            className="text-sm text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
          >
            ← Master Console
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

      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)] select-none">
          <input
            type="checkbox"
            className="rounded border-white/30"
            checked={devMode}
            onChange={(e) => {
              const on = e.target.checked;
              setDevMode(on);
              try {
                localStorage.setItem(SETTINGS_DEV_MODE_LS, on ? '1' : '0');
              } catch {
                /* ignore */
              }
            }}
          />
          Enable dev mode
        </label>
        {!devMode ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Hides party card widget options, live TV preview, Tampermonkey / API setup, and optional D&amp;D Beyond seed.
            Turn on for full power-user controls.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">
            <Link
              to="/dm/settings/theme-builder"
              className="text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
            >
              Create new theme
            </Link>{' '}
            — name, colours, and palette-based UI tokens (saved per account).{' '}
            <Link
              to="/dm/settings/initiative-customizer"
              className="text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
            >
              Party card grid customizer
            </Link>{' '}
            for TV combined init and custom full cards (drag/resize layout).
          </p>
        )}
      </div>

      {sessionLost && (
        <div
          className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <strong className="text-amber-200">Master session missing on the server.</strong> The API rejected your saved
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
              , and pull uploads into this table from the Master console.
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

      {devMode ? (
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
      ) : null}

      <section className="rounded-xl border border-violet-500/25 bg-[var(--surface)] p-4 md:p-6 space-y-3">
        <h2 className="font-semibold text-lg text-[var(--accent)]">D&amp;D Beyond party ingest (Tampermonkey)</h2>
        <p className="text-sm text-[var(--muted)]">
          Browser userscript that pulls character JSON from D&amp;D Beyond and POSTs it to this DM Screen deployment (
          <code className="text-[var(--text)]">https://dnd.saltbushlabs.com</code>). Generate an API key on{' '}
          <Link to="/account" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
            Account
          </Link>
          , paste it into the script (see guide), then use <strong className="text-[var(--text)]">Load upload into this table</strong>{' '}
          on the Master console after pushing.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href="/userscripts/ddb-party-ingest.user.js"
            download="ddb-party-ingest.user.js"
            className="inline-flex rounded-lg bg-violet-800 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Download userscript
          </a>
          <span className="text-xs text-[var(--muted)]">Right-click and <strong className="text-[var(--text)]">Save as…</strong></span>
        </div>
        <details className="rounded-lg border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-elevated)_55%,transparent)] p-3 text-sm text-[var(--muted)]">
          <summary className="cursor-pointer font-medium text-[var(--text)] select-none">
            Installation guide
          </summary>
          <ol className="mt-3 list-decimal space-y-3 pl-5">
            <li>
              Install <strong className="text-[var(--text)]">Tampermonkey</strong> from the{' '}
              <a
                href="https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo"
                className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Chrome Web Store
              </a>{' '}
              (or your browser&apos;s equivalent).
            </li>
            <li>
              <strong className="text-[var(--text)]">Allow user scripts (required in Chrome):</strong> open{' '}
              <strong className="text-[var(--text)]">Extensions</strong> (puzzle icon) → <strong className="text-[var(--text)]">Manage extensions</strong> →
              Tampermonkey → <strong className="text-[var(--text)]">Details</strong>. Turn on{' '}
              <strong className="text-[var(--text)]">Allow User Scripts</strong> — Chrome shows a warning that the extension can
              run code not reviewed by Google; this app&apos;s ingest script is open source and only runs on D&amp;D Beyond + your
              chosen backend. Without this, Tampermonkey may not run scripts reliably under Manifest V3.
            </li>
            <li>
              Still under Tampermonkey <strong className="text-[var(--text)]">Details</strong>, set{' '}
              <strong className="text-[var(--text)]">Site access</strong> to include{' '}
              <code className="text-[var(--text)]">dndbeyond.com</code> (or <strong className="text-[var(--text)]">On all sites</strong>{' '}
              while testing). Optionally allow <strong className="text-[var(--text)]">Allow access to file URLs</strong> if you install
              from a downloaded file.
            </li>
            <li>
              Download <strong className="text-[var(--text)]">ddb-party-ingest.user.js</strong> above. In Tampermonkey:{' '}
              <strong className="text-[var(--text)]">Dashboard → Utilities → Install from file</strong>, or drag the file into Chrome.
            </li>
            <li>
              Open the script in Tampermonkey&apos;s editor. For <strong className="text-[var(--text)]">this</strong> deployment,{' '}
              <code className="text-[var(--text)]">BACKEND_URL</code> is already{' '}
              <code className="text-[var(--text)]">https://dnd.saltbushlabs.com</code> and <code className="text-[var(--text)]">@connect</code>{' '}
              includes that host. Replace <code className="text-[var(--text)]">CHANGEME</code> in{' '}
              <code className="text-[var(--text)]">DND_API_KEY</code> with a key from{' '}
              <Link to="/account" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
                Account → Generate API key
              </Link>
              . Save. <strong className="text-[var(--text)]">Self-hosting?</strong> Set <code className="text-[var(--text)]">BACKEND_URL</code>{' '}
              to your origin and add <code className="text-[var(--text)]">// @connect your.hostname</code> in the header
              {devMode ? (
                <> (backend URL also under <strong className="text-[var(--text)]">D&amp;D Beyond data (Tampermonkey)</strong> below).</>
              ) : (
                <> (enable <strong className="text-[var(--text)]">dev mode</strong> in Settings for a copy button).</>
              )}
            </li>
            <li>
              The script posts via <code className="text-[var(--text)]">GM_xmlhttpRequest</code>. If pushes fail, check Tampermonkey&apos;s
              script errors and that your API key is valid. The header <code className="text-[var(--text)]">@require</code> loads a D&amp;D
              Beyond bundle from <code className="text-[var(--text)]">media.dndbeyond.com</code>; if DDB renames it, update the{' '}
              <code className="text-[var(--text)]">@require</code> line (see comments at the top of the file).
            </li>
            <li>
              Open a <strong className="text-[var(--text)]">character or campaign</strong> page on D&amp;D Beyond and use the floating
              panel (Pull / Push / auto-sync).
            </li>
          </ol>
        </details>
      </section>

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

      {!DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY ? (
        <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 md:p-6 space-y-3">
          <h2 className="font-semibold text-lg text-[var(--accent)]">Display initiative privacy</h2>
          <p className="text-sm text-[var(--muted)]">
            When enabled, the table TV, phone initiative page, and combined party cards hide initiative totals and roll
            breakdowns except for whoever is first in the current order (and optionally everyone tied for the lowest total
            in that order). Turn order stays visible. The Master Console always shows full numbers.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={state?.displayInitiativeMaskTotals === true}
              disabled={sessionLost || !sessionId}
              onChange={(e) => {
                const on = e.target.checked;
                void patchDisplayInitiativeMask({
                  displayInitiativeMaskTotals: on,
                  displayInitiativeRevealLowest: on ? state?.displayInitiativeRevealLowest === true : false,
                });
              }}
            />
            <span>Hide initiative totals on display (order still visible)</span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2 text-sm ${
              state?.displayInitiativeMaskTotals === true ? 'text-[var(--text)]' : 'text-[var(--muted)]'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={state?.displayInitiativeRevealLowest === true}
              disabled={sessionLost || !sessionId || state?.displayInitiativeMaskTotals !== true}
              onChange={(e) => {
                void patchDisplayInitiativeMask({
                  displayInitiativeMaskTotals: state?.displayInitiativeMaskTotals === true,
                  displayInitiativeRevealLowest: e.target.checked,
                });
              }}
            />
            <span>Also reveal anyone tied for lowest initiative in the current order</span>
          </label>
        </section>
      ) : (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 md:p-6">
          <p className="text-sm text-amber-100/90">
            <strong className="font-semibold">Debug:</strong> display initiative privacy is disabled in code (
            <code className="rounded bg-black/30 px-1 font-mono text-xs">debug/displayInitiativePrivacy.ts</code>). Rebuild
            after setting <code className="font-mono text-xs">DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY</code> to{' '}
            <code className="font-mono text-xs">false</code>.
          </p>
        </section>
      )}

      {devMode ? (
        <section className="rounded-xl border border-teal-500/25 bg-[var(--surface)] p-4 md:p-6 space-y-2">
          <h2 className="font-semibold text-lg text-[var(--accent)]">D&amp;D Beyond data (Tampermonkey)</h2>
          <p className="text-sm text-[var(--muted)]">
            Party JSON is sent to your account with an <strong className="text-[var(--text)]">API key</strong> (not this DM
            session). Configure keys and copy your backend URL on the{' '}
            <Link to="/account" className="text-sky-400 hover:underline">
              Account
            </Link>{' '}
            page. Then use <strong className="text-[var(--text)]">Load upload into this table</strong> on the Master console
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
      ) : null}

      {devMode ? (
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
      ) : null}
    </div>
  );
}
