import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PublicSessionState, TableLayout, WidgetInstance, WidgetType } from '@ddb/shared-types';
import {
  getInitiativeDensitySelectValue,
  getPartyWidgetView,
  type InitiativeWidgetDensityMode,
} from '@ddb/shared-types';
import { renderTableWidget } from '../widgets/renderTableWidget';
import { sortWidgets } from '../widgets/sortWidgets';
import { WIDGET_REGISTRY } from '../widgets/widgetRegistry';
import { resolveWidgetTableTheme, widgetThemeSurfaceClassFromSession } from '../theme/tableTheme';
import { TableThemeProvider } from '../theme/TableThemeContext';
import { normalizeTableLayout, validateTableLayoutForServer } from './tableLayoutValidate';
import {
  TABLE_LAYOUT_FILL_GAP_PX,
  tableLayoutColStride,
  tableLayoutRowCount,
  tableLayoutRowStride,
} from './tableLayoutGrid';

const PALETTE_TYPES = (Object.keys(WIDGET_REGISTRY) as WidgetType[]).sort((a, b) =>
  WIDGET_REGISTRY[a].label.localeCompare(WIDGET_REGISTRY[b].label),
);

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  party: { w: 6, h: 2 },
  initiative: { w: 4, h: 2 },
  timedEffects: { w: 4, h: 1 },
  diceLog: { w: 4, h: 1 },
  clock: { w: 3, h: 1 },
  spacer: { w: 2, h: 1 },
};

type PointerSession =
  | { kind: 'move'; startX: number; startY: number; orig: WidgetInstance }
  | { kind: 'resize'; startX: number; startY: number; orig: WidgetInstance };

export default function TableLayoutEditor({
  state,
  onApply,
}: {
  state: PublicSessionState;
  onApply: (layout: TableLayout) => void;
}) {
  const [draft, setDraft] = useState<TableLayout>(() => structuredClone(state.tableLayout));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addType, setAddType] = useState<WidgetType>('initiative');
  const gridRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PointerSession | null>(null);

  const syncSig = useMemo(
    () =>
      JSON.stringify(
        state.tableLayout.widgets.map((x) => [x.id, x.type, x.x, x.y, x.w, x.h, x.config ?? null]),
      ),
    [state.tableLayout.widgets],
  );

  const layoutSourceRef = useRef(state.tableLayout);
  layoutSourceRef.current = state.tableLayout;

  /** Replace local draft when server layout *content* changes (e.g. Apply → `state:full`), not on every parent re-render. */
  useLayoutEffect(() => {
    setDraft(structuredClone(layoutSourceRef.current));
    setDirty(false);
  }, [syncSig]);

  const renderState = useMemo(() => ({ ...state, tableLayout: draft }), [state, draft]);
  const widgets = useMemo(() => sortWidgets(draft.widgets), [draft.widgets]);
  const rowCount = useMemo(() => tableLayoutRowCount(draft.widgets), [draft.widgets]);

  const applyPointerResult = useCallback((e: PointerEvent, s: PointerSession) => {
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const gapPx = TABLE_LAYOUT_FILL_GAP_PX;
    const colStride = tableLayoutColStride(rect.width, gapPx);

    setDraft((prev) => {
      const rc = tableLayoutRowCount(prev.widgets);
      const rowStride = tableLayoutRowStride(rect.height, rc, gapPx);
      const next = { ...prev, widgets: prev.widgets.map((w) => ({ ...w })) };
      const ix = next.widgets.findIndex((w) => w.id === s.orig.id);
      if (ix < 0) return prev;

      if (s.kind === 'move') {
        const dx = Math.round((e.clientX - s.startX) / colStride);
        const dy = Math.round((e.clientY - s.startY) / rowStride);
        let nx = s.orig.x + dx;
        let ny = s.orig.y + dy;
        nx = Math.max(0, Math.min(12 - s.orig.w, nx));
        ny = Math.max(0, ny);
        next.widgets[ix] = { ...next.widgets[ix], x: nx, y: ny };
      } else {
        const dx = Math.round((e.clientX - s.startX) / colStride);
        const dy = Math.round((e.clientY - s.startY) / rowStride);
        let nw = s.orig.w + dx;
        let nh = s.orig.h + dy;
        nw = Math.max(1, Math.min(12 - s.orig.x, nw));
        nh = Math.max(1, nh);
        next.widgets[ix] = { ...next.widgets[ix], w: nw, h: nh };
      }
      return next;
    });
    setDirty(true);
  }, []);

  useEffect(() => {
    const finish = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      applyPointerResult(e, s);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [applyPointerResult]);

  const removeWidget = (id: string) => {
    setDraft((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }));
    setDirty(true);
    setError(null);
  };

  const addWidget = () => {
    const { w, h } = DEFAULT_SIZE[addType];
    const id = `w-${crypto.randomUUID().slice(0, 8)}`;
    setDraft((d) => {
      const maxY = d.widgets.reduce((m, x) => Math.max(m, x.y + x.h), 0);
      let x = 0;
      let y = maxY;
      if (x + w > 12) {
        x = 0;
        y = maxY + 1;
      }
      return { ...d, widgets: [...d.widgets, { id, type: addType, x, y, w, h }] };
    });
    setDirty(true);
    setError(null);
  };

  const handleApply = () => {
    const normalized = normalizeTableLayout(draft);
    const err = validateTableLayoutForServer(normalized);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onApply(normalized);
  };

  const handleRevert = () => {
    setDraft(structuredClone(state.tableLayout));
    setDirty(false);
    setError(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Drag <span className="text-[var(--text)]">⋮⋮</span> to move (snaps on release). Drag the corner to resize. Server allows overlap;
        bounds must keep widgets within 12 columns.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          onClick={handleApply}
        >
          Apply layout to table
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onClick={handleRevert}
          disabled={!dirty}
        >
          Revert
        </button>
        <span className="text-xs text-[var(--muted)]">{dirty ? 'Unsaved changes' : 'In sync with last apply'}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Add widget
          <select
            className="rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-[var(--text)] min-w-[14rem]"
            value={addType}
            onChange={(e) => setAddType(e.target.value as WidgetType)}
          >
            {PALETTE_TYPES.map((t) => (
              <option key={t} value={t}>
                {WIDGET_REGISTRY[t].label} · {t}
              </option>
            ))}
          </select>
          <span className="max-w-md text-[10px] leading-snug text-[var(--muted)]">
            The rich combat tracker is <strong className="text-[var(--text)]">Initiative tracker</strong> (type{' '}
            <code className="text-[var(--text)]">initiative</code>). Default layout already includes it on the right;
            add another if you removed it.
          </span>
        </label>
        <button
          type="button"
          className="rounded-lg bg-slate-600 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onClick={addWidget}
        >
          Add
        </button>
      </div>

      {error && (
        <p className="text-sm text-amber-300" role="alert">
          {error}
        </p>
      )}

      <p className="text-[10px] text-[var(--muted)]">
        Preview uses a <strong className="text-[var(--text)]">16:9</strong> frame (1080p proportions). Widgets use the same row splits and{' '}
        <code className="text-[var(--text)]">fill</code> behavior as the TV display.
      </p>

      <div className="table-layout-editor-canvas mx-auto w-full max-w-[min(100%,1920px)] min-w-0">
        <div className="aspect-video w-full min-h-0 overflow-hidden rounded-lg border border-dashed border-violet-500/40 bg-black/30">
          <div className="flex h-full min-h-0 flex-col p-2">
            <div
              ref={gridRef}
              className="table-layout-grid table-layout-grid--fill relative z-[1] min-h-0 flex-1"
              style={{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }}
            >
              {widgets.map((w) => {
                const previewLarge = w.type === 'initiative' || w.type === 'party';
                const body = renderTableWidget(w, renderState, previewLarge, undefined, { fillCell: true });
                const surface = widgetThemeSurfaceClassFromSession(
                  renderState.theme,
                  w.themeOverride,
                  renderState.themePalette,
                );
                const widgetTheme = resolveWidgetTableTheme(renderState.theme, w.themeOverride);

                const patchConfig = (patch: Record<string, unknown>) => {
                  setDraft((d) => ({
                    ...d,
                    widgets: d.widgets.map((x) => {
                      if (x.id !== w.id) return x;
                      const prev = x.config && typeof x.config === 'object' ? { ...(x.config as object) } : {};
                      return { ...x, config: { ...prev, ...patch } };
                    }),
                  }));
                  setDirty(true);
                  setError(null);
                };

                const setPartyView = (view: 'full' | 'compact') => {
                  if (view === 'full') {
                    setDraft((d) => ({
                      ...d,
                      widgets: d.widgets.map((x) => {
                        if (x.id !== w.id) return x;
                        const cfg = x.config && typeof x.config === 'object' ? { ...(x.config as object) } : {};
                        delete (cfg as { view?: string }).view;
                        return Object.keys(cfg).length ? { ...x, config: cfg } : { ...x, config: undefined };
                      }),
                    }));
                  } else {
                    patchConfig({ view: 'compact' });
                  }
                  setDirty(true);
                  setError(null);
                };

                const setInitiativeDensity = (mode: InitiativeWidgetDensityMode) => {
                  if (mode === 'auto') {
                    setDraft((d) => ({
                      ...d,
                      widgets: d.widgets.map((x) => {
                        if (x.id !== w.id) return x;
                        const cfg = x.config && typeof x.config === 'object' ? { ...(x.config as object) } : {};
                        delete (cfg as { density?: string }).density;
                        return Object.keys(cfg).length ? { ...x, config: cfg } : { ...x, config: undefined };
                      }),
                    }));
                  } else {
                    patchConfig({ density: mode });
                  }
                  setDirty(true);
                  setError(null);
                };

                return (
                  <div
                    key={w.id}
                    className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border-2 border-violet-500/50 shadow-md ${surface}`}
                    style={{
                      gridColumn: `${w.x + 1} / span ${w.w}`,
                      gridRow: `${w.y + 1} / span ${w.h}`,
                    }}
                  >
                    <div className="flex shrink-0 flex-col gap-0.5 border-b border-white/10 bg-black/40 px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${w.type} widget`}
                          className="cursor-grab touch-none rounded px-1.5 py-1 text-[var(--muted)] hover:bg-white/10 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            sessionRef.current = {
                              kind: 'move',
                              startX: e.clientX,
                              startY: e.clientY,
                              orig: { ...w },
                            };
                          }}
                        >
                          ⋮⋮
                        </button>
                        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--muted)]">
                          {w.id} · {w.type}
                        </span>
                        <button
                          type="button"
                          className="rounded px-1.5 py-0.5 text-xs text-amber-300 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                          onClick={() => removeWidget(w.id)}
                        >
                          Remove
                        </button>
                      </div>
                      {w.type === 'party' ? (
                        <label className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                          <span className="shrink-0">Party</span>
                          <select
                            className="min-w-0 flex-1 rounded border border-white/20 bg-black/50 px-1 py-0.5 text-[var(--text)]"
                            value={getPartyWidgetView(w)}
                            onChange={(e) => setPartyView(e.target.value === 'compact' ? 'compact' : 'full')}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="full">Full cards (3 col)</option>
                            <option value="compact">Compact strip</option>
                          </select>
                        </label>
                      ) : null}
                      {w.type === 'initiative' ? (
                        <label className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                          <span className="shrink-0">Init</span>
                          <select
                            className="min-w-0 flex-1 rounded border border-white/20 bg-black/50 px-1 py-0.5 text-[var(--text)]"
                            value={getInitiativeDensitySelectValue(w)}
                            onChange={(e) => setInitiativeDensity(e.target.value as InitiativeWidgetDensityMode)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="auto">Auto (compact if ≤3 cols)</option>
                            <option value="normal">Comfortable</option>
                            <option value="compact">Compact rows</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <TableThemeProvider theme={widgetTheme}>
                      <div className="min-h-0 flex-1 overflow-auto p-1 [&_*]:pointer-events-none">
                        {body ?? (
                          <p className="p-2 text-sm text-[var(--muted)]">{w.type === 'spacer' ? 'Spacer' : '—'}</p>
                        )}
                      </div>
                    </TableThemeProvider>
                    <button
                      type="button"
                      aria-label={`Resize ${w.type} widget`}
                      className="absolute bottom-0.5 right-0.5 z-10 h-4 w-4 cursor-se-resize rounded-sm border border-violet-400/80 bg-violet-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        sessionRef.current = {
                          kind: 'resize',
                          startX: e.clientX,
                          startY: e.clientY,
                          orig: { ...w },
                        };
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
