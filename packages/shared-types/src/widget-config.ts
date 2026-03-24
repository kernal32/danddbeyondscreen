import type { WidgetInstance } from './layout.js';

/** Party widget TV layout: full `PartyCard` grid vs compact strip tiles. */
export type PartyWidgetView = 'full' | 'compact';

/** Initiative row density; omit or `auto` uses widget width heuristic on the client. */
export type InitiativeWidgetDensityMode = 'auto' | 'normal' | 'compact';

export function getPartyWidgetView(instance: WidgetInstance): PartyWidgetView {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object' && (cfg as { view?: string }).view === 'compact') {
    return 'compact';
  }
  return 'full';
}

/** Effective initiative row density for rendering. */
export function getInitiativeWidgetDensity(instance: WidgetInstance): 'normal' | 'compact' {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object') {
    const d = (cfg as { density?: string }).density;
    if (d === 'compact') return 'compact';
    if (d === 'normal') return 'normal';
  }
  return instance.w <= 3 ? 'compact' : 'normal';
}

export function getInitiativeDensitySelectValue(instance: WidgetInstance): InitiativeWidgetDensityMode {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object') {
    const d = (cfg as { density?: string }).density;
    if (d === 'compact') return 'compact';
    if (d === 'normal') return 'normal';
  }
  return 'auto';
}
