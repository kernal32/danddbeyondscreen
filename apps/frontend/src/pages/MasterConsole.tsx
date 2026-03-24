import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import type { PublicSessionState, SavedCustomTheme, TableTheme, UserThemePreferences } from '@ddb/shared-types';
import { TABLE_THEME_IDS } from '@ddb/shared-types';
import { createDefaultTableLayout } from '@ddb/shared-types';
import { apiGet, apiPatch, apiPostWithHeaders, ApiHttpError } from '../api';
import { USER_TOKEN_KEY } from '../auth-storage';
import { useSessionSocket } from '../hooks/useSessionSocket';
import TableLayoutEditor from '../layout/TableLayoutEditor';
import { applySessionVisualTheme, THEME_LABELS } from '../theme/tableTheme';
import { TableThemeProvider } from '../theme/TableThemeContext';
import MasterPartyStrip from '../components/MasterPartyStrip';
import { getAppOriginForLinks } from '../util/appOrigin';

const AUTO_IMPORT_PARTY_LS = 'ddb_dm_autoImportParty';
const SETTINGS_DEV_MODE_LS = 'ddb_settings_dev_mode';

export default function MasterConsole() {
  const nav = useNavigate();
  const sessionId = sessionStorage.getItem('ddb_sessionId');
  const dmToken = sessionStorage.getItem('ddb_dmToken');
  const displayToken = useMemo(() => {
    try {
      return sessionStorage.getItem('ddb_displayToken');
    } catch {
      return null;
    }
  }, []);
  const appOrigin = getAppOriginForLinks();
  const displayScreenUrl = displayToken
    ? `${appOrigin}/display/${encodeURIComponent(displayToken)}`
    : null;
  const initiativeRemoteUrl = displayToken
    ? `${appOrigin}/initiative-remote/${encodeURIComponent(displayToken)}`
    : null;
  const [showPhoneQr, setShowPhoneQr] = useState(false);
  const { state, connected, emit } = useSessionSocket(sessionId, dmToken, { uiMode: 'dm' });
  const [sessionLost, setSessionLost] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [autoImportParty, setAutoImportParty] = useState(() => {
    try {
      return localStorage.getItem(AUTO_IMPORT_PARTY_LS) === '1';
    } catch {
      return false;
    }
  });
  const [savedAccountThemes, setSavedAccountThemes] = useState<SavedCustomTheme[]>([]);

  useEffect(() => {
    if (!sessionId || !dmToken) nav('/');
  }, [sessionId, dmToken, nav]);

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
        await apiGet(`/api/sessions/${sessionId}`, dmToken);
        setSessionLost(false);
      } catch (e) {
        setSessionLost(e instanceof ApiHttpError && e.status === 401);
      }
    })();
  }, [sessionId, dmToken]);

  useEffect(() => {
    if (!autoImportParty || !sessionId || !dmToken || !authEnabled) return;
    const appliedKey = `ddb_partyImportAppliedAt_${sessionId}`;
    const tick = async () => {
      const userTok = localStorage.getItem(USER_TOKEN_KEY);
      if (!userTok) return;
      try {
        const meta = await apiGet<{ upload: { updatedAt: number; characterCount: number } | null }>(
          '/api/me/ddb-upload',
          userTok,
        );
        const u = meta.upload;
        if (!u || u.characterCount < 1) return;
        const last = Number(sessionStorage.getItem(appliedKey) || '0');
        if (u.updatedAt <= last) return;
        const r = await apiPostWithHeaders<{
          characterCount: number;
          uploadUpdatedAt?: number | null;
        }>(`/api/sessions/${sessionId}/party/import-upload`, {}, {
          Authorization: `Bearer ${dmToken}`,
          'X-User-Authorization': `Bearer ${userTok}`,
        });
        const applied = r.uploadUpdatedAt ?? u.updatedAt;
        sessionStorage.setItem(appliedKey, String(applied));
        setImportMsg({ text: `Auto-loaded ${r.characterCount} character(s) from account upload.`, ok: true });
      } catch (e) {
        setImportMsg({
          text: e instanceof ApiHttpError ? e.message : 'Auto-import failed',
          ok: false,
        });
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 45_000);
    void tick();
    return () => window.clearInterval(id);
  }, [autoImportParty, sessionId, dmToken, authEnabled]);

  useEffect(() => {
    applySessionVisualTheme(state?.theme ?? 'minimal', state?.themePalette ?? null);
  }, [state?.theme, state?.themePalette]);

  useEffect(() => {
    const t = localStorage.getItem(USER_TOKEN_KEY);
    if (!t) {
      setSavedAccountThemes([]);
      return;
    }
    void (async () => {
      try {
        const r = await apiGet<{ preferences: { themePreferences?: UserThemePreferences } }>('/api/me', t);
        setSavedAccountThemes(r.preferences.themePreferences?.savedCustomThemes ?? []);
      } catch {
        setSavedAccountThemes([]);
      }
    })();
  }, [sessionId, authEnabled]);

  if (!sessionId || !dmToken) return null;

  const s = state as PublicSessionState | null;
  const party = s?.party;

  const pushSessionTheme = (theme: TableTheme, themePalette: string[] | null) => {
    if (!sessionId || !dmToken) return;
    void (async () => {
      try {
        await apiPatch(`/api/sessions/${sessionId}`, { theme, themePalette }, dmToken);
        emit('session:setTheme', { theme, themePalette });
      } catch (e) {
        console.error(e);
      }
    })();
  };

  return (
    <TableThemeProvider theme={s?.theme ?? 'minimal'}>
      <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-3 md:gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Table</span>
          {displayScreenUrl ? (
            <a
              href={displayScreenUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Launch display
            </a>
          ) : (
            <span className="text-sm text-[var(--muted)]">No display link in session</span>
          )}
          {initiativeRemoteUrl ? (
            <button
              type="button"
              className="rounded-lg border border-violet-500/50 bg-violet-950/40 px-3 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              onClick={() => setShowPhoneQr(true)}
            >
              Show QR (phone)
            </button>
          ) : null}
          <Link
            to="/dm/settings#display-pin"
            className="rounded-lg border border-amber-500/45 bg-amber-950/35 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Set pin
          </Link>
        </div>

        {showPhoneQr && initiativeRemoteUrl ? (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Phone initiative QR code"
            onClick={() => setShowPhoneQr(false)}
          >
            <div
              className="max-w-md rounded-2xl border border-white/15 bg-[var(--surface)] p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-bold text-[var(--accent)]">Scan for phone controls</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Opens initiative on a phone (same session as the TV). First visit asks for the 4-digit code —{' '}
                <Link to="/dm/settings#display-pin" className="text-sky-400 hover:underline">
                  set pin in Settings
                </Link>
                .
              </p>
              <div className="mt-4 flex justify-center rounded-lg bg-white p-3 [&_svg]:block">
                <QRCode value={initiativeRemoteUrl} size={200} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-slate-600 px-3 py-2 text-sm text-white"
                  onClick={() => void navigator.clipboard?.writeText(initiativeRemoteUrl)}
                >
                  Copy phone link
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm text-[var(--muted)]"
                  onClick={() => setShowPhoneQr(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <header className="flex flex-wrap gap-4 justify-between items-center mb-6">
          <h1 className="text-3xl font-display font-bold text-[var(--accent)]">Master Console</h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/dm/settings"
              className="text-sm text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded px-1"
            >
              Settings
            </Link>
            <span
              className={`text-sm px-3 py-1 rounded-full border ${
                connected ? 'border-emerald-500/50 text-emerald-400' : 'border-amber-500/50 text-amber-300'
              }`}
            >
              {connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </header>

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
          <div className="mb-6 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                disabled={!localStorage.getItem(USER_TOKEN_KEY)}
                onClick={() => {
                  const userTok = localStorage.getItem(USER_TOKEN_KEY);
                  if (!sessionId || !dmToken || !userTok) return;
                  setImportMsg(null);
                  void (async () => {
                    try {
                      const r = await apiPostWithHeaders<{
                        characterCount: number;
                        uploadUpdatedAt?: number | null;
                      }>(`/api/sessions/${sessionId}/party/import-upload`, {}, {
                        Authorization: `Bearer ${dmToken}`,
                        'X-User-Authorization': `Bearer ${userTok}`,
                      });
                      const appliedKey = `ddb_partyImportAppliedAt_${sessionId}`;
                      const at = r.uploadUpdatedAt;
                      if (at != null) sessionStorage.setItem(appliedKey, String(at));
                      setImportMsg({ text: `Loaded ${r.characterCount} character(s) from your account upload.`, ok: true });
                    } catch (e) {
                      setImportMsg({
                        text: e instanceof ApiHttpError ? e.message : 'Import failed',
                        ok: false,
                      });
                    }
                  })();
                }}
              >
                Load upload into this table
              </button>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={autoImportParty}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAutoImportParty(on);
                    try {
                      localStorage.setItem(AUTO_IMPORT_PARTY_LS, on ? '1' : '0');
                    } catch {
                      /* ignore */
                    }
                  }}
                />
                Auto-load when account upload changes (~45s)
              </label>
            </div>
            {!localStorage.getItem(USER_TOKEN_KEY) ? (
              <span className="text-xs text-amber-300">Sign in (same browser) to import your Tampermonkey uploads.</span>
            ) : null}
            {importMsg && (
              <span className={`text-sm ${importMsg.ok ? 'text-sky-300' : 'text-amber-300'}`} role={importMsg.ok ? 'status' : 'alert'}>
                {importMsg.text}
              </span>
            )}
          </div>
        )}

        <section className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <p className="text-xs text-[var(--muted)]">Table theme (display + session)</p>
            {typeof localStorage !== 'undefined' && localStorage.getItem(SETTINGS_DEV_MODE_LS) === '1' ? (
              <Link
                to="/dm/settings/theme-builder"
                className="text-xs text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                Create new theme
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {TABLE_THEME_IDS.map((t) => {
              const active = s?.theme === t && !(s?.themePalette && s.themePalette.length > 0);
              return (
                <button
                  key={t}
                  type="button"
                  className={`rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    active ? 'bg-violet-700 text-white' : 'bg-white/10 text-[var(--text)]'
                  }`}
                  onClick={() => pushSessionTheme(t, null)}
                >
                  {THEME_LABELS[t]}
                </button>
              );
            })}
          </div>
          {savedAccountThemes.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center pt-1">
              <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Your palettes</span>
              {savedAccountThemes.map((c) => {
                const active =
                  s?.theme === c.baseTheme &&
                  JSON.stringify(s?.themePalette ?? []) === JSON.stringify(c.palette);
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.name}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      active ? 'bg-violet-700 text-white' : 'bg-white/10 text-[var(--text)]'
                    }`}
                    onClick={() => pushSessionTheme(c.baseTheme, c.palette)}
                  >
                    <span className="flex gap-0.5">
                      {c.palette.slice(0, 6).map((h, i) => (
                        <span
                          key={`${c.id}-${i}`}
                          className="h-5 w-5 rounded-sm border border-black/20 shadow-sm"
                          style={{ backgroundColor: h }}
                        />
                      ))}
                    </span>
                    <span className="max-w-[10rem] truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 items-center pt-1">
            <button
              type="button"
              className="rounded px-3 py-2 bg-slate-700 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              onClick={() => emit('session:setTableLayout', { tableLayout: createDefaultTableLayout() })}
            >
              Reset TV layout
            </button>
          </div>
        </section>

        {s && (
          <details className="mb-6 rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer font-display text-lg text-[var(--accent)] select-none">
              TV layout & editor
            </summary>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Drag widgets to reposition (release to snap), resize from the corner, add/remove blocks, then{' '}
              <strong className="text-[var(--text)]">Apply layout to table</strong> to push to the display via Socket.IO.
              Layout debug on the public display: Ctrl+Shift+D.
            </p>
            <div className="mt-3">
              <TableLayoutEditor state={s} onApply={(layout) => emit('session:setTableLayout', { tableLayout: layout })} />
            </div>
          </details>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 mb-6 lg:mb-0 rounded-xl border border-white/10 bg-black/20 p-3 space-y-4">
            <h2 className="font-display text-lg text-[var(--accent)]">Party</h2>
            {party?.characters.length ? (
              <MasterPartyStrip
                characters={party.characters}
                hiddenPartyMembers={s?.hiddenPartyMembers}
                emit={emit}
              />
            ) : null}
            {party && party.error && (
              <p className="text-amber-400 border border-amber-500/40 rounded-lg p-3">{party.error}</p>
            )}
            {party && !party.characters.length && !party.error && (
              <p className="text-sm text-[var(--muted)]">No characters — sync from D&amp;D Beyond in Settings.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--accent)] mb-2">Dice / log</h3>
            <ul className="max-h-48 overflow-y-auto text-sm space-y-1 font-mono">
              {(s?.diceLog ?? []).map((e) => (
                <li key={e.at + e.message} className="text-[var(--muted)]">
                  <span className="text-[var(--text)]">{e.at.slice(11, 19)}</span> {e.message}
                  {e.dmOnly && ' (DM)'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </TableThemeProvider>
  );
}
