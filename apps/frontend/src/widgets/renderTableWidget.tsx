import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { WidgetInstance } from '@ddb/shared-types/layout';
import type { PublicSessionState } from '@ddb/shared-types/session';
import type { SessionUiMode } from '../types/sessionUiMode';
import UnknownWidget from './UnknownWidget';
import { WIDGET_REGISTRY, isRegisteredWidgetType } from './widgetRegistry';

function widgetFallback(compact?: boolean): ReactNode {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-white/10 bg-black/20 text-[var(--muted)] ${
        compact ? 'min-h-8 text-[10px]' : 'min-h-16 text-xs'
      }`}
      aria-hidden
    >
      …
    </div>
  );
}

export function renderTableWidget(
  w: WidgetInstance,
  state: PublicSessionState,
  sessionUiMode: SessionUiMode,
  large?: boolean,
  emit?: (event: string, payload?: unknown) => void,
  options?: { fillCell?: boolean; layoutRowCount?: number },
): ReactNode {
  const props = {
    instance: w,
    state,
    sessionUiMode,
    large,
    emit,
    fillCell: options?.fillCell,
    layoutRowCount: options?.layoutRowCount,
  };

  if (!isRegisteredWidgetType(w.type)) {
    return <UnknownWidget instance={w} />;
  }

  const { Component } = WIDGET_REGISTRY[w.type];
  const compact = options?.fillCell === true;
  return (
    <Suspense fallback={widgetFallback(compact)}>
      <Component {...props} />
    </Suspense>
  );
}
