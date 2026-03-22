import { mergePartyCardDisplayOptions } from '@ddb/shared-types';
import PartyCard from '../components/PartyCard';
import { tvPartyGridDensityFromCount } from '../components/player-card/types';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import type { WidgetViewProps } from './types';

export default function PartyWidget({ state, large, fillCell, emit }: WidgetViewProps) {
  const uiMode = useSessionRuntimeStore((s) => s.uiMode);
  const displayOptions = mergePartyCardDisplayOptions(state.partyCardDisplay);
  const characters = state.party?.characters ?? [];
  const tvDensity = (() => {
    if (!large) return undefined;
    const base = tvPartyGridDensityFromCount(characters.length);
    if (!fillCell) return base;
    return base === 'cozy' ? 'compact' : 'dense';
  })();
  const gridClass = large
    ? `grid min-w-0 grid-cols-3 ${tvDensity === 'dense' ? 'gap-2' : tvDensity === 'compact' ? 'gap-2 sm:gap-3' : 'gap-3 sm:gap-4'}`
    : 'grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0';

  return (
    <section className={`${gridClass} min-w-0`}>
      {characters.map((c) => (
        <PartyCard
          key={c.id}
          c={c}
          large={large}
          tvDensity={tvDensity}
          displayOptions={displayOptions}
          onAbsentChange={
            emit && uiMode === 'dm'
              ? (absent) => emit('party:setAbsent', { characterId: c.id, absent })
              : undefined
          }
        />
      ))}
      {characters.length === 0 && (
        <p className="text-2xl text-[var(--muted)] col-span-full">No characters — DM can sync from D&D Beyond.</p>
      )}
    </section>
  );
}
