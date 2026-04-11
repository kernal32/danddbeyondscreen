import { createDefaultTableLayout } from '@ddb/shared-types/layout';
import type { PublicSessionState } from '@ddb/shared-types/session';
import { resolveWidgetTableTheme, widgetThemeSurfaceClassFromSession } from '../theme/tableTheme';
import { TableThemeProvider } from '../theme/TableThemeContext';
import { renderTableWidget } from '../widgets/renderTableWidget';
import type { SessionUiMode } from '../types/sessionUiMode';
import { sortWidgets } from '../widgets/sortWidgets';
import { tableLayoutRowCount } from './tableLayoutGrid';
import { getWidgetLayoutV2, layoutV2ToLegacyGrid, withWidgetLayoutV2Config } from './layoutV2';

export type TableLayoutRendererProps = {
  state: PublicSessionState;
  sessionUiMode: SessionUiMode;
  large?: boolean;
  /** Widget outlines, 12-col guides (wide screens), raw JSON panel */
  debugLayout?: boolean;
  className?: string;
  /** Proportional row heights + in-cell scroll (table display / 1080p TV) */
  fillViewport?: boolean;
  emit?: (event: string, payload?: unknown) => void;
};

function LayoutGridOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] hidden min-[1024px]:grid grid-cols-12 gap-4 opacity-50"
      aria-hidden
    >
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={i}
          className={`min-h-full border-x border-dashed border-cyan-400/60 ${i === 0 ? 'border-l' : ''} ${i === 11 ? 'border-r' : ''}`}
        />
      ))}
    </div>
  );
}

export default function TableLayoutRenderer({
  state,
  sessionUiMode,
  large = true,
  debugLayout = false,
  className = '',
  fillViewport = false,
  emit,
}: TableLayoutRendererProps) {
  const layout = state.tableLayout ?? createDefaultTableLayout();
  const widgets = sortWidgets(layout.widgets ?? []);
  const legacyRowCount = tableLayoutRowCount(widgets);
  const projectedOnce = widgets.map((w) => {
    const v2 = getWidgetLayoutV2(w, legacyRowCount);
    const legacy = layoutV2ToLegacyGrid(v2, legacyRowCount);
    return withWidgetLayoutV2Config({ ...w, ...legacy }, v2);
  });
  const projectedRowCount = tableLayoutRowCount(projectedOnce);
  const effectiveWidgets = projectedOnce.map((w) => {
    const v2 = getWidgetLayoutV2(w, projectedRowCount);
    const legacy = layoutV2ToLegacyGrid(v2, projectedRowCount);
    return withWidgetLayoutV2Config({ ...w, ...legacy }, v2);
  });
  const rowCount = tableLayoutRowCount(effectiveWidgets);

  return (
    <div
      className={`${fillViewport ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-2'} ${className}`.trim()}
    >
      <div className={fillViewport ? 'relative flex min-h-0 min-w-0 flex-1 flex-col' : 'relative'}>
        {debugLayout && <LayoutGridOverlay />}
        <div
          className={`table-layout-grid relative z-[1] ${fillViewport ? 'table-layout-grid--fill' : ''}`}
          style={
            fillViewport
              ? { gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {effectiveWidgets.map((w) => {
            const body = renderTableWidget(w, state, sessionUiMode, large, emit, {
              fillCell: fillViewport,
              layoutRowCount: rowCount,
            });
            if (body == null) return null;

            const surfaceTheme = widgetThemeSurfaceClassFromSession(state.theme, w.themeOverride, state.themePalette);
            const widgetTheme = resolveWidgetTableTheme(state.theme, w.themeOverride);
            return (
              <div
                key={w.id}
                className={`table-layout-cell min-w-0 relative rounded-lg ${surfaceTheme} ${
                  fillViewport ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''
                } ${debugLayout ? 'outline outline-2 outline-cyan-500/70 outline-offset-[-2px]' : ''}`}
                style={{
                  gridColumn: `${w.x + 1} / span ${w.w}`,
                  gridRow: `${w.y + 1} / span ${w.h}`,
                }}
              >
                {debugLayout && (
                  <span className="absolute top-0 left-0 z-20 max-w-full truncate rounded-br bg-black/75 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-cyan-300">
                    {w.id} · {w.type}
                  </span>
                )}
                <TableThemeProvider theme={widgetTheme}>
                  {fillViewport ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5">{body}</div>
                  ) : (
                    body
                  )}
                </TableThemeProvider>
              </div>
            );
          })}
        </div>
      </div>
      {debugLayout && (
        <details
          className={`rounded-lg border border-white/20 bg-black/50 p-2 text-left font-mono text-[11px] text-[var(--muted)] ${
            fillViewport ? 'max-h-36 shrink-0 overflow-y-auto' : 'max-h-52 overflow-auto'
          }`}
        >
          <summary className="cursor-pointer select-none text-[var(--accent)]">Raw session (debug)</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all text-[var(--text)]">{JSON.stringify(state, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
