import type { NormalizedCharacter, PartyCardDisplayOptions } from '@ddb/shared-types';
import ThemedPanel from './ui/ThemedPanel';
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
  const inspired = c.inspired === true;
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
          className="rounded border-[var(--border-strong)]"
          checked={absent}
          onChange={(e) => onAbsentChange(e.target.checked)}
        />
        Absent <span className="text-[var(--muted)] font-normal">(hidden from initiative)</span>
      </label>
    ) : absent ? (
      <p
        className={`text-[var(--warn-status)]/90 ${
          tv ? (density === 'dense' ? 'text-xs' : density === 'compact' ? 'text-xs sm:text-sm' : 'text-sm md:text-base') : 'text-xs'
        }`}
      >
        Absent
      </p>
    ) : undefined;

  return (
    <ThemedPanel
      className={`min-w-0 ${absent ? 'opacity-45 saturate-50' : ''} ${
        inspired ? '!border-amber-400/70 bg-amber-300/10 ring-1 ring-amber-300/70' : ''
      }`}
      contentClassName={`${articlePad} relative`}
    >
      {inspired ? (
        <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-amber-300/70 bg-amber-300/28 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-50">
          INSP
        </span>
      ) : null}
      <PlayerCard
        data={data}
        displayOptions={o}
        large={tv}
        tvDensity={density}
        headerTrailing={headerTrailing}
      />
      {onHpChange && (
        <div className="mt-4 flex flex-wrap gap-2 items-center text-sm border-t border-[var(--border-subtle)] pt-4">
          <label className="flex items-center gap-1">
            HP
            <input
              type="number"
              className="w-20 rounded bg-[var(--surface-elevated)] border border-[var(--border-strong)] px-2 py-1 text-[var(--text)]"
              defaultValue={c.currentHp}
              id={`hp-${c.id}`}
            />
          </label>
          <label className="flex items-center gap-1">
            Temp
            <input
              type="number"
              className="w-20 rounded bg-[var(--surface-elevated)] border border-[var(--border-strong)] px-2 py-1 text-[var(--text)]"
              defaultValue={c.tempHp}
              id={`tmp-${c.id}`}
            />
          </label>
          <button
            type="button"
            className="rounded px-2 py-1 text-white bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)]"
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
    </ThemedPanel>
  );
}
