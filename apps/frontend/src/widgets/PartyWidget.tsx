import type { InitiativeEntry } from '@ddb/shared-types/initiative';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import {
  getCombinedCardLayoutConfig,
  getPartyCombinedStretch,
  getPartyHighestRollSide,
  getPartyWidgetView,
} from '@ddb/shared-types/widget-config';
import { shouldRevealInitiativeDetailOnDisplay } from '@ddb/shared-types/initiative';
import { useEffect, useMemo, useState } from 'react';
import PartyCard from '../components/PartyCard';
import { tightenPartyDensityForGridCell, tvPartyGridDensityFromCount } from '../components/player-card/types';
import { useFitContentZoom } from '../hooks/useFitContentZoom';
import { DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY } from '../debug/displayInitiativePrivacy';
import { mapPartyForPartyWidget } from '../util/characterAvatarFallback';
import { buildInitiativeTieNote } from '../util/initiativeTieNote';
import type { WidgetViewProps } from './types';
import TvPartyCombinedColumn from './TvPartyCombinedColumn';
import TvPartyCompactTile from './TvPartyCompactTile';

export default function PartyWidget({
  instance,
  state,
  sessionUiMode,
  large,
  fillCell,
  layoutRowCount,
  emit,
}: WidgetViewProps) {
  const displayOptions = mergePartyCardDisplayOptions(state.partyCardDisplay);
  const characters = useMemo(
    () => mapPartyForPartyWidget(state.party?.characters ?? [], state.initiative),
    [state.party?.characters, state.initiative],
  );
  const partyView = getPartyWidgetView(instance);
  const highestRollSide = getPartyHighestRollSide(instance);
  const combinedLayout = getCombinedCardLayoutConfig(instance);
  const combinedStretch = getPartyCombinedStretch(instance);
  const maskInitOnDisplay =
    !DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY &&
    sessionUiMode === 'display' &&
    state.displayInitiativeMaskTotals === true;
  const revealLowestInit =
    !DEBUG_DISABLE_DISPLAY_INITIATIVE_PRIVACY && state.displayInitiativeRevealLowest === true;

  const initiativeDetailVisibleFor = (init: InitiativeEntry | undefined): boolean => {
    if (!init || !state.initiative) return true;
    return shouldRevealInitiativeDetailOnDisplay(init, state.initiative, {
      maskTotals: maskInitOnDisplay,
      revealLowest: revealLowestInit,
    });
  };

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
      if (layoutRowCount != null && layoutRowCount > 0) {
        base = tightenPartyDensityForGridCell(base, instance.w, instance.h, layoutRowCount);
      }
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
  const { containerRef, contentRef } = useFitContentZoom(fitZoom, [characters.length, tvDensity, partyView]);

  const combinedOrdered = useMemo(() => {
    if (partyView !== 'combined' || !large) return [];
    const charsById = new Map(characters.map((c) => [c.id, c] as const));
    const entries = state.initiative?.entries ?? {};
    const turnOrder = state.initiative?.turnOrder ?? [];
    const used = new Set<string>();
    const ranked: { c: (typeof characters)[number]; init?: (typeof entries)[string] }[] = [];
    for (const entryId of turnOrder) {
      const entry = entries[entryId];
      if (!entry) continue;
      const c = charsById.get(entry.entityId);
      if (!c) continue;
      if (used.has(c.id)) continue;
      used.add(c.id);
      ranked.push({ c, init: entry });
    }
    for (const c of characters) {
      if (used.has(c.id)) continue;
      ranked.push({ c, init: undefined });
    }
    if (highestRollSide === 'right') ranked.reverse();
    return ranked;
  }, [partyView, large, characters, state.initiative, highestRollSide]);

  if (partyView === 'compact' && large) {
    const compactCols =
      characters.length >= 8 ? 'grid-cols-4 sm:grid-cols-5 lg:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5';
    return (
      <section
        ref={containerRef}
        className={`min-w-0 ${fitZoom ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''}`}
      >
        <div
          ref={contentRef}
          className={`grid min-w-0 w-full shrink-0 gap-2 ${compactCols} ${fitZoom ? 'content-start' : ''}`}
        >
          {characters.map((c) => (
            <TvPartyCompactTile key={c.id} c={c} />
          ))}
          {characters.length === 0 && (
            <p className="col-span-full text-lg text-[var(--muted)]">No characters — DM can sync from D&amp;D Beyond.</p>
          )}
        </div>
      </section>
    );
  }

  if (partyView === 'combined' && large) {
    const cols = Math.max(1, combinedOrdered.length || characters.length || 1);
    return (
      <section
        ref={containerRef}
        className={`min-w-0 ${fitZoom ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''}`}
      >
        <div
          ref={contentRef}
          className={`grid h-full min-h-0 min-w-0 w-full shrink-0 gap-2 ${fitZoom ? 'content-start' : ''} ${
            combinedStretch ? 'items-stretch' : 'items-start'
          }`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(200px, 1fr))` }}
        >
          {combinedOrdered.map(({ c, init }) => {
            const initDetail = initiativeDetailVisibleFor(init);
            return (
            <div key={c.id} className={combinedStretch ? 'flex h-full min-h-0 min-w-0 flex-col' : 'min-w-0'}>
              <TvPartyCombinedColumn
                c={c}
                initiative={init}
                layoutConfig={combinedLayout}
                initiativeTieNote={
                  initDetail ? buildInitiativeTieNote(init, state.initiative, characters) : null
                }
                initiativeDetailVisible={initDetail}
                stretch={combinedStretch}
                displayOptions={displayOptions}
              />
            </div>
            );
          })}
          {combinedOrdered.length === 0 && (
            <p className="col-span-full text-lg text-[var(--muted)]">No characters — DM can sync from D&amp;D Beyond.</p>
          )}
        </div>
      </section>
    );
  }

  if (partyView === 'customFull' && large) {
    const entries = state.initiative?.entries ?? {};
    return (
      <section
        ref={containerRef}
        className={`min-w-0 ${fitZoom ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''}`}
      >
        <div
          ref={contentRef}
          className={`${gridClass} min-w-0 w-full shrink-0 ${fitZoom ? 'content-start' : ''} ${
            combinedStretch ? 'items-stretch' : 'items-start'
          }`}
        >
          {characters.map((c) => {
            const init = Object.values(entries).find((e) => e.entityId === c.id);
            const initDetail = initiativeDetailVisibleFor(init);
            return (
              <div key={c.id} className={combinedStretch ? 'flex h-full min-h-0 min-w-0 flex-col' : 'min-w-0'}>
                <TvPartyCombinedColumn
                  c={c}
                  initiative={init}
                  layoutConfig={combinedLayout}
                  initiativeTieNote={
                    initDetail ? buildInitiativeTieNote(init, state.initiative, characters) : null
                  }
                  initiativeDetailVisible={initDetail}
                  stretch={combinedStretch}
                  displayOptions={displayOptions}
                />
              </div>
            );
          })}
          {characters.length === 0 && (
            <p className="col-span-full text-lg text-[var(--muted)]">No characters — DM can sync from D&amp;D Beyond.</p>
          )}
        </div>
      </section>
    );
  }

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
              emit && sessionUiMode === 'dm'
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
