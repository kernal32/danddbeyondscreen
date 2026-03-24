import type { ComponentType } from 'react';
import type { WidgetType } from '@ddb/shared-types';
import ClockWidget from './ClockWidget';
import DiceLogWidget from './DiceLogWidget';
import InitiativeWidget from './InitiativeWidget';
import PartyWidget from './PartyWidget';
import SpacerWidget from './SpacerWidget';
import TimedEffectsWidget from './TimedEffectsWidget';
import type { WidgetViewProps } from './types';

export type WidgetDefinition = {
  /** Layout editor palette / tooling (future). */
  label: string;
  Component: ComponentType<WidgetViewProps>;
  /**
   * Informal notes for `WidgetInstance.config` until shared-types defines per-widget schemas.
   * Keys are suggestions only; backend does not validate widget-specific config today.
   */
  configNotes?: string;
};

/**
 * Exhaustive map: adding a `WidgetType` in `@ddb/shared-types` without an entry here is a type error.
 */
export const WIDGET_REGISTRY = {
  party: {
    label: 'Party',
    Component: PartyWidget,
    configNotes:
      'Player cards: DM Settings — Party / player cards (toggles, section order, preview). Data from NormalizedCharacter + optional rich fields when populated.',
  },
  initiative: {
    label: 'Initiative tracker',
    Component: InitiativeWidget,
    configNotes:
      'Portraits, initiative bonus, roll breakdown, conditions, turn highlight on DM / “last” tap on TV, New combat; TV: Next round (new rolls each round), DM: Next turn (live table only).',
  },
  timedEffects: {
    label: 'Timed effects',
    Component: TimedEffectsWidget,
    configNotes: 'Reserved; no keys in use yet.',
  },
  diceLog: {
    label: 'Dice log',
    Component: DiceLogWidget,
    configNotes: 'Reserved; e.g. maxLines (future).',
  },
  clock: {
    label: 'Clock',
    Component: ClockWidget,
    configNotes: 'Future: format, timezone (product TBD).',
  },
  spacer: {
    label: 'Spacer',
    Component: SpacerWidget,
    configNotes: 'Visual gap; config unused.',
  },
} satisfies Record<WidgetType, WidgetDefinition>;

const REGISTERED_TYPES = new Set<string>(Object.keys(WIDGET_REGISTRY));

export function isRegisteredWidgetType(type: string): type is WidgetType {
  return REGISTERED_TYPES.has(type);
}

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  if (!isRegisteredWidgetType(type)) return undefined;
  return WIDGET_REGISTRY[type];
}
