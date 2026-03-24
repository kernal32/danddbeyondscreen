import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, ApiHttpError } from '../api';
import { USER_EMAIL_KEY, USER_TOKEN_KEY } from '../auth-storage';

type ApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
};

export default function AccountPage() {
  const nav = useNavigate();
  const token = typeof window !== 'undefined' ? localStorage.getItem(USER_TOKEN_KEY) : null;
  const email = typeof window !== 'undefined' ? localStorage.getItem(USER_EMAIL_KEY) : null;

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [uploadMeta, setUploadMeta] = useState<{ characterCount: number; updatedAt: number } | null>(null);
  const [label, setLabel] = useState('');
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apiBase = useMemo(() => (typeof window !== 'undefined' ? window.location.origin : ''), []);

  useEffect(() => {
    if (!token) {
      nav('/login', { replace: true, state: { from: '/account' } });
      return;
    }
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const [k, u] = await Promise.all([
          apiGet<{ keys: ApiKeyRow[] }>('/api/me/api-keys', token),
          apiGet<{ upload: { characterCount: number; updatedAt: number } | null }>('/api/me/ddb-upload', token),
        ]);
        setKeys(k.keys);
        setUploadMeta(u.upload);
      } catch (e) {
        setErr(e instanceof ApiHttpError ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, nav]);

  const refreshLists = async () => {
    if (!token) return;
    const [k, u] = await Promise.all([
      apiGet<{ keys: ApiKeyRow[] }>('/api/me/api-keys', token),
      apiGet<{ upload: { characterCount: number; updatedAt: number } | null }>('/api/me/ddb-upload', token),
    ]);
    setKeys(k.keys);
    setUploadMeta(u.upload);
  };

  const createKey = () => {
    if (!token) return;
    setErr(null);
    setIssuedKey(null);
    void (async () => {
      try {
        const r = await apiPost<{ id: string; key: string; keyPrefix: string }>(
          '/api/me/api-keys',
          { label: label.trim() || undefined },
          token,
        );
        setIssuedKey(r.key);
        setLabel('');
        await refreshLists();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    })();
  };

  const revoke = (id: string) => {
    if (!token) return;
    setErr(null);
    void (async () => {
      try {
        await apiDelete(`/api/me/api-keys/${id}`, token);
        await refreshLists();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed');
      }
    })();
  };

  const logout = () => {
    localStorage.removeItem(USER_TOKEN_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    nav('/');
  };

  if (!token) return null;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto space-y-8">
      <header className="flex flex-wrap justify-between gap-4 items-center">
        <div>
          <Link to="/" className="text-sm text-[var(--link)] hover:text-[var(--link-hover)] hover:underline">
            ← Home
          </Link>
          <h1 className="text-2xl font-display font-bold text-[var(--accent)] mt-2">Account</h1>
          <p className="text-sm text-[var(--muted)] mt-1">{email}</p>
        </div>
        <button
          type="button"
          className="text-sm text-[var(--muted)] hover:text-[var(--text)] hover:underline"
          onClick={logout}
        >
          Sign out
        </button>
      </header>

      {loading ? <p className="text-[var(--muted)]">Loading…</p> : null}
      {err ? (
        <p className="text-amber-400 text-sm" role="alert">
          {err}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-lg text-[var(--accent)]">Tampermonkey API keys</h2>
        <p className="text-sm text-[var(--muted)]">
          Use <code className="text-[var(--text)]">Authorization: Bearer &lt;key&gt;</code> on{' '}
          <code className="text-[var(--text)]">POST /api/ingest/party</code>. Keys start with{' '}
          <code className="text-[var(--text)]">dnd_</code>. Set <code className="text-[var(--text)]">BACKEND_URL</code> in your
          userscript to:
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <code className="text-xs bg-[color-mix(in_srgb,var(--surface-elevated)_80%,transparent)] px-2 py-1 rounded break-all text-[var(--text)]">
            {apiBase}
          </code>
          <button
            type="button"
            className="rounded bg-[var(--btn-secondary-bg)] px-3 py-1 text-white text-sm hover:bg-[var(--btn-secondary-hover)]"
            onClick={() => void navigator.clipboard.writeText(apiBase)}
          >
            Copy
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Add <code className="text-[var(--text)]">// @connect</code> for your host in the userscript (see{' '}
          <code className="text-[var(--text)]">userscripts/ddb-party-ingest.user.js</code>).
        </p>

        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-[var(--muted)] mb-1">Label (optional)</label>
            <input
              className="rounded bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] border border-[var(--border-subtle)] px-3 py-2 text-sm w-48 text-[var(--text)]"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. laptop"
            />
          </div>
          <button
            type="button"
            className="rounded bg-[var(--btn-primary-bg)] px-4 py-2 text-white text-sm hover:bg-[var(--btn-primary-hover)]"
            onClick={createKey}
          >
            Generate API key
          </button>
        </div>

        {issuedKey && (
          <div className="rounded border border-[var(--warn)]/40 bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] p-3 space-y-2">
            <p className="text-xs text-[var(--callout-strong)] font-medium">Copy now — shown once</p>
            <pre className="text-xs font-mono text-[var(--text)] break-all whitespace-pre-wrap">{issuedKey}</pre>
          </div>
        )}

        <ul className="space-y-2">
          {keys.length === 0 ? <li className="text-sm text-[var(--muted)]">No keys yet.</li> : null}
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap justify-between gap-2 items-center text-sm border border-[var(--border-subtle)] rounded-lg px-3 py-2"
            >
              <span className="font-mono text-[var(--text)]">{k.keyPrefix}…</span>
              <span className="text-[var(--muted)]">
                {k.label ?? '—'} · created {new Date(k.createdAt).toLocaleString()}
                {k.lastUsedAt != null ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ''}
              </span>
              <button
                type="button"
                className="text-[var(--danger)] hover:underline text-sm"
                onClick={() => revoke(k.id)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 md:p-6 space-y-2">
        <h2 className="font-semibold text-lg text-[var(--accent)]">Latest upload</h2>
        {uploadMeta ? (
          <p className="text-sm text-[var(--text)]">
            <strong>{uploadMeta.characterCount}</strong> character(s) · updated{' '}
            {new Date(uploadMeta.updatedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted)]">No data ingested yet from Tampermonkey.</p>
        )}
        <p className="text-xs text-[var(--muted)]">
          Open a <strong className="text-[var(--text)]">DM session</strong> and use{' '}
          <strong className="text-[var(--text)]">Load upload into this table</strong> on the console (you must stay signed in here
          in the same browser).
        </p>
      </section>
    </div>
  );
}
