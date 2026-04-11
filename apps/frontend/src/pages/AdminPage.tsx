import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, ApiHttpError } from '../api';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';

type Overview = {
  activeUserCount: number;
  deactivatedUserCount: number;
  adminSlotCount: number;
};

type UserRow = {
  id: string;
  email: string;
  createdAt: number;
  deletedAt: number | null;
};

type UserListRes = {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
};

type UserDetail = {
  user: UserRow;
  apiKeyCount: number;
  ownedSessionsCount: number;
  billing: {
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    planTier: string | null;
    subscriptionStatus: string | null;
    currentPeriodEnd: number | null;
  } | null;
};

type IngestCharacterRow = {
  id: string;
  name: string;
  ddbCharacterId: number | null;
  source: 'ddb' | 'manual';
  maxHp: number;
  currentHp: number;
  tempHp: number;
  ac: number;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  inspired: boolean;
  initiativeBonus?: number;
  dexterityModifier?: number;
  spellSaveDC?: number;
  conditionsCount: number;
  conditionsPreview: string[];
  spellSlotsCount: number;
  /** Remaining/max per spell level, e.g. `L1 2/3 · L2 1/2` */
  spellSlotsSummary: string | null;
  classResourcesCount: number;
  hasAvatarUrl: boolean;
  avatarUrlChars: number;
  avatarUrlPrefix: string | null;
  ingestedAt: number | null;
};

type UserIngestInspect = {
  user: { id: string; email: string };
  meta: { characterCount: number; updatedAt: number };
  campaign: { id: number | null; name: string; link: string; characterIdsCount: number } | null;
  fetchedAt: string | null;
  upstreamDate: string | null;
  error: string | null;
  characters: IngestCharacterRow[];
  /** @deprecated Same as `characters` — kept for older responses */
  sampleCharacters?: IngestCharacterRow[];
};

export default function AdminPage() {
  const nav = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem(USER_TOKEN_KEY) : null;

  const [meChecked, setMeChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [list, setList] = useState<UserListRes | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [ingestInspect, setIngestInspect] = useState<UserIngestInspect | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestErr, setIngestErr] = useState<string | null>(null);

  const pageSize = 25;

  const loadOverviewAndList = useCallback(async () => {
    if (!token) return;
    setErr(null);
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(includeDeleted ? { includeDeleted: '1' } : {}),
    });
    const [ov, users] = await Promise.all([
      apiGet<Overview>('/api/admin/overview', token),
      apiGet<UserListRes>(`/api/admin/users?${qs}`, token),
    ]);
    setOverview(ov);
    setList(users);
  }, [token, page, q, includeDeleted]);

  useEffect(() => {
    if (!token) {
      nav('/login', { replace: true, state: { from: '/admin' } });
      return;
    }
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const me = await apiGet<{ isAdmin?: boolean }>('/api/me', token);
        setMeChecked(true);
        if (!me.isAdmin) {
          setAllowed(false);
          setErr('Your account is not in the server admin allowlist.');
          return;
        }
        setAllowed(true);
      } catch (e) {
        setMeChecked(true);
        setErr(e instanceof ApiHttpError ? e.message : 'Failed to load admin');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, nav]);

  useEffect(() => {
    if (!token || !allowed) return;
    void (async () => {
      setListLoading(true);
      setErr(null);
      try {
        await loadOverviewAndList();
      } catch (e) {
        setErr(e instanceof ApiHttpError ? e.message : 'Failed to refresh list');
      } finally {
        setListLoading(false);
      }
    })();
  }, [page, q, includeDeleted, token, allowed, loadOverviewAndList]);

  useEffect(() => {
    if (!token || !selectedId || !allowed) {
      setDetail(null);
      setIngestInspect(null);
      setIngestErr(null);
      return;
    }
    void (async () => {
      try {
        const d = await apiGet<UserDetail>(`/api/admin/users/${encodeURIComponent(selectedId)}`, token);
        setDetail(d);
      } catch (e) {
        setDetail(null);
        setErr(e instanceof ApiHttpError ? e.message : 'Failed to load user');
      }
    })();
  }, [token, selectedId, allowed]);

  const loadIngestInspect = useCallback(() => {
    if (!token || !detail) return;
    setIngestLoading(true);
    setIngestErr(null);
    void (async () => {
      try {
        const data = await apiGet<UserIngestInspect>(
          `/api/admin/users/${encodeURIComponent(detail.user.id)}/ingest`,
          token,
        );
        setIngestInspect(data);
      } catch (e) {
        setIngestInspect(null);
        setIngestErr(e instanceof ApiHttpError ? e.message : 'Failed to load ingest snapshot');
      } finally {
        setIngestLoading(false);
      }
    })();
  }, [token, detail]);

  const myEmail = useMemo(
    () => (typeof window !== 'undefined' ? localStorage.getItem(USER_EMAIL_KEY) : null),
    [],
  );

  const openDeactivate = () => {
    setActionErr(null);
    setConfirmEmail('');
    setConfirmOpen(true);
  };

  const submitDeactivate = () => {
    if (!token || !detail) return;
    setActionErr(null);
    void (async () => {
      try {
        await apiPost<{ ok: boolean }>(
          `/api/admin/users/${encodeURIComponent(detail.user.id)}/deactivate`,
          { confirmEmail: confirmEmail.trim() },
          token,
        );
        setConfirmOpen(false);
        setSelectedId(null);
        setDetail(null);
        await loadOverviewAndList();
      } catch (e) {
        setActionErr(e instanceof ApiHttpError ? e.message : 'Deactivate failed');
      }
    })();
  };

  if (!token) return null;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-wrap justify-between gap-4 items-center">
        <div>
          <Link to="/account" className="text-sm text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
            ← Account
          </Link>
          <h1 className="text-2xl font-display font-bold text-[var(--accent)] mt-2">Admin</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Operator tools · {myEmail}</p>
        </div>
        <Link
          to="/account"
          className="text-sm text-[var(--muted)] hover:text-[var(--text)] hover:underline"
        >
          Back to account
        </Link>
      </header>

      {loading && !meChecked ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {allowed && listLoading ? <p className="text-[var(--muted)] text-sm">Refreshing directory…</p> : null}
      {err ? (
        <p className="text-amber-400 text-sm" role="alert">
          {err}
        </p>
      ) : null}

      {allowed && overview ? (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Active accounts</p>
            <p className="text-2xl font-semibold text-[var(--text)]">{overview.activeUserCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Deactivated</p>
            <p className="text-2xl font-semibold text-[var(--text)]">{overview.deactivatedUserCount}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Admin allowlist slots</p>
            <p className="text-2xl font-semibold text-[var(--text)]">{overview.adminSlotCount}</p>
          </div>
        </section>
      ) : null}

      {allowed && list ? (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <h2 className="font-semibold text-lg text-[var(--accent)]">Users</h2>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => {
                  setIncludeDeleted(e.target.checked);
                  setPage(1);
                }}
              />
              Show deactivated
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] border border-[var(--border-subtle)] px-3 py-2 text-sm flex-1 min-w-[12rem] text-[var(--text)]"
              placeholder="Search email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[var(--muted)] border-b border-[var(--border-subtle)]">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.users.map((u) => (
                  <tr
                    key={u.id}
                    className={`border-b border-[var(--border-subtle)]/60 cursor-pointer hover:bg-[color-mix(in_srgb,var(--surface-elevated)_40%,transparent)] ${
                      selectedId === u.id ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]' : ''
                    }`}
                    onClick={() => setSelectedId(u.id)}
                  >
                    <td className="py-2 pr-4 font-mono text-[var(--text)] break-all">{u.email}</td>
                    <td className="py-2 pr-4 text-[var(--muted)]">{new Date(u.createdAt).toLocaleString()}</td>
                    <td className="py-2 text-[var(--muted)]">{u.deletedAt ? 'Deactivated' : 'Active'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-[var(--muted)]">
            <span>
              Page {list.page} · {list.total} total
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-[var(--link)] hover:underline disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="text-[var(--link)] hover:underline disabled:opacity-40"
                disabled={page * pageSize >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {allowed && detail ? (
        <section className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 md:p-6 space-y-4">
          <h2 className="font-semibold text-lg text-[var(--accent)]">User detail</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <dt className="text-[var(--muted)]">Email</dt>
            <dd className="font-mono text-[var(--text)] break-all">{detail.user.email}</dd>
            <dt className="text-[var(--muted)]">User id</dt>
            <dd className="font-mono text-xs text-[var(--text)] break-all">{detail.user.id}</dd>
            <dt className="text-[var(--muted)]">API keys</dt>
            <dd className="text-[var(--text)]">{detail.apiKeyCount}</dd>
            <dt className="text-[var(--muted)]">Owned table sessions</dt>
            <dd className="text-[var(--text)]">{detail.ownedSessionsCount}</dd>
          </dl>
          <div className="border border-[var(--border-subtle)] rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-medium text-[var(--accent)]">Billing (future)</h3>
            {detail.billing ? (
              <pre className="text-xs text-[var(--muted)] overflow-x-auto">
                {JSON.stringify(detail.billing, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                No billing row yet (free tier). Stripe fields will appear here after integration.
              </p>
            )}
          </div>
          {detail.user.deletedAt ? null : (
            <button
              type="button"
              className="rounded bg-[color-mix(in_srgb,var(--danger)_85%,black)] px-4 py-2 text-white text-sm hover:opacity-90"
              onClick={openDeactivate}
            >
              Deactivate account…
            </button>
          )}

          <div className="border border-[var(--border-subtle)] rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <h3 className="text-sm font-medium text-[var(--accent)]">Latest ingest snapshot</h3>
              <button
                type="button"
                className="rounded border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--link)] hover:underline disabled:opacity-50"
                onClick={loadIngestInspect}
                disabled={ingestLoading}
              >
                {ingestLoading ? 'Loading…' : 'Load ingest snapshot'}
              </button>
            </div>
            {ingestErr ? (
              <p className="text-amber-400 text-sm" role="alert">
                {ingestErr}
              </p>
            ) : null}
            {ingestInspect ? (
              <>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                  <dt>Updated</dt>
                  <dd>{new Date(ingestInspect.meta.updatedAt).toLocaleString()}</dd>
                  <dt>Stored characters</dt>
                  <dd>{ingestInspect.meta.characterCount}</dd>
                  <dt>Fetched at</dt>
                  <dd>{ingestInspect.fetchedAt ? new Date(ingestInspect.fetchedAt).toLocaleString() : '—'}</dd>
                  <dt>Campaign</dt>
                  <dd>{ingestInspect.campaign?.name || '—'}</dd>
                </dl>
                {ingestInspect.error ? (
                  <p className="text-amber-400 text-xs">Upstream error: {ingestInspect.error}</p>
                ) : null}
                <p className="text-[var(--muted)] text-[11px] leading-relaxed">
                  Full normalized stash per character. If <strong className="text-[var(--text)]">Avatar?</strong> is{' '}
                  <strong className="text-[var(--text)]">no</strong> but the table shows portraits on initiative, the
                  live session may still be using initiative snapshot URLs — player cards now merge that fallback when
                  party <code className="text-[var(--muted)]">avatarUrl</code> is empty.
                </p>
                <div className="overflow-x-auto max-h-[min(70vh,520px)] overflow-y-auto border border-[var(--border-subtle)]/60 rounded-lg">
                  <table className="w-full text-[11px] text-left min-w-[1100px]">
                    <thead className="sticky top-0 bg-[color-mix(in_srgb,var(--surface)_95%,black)] z-[1]">
                      <tr className="text-[var(--muted)] border-b border-[var(--border-subtle)]">
                        <th className="py-1.5 px-2">Name</th>
                        <th className="py-1.5 px-2">HP</th>
                        <th className="py-1.5 px-2">Tmp</th>
                        <th className="py-1.5 px-2">Max</th>
                        <th className="py-1.5 px-2">AC</th>
                        <th className="py-1.5 px-2">PP</th>
                        <th className="py-1.5 px-2">Inv</th>
                        <th className="py-1.5 px-2">Ins</th>
                        <th className="py-1.5 px-2">Init</th>
                        <th className="py-1.5 px-2">DEX</th>
                        <th className="py-1.5 px-2">DC</th>
                        <th className="py-1.5 px-2">#Cond</th>
                        <th className="py-1.5 px-2" title="Per level: slots left / pool max (same as player card)">
                          Spell slots
                        </th>
                        <th className="py-1.5 px-2">Res</th>
                        <th className="py-1.5 px-2">Insp</th>
                        <th className="py-1.5 px-2">Avatar?</th>
                        <th className="py-1.5 px-2">Src</th>
                        <th className="py-1.5 px-2">Conditions (preview)</th>
                        <th className="py-1.5 px-2">Portrait prefix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ingestInspect.characters ?? ingestInspect.sampleCharacters ?? []).map((c) => (
                        <tr key={c.id} className="border-b border-[var(--border-subtle)]/50 align-top">
                          <td className="py-1.5 px-2 text-[var(--text)]">{c.name}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.currentHp}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.tempHp}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.maxHp}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.ac}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.passivePerception}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.passiveInvestigation}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.passiveInsight}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">
                            {c.initiativeBonus ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">
                            {c.dexterityModifier ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.spellSaveDC ?? '—'}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.conditionsCount}</td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums max-w-[12rem]">
                            {c.spellSlotsSummary ?? (c.spellSlotsCount > 0 ? `${c.spellSlotsCount} lvl` : '—')}
                          </td>
                          <td className="py-1.5 px-2 text-[var(--text)] tabular-nums">{c.classResourcesCount}</td>
                          <td className="py-1.5 px-2 text-[var(--muted)]">{c.inspired ? 'yes' : '—'}</td>
                          <td className="py-1.5 px-2 text-[var(--muted)]">{c.hasAvatarUrl ? 'yes' : 'no'}</td>
                          <td className="py-1.5 px-2 text-[var(--muted)]">{c.source}</td>
                          <td className="py-1.5 px-2 text-[var(--muted)] max-w-[14rem]">
                            {c.conditionsPreview?.length ? c.conditionsPreview.join(', ') : '—'}
                          </td>
                          <td className="py-1.5 px-2 text-[var(--muted)] break-all max-w-[18rem] font-mono">
                            {c.avatarUrlPrefix ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Click “Load ingest snapshot” to inspect one recent uploaded payload summary for this user.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {confirmOpen && detail ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-deactivate-title"
        >
          <div className="max-w-md w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 space-y-4 shadow-xl">
            <h2 id="admin-deactivate-title" className="text-lg font-semibold text-[var(--accent)]">
              Deactivate account
            </h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              This signs the user out permanently for that email: credentials stop working and the address can be
              registered again. Type the account email to confirm.
            </p>
            <input
              className="w-full rounded bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text)]"
              placeholder={detail.user.email}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              autoComplete="off"
            />
            {actionErr ? (
              <p className="text-amber-400 text-sm" role="alert">
                {actionErr}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="rounded px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-[var(--danger)] px-4 py-2 text-white text-sm hover:opacity-90"
                onClick={submitDeactivate}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
