import type { PublicSessionState, WidgetInstance } from '@ddb/shared-types';

export type WidgetViewProps = {
  instance: WidgetInstance;
  state: PublicSessionState;
  large?: boolean;
  /** Table display with viewport-fill layout: tighter widget chrome + party card density */
  fillCell?: boolean;
  /** Present on the live table (DM + TV); omitted in layout editor preview. */
  emit?: (event: string, payload?: unknown) => void;
};
