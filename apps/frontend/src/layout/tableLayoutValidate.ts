import { TABLE_LAYOUT_VERSION, type TableLayout, type WidgetType } from '@ddb/shared-types/layout';

const WIDGET_TYPES = new Set<WidgetType>([
  'party',
  'initiative',
  'timedEffects',
  'diceLog',
  'clock',
  'spacer',
]);

/** Mirrors `apps/backend/src/util/table-layout.ts` rules for client-side UX before emit. */
export function validateTableLayoutForServer(layout: TableLayout): string | null {
  if (typeof layout.id !== 'string' || !layout.id.trim()) return 'Layout needs a non-empty id.';
  if (typeof layout.name !== 'string' || !layout.name.trim()) return 'Layout needs a name.';
  if (!Array.isArray(layout.widgets) || layout.widgets.length === 0) return 'Add at least one widget.';
  const seen = new Set<string>();
  for (const w of layout.widgets) {
    if (seen.has(w.id)) return `Duplicate widget id: ${w.id}`;
    seen.add(w.id);
    if (!WIDGET_TYPES.has(w.type)) return `Unknown widget type: ${w.type}`;
    if (!Number.isFinite(w.w) || !Number.isFinite(w.h) || w.w < 1 || w.h < 1) {
      return `Widget ${w.id}: width and height must be ≥ 1.`;
    }
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y) || w.x < 0 || w.y < 0) {
      return `Widget ${w.id}: position must be non-negative.`;
    }
    if (w.x + w.w > 12) return `Widget ${w.id}: spans past column 12 (0–11 + width ≤ 12).`;
  }
  return null;
}

export function normalizeTableLayout(layout: TableLayout): TableLayout {
  return {
    id: layout.id.trim(),
    name: layout.name.trim(),
    version: TABLE_LAYOUT_VERSION,
    snapGrid: layout.snapGrid === true,
    widgets: layout.widgets.map((w) => {
      const x = Math.max(0, Math.floor(w.x));
      const y = Math.max(0, Math.floor(w.y));
      let width = Math.max(1, Math.floor(w.w));
      const height = Math.max(1, Math.floor(w.h));
      width = Math.min(width, 12 - x);
      return {
        id: w.id,
        type: w.type,
        x,
        y,
        w: width,
        h: height,
        ...(w.config && typeof w.config === 'object' ? { config: w.config } : {}),
        ...(typeof w.themeOverride === 'string' ? { themeOverride: w.themeOverride } : {}),
      };
    }),
  };
}
