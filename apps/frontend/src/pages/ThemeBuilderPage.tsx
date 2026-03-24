import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { TableTheme, UserThemePreferences } from '@ddb/shared-types';
import { TABLE_THEME_IDS } from '@ddb/shared-types';
import { normalizeHexColor } from '@ddb/shared-types';
import { apiGet, apiPut, ApiHttpError } from '../api';
import { USER_TOKEN_KEY } from '../auth-storage';
import { applySessionVisualTheme, THEME_LABELS } from '../theme/tableTheme';
import { mapPaletteToTheme, validateThemeContrast } from '../theme/mapPaletteToTheme';

const SETTINGS_DEV_MODE_LS = 'ddb_settings_dev_mode';

const DEFAULT_SLOTS = ['#0f1419', '#1a2332', '#38bdf8', '#94a3b8', '#f1f5f9', '#7dd3fc'];

function readDevMode(): boolean {
  try {
    return localStorage.getItem(SETTINGS_DEV_MODE_LS) === '1';
  } catch {
    return false;
  }
}

export default function ThemeBuilderPage() {
  const [devOk] = useState(readDevMode);
  const [name, setName] = useState('My palette');
  const [baseTheme, setBaseTheme] = useState<TableTheme>('minimal');
  const [slots, setSlots] = useState<string[]>(DEFAULT_SLOTS);
  const [makeDefault, setMakeDefault] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const palette = useMemo(() => {
    const out: string[] = [];
    for (const s of slots) {
      const n = normalizeHexColor(s);
      if (n) out.push(n);
    }
    return out;
  }, [slots]);

  useEffect(() => {
    applySessionVisualTheme(baseTheme, palette);
  }, [baseTheme, palette]);

  const previewTheme = useMemo(() => mapPaletteToTheme(palette), [palette]);
  const contrastIssues = useMemo(() => validateThemeContrast(previewTheme), [previewTheme]);

  const saveToAccount = () => {
    const tok = localStorage.getItem(USER_TOKEN_KEY);
    setMsg(null);
    if (!tok) {
      setMsg({ text: 'Sign in (Settings → account) to save themes.', ok: false });
      return;
    }
    if (palette.length < 1) {
      setMsg({ text: 'Add at least one valid hex colour.', ok: false });
      return;
    }
    const id = crypto.randomUUID();
    void (async () => {
      try {
        let cur: UserThemePreferences = { savedCustomThemes: [], preferredDefault: null };
        try {
          const r = await apiGet<{ preferences: { themePreferences?: UserThemePreferences } }>('/api/me', tok);
          if (r.preferences.themePreferences) cur = r.preferences.themePreferences;
        } catch {
          /* first save */
        }
        const label = name.trim() || 'Untitled';
        const next: UserThemePreferences = {
          savedCustomThemes: [
            ...cur.savedCustomThemes,
            { id, name: label, palette: [...palette], baseTheme },
          ],
          preferredDefault: makeDefault ? { kind: 'custom', id } : cur.preferredDefault,
        };
        await apiPut('/api/me/preferences', { themePreferences: next }, tok);
        setMsg({ text: 'Theme saved to your account. Pick it from the Master Console.', ok: true });
      } catch (e) {
        setMsg({
          text: e instanceof ApiHttpError ? e.message : 'Save failed',
          ok: false,
        });
      }
    })();
  };

  if (!devOk) return <Navigate to="/dm/settings" replace />;

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/dm/settings"
          className="text-sm text-sky-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
        >
          ← Settings
        </Link>
        <h1 className="text-2xl font-display font-bold text-[var(--accent)]">Create new theme</h1>
      </header>

      <p className="text-sm text-[var(--muted)]">
        Enter a name, pick a base layout style, and tune hex colours. Preview updates instantly. Semantic colours (danger /
        ok / warn) stay red, green, and amber for readability. Saved themes appear on the Master Console for this table
        session.
      </p>

      <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4">
        <label className="block text-sm text-[var(--text)]">
          Theme name
          <input
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-[var(--text)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>

        <label className="block text-sm text-[var(--text)]">
          Base layout / frame style
          <select
            className="mt-1 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-[var(--text)]"
            value={baseTheme}
            onChange={(e) => setBaseTheme(e.target.value as TableTheme)}
          >
            {TABLE_THEME_IDS.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--accent)]">Palette</h2>
        <p className="text-xs text-[var(--muted)]">
          1–12 colours. Darkest / lightest drive background and text; saturated mid-tones become accent.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((col, i) => (
            <label key={i} className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input
                type="color"
                aria-label={`Palette colour ${i + 1}`}
                value={normalizeHexColor(col) ?? '#000000'}
                onChange={(e) => {
                  const next = [...slots];
                  next[i] = e.target.value;
                  setSlots(next);
                }}
                className="h-9 w-14 cursor-pointer rounded border border-white/20 bg-transparent"
              />
              <input
                className="flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 font-mono text-xs text-[var(--text)]"
                value={col}
                onChange={(e) => {
                  const next = [...slots];
                  next[i] = e.target.value;
                  setSlots(next);
                }}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
            onClick={() => setSlots((s) => [...s, '#888888'])}
            disabled={slots.length >= 12}
          >
            Add colour
          </button>
          <button
            type="button"
            className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--muted)]"
            onClick={() => setSlots((s) => (s.length > 1 ? s.slice(0, -1) : s))}
            disabled={slots.length <= 1}
          >
            Remove last
          </button>
          <button type="button" className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--muted)]" onClick={() => setSlots([...DEFAULT_SLOTS])}>
            Reset sample palette
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-[var(--accent)]">Contrast (WCAG-style)</h2>
        {contrastIssues.length === 0 ? (
          <p className="text-xs text-emerald-400/90">Key text/background pairs meet the checked thresholds (or are close).</p>
        ) : (
          <ul className="list-disc pl-5 text-xs text-amber-200/90 space-y-1">
            {contrastIssues.map((c) => (
              <li key={c.pair}>
                {c.pair}: ratio {c.ratio} (want ≥ {c.minimum})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm text-[var(--text)] select-none cursor-pointer">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="rounded border-white/30" />
          Use as default for new tables (when signed in)
        </label>
        <button
          type="button"
          className="rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          onClick={saveToAccount}
        >
          Save to account
        </button>
      </div>

      {msg ? (
        <p className={`text-sm ${msg.ok ? 'text-sky-300' : 'text-amber-300'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      ) : null}

      <div
        className="rounded-xl border border-[var(--border-strong)] p-4"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
      >
        <p className="text-xs text-[var(--muted)]">Sample panel</p>
        <p className="mt-2 font-display text-lg text-[var(--accent)]">Preview heading</p>
        <p className="mt-1 text-sm">
          Body copy uses <span className="text-[var(--danger)]">danger</span>, <span className="text-[var(--ok)]">ok</span>, and{' '}
          <span className="text-[var(--warn)]">warn</span> semantics.
        </p>
      </div>
    </div>
  );
}
