import type { PublicSessionState, WidgetInstance } from '@ddb/shared-types';
import { createDefaultTableLayout } from '@ddb/shared-types';
import { widgetThemeSurfaceClass } from '../theme/tableTheme';
import { renderTableWidget } from '../widgets/renderTableWidget';
import { sortWidgets } from '../widgets/sortWidgets';

export type TableLayoutRendererProps = {
  state: PublicSessionState;
  large?: boolean;
  /** Widget outlines, 12-col guides (wide screens), raw JSON panel */
  debugLayout?: boolean;
  className?: string;
  /** Proportional row heights + in-cell scroll (table display / 1080p TV) */
  fillViewport?: boolean;
  emit?: (event: string, payload?: unknown) => void;
};

function tableLayoutRowCount(widgets: WidgetInstance[]): number {
  let max = 0;
  for (const w of widgets) max = Math.max(max, w.y + w.h);
  return Math.max(1, max);
}

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
  large = true,
  debugLayout = false,
  className = '',
  fillViewport = false,
  emit,
}: TableLayoutRendererProps) {
  const layout = state.tableLayout ?? createDefaultTableLayout();
  const widgets = sortWidgets(layout.widgets ?? []);
  const rowCount = tableLayoutRowCount(widgets);

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
          {widgets.map((w) => {
            const body = renderTableWidget(w, state, large, emit, { fillCell: fillViewport });
            if (body == null) return null;

            const surfaceTheme = widgetThemeSurfaceClass(state.theme, w.themeOverride);
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
                {fillViewport ? (
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1.5">{body}</div>
                ) : (
                  body
                )}
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
