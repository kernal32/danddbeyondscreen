import type { WidgetInstance } from '@ddb/shared-types';

/** Match `.table-layout-grid--fill` gap `0.5rem` (8px at default root font). */
export const TABLE_LAYOUT_FILL_GAP_PX = 8;

export function tableLayoutRowCount(widgets: WidgetInstance[]): number {
  let max = 0;
  for (const w of widgets) max = Math.max(max, w.y + w.h);
  return Math.max(1, max);
}

export function tableLayoutColStride(rectWidth: number, gapPx: number = TABLE_LAYOUT_FILL_GAP_PX): number {
  const innerW = Math.max(0, rectWidth - 11 * gapPx);
  return innerW / 12 + gapPx;
}

export function tableLayoutRowStride(rectHeight: number, rowCount: number, gapPx: number = TABLE_LAYOUT_FILL_GAP_PX): number {
  if (rowCount < 1) return gapPx;
  const innerH = Math.max(0, rectHeight - (rowCount - 1) * gapPx);
  return innerH / rowCount + gapPx;
}
