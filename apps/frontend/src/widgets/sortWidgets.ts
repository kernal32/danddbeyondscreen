import type { WidgetInstance } from '@ddb/shared-types/layout';

export function sortWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}
