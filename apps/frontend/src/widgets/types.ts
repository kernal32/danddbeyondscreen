import type { WidgetInstance } from '@ddb/shared-types/layout';
import type { PublicSessionState } from '@ddb/shared-types/session';
import type { SessionUiMode } from '../types/sessionUiMode';

export type WidgetViewProps = {
  instance: WidgetInstance;
  state: PublicSessionState;
  /** Set by layout renderer — do not read `useSessionRuntimeStore` in lazy widgets (avoids chunk↔index TDZ). */
  sessionUiMode: SessionUiMode;
  large?: boolean;
  /** Table display with viewport-fill layout: tighter widget chrome + party card density */
  fillCell?: boolean;
  /**
   * Total rows in the 12-col layout grid (from `tableLayoutRowCount`).
   * Used with {@link WidgetInstance.w} / {@link WidgetInstance.h} so party/initiative density tracks designer cell size.
   */
  layoutRowCount?: number;
  /** Present on the live table (DM + TV); omitted in layout editor preview. */
  emit?: (event: string, payload?: unknown) => void;
};
