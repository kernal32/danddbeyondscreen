import { useParams } from 'react-router-dom';
import InitiativeTrackerPanel from '../components/InitiativeTrackerPanel';
import { getAppOriginForLinks } from '../util/appOrigin';
import type { WidgetViewProps } from './types';

export default function InitiativeWidget({ state, large, emit }: WidgetViewProps) {
  const { displayToken } = useParams<{ displayToken: string }>();
  const initiativeRemoteUrl =
    displayToken != null && displayToken !== ''
      ? `${getAppOriginForLinks()}/initiative-remote/${encodeURIComponent(displayToken)}`
      : null;

  return (
    <InitiativeTrackerPanel
      init={state.initiative}
      party={state.party}
      large={large}
      emit={emit}
      initiativeRemoteUrl={initiativeRemoteUrl}
    />
  );
}
