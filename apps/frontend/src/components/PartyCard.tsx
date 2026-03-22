import type { NormalizedCharacter, PartyCardDisplayOptions } from '@ddb/shared-types';
import PlayerCard from './player-card/PlayerCard';
import { normalizedCharacterToPlayerCardData } from './player-card/mapPlayerCardData';
import type { TvPartyGridDensity } from './player-card/types';

export default function PartyCard({
  c,
  large,
  tvDensity,
  onHpChange,
  displayOptions,
  onAbsentChange,
}: {
  c: NormalizedCharacter;
  large?: boolean;
  /** Table display only — scales typography when many cards in a 3-column grid */
  tvDensity?: TvPartyGridDensity;
  onHpChange?: (id: string, currentHp: number, tempHp: number) => void;
  displayOptions: PartyCardDisplayOptions;
  onAbsentChange?: (absent: boolean) => void;
}) {
  const o = displayOptions;
  const absent = !!c.absent;
  const tv = !!large;
  const data = normalizedCharacterToPlayerCardData(c);
  const density = tv ? (tvDensity ?? 'cozy') : undefined;

  const articlePad = tv
    ? density === 'dense'
      ? 'p-2 sm:p-3'
      : density === 'compact'
        ? 'p-3 sm:p-4 md:p-5'
        : 'p-6 md:p-8'
    : 'p-4';

  const headerTrailing =
    onAbsentChange != null ? (
      <label
        className={`flex items-center gap-2 cursor-pointer select-none text-[var(--muted)] ${
          tv
            ? density === 'dense'
              ? 'text-xs sm:text-sm'
              : density === 'compact'
                ? 'text-sm md:text-base'
                : 'text-base md:text-lg'
            : 'text-sm'
        }`}
      >
        <input
          type="checkbox"
          className="rounded border-white/30"
          checked={absent}
          onChange={(e) => onAbsentChange(e.target.checked)}
        />
        Absent <span className="text-[var(--muted)] font-normal">(hidden from initiative)</span>
      </label>
    ) : absent ? (
      <p
        className={`text-amber-300/90 ${
          tv ? (density === 'dense' ? 'text-xs' : density === 'compact' ? 'text-xs sm:text-sm' : 'text-sm md:text-base') : 'text-xs'
        }`}
      >
        Absent
      </p>
    ) : undefined;

  return (
    <article
      className={`rounded-xl border border-white/10 bg-[var(--surface)] shadow-lg min-w-0 ${articlePad} ${
        absent ? 'opacity-45 saturate-50 border-white/5' : ''
      }`}
    >
      <PlayerCard
        data={data}
        displayOptions={o}
        large={tv}
        tvDensity={density}
        headerTrailing={headerTrailing}
      />
      {onHpChange && (
        <div className="mt-4 flex flex-wrap gap-2 items-center text-sm border-t border-white/10 pt-4">
          <label className="flex items-center gap-1">
            HP
            <input
              type="number"
              className="w-20 rounded bg-black/30 border border-white/20 px-2 py-1"
              defaultValue={c.currentHp}
              id={`hp-${c.id}`}
            />
          </label>
          <label className="flex items-center gap-1">
            Temp
            <input
              type="number"
              className="w-20 rounded bg-black/30 border border-white/20 px-2 py-1"
              defaultValue={c.tempHp}
              id={`tmp-${c.id}`}
            />
          </label>
          <button
            type="button"
            className="rounded bg-sky-700 px-2 py-1 text-white"
            onClick={() => {
              const hp = Number((document.getElementById(`hp-${c.id}`) as HTMLInputElement).value);
              const tmp = Number((document.getElementById(`tmp-${c.id}`) as HTMLInputElement).value);
              onHpChange(c.id, hp, tmp);
            }}
          >
            Apply
          </button>
        </div>
      )}
    </article>
  );
}
