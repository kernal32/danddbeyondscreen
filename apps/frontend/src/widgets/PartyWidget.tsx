import { mergePartyCardDisplayOptions } from '@ddb/shared-types';
import { useEffect, useState } from 'react';
import PartyCard from '../components/PartyCard';
import { tvPartyGridDensityFromCount } from '../components/player-card/types';
import { useFitContentZoom } from '../hooks/useFitContentZoom';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import type { WidgetViewProps } from './types';

export default function PartyWidget({ state, large, fillCell, emit }: WidgetViewProps) {
  const uiMode = useSessionRuntimeStore((s) => s.uiMode);
  const displayOptions = mergePartyCardDisplayOptions(state.partyCardDisplay);
  const characters = state.party?.characters ?? [];

  const [shortViewport, setShortViewport] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !fillCell) return;
    const mq = window.matchMedia('(max-height: 1050px)');
    const on = () => setShortViewport(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [fillCell]);

  const tvDensity = (() => {
    if (!large) return undefined;
    let base = tvPartyGridDensityFromCount(characters.length);
    if (fillCell) {
      base = base === 'cozy' ? 'compact' : 'dense';
    }
    if (fillCell && shortViewport && base === 'compact') {
      base = 'dense';
    }
    return base;
  })();

  const gridClass = large
    ? `grid min-w-0 grid-cols-3 ${tvDensity === 'dense' ? 'gap-2' : tvDensity === 'compact' ? 'gap-2 sm:gap-3' : 'gap-3 sm:gap-4'}`
    : 'grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0';

  const fitZoom = Boolean(fillCell && large);
  const { containerRef, contentRef } = useFitContentZoom(fitZoom, [characters.length, tvDensity]);

  return (
    <section
      ref={containerRef}
      className={`min-w-0 ${fitZoom ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''}`}
    >
      <div ref={contentRef} className={`${gridClass} min-w-0 w-full shrink-0`}>
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
      </div>
    </section>
  );
}
