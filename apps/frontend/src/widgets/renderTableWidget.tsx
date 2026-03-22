import type { ReactNode } from 'react';
import type { PublicSessionState, WidgetInstance } from '@ddb/shared-types';
import UnknownWidget from './UnknownWidget';
import { WIDGET_REGISTRY, isRegisteredWidgetType } from './widgetRegistry';

export function renderTableWidget(
  w: WidgetInstance,
  state: PublicSessionState,
  large?: boolean,
  emit?: (event: string, payload?: unknown) => void,
  options?: { fillCell?: boolean },
): ReactNode {
  const props = { instance: w, state, large, emit, fillCell: options?.fillCell };

  if (!isRegisteredWidgetType(w.type)) {
    return <UnknownWidget instance={w} />;
  }

  const { Component } = WIDGET_REGISTRY[w.type];
  return <Component {...props} />;
}
