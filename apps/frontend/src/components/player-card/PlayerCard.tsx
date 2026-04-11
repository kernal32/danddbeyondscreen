import type { PartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { validatePlayerCardLayoutSchema } from '@ddb/shared-types';
import type { ReactNode } from 'react';
import type { PlayerCardData, TvPartyGridDensity } from './types';
import PlayerCardCanvas from './layout/PlayerCardCanvas';
import { buildPlayerCardLayoutViewModel } from './layout/playerCardLayoutViewModel';
import PlayerCardLegacy from './PlayerCardLegacy';

export default function PlayerCard({
  data,
  displayOptions,
  large,
  tvDensity,
  headerTrailing,
}: {
  data: PlayerCardData;
  displayOptions: PartyCardDisplayOptions;
  large?: boolean;
  tvDensity?: TvPartyGridDensity;
  headerTrailing?: ReactNode;
}) {
  const mode = displayOptions.playerCardLayoutMode;
  const rawSchema = displayOptions.playerCardLayoutSchema;

  if (mode === 'schema' && rawSchema != null) {
    const validated = validatePlayerCardLayoutSchema(rawSchema);
    if (validated.ok) {
      const viewModel = buildPlayerCardLayoutViewModel(data, displayOptions, { large, tvDensity });
      return <PlayerCardCanvas schema={validated.schema} viewModel={viewModel} className="min-w-0" />;
    }
  }

  return (
    <PlayerCardLegacy
      data={data}
      displayOptions={displayOptions}
      large={large}
      tvDensity={tvDensity}
      headerTrailing={headerTrailing}
    />
  );
}
