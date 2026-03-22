import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import type { PublicSessionState, TableTheme } from '@ddb/shared-types';
import { mergePartyCardDisplayOptions, TABLE_THEME_IDS } from '@ddb/shared-types';
import { createDefaultTableLayout } from '@ddb/shared-types';
import { apiGet, apiPatch, apiPost, apiPostWithHeaders, ApiHttpError } from '../api';
import { USER_TOKEN_KEY } from '../auth-storage';
import { useSessionSocket } from '../hooks/useSessionSocket';
import TableLayoutEditor from '../layout/TableLayoutEditor';
import { applyRootTableTheme, THEME_LABELS } from '../theme/tableTheme';
import PartyCard from '../components/PartyCard';
import InitiativeTrackerPanel from '../components/InitiativeTrackerPanel';
import { formatConditionLabel } from '../util/formatConditionLabel';
import { getAppOriginForLinks } from '../util/appOrigin';

const AUTO_IMPORT_PARTY_LS = 'ddb_dm_autoImportParty';

export default function DmConsole() {
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
  const [newCombatant, setNewCombatant] = useState('');
  const [condInput, setCondInput] = useState<Record<string, string>>({});
  const [fxLabel, setFxLabel] = useState('Bless');
  const [fxRounds, setFxRounds] = useState(3);
  const [fxEntity, setFxEntity] = useState('');
  const [npcName, setNpcName] = useState('Goblin');
  const [npcAc, setNpcAc] = useState(15);
  const [npcHp, setNpcHp] = useState(7);
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
    applyRootTableTheme(state?.theme ?? 'minimal');
  }, [state?.theme]);

  if (!sessionId || !dmToken) return null;

  const s = state as PublicSessionState | null;
  const party = s?.party;
  const init = s?.initiative;

  const setTheme = async (theme: TableTheme) => {
    await apiPatch(`/api/sessions/${sessionId}`, { theme }, dmToken);
    emit('session:setTheme', { theme });
  };

  return (
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
        <h1 className="text-3xl font-display font-bold text-[var(--accent)]">DM Console</h1>
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
          <strong className="text-amber-200">DM session missing on the server.</strong> The API rejected your saved
          tokens—often because the Node backend was restarted and in-memory sessions were cleared. Socket.IO can still
          show &quot;Connected&quot; even though REST calls fail.{' '}
          <button type="button" className="text-sky-300 underline font-medium" onClick={() => nav('/')}>
            Go to home → new session
          </button>
        </div>
      )}

      <p className="text-sm text-[var(--muted)] mb-4">
        Display link, seed, Tampermonkey setup:{' '}
        <Link to="/dm/settings" className="text-sky-400 hover:underline">
          Settings
        </Link>
        {authEnabled ? (
          <>
            {' · '}
            <Link to="/account" className="text-sky-400 hover:underline">
              Account / API keys
            </Link>
          </>
        ) : null}
      </p>

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
        <p className="text-xs text-[var(--muted)]">Table theme (display + DM)</p>
        <div className="flex flex-wrap gap-2 items-center">
          {TABLE_THEME_IDS.map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                s?.theme === t ? 'bg-violet-700 text-white' : 'bg-white/10 text-[var(--text)]'
              }`}
              onClick={() => void setTheme(t)}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
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
        <details className="lg:col-span-2 mb-6 lg:mb-0 rounded-xl border border-white/10 bg-black/20 p-3 space-y-4 open:space-y-4">
          <summary className="cursor-pointer font-display text-lg text-[var(--accent)] select-none">
            Party
          </summary>
          {party?.characters.map((c) => (
            <div key={c.id}>
              <PartyCard
                c={c}
                displayOptions={mergePartyCardDisplayOptions(s?.partyCardDisplay)}
                onHpChange={(id, currentHp, tempHp) =>
                  emit('party:manualHp', { characterId: id, currentHp, tempHp })
                }
                onAbsentChange={(absent) => emit('party:setAbsent', { characterId: c.id, absent })}
              />
              <div className="mt-2 flex flex-wrap gap-2 items-center text-sm">
                <input
                  className="rounded bg-black/30 border border-white/20 px-2 py-1 flex-1 min-w-[12rem]"
                  placeholder="Conditions (comma-separated)"
                  value={
                    condInput[c.id] ??
                    c.conditions.map((x) => formatConditionLabel(x as unknown)).join(', ')
                  }
                  onChange={(e) => setCondInput((m) => ({ ...m, [c.id]: e.target.value }))}
                />
                <button
                  type="button"
                  className="rounded bg-violet-700 px-2 py-1 text-white"
                  onClick={() => {
                    const raw = condInput[c.id] ?? '';
                    const conditions = raw
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean);
                    emit('party:setConditions', { characterId: c.id, conditions });
                  }}
                >
                  Set conditions
                </button>
              </div>
              <p className="mt-1 max-w-2xl text-[11px] leading-snug text-[var(--muted)]">
                Party conditions drive the TV and player-card tiles. They are updated here by the DM or refreshed from
                D&amp;D Beyond via ingest — there is no player-facing editor in this app yet. In the{' '}
                <strong className="text-[var(--text)]">Initiative tracker</strong>, use <strong>1st</strong> /{' '}
                <strong>Last</strong> for next-round order; <strong>Adv</strong> / <strong>Dis</strong> make that row roll
                two d20s for initiative (keep high / low) and glow on the table. First/last-next-round tags clear when the
                round advances; Adv/Dis stay until you toggle them off.
              </p>
            </div>
          ))}
          {party && party.error && (
            <p className="text-amber-400 border border-amber-500/40 rounded-lg p-3">{party.error}</p>
          )}
        </details>

        <div className="space-y-4">
          {init && party && (
            <InitiativeTrackerPanel
              init={init}
              party={party}
              emit={emit}
              initiativeRemoteUrl={initiativeRemoteUrl}
            />
          )}
          <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 space-y-2">
            <h3 className="font-semibold text-[var(--accent)]">Initiative — extras</h3>
            <p className="text-xs text-[var(--muted)]">
              Main tracker above matches the TV. Use this for NPCs, locks, and clearing.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded bg-slate-700 px-2 py-1 text-sm" onClick={() => emit('initiative:sort')}>
                Sort
              </button>
              <button type="button" className="rounded bg-slate-700 px-2 py-1 text-sm" onClick={() => emit('initiative:delay')}>
                Delay
              </button>
              <button type="button" className="rounded bg-red-900/60 px-2 py-1 text-sm" onClick={() => emit('initiative:clear')}>
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded bg-black/30 border border-white/20 px-2 py-1 flex-1"
                placeholder="New combatant"
                value={newCombatant}
                onChange={(e) => setNewCombatant(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-sky-800 px-2 py-1 text-sm"
                onClick={() => {
                  if (!newCombatant.trim()) return;
                  emit('initiative:add', { label: newCombatant.trim(), mod: 0 });
                  setNewCombatant('');
                }}
              >
                Add NPC / extra
              </button>
              <button type="button" className="rounded bg-sky-800 px-2 py-1 text-sm" onClick={() => emit('initiative:roll', {})}>
                Roll (no re-sort)
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 space-y-2">
            <h3 className="font-semibold text-[var(--accent)]">Timed effects</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              <input className="rounded bg-black/30 border px-2 py-1 w-28" value={fxLabel} onChange={(e) => setFxLabel(e.target.value)} />
              <input
                type="number"
                className="rounded bg-black/30 border px-2 py-1 w-16"
                value={fxRounds}
                onChange={(e) => setFxRounds(Number(e.target.value))}
              />
              <input
                className="rounded bg-black/30 border px-2 py-1 w-24"
                placeholder="entity id"
                value={fxEntity}
                onChange={(e) => setFxEntity(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-purple-800 px-2 py-1"
                onClick={() => {
                  const id = fxEntity || party?.characters[0]?.id || 'manual';
                  emit('effects:add', { label: fxLabel, roundsRemaining: fxRounds, entityId: id });
                }}
              >
                Add effect
              </button>
              <button type="button" className="rounded bg-purple-900 px-2 py-1" onClick={() => emit('effects:tick')}>
                Tick rounds
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4 space-y-2">
            <h3 className="font-semibold text-[var(--accent)]">NPC templates</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              <input className="rounded bg-black/30 border px-2 py-1" value={npcName} onChange={(e) => setNpcName(e.target.value)} />
              <input
                type="number"
                className="rounded bg-black/30 border px-2 py-1 w-16"
                value={npcAc}
                onChange={(e) => setNpcAc(Number(e.target.value))}
              />
              <input
                type="number"
                className="rounded bg-black/30 border px-2 py-1 w-16"
                value={npcHp}
                onChange={(e) => setNpcHp(Number(e.target.value))}
              />
              <button
                type="button"
                className="rounded bg-stone-700 px-2 py-1"
                onClick={() =>
                  void apiPost(
                    `/api/sessions/${sessionId}/npc-templates`,
                    { name: npcName, defaultAc: npcAc, defaultMaxHp: npcHp },
                    dmToken,
                  )
                }
              >
                Save template
              </button>
            </div>
            <ul className="text-sm text-[var(--muted)] space-y-1">
              {s?.npcTemplates?.map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span>
                    {t.name} (AC {t.defaultAc}, HP {t.defaultMaxHp})
                  </span>
                  <button
                    type="button"
                    className="text-sky-400 hover:underline"
                    onClick={() => emit('npc:spawnFromTemplate', { templateId: t.id })}
                  >
                    Spawn
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <h3 className="font-semibold text-[var(--accent)] mb-2">Dice / log</h3>
            <ul className="max-h-48 overflow-y-auto text-sm space-y-1 font-mono">
              {s?.diceLog.map((e) => (
                <li key={e.at + e.message} className="text-[var(--muted)]">
                  <span className="text-[var(--text)]">{e.at.slice(11, 19)}</span> {e.message}
                  {e.dmOnly && ' (DM)'}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
