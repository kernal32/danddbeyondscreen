import { useParams } from 'react-router-dom';
import InitiativeTrackerPanel from '../components/InitiativeTrackerPanel';
import { getAppOriginForLinks } from '../util/appOrigin';
import { getInitiativeWidgetDensity } from '@ddb/shared-types/widget-config';
import type { WidgetViewProps } from './types';

export default function InitiativeWidget({ instance, state, sessionUiMode, large, emit }: WidgetViewProps) {
  const { displayToken } = useParams<{ displayToken: string }>();
  const initiativeRemoteUrl =
    displayToken != null && displayToken !== ''
      ? `${getAppOriginForLinks()}/initiative-remote/${encodeURIComponent(displayToken)}`
      : null;

  const rowDensity = getInitiativeWidgetDensity(instance);

  return (
    <InitiativeTrackerPanel
      init={state.initiative}
      party={state.party}
      sessionUiMode={sessionUiMode}
      large={large}
      emit={emit}
      initiativeRemoteUrl={initiativeRemoteUrl}
      rowDensity={rowDensity}
      hideInitiativeControlHints
      displayInitiativeMaskTotals={state.displayInitiativeMaskTotals === true}
      displayInitiativeRevealLowest={state.displayInitiativeRevealLowest === true}
    />
  );
}
