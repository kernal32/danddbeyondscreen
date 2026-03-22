/** Widget kinds the table display can render. Extend over time (DesignerRole). */
export type WidgetType =
  | 'party'
  | 'initiative'
  | 'timedEffects'
  | 'diceLog'
  | 'clock'
  | 'spacer';

/** Grid placement: 12-column layout, 0-based x/y, w/h in column/row spans. */
export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
  themeOverride?: string;
}

export interface TableLayout {
  id: string;
  name: string;
  version: number;
  snapGrid?: boolean;
  widgets: WidgetInstance[];
}

export const TABLE_LAYOUT_VERSION = 1;

/** Initiative left (4×2), party right (8×2), timed effects under initiative column. */
export function createDefaultTableLayout(): TableLayout {
  return {
    id: 'default',
    name: 'Default',
    version: TABLE_LAYOUT_VERSION,
    snapGrid: true,
    widgets: [
      { id: 'w-initiative', type: 'initiative', x: 0, y: 0, w: 4, h: 2 },
      { id: 'w-party', type: 'party', x: 4, y: 0, w: 8, h: 2 },
      { id: 'w-effects', type: 'timedEffects', x: 0, y: 2, w: 4, h: 1 },
    ],
  };
}
