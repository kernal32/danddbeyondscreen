import type { PartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import type { PlayerCardLayoutViewModelInput } from '@ddb/shared-types';
import type { PlayerCardData } from '../types';
import type { TvPartyGridDensity } from '../types';

export function buildPlayerCardLayoutViewModel(
  data: PlayerCardData,
  displayOptions: PartyCardDisplayOptions,
  context: { large?: boolean; tvDensity?: TvPartyGridDensity },
): PlayerCardLayoutViewModelInput {
  const merged = mergePartyCardDisplayOptions(displayOptions);
  return {
    data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
    options: JSON.parse(JSON.stringify(merged)) as Record<string, unknown>,
    context: {
      large: !!context.large,
      tvDensity: context.tvDensity ?? null,
    },
  };
}
