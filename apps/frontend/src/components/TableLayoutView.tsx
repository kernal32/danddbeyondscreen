import type { PublicSessionState } from '@ddb/shared-types';
import TableLayoutRenderer from '../layout/TableLayoutRenderer';

export type { TableLayoutRendererProps } from '../layout/TableLayoutRenderer';

export default function TableLayoutView({
  state,
  large = true,
  debugLayout = false,
  className = '',
  fillViewport = false,
  emit,
}: {
  state: PublicSessionState;
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
      large={large}
      debugLayout={debugLayout}
      className={className}
      fillViewport={fillViewport}
      emit={emit}
    />
  );
}
