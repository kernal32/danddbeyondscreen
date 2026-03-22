import type { TableLayout, WidgetInstance, WidgetType } from '@ddb/shared-types';
import { TABLE_LAYOUT_VERSION } from '@ddb/shared-types';

const WIDGET_TYPES = new Set<WidgetType>([
  'party',
  'initiative',
  'timedEffects',
  'diceLog',
  'clock',
  'spacer',
]);

function nonNegInt(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

function isWidget(w: unknown): w is WidgetInstance {
  if (!w || typeof w !== 'object') return false;
  const o = w as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return false;
  if (typeof o.type !== 'string' || !WIDGET_TYPES.has(o.type as WidgetType)) return false;
  const x = nonNegInt(o, 'x');
  const y = nonNegInt(o, 'y');
  const width = nonNegInt(o, 'w');
  const height = nonNegInt(o, 'h');
  if (x === null || y === null || width === null || height === null) return false;
  if (width === 0 || height === 0) return false;
  if (x + width > 12) return false;
  return true;
}

/** Accept partial layout from API/socket; return normalized layout or null (caller uses default). */
export function parseTableLayoutPayload(raw: unknown): TableLayout | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  const version = o.version;
  if (typeof version !== 'number' || version < 1) return null;
  const widgets = o.widgets;
  if (!Array.isArray(widgets) || widgets.length === 0) return null;
  const seen = new Set<string>();
  const out: WidgetInstance[] = [];
  for (const item of widgets) {
    if (!isWidget(item)) return null;
    if (seen.has(item.id)) return null;
    seen.add(item.id);
    out.push({
      id: item.id,
      type: item.type,
      x: Math.floor(item.x),
      y: Math.floor(item.y),
      w: Math.floor(item.w),
      h: Math.floor(item.h),
      ...(item.config && typeof item.config === 'object' ? { config: item.config as Record<string, unknown> } : {}),
      ...(typeof item.themeOverride === 'string' ? { themeOverride: item.themeOverride } : {}),
    });
  }
  return {
    id: o.id.trim(),
    name: o.name,
    version: TABLE_LAYOUT_VERSION,
    snapGrid: o.snapGrid === true,
    widgets: out,
  };
}
