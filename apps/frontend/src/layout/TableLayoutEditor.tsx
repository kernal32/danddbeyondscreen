import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TableLayout, WidgetInstance, WidgetType } from '@ddb/shared-types/layout';
import type { PublicSessionState } from '@ddb/shared-types/session';
import {
  getInitiativeDensitySelectValue,
  getPartyHighestRollSide,
  getPartyWidgetView,
  type InitiativeWidgetDensityMode,
  type PartyWidgetView,
} from '@ddb/shared-types/widget-config';
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
import {
  getWidgetLayoutV2,
  layoutV2ToLegacyGrid,
  withWidgetLayoutV2Config,
  type AnchorX,
  type AnchorY,
  type WidgetLayoutV2,
} from './layoutV2';

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
  | { kind: 'move'; startX: number; startY: number; orig: WidgetInstance; axis?: 'x' | 'y' }
  | { kind: 'resize'; startX: number; startY: number; orig: WidgetInstance };

type GuideLine = { axis: 'x' | 'y'; px: number };

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState<'grid' | 'free'>('grid');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapPx, setSnapPx] = useState(8);
  const [guides, setGuides] = useState<GuideLine[]>([]);
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
        let pxDx = e.clientX - s.startX;
        let pxDy = e.clientY - s.startY;

        if (e.shiftKey) {
          if (!s.axis) s.axis = Math.abs(pxDx) >= Math.abs(pxDy) ? 'x' : 'y';
          if (s.axis === 'x') pxDy = 0;
          else pxDx = 0;
        } else {
          s.axis = undefined;
        }

        if (moveMode === 'grid') {
          const dx = Math.round(pxDx / colStride);
          const dy = Math.round(pxDy / rowStride);
          let nx = s.orig.x + dx;
          let ny = s.orig.y + dy;
          nx = Math.max(0, Math.min(12 - s.orig.w, nx));
          ny = Math.max(0, ny);
          const v2 = getWidgetLayoutV2(s.orig, rc);
          const merged = withWidgetLayoutV2Config({ ...next.widgets[ix], x: nx, y: ny }, {
            ...v2,
            xPct: nx / 12,
            yPct: ny / rc,
            wPct: s.orig.w / 12,
            hPct: s.orig.h / rc,
          });
          next.widgets[ix] = merged;
          setGuides([]);
        } else {
          const origV2 = getWidgetLayoutV2(s.orig, rc);
          const pxW = origV2.wPct * rect.width;
          const pxH = origV2.hPct * rect.height;
          const anchorBaseX = origV2.xPct * rect.width;
          const anchorBaseY = origV2.yPct * rect.height;
          let nextAnchorX = anchorBaseX + pxDx;
          let nextAnchorY = anchorBaseY + pxDy;
          if (snapEnabled && snapPx > 0) {
            nextAnchorX = Math.round(nextAnchorX / snapPx) * snapPx;
            nextAnchorY = Math.round(nextAnchorY / snapPx) * snapPx;
          }
          const vSnap = 6;
          const otherGuidesX: number[] = [0, rect.width / 2, rect.width];
          const otherGuidesY: number[] = [0, rect.height / 2, rect.height];
          for (const ow of prev.widgets) {
            if (ow.id === s.orig.id) continue;
            const ov2 = getWidgetLayoutV2(ow, rc);
            const ox = ov2.xPct * rect.width;
            const oy = ov2.yPct * rect.height;
            const owW = ov2.wPct * rect.width;
            const owH = ov2.hPct * rect.height;
            const left = ov2.anchorX === 'left' ? ox : ov2.anchorX === 'center' ? ox - owW / 2 : ox - owW;
            const top = ov2.anchorY === 'top' ? oy : ov2.anchorY === 'center' ? oy - owH / 2 : oy - owH;
            otherGuidesX.push(left, left + owW / 2, left + owW);
            otherGuidesY.push(top, top + owH / 2, top + owH);
          }
          let gx: number | null = null;
          let gy: number | null = null;
          for (const g of otherGuidesX) {
            if (Math.abs(g - nextAnchorX) <= vSnap) {
              nextAnchorX = g;
              gx = g;
              break;
            }
          }
          for (const g of otherGuidesY) {
            if (Math.abs(g - nextAnchorY) <= vSnap) {
              nextAnchorY = g;
              gy = g;
              break;
            }
          }
          const nextV2: WidgetLayoutV2 = {
            ...origV2,
            xPct: Math.max(0, Math.min(1, nextAnchorX / rect.width)),
            yPct: Math.max(0, Math.min(1, nextAnchorY / rect.height)),
            wPct: Math.max(1 / 12, Math.min(1, pxW / rect.width)),
            hPct: Math.max(1 / rc, Math.min(1, pxH / rect.height)),
          };
          const legacy = layoutV2ToLegacyGrid(nextV2, rc);
          next.widgets[ix] = withWidgetLayoutV2Config({ ...next.widgets[ix], ...legacy }, nextV2);
          const nextGuides: GuideLine[] = [];
          if (gx != null) nextGuides.push({ axis: 'x', px: gx });
          if (gy != null) nextGuides.push({ axis: 'y', px: gy });
          setGuides(nextGuides);
        }
      } else {
        const dx = Math.round((e.clientX - s.startX) / colStride);
        const dy = Math.round((e.clientY - s.startY) / rowStride);
        let nw = s.orig.w + dx;
        let nh = s.orig.h + dy;
        nw = Math.max(1, Math.min(12 - s.orig.x, nw));
        nh = Math.max(1, nh);
        const v2 = getWidgetLayoutV2(s.orig, rc);
        const nextV2: WidgetLayoutV2 = {
          ...v2,
          wPct: Math.max(1 / 12, Math.min(1, nw / 12)),
          hPct: Math.max(1 / rc, Math.min(1, nh / rc)),
        };
        next.widgets[ix] = withWidgetLayoutV2Config({ ...next.widgets[ix], w: nw, h: nh }, nextV2);
      }
      return next;
    });
    setDirty(true);
  }, [moveMode, snapEnabled, snapPx]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      applyPointerResult(e, s);
    };
    const finish = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      sessionRef.current = null;
      applyPointerResult(e, s);
      setGuides([]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
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
    setSelectedId(id);
    setDirty(true);
    setError(null);
  };

  const selected = selectedId ? widgets.find((w) => w.id === selectedId) ?? null : null;

  const patchSelectedLayoutV2 = (patch: Partial<WidgetLayoutV2>) => {
    if (!selectedId) return;
    setDraft((prev) => {
      const rc = tableLayoutRowCount(prev.widgets);
      const next = { ...prev, widgets: prev.widgets.map((x) => ({ ...x })) };
      const ix = next.widgets.findIndex((w) => w.id === selectedId);
      if (ix < 0) return prev;
      const w = next.widgets[ix];
      const base = getWidgetLayoutV2(w, rc);
      const merged: WidgetLayoutV2 = { ...base, ...patch };
      const legacy = layoutV2ToLegacyGrid(merged, rc);
      next.widgets[ix] = withWidgetLayoutV2Config({ ...w, ...legacy }, merged);
      return next;
    });
    setDirty(true);
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
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          Move mode
          <select
            className="rounded border border-white/20 bg-black/40 px-2 py-1 text-xs text-[var(--text)]"
            value={moveMode}
            onChange={(e) => setMoveMode(e.target.value === 'free' ? 'free' : 'grid')}
          >
            <option value="grid">Grid</option>
            <option value="free">Free</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
          Snap
        </label>
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          Snap px
          <input
            type="number"
            min={1}
            max={64}
            className="w-16 rounded border border-white/20 bg-black/40 px-1 py-0.5 text-xs text-[var(--text)]"
            value={snapPx}
            onChange={(e) => setSnapPx(Math.max(1, Math.min(64, Number(e.target.value) || 8)))}
          />
        </label>
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
                const body = renderTableWidget(w, renderState, 'dm', previewLarge, undefined, {
                  fillCell: true,
                  layoutRowCount: rowCount,
                });
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

                const setPartyView = (view: PartyWidgetView) => {
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
                    patchConfig({ view });
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
                    className={`relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border-2 shadow-md ${selectedId === w.id ? 'border-cyan-300' : 'border-violet-500/50'} ${surface}`}
                    style={{
                      gridColumn: `${w.x + 1} / span ${w.w}`,
                      gridRow: `${w.y + 1} / span ${w.h}`,
                    }}
                    onPointerDown={() => setSelectedId(w.id)}
                  >
                    <div className="flex shrink-0 flex-col gap-0.5 border-b border-white/10 bg-black/40 px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${w.type} widget`}
                          className="cursor-grab touch-none rounded px-1.5 py-1 text-[var(--muted)] hover:bg-white/10 active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setSelectedId(w.id);
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
                            onChange={(e) => {
                              const v = e.target.value;
                              setPartyView(
                                v === 'compact'
                                  ? 'compact'
                                  : v === 'combined'
                                    ? 'combined'
                                    : v === 'customFull'
                                      ? 'customFull'
                                      : 'full',
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="full">Full cards (3 col)</option>
                            <option value="compact">Compact strip</option>
                            <option value="combined">Combined init columns</option>
                            <option value="customFull">Custom full cards (3 col, grid layout)</option>
                          </select>
                        </label>
                      ) : null}
                      {w.type === 'party' && getPartyWidgetView(w) === 'combined' ? (
                        <label className="flex items-center gap-1 text-[10px] text-[var(--muted)]">
                          <span className="shrink-0">High</span>
                          <select
                            className="min-w-0 flex-1 rounded border border-white/20 bg-black/50 px-1 py-0.5 text-[var(--text)]"
                            value={getPartyHighestRollSide(w)}
                            onChange={(e) =>
                              patchConfig({ highestRollSide: e.target.value === 'right' ? 'right' : 'left' })
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="left">Left side</option>
                            <option value="right">Right side</option>
                          </select>
                        </label>
                      ) : null}
                      {w.type === 'party' &&
                      (getPartyWidgetView(w) === 'combined' || getPartyWidgetView(w) === 'customFull') ? (
                        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-[var(--muted)]">
                          <input
                            type="checkbox"
                            className="shrink-0 rounded border-white/30"
                            checked={
                              !!(
                                w.config &&
                                typeof w.config === 'object' &&
                                (w.config as { combinedStretch?: boolean }).combinedStretch
                              )
                            }
                            onChange={(e) => patchConfig({ combinedStretch: e.target.checked })}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span>Stretch cards to full cell height</span>
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
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5 [&_*]:pointer-events-none">
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
                        setSelectedId(w.id);
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
              {guides.map((g, ix) =>
                g.axis === 'x' ? (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={`gx-${ix}`}
                    className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-cyan-300/80"
                    style={{ left: `${g.px}px` }}
                  />
                ) : (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={`gy-${ix}`}
                    className="pointer-events-none absolute left-0 right-0 z-30 h-px bg-cyan-300/80"
                    style={{ top: `${g.px}px` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      {selected && (
        <div className="rounded-lg border border-white/15 bg-black/30 p-2">
          <p className="mb-2 text-xs text-[var(--muted)]">
            Selected: <span className="text-[var(--text)]">{selected.id}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="text-xs text-[var(--muted)]">
              Anchor X
              <select
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-[var(--text)]"
                value={getWidgetLayoutV2(selected, rowCount).anchorX}
                onChange={(e) => patchSelectedLayoutV2({ anchorX: e.target.value as AnchorX })}
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              Anchor Y
              <select
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-[var(--text)]"
                value={getWidgetLayoutV2(selected, rowCount).anchorY}
                onChange={(e) => patchSelectedLayoutV2({ anchorY: e.target.value as AnchorY })}
              >
                <option value="top">top</option>
                <option value="center">center</option>
                <option value="bottom">bottom</option>
              </select>
            </label>
            <label className="text-xs text-[var(--muted)]">
              X %
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-[var(--text)]"
                value={Math.round(getWidgetLayoutV2(selected, rowCount).xPct * 100)}
                onChange={(e) => patchSelectedLayoutV2({ xPct: Math.max(0, Math.min(1, Number(e.target.value) / 100)) })}
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Y %
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-[var(--text)]"
                value={Math.round(getWidgetLayoutV2(selected, rowCount).yPct * 100)}
                onChange={(e) => patchSelectedLayoutV2({ yPct: Math.max(0, Math.min(1, Number(e.target.value) / 100)) })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
