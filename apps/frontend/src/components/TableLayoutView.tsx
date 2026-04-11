import type { PublicSessionState } from '@ddb/shared-types/session';
import TableLayoutRenderer from '../layout/TableLayoutRenderer';
import type { SessionUiMode } from '../types/sessionUiMode';

export type { TableLayoutRendererProps } from '../layout/TableLayoutRenderer';

export default function TableLayoutView({
  state,
  sessionUiMode,
  large = true,
  debugLayout = false,
  className = '',
  fillViewport = false,
  emit,
}: {
  state: PublicSessionState;
  sessionUiMode: SessionUiMode;
  large?: boolean;
  debugLayout?: boolean;
  className?: string;
  /** Table display: use full viewport height with proportional rows (e.g. 1920×1080 TV) */
  fillViewport?: boolean;
  emit?: (event: string, payload?: unknown) => void;
}) {
  return (
    <TableLayoutRenderer
      state={state}
      sessionUiMode={sessionUiMode}
      large={large}
      debugLayout={debugLayout}
      className={className}
      fillViewport={fillViewport}
      emit={emit}
    />
  );
}
