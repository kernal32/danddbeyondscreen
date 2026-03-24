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
    nav('/master');
  };

  const create = async () => {
    setErr(null);
    if (authEnabled && !userTok) {
      setErr('Sign in to create a new table session.');
      return;
    }
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

  const canCreateSession = !authEnabled || Boolean(userTok);

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
      nav('/master');
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold font-display text-[var(--accent)]">D&D Beyond DM Screen</h1>
      <p className="text-[var(--muted)] max-w-md text-center text-lg leading-relaxed">
        Run your D&amp;D Beyond game with a <strong className="font-semibold text-[var(--text)]">table display</strong> and{' '}
        <strong className="font-semibold text-[var(--text)]">initiative tracker</strong> built for the physical or virtual
        table. Put the player view on a TV or tablet, keep the DM console on your laptop or phone, and keep party cards,
        HP, conditions, and turn order in sync so everyone sees the same state.
      </p>
      {authEnabled && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--muted)]">
          {userEmail ? (
            <>
              <span>
                Signed in as <span className="text-[var(--text)]">{userEmail}</span>
              </span>
              <Link to="/account" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
                Account
              </Link>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
                onClick={logout}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
                Sign in
              </Link>
              <span aria-hidden>·</span>
              <Link to="/register" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
                Register
              </Link>
            </>
          )}
        </div>
      )}
      <p className="text-xs text-[var(--muted)] max-w-md text-center leading-relaxed">
        {authEnabled && userEmail ? (
          <>
            New tables pick up your saved party seed, layout, and display options. Sessions you start while signed in stay
            on your account so you can resume anytime.{' '}
            <Link to="/account" className="text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
              API keys &amp; uploads
            </Link>
            .
          </>
        ) : authEnabled ? (
          <>
            A free account saves your tables and preferences, and unlocks optional browser helpers for pulling a party in
            from D&amp;D Beyond. You can still continue an open session in this browser without signing in.
          </>
        ) : (
          'Open sessions can be continued from this browser; your table state is stored so you can pick up after a refresh or reconnect.'
        )}
      </p>

      {canContinueBrowser ? (
        <div className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-4">
          <p className="text-sm font-medium text-[var(--text)]">This browser</p>
          <p className="text-xs text-[var(--muted)]">
            Continue the session already open in this tab (DM token in session storage).
          </p>
          <button
            type="button"
            disabled={browserContinueLoading}
            onClick={() => void continueInThisBrowser()}
            className="rounded-lg border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-elevated)_90%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_100%,transparent)] disabled:opacity-50"
          >
            {browserContinueLoading ? 'Checking…' : 'Continue to DM console'}
          </button>
          {browserContinueErr ? <p className="text-xs text-[var(--danger)]">{browserContinueErr}</p> : null}
        </div>
      ) : null}

      {authEnabled && userTok && (
        <div className="w-full max-w-md flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--text)] text-center">Your tables</p>
          {tablesLoading ? (
            <p className="text-center text-sm text-[var(--muted)]">Loading saved tables…</p>
          ) : myTables && myTables.length > 0 ? (
            <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-2">
              {myTables.map((t) => (
                <li
                  key={t.sessionId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] px-3 py-2"
                >
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
                    className="shrink-0 rounded bg-[var(--btn-primary-bg)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50"
                  >
                    Resume
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-xs text-[var(--muted)]">
              No saved tables yet. Start one with <strong className="text-[var(--text)]">New session</strong> to see it
              listed here.
            </p>
          )}
        </div>
      )}

      <div className="flex max-w-md flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void create()}
          disabled={loading || !canCreateSession}
          title={!canCreateSession && authEnabled ? 'Sign in to create a new table' : undefined}
          className="rounded-lg bg-[var(--btn-primary-bg)] px-8 py-3 text-lg font-semibold text-white hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Working…' : 'New session'}
        </button>
      </div>
      {err && <p className="text-[var(--danger)]">{err}</p>}
    </div>
  );
}
