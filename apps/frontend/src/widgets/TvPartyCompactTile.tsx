import type { NormalizedCharacter } from '@ddb/shared-types';
import { BUILTIN_GENERIC_PLAYER_AVATAR_URL } from '@ddb/shared-types';
import { normalizedCharacterToPlayerCardData } from '../components/player-card/mapPlayerCardData';

function hpPct(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, current / max));
}

function hpBarTone(current: number, max: number): string {
  const p = hpPct(current, max);
  if (p <= 0) return 'bg-[color-mix(in_srgb,var(--danger)_70%,transparent)]';
  if (p <= 0.25) return 'bg-[color-mix(in_srgb,var(--danger)_55%,transparent)]';
  if (p <= 0.5) return 'bg-[var(--hp-bar-mid)]';
  return 'bg-[color-mix(in_srgb,var(--ok)_55%,transparent)]';
}

export default function TvPartyCompactTile({ c }: { c: NormalizedCharacter }) {
  const d = normalizedCharacterToPlayerCardData(c);
  const avatarUrl = (d.avatarUrl || '').trim();
  const showImg = avatarUrl && avatarUrl !== BUILTIN_GENERIC_PLAYER_AVATAR_URL;
  const initial = d.name.slice(0, 1).toUpperCase();
  const cur = d.hp.current;
  const maxHp = d.hp.max;
  const pct = hpPct(cur, maxHp);
  const inspired = c.inspired === true;

  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] p-1.5 ${
        inspired ? '!border-amber-400/75 bg-amber-300/10 ring-1 ring-amber-300/70' : ''
      }`}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {showImg ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-md border border-[var(--border-subtle)] object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] font-display text-sm text-[var(--accent)]">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-tight text-[var(--text)]" title={d.name}>
            {d.name}
            {inspired ? <span className="ml-1 text-amber-300">★</span> : null}
          </p>
          {inspired ? (
            <p className="mt-0.5 inline-flex rounded-full border border-amber-300/70 bg-amber-300/22 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-50">
              INSP
            </p>
          ) : null}
          <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
            AC{' '}
            <span className="text-[var(--text)]">{d.ac != null && Number.isFinite(d.ac) ? d.ac : '—'}</span>
          </p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-center text-[9px] tabular-nums text-[var(--text)]/90">
          {cur}/{maxHp}
        </p>
        <div className="mt-0.5 h-1 w-full min-w-0 overflow-hidden rounded-full bg-black/40">
          <div
            className={`h-full min-w-0 rounded-full transition-[width] duration-300 ease-out ${hpBarTone(cur, maxHp)}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
