import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, ApiHttpError } from '../api';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';

type TableSessionRow = {
  sessionId: string;
  displayToken: string;
  summaryLabel: string;
  updatedAt: number;
};

export default function HomePage() {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem(USER_EMAIL_KEY));
  const [userTok, setUserTok] = useState<string | null>(() => localStorage.getItem(USER_TOKEN_KEY));
  const [myTables, setMyTables] = useState<TableSessionRow[] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [browserContinueErr, setBrowserContinueErr] = useState<string | null>(null);
  const [browserContinueLoading, setBrowserContinueLoading] = useState(false);

  const storedSessionId =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ddb_sessionId') : null;
  const storedDmToken =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ddb_dmToken') : null;
  const canContinueBrowser = Boolean(storedSessionId && storedDmToken);

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
    if (!authEnabled || !userTok) {
      setMyTables(null);
      return;
    }
    let cancelled = false;
    setTablesLoading(true);
    void (async () => {
      try {
        const r = await apiGet<{ tables: TableSessionRow[] }>('/api/me/table-sessions', userTok);
        if (!cancelled) setMyTables(r.tables);
      } catch {
        if (!cancelled) setMyTables([]);
      } finally {
        if (!cancelled) setTablesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authEnabled, userTok]);

  const logout = () => {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    setUserEmail(null);
    setUserTok(null);
    setMyTables(null);
  };

  const goDm = (sessionId: string, dmToken: string, displayToken: string) => {
    sessionStorage.setItem('ddb_sessionId', sessionId);
    sessionStorage.setItem('ddb_dmToken', dmToken);
    sessionStorage.setItem('ddb_displayToken', displayToken);
    nav('/dm');
  };

  const create = async () => {
    setErr(null);
    setLoading(true);
    try {
      const tok = localStorage.getItem(USER_TOKEN_KEY) ?? undefined;
      const res = await apiPost<{ sessionId: string; displayToken: string; dmToken: string }>(
        '/api/sessions',
        {},
        tok,
      );
      goDm(res.sessionId, res.dmToken, res.displayToken);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const resumeTable = async (sessionId: string) => {
    const tok = localStorage.getItem(USER_TOKEN_KEY);
    if (!tok) return;
    setErr(null);
    setLoading(true);
    try {
      const res = await apiPost<{ sessionId: string; displayToken: string; dmToken: string }>(
        `/api/me/table-sessions/${encodeURIComponent(sessionId)}/resume`,
        {},
        tok,
      );
      goDm(res.sessionId, res.dmToken, res.displayToken);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const continueInThisBrowser = useCallback(async () => {
    if (!storedSessionId || !storedDmToken) return;
    setBrowserContinueErr(null);
    setBrowserContinueLoading(true);
    try {
      await apiGet(`/api/sessions/${storedSessionId}`, storedDmToken);
      nav('/dm');
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 401) {
        setBrowserContinueErr('That session is no longer on this server. Start a new one or pick a saved table below.');
      } else {
        setBrowserContinueErr(e instanceof Error ? e.message : 'Could not resume');
      }
    } finally {
      setBrowserContinueLoading(false);
    }
  }, [nav, storedDmToken, storedSessionId]);

  return (
    <div className="theme-minimal min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold font-display text-sky-400">D&D Beyond DM Screen</h1>
      <p className="text-slate-400 max-w-md text-center text-lg">
        Self-hosted table display and initiative. Create a session to get DM and display links — or resume a saved table
        after sign-in.
      </p>
      {authEnabled && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--muted)]">
          {userEmail ? (
            <>
              <span>
                Signed in as <span className="text-[var(--text)]">{userEmail}</span>
              </span>
              <Link to="/account" className="text-sky-400 hover:underline">
                Account
              </Link>
              <span aria-hidden>·</span>
              <button type="button" className="text-sky-400 hover:underline" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sky-400 hover:underline">
                Sign in
              </Link>
              <span aria-hidden>·</span>
              <Link to="/register" className="text-sky-400 hover:underline">
                Register
              </Link>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500 max-w-md text-center">
        {authEnabled && userEmail ? (
          <>
            New sessions preload seed and layout from your account. Tables you create while signed in are saved on the
            server and survive restarts.{' '}
            <Link to="/account" className="text-sky-400 hover:underline">
              API keys & uploads
            </Link>
          </>
        ) : authEnabled ? (
          'Register or sign in for Tampermonkey API keys, saved seed/layout, resumable tables, and pulling uploads into a live table.'
        ) : (
          'Live game state is saved to the server database so it survives restarts (same data folder as when accounts are enabled).'
        )}
      </p>

      {canContinueBrowser ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-sm font-medium text-[var(--text)]">This browser</p>
          <p className="text-xs text-[var(--muted)]">
            Continue the session already open in this tab (DM token in session storage).
          </p>
          <button
            type="button"
            disabled={browserContinueLoading}
            onClick={() => void continueInThisBrowser()}
            className="rounded-lg border border-sky-500/40 bg-sky-950/40 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-900/40 disabled:opacity-50"
          >
            {browserContinueLoading ? 'Checking…' : 'Continue to DM console'}
          </button>
          {browserContinueErr ? <p className="text-xs text-red-400">{browserContinueErr}</p> : null}
        </div>
      ) : null}

      {authEnabled && userTok && (
        <div className="w-full max-w-md flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--text)] text-center">Your tables</p>
          {tablesLoading ? (
            <p className="text-center text-sm text-[var(--muted)]">Loading saved tables…</p>
          ) : myTables && myTables.length > 0 ? (
            <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {myTables.map((t) => (
                <li key={t.sessionId} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--text)]">{t.summaryLabel}</p>
                    <p className="text-[10px] text-[var(--muted)]">
                      Updated {new Date(t.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void resumeTable(t.sessionId)}
                    className="shrink-0 rounded bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    Resume
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-xs text-[var(--muted)]">
              No tables linked to your account yet. Use <strong className="text-[var(--text)]">New session</strong> — you
              must be signed in when you create them to list them here.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void create()}
        disabled={loading}
        className="rounded-lg bg-sky-600 px-8 py-3 text-lg font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {loading ? 'Working…' : 'New session'}
      </button>
      {err && <p className="text-red-400">{err}</p>}
    </div>
  );
}
