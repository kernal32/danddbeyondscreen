import type { WidgetInstance } from '@ddb/shared-types';

export function sortWidgets(widgets: WidgetInstance[]): WidgetInstance[] {
  return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
}
