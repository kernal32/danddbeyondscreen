import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TableLayout, WidgetInstance } from '@ddb/shared-types/layout';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import type {
  CombinedBlockTextAlign,
  CombinedBlockVerticalAlign,
  CombinedCardComponentKey,
  CombinedCardComponentLayout,
  CombinedCardLayoutConfig,
  CombinedDecorSvgId,
  CombinedSvgColorMode,
} from '@ddb/shared-types/widget-config';
import {
  clampCombinedBlockScalePercent,
  clampCombinedSectionGapPx,
  COMBINED_BLOCK_VERTICAL_ALIGNS,
  COMBINED_CARD_PALETTE_KEYS,
  COMBINED_BLOCK_SCALE_PERCENT_MAX,
  COMBINED_BLOCK_SCALE_PERCENT_MIN,
  COMBINED_DECOR_SVG_IDS,
  COMBINED_SVG_COLOR_MODES,
  defaultCombinedCardLayoutConfig,
  getCombinedCardLayoutConfig,
  getPartyWidgetView,
  isCombinedBlockTextAlign,
  isCombinedBlockVerticalAlign,
  isCombinedCardComponentKey,
  isCombinedDecorSvgId,
  isCombinedSvgColorMode,
  normalizeCombinedDecorColorCustom,
} from '@ddb/shared-types/widget-config';
import { apiGet, apiPatch, apiPut } from '../api';
import { useSessionSocket } from '../hooks/useSessionSocket';
import { USER_TOKEN_KEY } from '../auth-storage';
import { buildInitiativeTieNote } from '../util/initiativeTieNote';
import TvPartyCombinedColumn from '../widgets/TvPartyCombinedColumn';

const PRESET_LS_KEY = 'ddb_combined_initiative_presets_v1';

const DECOR_SVG_LABELS: Record<CombinedDecorSvgId, string> = {
  heart: 'Heart (HP)',
  shield: 'Shield (AC)',
  spellStar: 'Spell save (pentagon)',
  eye: 'Eye (passive perception)',
  search: 'Search (investigation)',
  insight: 'Insight',
  sparkles: 'Sparkles (spell slots)',
  conditions: 'Conditions scroll',
};

const SVG_COLOR_LABELS: Record<CombinedSvgColorMode, string> = {
  theme: 'Theme (AC tint)',
  accent: 'Accent',
  text: 'Text',
  muted: 'Muted',
  spellBar: 'Spell bar',
  ok: 'OK / HP green',
  custom: 'Custom hex',
};

type Preset = {
  id: string;
  name: string;
  layout: ReturnType<typeof defaultCombinedCardLayoutConfig>;
};

function normalizePreset(raw: unknown): Preset | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? '').trim();
  const name = String(o.name ?? '').trim();
  const layoutRaw = o.layout;
  if (!id || !name || !layoutRaw || typeof layoutRaw !== 'object') return null;
  const d = defaultCombinedCardLayoutConfig();
  const l = layoutRaw as Record<string, unknown>;
  const cols = Math.max(1, Math.min(24, Math.floor(Number(l.cols) || d.cols)));
  const rows = Math.max(1, Math.min(48, Math.floor(Number(l.rows) || d.rows)));
  const compsRaw = Array.isArray(l.components) ? l.components : d.components;
  const components = compsRaw
    .map((c, ix) => {
      if (!c || typeof c !== 'object') return null;
      const x = c as Record<string, unknown>;
      const key = String(x.key ?? '');
      if (!isCombinedCardComponentKey(key)) {
        return null;
      }
      const w = Math.max(1, Math.min(cols, Math.floor(Number(x.w) || 1)));
      const h = Math.max(1, Math.min(rows, Math.floor(Number(x.h) || 1)));
      const x0 = Math.max(0, Math.min(cols - w, Math.floor(Number(x.x) || 0)));
      const y0 = Math.max(0, Math.min(rows - h, Math.floor(Number(x.y) || 0)));
      const bs = Number(x.blockScalePercent);
      const keyTyped = key as CombinedCardComponentKey;
      const decorExtra =
        keyTyped === 'decorSvg'
          ? {
              decorSvgId: isCombinedDecorSvgId(String(x.decorSvgId ?? 'heart'))
                ? (String(x.decorSvgId) as CombinedDecorSvgId)
                : 'heart',
              decorColorMode: isCombinedSvgColorMode(String(x.decorColorMode ?? 'theme'))
                ? (String(x.decorColorMode) as CombinedSvgColorMode)
                : 'theme',
              ...(normalizeCombinedDecorColorCustom(x.decorColorCustom) &&
              String(x.decorColorMode ?? '') === 'custom'
                ? { decorColorCustom: normalizeCombinedDecorColorCustom(x.decorColorCustom)! }
                : {}),
              ...(x.decorSendToBack === true ? { decorSendToBack: true as const } : {}),
            }
          : {};
      return {
        id: String(x.id || `${key}-${ix}`),
        key: keyTyped,
        x: x0,
        y: y0,
        w,
        h,
        ...(x.visible === false ? { visible: false } : {}),
        ...(x.borderless === true ? { borderless: true } : {}),
        ...(x.dataOnly === true ? { dataOnly: true } : {}),
        ...(Number.isFinite(bs) ? { blockScalePercent: clampCombinedBlockScalePercent(bs) } : {}),
        ...(isCombinedBlockTextAlign(String(x.blockTextAlign ?? ''))
          ? { blockTextAlign: String(x.blockTextAlign) as CombinedBlockTextAlign }
          : {}),
        ...(isCombinedBlockVerticalAlign(String(x.blockVerticalAlign ?? ''))
          ? { blockVerticalAlign: String(x.blockVerticalAlign) as CombinedBlockVerticalAlign }
          : {}),
        ...decorExtra,
      };
    })
    .filter((x): x is ReturnType<typeof defaultCombinedCardLayoutConfig>['components'][number] => !!x);

  return {
    id: id.slice(0, 96),
    name: name.slice(0, 120),
    layout: {
      cols,
      rows,
      components: components.length ? components : d.components,
      ...(Number.isFinite(Number(l.textScalePercent))
        ? { textScalePercent: Math.max(60, Math.min(180, Math.floor(Number(l.textScalePercent)))) }
        : {}),
      ...(Number.isFinite(Number(l.iconScalePercent))
        ? { iconScalePercent: Math.max(60, Math.min(180, Math.floor(Number(l.iconScalePercent)))) }
        : {}),
      ...(Number.isFinite(Number(l.sectionGapPx))
        ? { sectionGapPx: clampCombinedSectionGapPx(Number(l.sectionGapPx)) }
        : {}),
    },
  };
}

function normalizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => normalizePreset(x)).filter((x): x is Preset => !!x);
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizePresets(parsed);
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  try {
    localStorage.setItem(PRESET_LS_KEY, JSON.stringify(normalizePresets(presets)));
  } catch {
    // ignore
  }
}

function ensurePartyGridLayoutWidget(layout: TableLayout): WidgetInstance | null {
  const found = layout.widgets.find((w) => {
    if (w.type !== 'party') return false;
    const v = (w.config as { view?: string } | undefined)?.view;
    return v === 'combined' || v === 'customFull';
  });
  return found ?? null;
}

type PageBoundaryState = {
  hasError: boolean;
  message: string;
};

class InitiativeCustomizerErrorBoundary extends Component<{ children: ReactNode }, PageBoundaryState> {
  state: PageBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): PageBoundaryState {
    const message = error instanceof Error ? error.message : 'Unknown rendering error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Initiative customizer crashed', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
          <header className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-[var(--accent)]">Initiative Tracker Customizer</h1>
          </header>
          <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <p className="text-sm text-amber-100">This page hit a runtime error instead of loading normally.</p>
            <p className="mt-2 break-all font-mono text-xs text-amber-200">{this.state.message}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Check browser DevTools Console for <code>Initiative customizer crashed</code> details.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/dm/settings" className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-600">
                Back to Settings
              </Link>
              <Link to="/master" className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--text)] hover:bg-white/5">
                Open Master Console
              </Link>
            </div>
          </section>
        </div>
      );
    }
    return this.props.children;
  }
}

function InitiativeCustomizerPageInner() {
  const nav = useNavigate();
  const sessionId = sessionStorage.getItem('ddb_sessionId');
  const dmToken = sessionStorage.getItem('ddb_dmToken');
  const { state, emit } = useSessionSocket(sessionId, dmToken, { uiMode: 'dm' });
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [presetName, setPresetName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [draftLayout, setDraftLayout] = useState<CombinedCardLayoutConfig>(defaultCombinedCardLayoutConfig());
  const [autoApply, setAutoApply] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addPaletteKey, setAddPaletteKey] = useState<CombinedCardComponentKey>(COMBINED_CARD_PALETTE_KEYS[0]);
  const userToken = typeof window !== 'undefined' ? localStorage.getItem(USER_TOKEN_KEY) : null;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    kind: 'move' | 'resize';
    resizeCorner?: 'se' | 'sw';
    id: string;
    startX: number;
    startY: number;
    orig: CombinedCardComponentLayout;
  } | null>(null);

  const partyWidget = useMemo(() => {
    if (!state?.tableLayout) return null;
    return ensurePartyGridLayoutWidget(state.tableLayout);
  }, [state?.tableLayout]);

  const layoutCfg = useMemo(() => {
    if (!partyWidget) return defaultCombinedCardLayoutConfig();
    return getCombinedCardLayoutConfig(partyWidget);
  }, [partyWidget]);

  useEffect(() => {
    setDraftLayout(layoutCfg);
  }, [layoutCfg]);

  const persistPresets = async (next: Preset[]) => {
    const normalized = normalizePresets(next);
    setPresets(normalized);
    savePresets(normalized);
    if (userToken) {
      try {
        await apiPut('/api/me/combined-layout-presets', { presets: normalized }, userToken);
      } catch {
        // keep local copy even if account save fails
      }
    }
  };

  useEffect(() => {
    if (!userToken) return;
    void (async () => {
      try {
        const r = await apiGet<{ presets?: Preset[] }>('/api/me/combined-layout-presets', userToken);
        if (Array.isArray(r.presets)) {
          const normalized = normalizePresets(r.presets);
          setPresets(normalized);
          savePresets(normalized);
        }
      } catch {
        // local fallback remains
      }
    })();
  }, [userToken]);

  const applyConfig = async (next: ReturnType<typeof defaultCombinedCardLayoutConfig>) => {
    if (!partyWidget || !state || !sessionId || !dmToken) return;
    const curView = getPartyWidgetView(partyWidget);
    const nextView = curView === 'customFull' || curView === 'combined' ? curView : 'combined';
    const nextLayout: TableLayout = {
      ...state.tableLayout,
      widgets: state.tableLayout.widgets.map((w) => {
        if (w.id !== partyWidget.id) return w;
        const prevCfg = w.config && typeof w.config === 'object' ? (w.config as Record<string, unknown>) : {};
        return {
          ...w,
          config: {
            ...prevCfg,
            view: nextView,
            combinedLayout: next,
          },
        };
      }),
    };
    await apiPatch(`/api/sessions/${sessionId}`, { tableLayout: nextLayout }, dmToken);
    emit('session:setTableLayout', { tableLayout: nextLayout });
    setMsg('Applied to current session.');
  };

  const updateComponent = useCallback((id: string, patch: Partial<CombinedCardComponentLayout>) => {
    setDraftLayout((cur) => ({
      ...cur,
      components: cur.components.map((c) => {
        if (c.id !== id) return c;
        const nextW = Math.max(1, Math.min(cur.cols, Number(patch.w ?? c.w)));
        const nextH = Math.max(1, Math.min(cur.rows, Number(patch.h ?? c.h)));
        const nextX = Math.max(0, Math.min(cur.cols - nextW, Number(patch.x ?? c.x)));
        const nextY = Math.max(0, Math.min(cur.rows - nextH, Number(patch.y ?? c.y)));
        const next: CombinedCardComponentLayout = { ...c, w: nextW, h: nextH, x: nextX, y: nextY };

        if ('visible' in patch) {
          if (patch.visible === false) next.visible = false;
          else delete next.visible;
        }
        if ('blockScalePercent' in patch && patch.blockScalePercent !== undefined) {
          const cl = clampCombinedBlockScalePercent(Number(patch.blockScalePercent));
          if (cl === 100) delete next.blockScalePercent;
          else next.blockScalePercent = cl;
        }
        if ('blockTextAlign' in patch) {
          const ba = patch.blockTextAlign;
          if (ba != null && isCombinedBlockTextAlign(ba)) next.blockTextAlign = ba;
          else delete next.blockTextAlign;
        }
        if ('blockVerticalAlign' in patch) {
          const va = patch.blockVerticalAlign;
          if (va != null && isCombinedBlockVerticalAlign(va)) next.blockVerticalAlign = va;
          else delete next.blockVerticalAlign;
        }
        if ('borderless' in patch) {
          if (patch.borderless === true) next.borderless = true;
          else delete next.borderless;
        }
        if ('dataOnly' in patch) {
          if (patch.dataOnly === true) next.dataOnly = true;
          else delete next.dataOnly;
        }
        if ('decorSvgId' in patch && patch.decorSvgId !== undefined && isCombinedDecorSvgId(patch.decorSvgId)) {
          next.decorSvgId = patch.decorSvgId;
        }
        if ('decorColorMode' in patch && patch.decorColorMode !== undefined && isCombinedSvgColorMode(patch.decorColorMode)) {
          next.decorColorMode = patch.decorColorMode;
          if (patch.decorColorMode !== 'custom') delete next.decorColorCustom;
        }
        if ('decorColorCustom' in patch) {
          const col = normalizeCombinedDecorColorCustom(patch.decorColorCustom);
          if (col && next.decorColorMode === 'custom') next.decorColorCustom = col;
          else delete next.decorColorCustom;
        }
        if ('decorSendToBack' in patch) {
          if (patch.decorSendToBack === true) next.decorSendToBack = true;
          else delete next.decorSendToBack;
        }
        return next;
      }),
    }));
  }, []);

  const removeComponent = useCallback((id: string) => {
    setDraftLayout((cur) => {
      if (cur.components.length <= 1) return cur;
      return { ...cur, components: cur.components.filter((c) => c.id !== id) };
    });
    setSelectedId((sid) => (sid === id ? null : sid));
  }, []);

  const applyDraft = useCallback(async () => {
    await applyConfig(draftLayout);
  }, [draftLayout]);

  const startDrag = (kind: 'move' | 'resize', c: CombinedCardComponentLayout, e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSelectedId(c.id);
    dragRef.current = {
      kind,
      id: c.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...c },
    };
  };

  const startResize = (
    corner: 'se' | 'sw',
    c: CombinedCardComponentLayout,
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(c.id);
    dragRef.current = {
      kind: 'resize',
      resizeCorner: corner,
      id: c.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...c },
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = dragRef.current;
      const canvas = canvasRef.current;
      if (!session || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const colStride = rect.width / Math.max(1, draftLayout.cols);
      const rowStride = rect.height / Math.max(1, draftLayout.rows);
      const dx = Math.round((e.clientX - session.startX) / Math.max(1, colStride));
      const dy = Math.round((e.clientY - session.startY) / Math.max(1, rowStride));
      if (session.kind === 'move') {
        updateComponent(session.id, { x: session.orig.x + dx, y: session.orig.y + dy });
      } else {
        const corner = session.resizeCorner ?? 'se';
        if (corner === 'se') {
          updateComponent(session.id, { w: session.orig.w + dx, h: session.orig.h + dy });
        } else {
          updateComponent(session.id, {
            w: session.orig.w - dx,
            x: session.orig.x + dx,
            h: session.orig.h + dy,
          });
        }
      }
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (autoApply) void applyDraft();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draftLayout.cols, draftLayout.rows, updateComponent, autoApply, applyDraft]);

  const sample = useMemo(() => {
    const first = state?.party?.characters?.[0];
    if (!first) return null;
    const initEntry = Object.values(state?.initiative?.entries ?? {}).find((x) => x.entityId === first.id);
    return { first, initEntry };
  }, [state?.party?.characters, state?.initiative]);

  const combinedCardDisplayOptions = useMemo(
    () => mergePartyCardDisplayOptions(state?.partyCardDisplay),
    [state?.partyCardDisplay],
  );

  /** Larger blocks painted first; smaller on top. Selected block is always painted last (easiest to grab). */
  const canvasStackOrder = useMemo(() => {
    const arr = [...draftLayout.components];
    arr.sort((a, b) => {
      const backA = a.key === 'decorSvg' && a.decorSendToBack === true ? 0 : 1;
      const backB = b.key === 'decorSvg' && b.decorSendToBack === true ? 0 : 1;
      if (backA !== backB) return backA - backB;
      const da = a.w * a.h;
      const db = b.w * b.h;
      if (da !== db) return db - da;
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      return a.id.localeCompare(b.id);
    });
    if (selectedId) {
      const i = arr.findIndex((c) => c.id === selectedId);
      if (i >= 0) {
        const [picked] = arr.splice(i, 1);
        arr.push(picked);
      }
    }
    return arr;
  }, [draftLayout.components, selectedId]);

  const blockListOrder = useMemo(
    () =>
      [...draftLayout.components].sort((a, b) =>
        a.y !== b.y ? a.y - b.y : a.x !== b.x ? a.x - b.x : a.id.localeCompare(b.id),
      ),
    [draftLayout.components],
  );

  if (!sessionId || !dmToken) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold text-[var(--accent)]">Initiative Tracker Customizer</h1>
        </header>
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <p className="text-sm text-amber-100">
            No active DM session found in this browser tab. Start or resume a table session first, then open the customizer
            from Settings.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/" className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-600">
              Go to Home
            </Link>
            <Link to="/master" className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--text)] hover:bg-white/5">
              Open Master Console
            </Link>
          </div>
        </section>
      </div>
    );
  }
  if (!state) return <div className="p-6 text-sm text-[var(--muted)]">Loading session…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dm/settings" className="text-sm text-sky-400 hover:underline">
            ← Back to Settings
          </Link>
          <div>
            <h1 className="text-2xl font-display font-bold text-[var(--accent)]">Initiative Tracker Customizer</h1>
            <p className="mt-1 max-w-2xl text-xs text-[var(--muted)]">
              Per-character grid layout for TV <strong>Combined init</strong> columns and <strong>Custom full cards</strong>{' '}
              (same <code>combinedLayout</code> template for both).
            </p>
          </div>
        </div>
        <button
          type="button"
          className="rounded border border-white/20 px-3 py-2 text-sm text-[var(--text)]"
          onClick={() => nav('/master')}
        >
          Master Console
        </button>
      </header>

      {!partyWidget ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
          No <code>party</code> widget in <strong>Combined init columns</strong> or <strong>Custom full cards</strong> mode
          found in the current table layout. Set the Party widget to one of those in the table layout editor first.
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm text-[var(--muted)]">
                Grid columns
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={draftLayout.cols}
                  onChange={(e) => setDraftLayout((d) => ({ ...d, cols: Math.max(1, Number(e.target.value) || 1) }))}
                  className="mt-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Grid rows
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={draftLayout.rows}
                  onChange={(e) => setDraftLayout((d) => ({ ...d, rows: Math.max(1, Number(e.target.value) || 1) }))}
                  className="mt-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Text scale (%)
                <input
                  type="number"
                  min={60}
                  max={180}
                  value={draftLayout.textScalePercent ?? 100}
                  onChange={(e) =>
                    setDraftLayout((d) => ({
                      ...d,
                      textScalePercent: Math.max(60, Math.min(180, Number(e.target.value) || 100)),
                    }))
                  }
                  className="mt-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-[var(--text)]"
                />
              </label>
              <label className="text-sm text-[var(--muted)]">
                Section gap (px)
                <input
                  type="number"
                  min={0}
                  max={32}
                  placeholder="auto"
                  value={draftLayout.sectionGapPx ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    setDraftLayout((d) => {
                      if (raw === '') {
                        const next = { ...d };
                        delete next.sectionGapPx;
                        return next;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return d;
                      return { ...d, sectionGapPx: clampCombinedSectionGapPx(n) };
                    });
                  }}
                  className="mt-1 w-full rounded border border-white/20 bg-black/30 px-2 py-1 text-[var(--text)]"
                />
                <span className="mt-0.5 block text-[10px] leading-tight text-[var(--muted)]">
                  Empty = scales with text scale (~6px at 100%).
                </span>
              </label>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              HP bar, spell slot bars/pips, and class resource bars/pips follow Party / player cards in DM Settings. Each
              section below can set its own scale (avatar + name, HP, slots, etc.).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
                Auto-apply on drag end
              </label>
              <button
                type="button"
                className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white"
                onClick={() => void applyDraft()}
              >
                Apply now
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-lg font-semibold text-[var(--accent)]">Add optional sections</h2>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Append a block below the current layout. Resize and position in the editor; use <strong>Apply now</strong> if
              auto-apply is off.
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                className="rounded border border-white/20 bg-black/30 px-2 py-1.5 text-sm text-[var(--text)]"
                value={addPaletteKey}
                onChange={(e) => setAddPaletteKey(e.target.value as CombinedCardComponentKey)}
              >
                {COMBINED_CARD_PALETTE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1.5 text-sm text-[var(--text)] hover:bg-white/5"
                onClick={() => {
                  setDraftLayout((d) => {
                    const maxY = d.components.reduce((m, c) => Math.max(m, c.y + c.h), 0);
                    const y = maxY;
                    const nextRows = Math.min(48, Math.max(d.rows, y + 2));
                    const newC: CombinedCardComponentLayout = {
                      id: `cc-${crypto.randomUUID().slice(0, 8)}`,
                      key: addPaletteKey,
                      x: 0,
                      y,
                      w: Math.min(4, d.cols),
                      h: addPaletteKey === 'decorSvg' ? 2 : 1,
                      ...(addPaletteKey === 'decorSvg'
                        ? { decorSvgId: 'heart', decorColorMode: 'theme' as const }
                        : {}),
                    };
                    return { ...d, rows: nextRows, components: [...d.components, newC] };
                  });
                }}
              >
                Add block
              </button>
            </div>
            <h2 className="mb-3 text-lg font-semibold text-[var(--accent)]">Visual editor (drag + resize snap grid)</h2>
            <p className="mb-2 text-xs text-[var(--muted)]">
              Smaller blocks stack above larger ones; the selected block is always on top. Use “Focus in editor” in the list
              below to select something covered by another block. Click empty grid space to clear selection.
            </p>
            <div
              ref={canvasRef}
              className="relative mb-4 h-[480px] w-full overflow-hidden rounded-xl border border-white/15 bg-black/30"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)',
                backgroundSize: `${100 / Math.max(1, draftLayout.cols)}% ${100 / Math.max(1, draftLayout.rows)}%`,
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) setSelectedId(null);
              }}
            >
              {canvasStackOrder.map((c, stackIx) => (
                <div
                  key={c.id}
                  className={`absolute overflow-hidden rounded border px-2 py-1 text-xs ${
                    selectedId === c.id
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                      : 'border-violet-400/70 bg-violet-500/15 text-violet-100'
                  }`}
                  style={{
                    left: `${(c.x / Math.max(1, draftLayout.cols)) * 100}%`,
                    top: `${(c.y / Math.max(1, draftLayout.rows)) * 100}%`,
                    width: `${(c.w / Math.max(1, draftLayout.cols)) * 100}%`,
                    height: `${(c.h / Math.max(1, draftLayout.rows)) * 100}%`,
                    zIndex: stackIx + 1,
                  }}
                  onPointerDown={(e) => startDrag('move', c, e)}
                >
                  <div className="pointer-events-none truncate font-semibold">
                    {c.key === 'decorSvg' ? `decorSvg · ${c.decorSvgId ?? 'heart'}` : c.key}
                  </div>
                  <div
                    className="absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize rounded-tr border-r border-t border-white/60 bg-white/30"
                    onPointerDown={(e) => startResize('sw', c, e)}
                  />
                  <div
                    className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-tl border-l border-t border-white/60 bg-white/30"
                    onPointerDown={(e) => startResize('se', c, e)}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {blockListOrder.map((c) => (
                <div
                  key={c.id}
                  className={`rounded border bg-black/20 p-2 text-xs ${
                    selectedId === c.id ? 'border-sky-500/70 ring-1 ring-sky-500/40' : 'border-white/10'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <code className="text-[11px] text-[var(--text)]">{c.key}</code>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-sky-500/50 bg-sky-950/40 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-900/50"
                        onClick={() => setSelectedId(c.id)}
                      >
                        Focus in editor
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-500/40 px-2 py-0.5 text-[11px] text-rose-200 hover:bg-rose-950/50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={draftLayout.components.length <= 1}
                        title={draftLayout.components.length <= 1 ? 'Keep at least one block' : 'Remove this block'}
                        onClick={() => removeComponent(c.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-8">
                    <label className="text-[var(--muted)]">
                      x
                      <input
                        type="number"
                        value={c.x}
                        min={0}
                        onChange={(e) => updateComponent(c.id, { x: Math.max(0, Number(e.target.value) || 0) })}
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                      />
                    </label>
                    <label className="text-[var(--muted)]">
                      y
                      <input
                        type="number"
                        value={c.y}
                        min={0}
                        onChange={(e) => updateComponent(c.id, { y: Math.max(0, Number(e.target.value) || 0) })}
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                      />
                    </label>
                    <label className="text-[var(--muted)]">
                      w
                      <input
                        type="number"
                        value={c.w}
                        min={1}
                        onChange={(e) => updateComponent(c.id, { w: Math.max(1, Number(e.target.value) || 1) })}
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                      />
                    </label>
                    <label className="text-[var(--muted)]">
                      h
                      <input
                        type="number"
                        value={c.h}
                        min={1}
                        onChange={(e) => updateComponent(c.id, { h: Math.max(1, Number(e.target.value) || 1) })}
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                      />
                    </label>
                    <label className="text-[var(--muted)] lg:col-span-1">
                      Scale %
                      <input
                        type="number"
                        min={COMBINED_BLOCK_SCALE_PERCENT_MIN}
                        max={COMBINED_BLOCK_SCALE_PERCENT_MAX}
                        value={c.blockScalePercent ?? 100}
                        onChange={(e) =>
                          updateComponent(c.id, {
                            blockScalePercent: clampCombinedBlockScalePercent(Number(e.target.value) || 100),
                          })
                        }
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                      />
                    </label>
                    <label className="text-[var(--muted)] lg:col-span-2">
                      Horizontal align
                      <select
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                        value={c.blockTextAlign ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') updateComponent(c.id, { blockTextAlign: undefined });
                          else if (isCombinedBlockTextAlign(v))
                            updateComponent(c.id, { blockTextAlign: v });
                        }}
                      >
                        <option value="">Default (block preset)</option>
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </label>
                    <label className="text-[var(--muted)] lg:col-span-2">
                      Vertical align
                      <select
                        className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                        value={c.blockVerticalAlign ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '') updateComponent(c.id, { blockVerticalAlign: undefined });
                          else if (isCombinedBlockVerticalAlign(v))
                            updateComponent(c.id, { blockVerticalAlign: v });
                        }}
                      >
                        <option value="">Default (center)</option>
                        {COMBINED_BLOCK_VERTICAL_ALIGNS.map((v) => (
                          <option key={v} value={v}>
                            {v === 'top' ? 'Top' : v === 'bottom' ? 'Bottom' : 'Center'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2 flex items-end gap-2 text-[var(--muted)] lg:col-span-2">
                      <input
                        type="checkbox"
                        checked={c.visible !== false}
                        onChange={(e) => updateComponent(c.id, { visible: e.target.checked })}
                      />
                      visible
                    </label>
                    <label className="col-span-2 flex items-end gap-2 text-[var(--muted)] lg:col-span-2">
                      <input
                        type="checkbox"
                        checked={c.borderless === true}
                        onChange={(e) => updateComponent(c.id, { borderless: e.target.checked })}
                      />
                      Borderless (no box)
                    </label>
                    <label className="col-span-2 flex items-end gap-2 text-[var(--muted)] lg:col-span-2">
                      <input
                        type="checkbox"
                        checked={c.dataOnly === true}
                        onChange={(e) => updateComponent(c.id, { dataOnly: e.target.checked })}
                      />
                      Data only (hide labels, values only)
                    </label>
                  </div>
                  {c.key === 'decorSvg' ? (
                    <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                      <label className="flex items-center gap-2 text-[var(--muted)]">
                        <input
                          type="checkbox"
                          checked={c.decorSendToBack === true}
                          onChange={(e) => updateComponent(c.id, { decorSendToBack: e.target.checked })}
                        />
                        Behind text (z-order)
                      </label>
                      <div className="grid gap-2 sm:grid-cols-3">
                      <label className="text-[var(--muted)]">
                        SVG preset
                        <select
                          className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                          value={c.decorSvgId ?? 'heart'}
                          onChange={(e) =>
                            updateComponent(c.id, { decorSvgId: e.target.value as CombinedDecorSvgId })
                          }
                        >
                          {COMBINED_DECOR_SVG_IDS.map((id) => (
                            <option key={id} value={id}>
                              {DECOR_SVG_LABELS[id]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[var(--muted)]">
                        Color
                        <select
                          className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[var(--text)]"
                          value={c.decorColorMode ?? 'theme'}
                          onChange={(e) =>
                            updateComponent(c.id, { decorColorMode: e.target.value as CombinedSvgColorMode })
                          }
                        >
                          {COMBINED_SVG_COLOR_MODES.map((m) => (
                            <option key={m} value={m}>
                              {SVG_COLOR_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[var(--muted)]">
                        Custom hex
                        <input
                          type="text"
                          placeholder="#aabbcc"
                          disabled={(c.decorColorMode ?? 'theme') !== 'custom'}
                          value={c.decorColorCustom ?? ''}
                          onChange={(e) => updateComponent(c.id, { decorColorCustom: e.target.value })}
                          className="mt-1 w-full rounded border border-white/20 bg-black/30 px-1 py-0.5 font-mono text-[var(--text)] disabled:opacity-40"
                        />
                      </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-lg font-semibold text-[var(--accent)]">Live card preview</h2>
            {sample ? (
              <div className="max-w-[340px]">
                <TvPartyCombinedColumn
                  c={sample.first}
                  initiative={sample.initEntry}
                  layoutConfig={draftLayout}
                  displayOptions={combinedCardDisplayOptions}
                  initiativeTieNote={buildInitiativeTieNote(
                    sample.initEntry,
                    state.initiative,
                    state.party?.characters ?? [],
                  )}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">No party character available for preview yet.</p>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
            <h2 className="mb-3 text-lg font-semibold text-[var(--accent)]">Presets (local for now)</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                className="rounded border border-white/20 bg-black/30 px-2 py-1 text-sm text-[var(--text)]"
              />
              <button
                type="button"
                className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white"
                onClick={() => {
                  const name = presetName.trim();
                  if (!name) return;
                  const next = [...presets, { id: crypto.randomUUID(), name, layout: draftLayout }];
                  void persistPresets(next);
                  setPresetName('');
                  setMsg(`Saved preset "${name}".`);
                }}
              >
                Save preset
              </button>
              <button
                type="button"
                className="rounded border border-white/20 px-3 py-1.5 text-sm text-[var(--text)]"
                onClick={() => {
                  const d = defaultCombinedCardLayoutConfig();
                  setDraftLayout(d);
                  if (autoApply) void applyConfig(d);
                }}
              >
                Reset to default
              </button>
            </div>
            <div className="space-y-2">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2">
                  <span className="text-sm text-[var(--text)]">{p.name}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-sky-700 px-2 py-1 text-xs text-white"
                      onClick={() => {
                        setDraftLayout(p.layout);
                        if (autoApply) void applyConfig(p.layout);
                      }}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2 py-1 text-xs text-[var(--muted)]"
                      onClick={() => {
                        const next = presets.filter((x) => x.id !== p.id);
                        void persistPresets(next);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {presets.length === 0 ? <p className="text-sm text-[var(--muted)]">No presets saved yet.</p> : null}
            </div>
          </section>
        </>
      )}

      {msg ? <p className="text-sm text-sky-300">{msg}</p> : null}
    </div>
  );
}

export default function InitiativeCustomizerPage() {
  return (
    <InitiativeCustomizerErrorBoundary>
      <InitiativeCustomizerPageInner />
    </InitiativeCustomizerErrorBoundary>
  );
}
