import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PartyCardDisplayOptions, PlayerCardSectionId, SpellSlotSummary } from '@ddb/shared-types';
import { effectivePlayerCardSectionOrder } from '@ddb/shared-types';
import type { PlayerCardData, TvPartyGridDensity } from './types';
import { formatConditionLabel } from '../../util/formatConditionLabel';
import {
  IconConditions,
  IconEye,
  IconHeart,
  IconInsight,
  IconSearch,
  IconSparkles,
} from '../party/PartyCardStatIcons';
import ConditionTile from '../conditions/ConditionTile';
import ArmorClassShieldBadge from './ArmorClassShieldBadge';

const SPELL_ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

type SpellSlotTier = 'desktop' | 'tvCozy' | 'tvCompact' | 'tvDense';

type PlayerCardScale = {
  labelSm: string;
  labelMd: string;
  numLg: string;
  numMd: string;
  numSm: string;
  rootSpaceY: string;
  avatarBox: string;
  avatarLetter: string;
  nameTitle: string;
  headerRowGap: string;
  tilePad: string;
  hpMaxSlash: string;
  hpBarH: string;
  movementMaxW: string;
  abilitiesMaxW: string;
  savesMaxW: string;
  senseIcon: string;
  classSummaryLine: string;
  conditionPill: string;
  conditionListGap: string;
  spellSlotTier: SpellSlotTier;
  /** Centered spell save DC / initiative (HP heart current uses {@link acValueNumeral} to match AC) */
  primaryHero: string;
  /** AC shield center numeral and HP heart current (same size) */
  acValueNumeral: string;
  /** Square wrapper for large HP heart / AC shield with overlaid numbers */
  statIconFrame: string;
  /** Small caps lines on DDB-style AC shield ("Armor" / "Class") */
  acShieldCaption: string;
};

function playerCardScale(large: boolean, tvDensity: TvPartyGridDensity | undefined): PlayerCardScale {
  if (!large) {
    return {
      labelSm: 'text-xs text-[var(--muted)]',
      labelMd: 'text-xs text-[var(--muted)]',
      numLg: 'text-xl font-bold tabular-nums',
      numMd: 'text-lg font-bold tabular-nums',
      numSm: 'text-base font-semibold tabular-nums',
      rootSpaceY: 'space-y-4 md:space-y-5',
      avatarBox: 'h-16 w-16 shrink-0 rounded-xl',
      avatarLetter: 'text-2xl',
      nameTitle: 'text-xl',
      headerRowGap: 'gap-4',
      tilePad: 'px-3 py-3',
      hpMaxSlash: 'text-base',
      hpBarH: 'h-2',
      movementMaxW: '',
      abilitiesMaxW: '',
      savesMaxW: '',
      senseIcon: 'h-5 w-5 shrink-0 text-[var(--accent)]',
      classSummaryLine: 'text-base font-medium',
      conditionPill: 'px-3 py-1 text-sm',
      conditionListGap: 'gap-2',
      spellSlotTier: 'desktop',
      primaryHero: 'text-3xl font-bold tabular-nums',
      acValueNumeral: 'text-4xl font-bold tabular-nums',
      statIconFrame: 'h-28 w-28',
      acShieldCaption: 'text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300/95',
    };
  }
  const d = tvDensity ?? 'cozy';
  if (d === 'dense') {
    return {
      labelSm: 'text-[11px] md:text-xs text-[var(--muted)]',
      labelMd: 'text-xs md:text-sm text-[var(--muted)]',
      numLg: 'text-xl md:text-2xl font-bold tabular-nums',
      numMd: 'text-lg md:text-xl font-bold tabular-nums',
      numSm: 'text-base md:text-lg font-semibold tabular-nums',
      rootSpaceY: 'space-y-2 md:space-y-3',
      avatarBox: 'h-14 w-14 md:h-16 md:w-16 shrink-0 rounded-xl',
      avatarLetter: 'text-2xl md:text-3xl',
      nameTitle: 'text-lg md:text-2xl',
      headerRowGap: 'gap-2 md:gap-3',
      tilePad: 'px-2.5 py-2 md:px-3 md:py-3',
      hpMaxSlash: 'text-sm md:text-base',
      hpBarH: 'h-1.5 md:h-2',
      movementMaxW: '',
      abilitiesMaxW: '',
      savesMaxW: '',
      senseIcon: 'h-5 w-5 shrink-0 text-[var(--accent)]',
      classSummaryLine: 'text-sm md:text-base font-medium',
      conditionPill: 'px-2.5 py-1 text-xs md:text-sm',
      conditionListGap: 'gap-1.5',
      spellSlotTier: 'tvDense',
      primaryHero: 'text-2xl md:text-3xl font-bold tabular-nums',
      acValueNumeral: 'text-3xl md:text-4xl font-bold tabular-nums',
      statIconFrame: 'h-[4.25rem] w-[4.25rem] md:h-20 md:w-20',
      acShieldCaption: 'text-[7px] md:text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-300/95',
    };
  }
  if (d === 'compact') {
    return {
      labelSm: 'text-xs md:text-sm text-[var(--muted)]',
      labelMd: 'text-sm md:text-base text-[var(--muted)]',
      numLg: 'text-2xl md:text-3xl font-bold tabular-nums',
      numMd: 'text-xl md:text-2xl font-bold tabular-nums',
      numSm: 'text-lg md:text-xl font-semibold tabular-nums',
      rootSpaceY: 'space-y-3 md:space-y-4',
      avatarBox: 'h-20 w-20 md:h-24 md:w-24 shrink-0 rounded-2xl',
      avatarLetter: 'text-3xl md:text-4xl',
      nameTitle: 'text-2xl md:text-4xl',
      headerRowGap: 'gap-3 md:gap-4',
      tilePad: 'px-3 py-3 md:px-4 md:py-4',
      hpMaxSlash: 'text-lg md:text-xl',
      hpBarH: 'h-2 md:h-2.5',
      movementMaxW: 'max-w-2xl',
      abilitiesMaxW: 'max-w-lg',
      savesMaxW: 'max-w-lg',
      senseIcon: 'h-6 w-6 shrink-0 text-[var(--accent)]',
      classSummaryLine: 'text-base md:text-lg font-medium',
      conditionPill: 'px-3 py-1.5 text-sm md:text-base',
      conditionListGap: 'gap-2',
      spellSlotTier: 'tvCompact',
      primaryHero: 'text-3xl md:text-4xl font-bold tabular-nums',
      acValueNumeral: 'text-4xl md:text-5xl font-bold tabular-nums',
      statIconFrame: 'h-28 w-28 md:h-36 md:w-36',
      acShieldCaption: 'text-[8px] md:text-[9px] font-semibold uppercase tracking-[0.13em] text-sky-300/95',
    };
  }
  return {
    labelSm: 'text-sm md:text-base text-[var(--muted)]',
    labelMd: 'text-base md:text-lg text-[var(--muted)]',
    numLg: 'text-3xl md:text-4xl font-bold tabular-nums',
    numMd: 'text-2xl md:text-3xl font-bold tabular-nums',
    numSm: 'text-xl md:text-2xl font-semibold tabular-nums',
    rootSpaceY: 'space-y-4 md:space-y-5',
    avatarBox: 'h-24 w-24 md:h-28 md:w-28 shrink-0 rounded-2xl',
    avatarLetter: 'text-4xl md:text-5xl',
    nameTitle: 'text-3xl md:text-5xl',
    headerRowGap: 'gap-4 md:gap-5',
    tilePad: 'px-4 py-4 md:px-5 md:py-5',
    hpMaxSlash: 'text-xl md:text-2xl',
    hpBarH: 'h-2.5 md:h-3',
    movementMaxW: 'max-w-2xl',
    abilitiesMaxW: 'max-w-xl',
    savesMaxW: 'max-w-xl',
    senseIcon: 'h-7 w-7 shrink-0 text-[var(--accent)]',
    classSummaryLine: 'text-lg md:text-xl font-medium',
    conditionPill: 'px-4 py-2 text-base md:text-lg',
    conditionListGap: 'gap-3',
    spellSlotTier: 'tvCozy',
    primaryHero: 'text-4xl md:text-5xl font-bold tabular-nums',
    acValueNumeral: 'text-5xl md:text-6xl font-bold tabular-nums',
    statIconFrame: 'h-32 w-32 md:h-40 md:w-40',
    acShieldCaption: 'text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/95',
  };
}

const ABIL_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABIL_LABEL: Record<(typeof ABIL_KEYS)[number], string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function fmtMod(m: number): string {
  return m >= 0 ? `+${m}` : `${m}`;
}

function hpPct(d: PlayerCardData): number {
  const max = Number(d.hp.max);
  const cur = Number(d.hp.current);
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (!Number.isFinite(cur)) return 0;
  return Math.min(1, Math.max(0, cur / max));
}

function hpToneClass(d: PlayerCardData): string {
  const p = hpPct(d);
  if (p <= 0.15) return 'text-red-400';
  if (p <= 0.5) return 'text-amber-300';
  return 'text-emerald-400';
}

function hpBarClass(d: PlayerCardData): string {
  const p = hpPct(d);
  if (p <= 0.15) return 'bg-red-500';
  if (p <= 0.5) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/** Hit point bar + centered `current/max` above it (same vertical footprint as {@link HpBarFootprintSpacer}). */
function HpBarWithFraction({
  d,
  sc,
  visibleFraction,
}: {
  d: PlayerCardData;
  sc: PlayerCardScale;
  /** When false, reserves the same layout with an invisible fraction (column alignment spacers). */
  visibleFraction: boolean;
}) {
  return (
    <div className="flex w-full min-w-0 shrink-0 flex-col items-center gap-0.5 pt-3">
      <div
        className={`w-full text-center tabular-nums ${sc.hpMaxSlash} ${visibleFraction ? 'text-white/90' : 'invisible'}`}
        aria-hidden={!visibleFraction}
      >
        {d.hp.current}/{d.hp.max}
      </div>
      <div className={`${sc.hpBarH} w-full min-w-0 overflow-hidden rounded-full bg-black/40`}>
        <div
          className={`h-full min-w-0 rounded-full transition-[width] duration-300 ease-out ${hpBarClass(d)}`}
          style={{ width: `${hpPct(d) * 100}%` }}
        />
      </div>
    </div>
  );
}

function HpBarFootprintSpacer({ sc }: { sc: PlayerCardScale }) {
  return (
    <div className="mt-auto w-full shrink-0">
      <div className="pointer-events-none flex w-full flex-col items-center gap-0.5 pt-3 select-none" aria-hidden>
        <div className={`invisible w-full text-center tabular-nums ${sc.hpMaxSlash}`}>88/88</div>
        <div className={`${sc.hpBarH} w-full shrink-0`} />
      </div>
    </div>
  );
}

function subtitleLine(d: PlayerCardData): string | null {
  const parts: string[] = [];
  if (d.level != null) parts.push(`Level ${d.level}`);
  if (d.race?.trim()) parts.push(d.race.trim());
  if (d.class?.trim()) parts.push(d.class.trim());
  return parts.length ? parts.join(' ') : null;
}

function hasMovement(d: PlayerCardData): boolean {
  return d.speed != null && d.speed.walk > 0;
}

function hasAbilities(d: PlayerCardData): boolean {
  return d.abilities != null;
}

function hasSaves(d: PlayerCardData): boolean {
  return d.saves != null;
}

function hasClassSummary(d: PlayerCardData, o: PartyCardDisplayOptions): boolean {
  const lines = d.classSummaryLines?.filter(Boolean).length ?? 0;
  const c = d.combat;
  const spellInSummary = c?.spellSaveDC != null && !o.showSpellSaveDC;
  const hasCombat = c != null && (spellInSummary || c.attackBonus != null);
  return lines > 0 || !!d.class?.trim() || hasCombat;
}

function sensesSectionHasContent(d: PlayerCardData, o: PartyCardDisplayOptions): boolean {
  const p = d.passives;
  const passivesOn =
    (o.showPassivePerception && p != null) ||
    (o.showPassiveInvestigation && p != null) ||
    (o.showPassiveInsight && p != null);
  const extra = d.senses && d.senses.length > 0;
  return passivesOn || !!extra;
}

export default function PlayerCard({
  data: d,
  displayOptions: o,
  large,
  tvDensity,
  headerTrailing,
}: {
  data: PlayerCardData;
  displayOptions: PartyCardDisplayOptions;
  large?: boolean;
  /** Table display: shrink typography when the party widget uses a 3×3 / 3×4 grid */
  tvDensity?: TvPartyGridDensity;
  headerTrailing?: ReactNode;
}) {
  const sc = playerCardScale(!!large, tvDensity);
  const order = effectivePlayerCardSectionOrder(o);

  const sections: Record<PlayerCardSectionId, ReactNode | null> = {
    header: renderHeader(d, o, sc, headerTrailing),
    primaryStats: renderPrimaryStats(d, o, sc),
    movement: renderMovement(d, o, sc),
    abilities: renderAbilities(d, o, sc),
    savingThrows: renderSavingThrows(d, o, sc),
    senses: renderSenses(d, o, sc),
    classSummary: renderClassSummary(d, o, sc),
    spellSlots: renderSpellSlots(d, o, sc),
    conditions: renderConditions(d, o, sc),
  };

  return (
    <div className={`min-w-0 ${sc.rootSpaceY}`}>
      {order.map((id) => {
        const node = sections[id];
        return node ? <div key={id}>{node}</div> : null;
      })}
    </div>
  );
}

function renderHeader(
  d: PlayerCardData,
  o: PartyCardDisplayOptions,
  sc: PlayerCardScale,
  headerTrailing: ReactNode | undefined,
): ReactNode | null {
  const showBlock =
    o.showAvatar ||
    o.showCharacterName ||
    o.showLevelRaceClass ||
    o.showPlayerName ||
    headerTrailing;
  if (!showBlock) return null;

  return <PlayerCardHeader d={d} o={o} sc={sc} headerTrailing={headerTrailing} />;
}

/** Keeps the character name vertically within the avatar square by measuring the portrait and shrinking type. */
function PlayerCardHeader({
  d,
  o,
  sc,
  headerTrailing,
}: {
  d: PlayerCardData;
  o: PartyCardDisplayOptions;
  sc: PlayerCardScale;
  headerTrailing: ReactNode | undefined;
}) {
  const avatarWrapRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [avatarH, setAvatarH] = useState(0);

  const sub = subtitleLine(d);
  const initial = d.name.slice(0, 1).toUpperCase();

  useLayoutEffect(() => {
    const node = avatarWrapRef.current;
    if (!node) {
      setAvatarH(0);
      return;
    }
    const measure = () => setAvatarH(Math.ceil(node.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [o.showAvatar, d.avatarUrl, sc.avatarBox]);

  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el || !o.showCharacterName) return;
    if (!o.showAvatar || avatarH <= 0) {
      el.style.fontSize = '';
      return;
    }
    el.style.fontSize = '';
    const start = parseFloat(getComputedStyle(el).fontSize);
    let fs = Number.isFinite(start) ? start : 20;
    el.style.fontSize = `${fs}px`;
    let guard = 0;
    while (el.scrollHeight > avatarH && fs > 8 && guard < 160) {
      fs -= 0.5;
      el.style.fontSize = `${fs}px`;
      guard += 1;
    }
  }, [avatarH, d.name, o.showCharacterName, o.showAvatar, sc.nameTitle]);

  const capNameHeight = o.showAvatar && avatarH > 0;

  return (
    <div className={`flex items-start ${sc.headerRowGap}`}>
      {o.showAvatar && (
        <div ref={avatarWrapRef} className="shrink-0">
          {d.avatarUrl ? (
            <img src={d.avatarUrl} alt="" className={`${sc.avatarBox} object-cover shadow-md border border-white/10`} />
          ) : (
            <div
              className={`${sc.avatarBox} flex items-center justify-center bg-white/5 border border-white/10 font-display text-[var(--accent)] shadow-md ${sc.avatarLetter}`}
            >
              {initial}
            </div>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {o.showCharacterName && (
          <div
            className="min-w-0 overflow-hidden"
            style={capNameHeight ? { height: avatarH } : undefined}
          >
            <h3
              ref={nameRef}
              className={`font-display font-bold text-[var(--text)] min-w-0 break-words leading-[1.08] [overflow-wrap:anywhere] ${sc.nameTitle}`}
            >
              {d.name}
            </h3>
          </div>
        )}
        {o.showLevelRaceClass && sub && (
          <p className={`${sc.labelMd} mt-1 text-[var(--muted)]`}>{sub}</p>
        )}
        {o.showPlayerName && d.playerName?.trim() && (
          <p className={`${sc.labelMd} mt-0.5 text-[var(--muted)]`}>
            Player: <span className="text-[var(--text)]/90">{d.playerName.trim()}</span>
          </p>
        )}
        {headerTrailing ? <div className="mt-2">{headerTrailing}</div> : null}
      </div>
    </div>
  );
}

function renderPrimaryStats(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  const showHp = o.showHitPoints || o.showHitPointsBar;
  const showAc = o.showArmorClass;
  const showDc = o.showSpellSaveDC && d.combat?.spellSaveDC != null;
  const showInit = o.showInitiative && d.initiativeMod != null;
  const third: 'dc' | 'init' | null = showDc ? 'dc' : showInit ? 'init' : null;
  if (!showHp && !showAc && !third) return null;

  const n = Number(showHp) + Number(showAc) + Number(!!third);
  const rowGrid =
    n >= 3 ? 'grid-cols-1 sm:grid-cols-3' : n === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1';

  const tile = `rounded-2xl bg-black/20 shadow-md border border-white/5 ${sc.tilePad}`;
  /** Reserve same bottom band as the HP bar so AC / third column icons line up with the heart. */
  const hpBarFootprint = showHp && o.showHitPointsBar;
  /** Same flex box for heart + shield so both glyphs center identically above the bar / spacer. */
  const primaryIconAreaClass =
    'flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-1 text-center';

  return (
    <div className="space-y-3">
      <div className={`grid min-h-0 gap-3 md:gap-4 ${rowGrid}`}>
        {showHp && (
          <div className={`${tile} flex h-full min-h-0 flex-col`}>
            {o.showHitPoints && (
              <div className={primaryIconAreaClass}>
                <div className={`relative mx-auto shrink-0 ${sc.statIconFrame}`}>
                  <IconHeart
                    className={`pointer-events-none absolute inset-0 h-full w-full ${hpToneClass(d)} opacity-90`}
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-0 z-10 flex -translate-y-[3px] flex-col items-center justify-center gap-0.5 px-1 text-center">
                    <div className={`${sc.acValueNumeral} max-w-full leading-none tabular-nums text-white`}>
                      {d.hp.current}
                    </div>
                    {d.hp.tempHp != null && d.hp.tempHp > 0 && (
                      <div className={`${sc.labelSm} mt-0.5 font-semibold text-sky-400`}>
                        +{d.hp.tempHp} temp
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {o.showHitPoints && !o.showHitPointsBar && (
              <div className={`w-full shrink-0 text-center tabular-nums ${sc.hpMaxSlash} text-white/90`}>
                {d.hp.current}/{d.hp.max}
              </div>
            )}
            {o.showHitPointsBar && (
              <div
                className={
                  o.showHitPoints ? 'mt-auto w-full min-w-0 shrink-0' : 'mt-auto flex w-full min-w-0 flex-1 shrink-0 flex-col justify-end'
                }
              >
                <HpBarWithFraction d={d} sc={sc} visibleFraction />
              </div>
            )}
          </div>
        )}
        {showAc && (
          <div className={`${tile} flex h-full min-h-0 flex-col text-center`}>
            <div className={primaryIconAreaClass}>
              <ArmorClassShieldBadge
                ac={d.ac}
                frameClassName={`relative mx-auto shrink-0 ${sc.statIconFrame}`}
                captionClassName={sc.acShieldCaption}
                valueClassName={`${sc.acValueNumeral} leading-none text-white tabular-nums`}
              />
            </div>
            {hpBarFootprint ? <HpBarFootprintSpacer sc={sc} /> : null}
          </div>
        )}
        {third === 'dc' && (
          <div className={`${tile} flex h-full min-h-0 flex-col text-center`}>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start pt-0.5">
              <div>
                <div className={sc.labelSm}>Spell save DC</div>
                <div className={`${sc.primaryHero} mt-1 text-[var(--text)] tabular-nums`}>{d.combat!.spellSaveDC}</div>
              </div>
            </div>
            {hpBarFootprint ? <HpBarFootprintSpacer sc={sc} /> : null}
          </div>
        )}
        {third === 'init' && (
          <div className={`${tile} flex h-full min-h-0 flex-col text-center`}>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start pt-0.5">
              <div>
                <div className={sc.labelSm}>Initiative</div>
                <div className={`${sc.primaryHero} mt-1 text-[var(--text)] tabular-nums`}>{fmtMod(d.initiativeMod!)}</div>
              </div>
            </div>
            {hpBarFootprint ? <HpBarFootprintSpacer sc={sc} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function renderMovement(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showMovement || !hasMovement(d) || !d.speed) return null;
  const { walk, climb, swim } = d.speed;
  const cols = [walk, climb, swim].filter((x) => x != null && x > 0).length;
  return (
    <div
      className={`grid gap-4 ${cols >= 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1'} ${sc.movementMaxW}`}
    >
      <div className="text-center sm:text-left">
        <div className={sc.labelSm}>Walk</div>
        <div className={`${sc.numSm} text-[var(--text)]`}>{walk} ft</div>
      </div>
      {climb != null && climb > 0 && (
        <div className="text-center sm:text-left">
          <div className={sc.labelSm}>Climb</div>
          <div className={`${sc.numSm} text-[var(--text)]`}>{climb} ft</div>
        </div>
      )}
      {swim != null && swim > 0 && (
        <div className="text-center sm:text-left">
          <div className={sc.labelSm}>Swim</div>
          <div className={`${sc.numSm} text-[var(--text)]`}>{swim} ft</div>
        </div>
      )}
    </div>
  );
}

function renderAbilities(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showAbilities || !hasAbilities(d) || !d.abilities) return null;
  const a = d.abilities;
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-3 ${sc.abilitiesMaxW}`}>
      {ABIL_KEYS.map((k) => {
        const v = a[k];
        const m = abilityMod(v);
        return (
          <div key={k} className="flex items-baseline justify-between gap-2 border-b border-white/5 pb-2">
            <span className={sc.labelSm}>{ABIL_LABEL[k]}</span>
            <span className="text-[var(--text)]">
              <span className={`${sc.numSm} font-mono`}>{v}</span>{' '}
              <span className="text-violet-300 font-semibold">{fmtMod(m)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function renderSavingThrows(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showSavingThrows || !hasSaves(d) || !d.saves) return null;
  const s = d.saves;
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-2 ${sc.savesMaxW}`}>
      {ABIL_KEYS.map((k) => (
        <div key={k} className="flex items-baseline justify-between gap-2">
          <span className={sc.labelSm}>{ABIL_LABEL[k]}</span>
          <span className={`${sc.numSm} text-amber-200/90 font-mono font-semibold`}>{fmtMod(s[k])}</span>
        </div>
      ))}
    </div>
  );
}

function renderSenses(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!sensesSectionHasContent(d, o)) return null;
  const p = d.passives;
  const iconCls = `${sc.senseIcon} shrink-0`;
  const showPerc = !!(p && o.showPassivePerception);
  const showInv = !!(p && o.showPassiveInvestigation);
  const showIns = !!(p && o.showPassiveInsight);
  const passiveCount = Number(showPerc) + Number(showInv) + Number(showIns);
  const numPassive = sc.numSm;

  return (
    <div className="space-y-2">
      {passiveCount > 0 && p && (
        <div
          className={`grid min-w-0 items-center gap-x-1 gap-y-1 ${
            passiveCount >= 3 ? 'grid-cols-3' : passiveCount === 2 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {showPerc && (
            <div
              className="flex min-w-0 items-center justify-center gap-1.5"
              role="group"
              aria-label={`Passive Perception ${p.perception}`}
            >
              <IconEye className={iconCls} aria-hidden />
              <span className={`${numPassive} font-bold tabular-nums text-[var(--text)]`}>{p.perception}</span>
            </div>
          )}
          {showInv && (
            <div
              className="flex min-w-0 items-center justify-center gap-1.5"
              role="group"
              aria-label={`Passive Investigation ${p.investigation}`}
            >
              <IconSearch className={iconCls} aria-hidden />
              <span className={`${numPassive} font-bold tabular-nums text-[var(--text)]`}>{p.investigation}</span>
            </div>
          )}
          {showIns && (
            <div
              className="flex min-w-0 items-center justify-center gap-1.5"
              role="group"
              aria-label={`Passive Insight ${p.insight}`}
            >
              <IconInsight className={iconCls} aria-hidden />
              <span className={`${numPassive} font-bold tabular-nums text-[var(--text)]`}>{p.insight}</span>
            </div>
          )}
        </div>
      )}
      {d.senses && d.senses.length > 0 && (
        <ul className={`space-y-1 ${sc.labelSm} text-[var(--muted)]`}>
          {d.senses.map((s) => (
            <li key={s} className="text-[var(--text)]/85">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderClassSummary(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showClassCombatSummary || !hasClassSummary(d, o)) return null;
  const lines = d.classSummaryLines?.filter(Boolean) ?? [];
  const primaryClass = d.class?.trim();
  const c = d.combat;
  return (
    <div className="space-y-2 rounded-2xl border border-white/5 bg-black/15 px-4 py-3 shadow-sm">
      {lines.map((line) => (
        <p key={line} className={`text-[var(--text)] ${sc.classSummaryLine}`}>
          {line}
        </p>
      ))}
      {!lines.length && primaryClass && (
        <p className={`text-[var(--text)] ${sc.classSummaryLine}`}>{primaryClass}</p>
      )}
      {c?.spellSaveDC != null && !o.showSpellSaveDC && (
        <p className={sc.labelSm}>
          Spell save DC:{' '}
          <span className={`${sc.numSm} text-[var(--text)] inline`}>{c.spellSaveDC}</span>
        </p>
      )}
      {c?.attackBonus != null && (
        <p className={sc.labelSm}>
          Attack bonus:{' '}
          <span className={`${sc.numSm} text-[var(--text)] inline`}>{fmtMod(c.attackBonus)}</span>
        </p>
      )}
    </div>
  );
}

function renderSpellSlots(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showSpellSlots || !d.spellSlots?.length) return null;
  return <SpellSlotsRow slots={d.spellSlots} tier={sc.spellSlotTier} />;
}

function SpellSlotsRow({ slots, tier }: { slots: SpellSlotSummary[]; tier: SpellSlotTier }) {
  const sorted = [...slots].sort((a, b) => a.level - b.level);
  const head =
    tier === 'desktop'
      ? { mb: 'mb-1', icon: 'h-5 w-5 shrink-0 text-violet-400', title: 'text-sm font-semibold' }
      : tier === 'tvDense'
        ? { mb: 'mb-1', icon: 'h-5 w-5 shrink-0 text-violet-400', title: 'text-xs md:text-sm font-display text-[var(--accent)]' }
        : tier === 'tvCompact'
          ? { mb: 'mb-1.5', icon: 'h-6 w-6 shrink-0 text-violet-400', title: 'text-sm md:text-base font-display text-[var(--accent)]' }
          : { mb: 'mb-2', icon: 'h-7 w-7 shrink-0 text-violet-400', title: 'text-lg md:text-xl font-display text-[var(--accent)]' };
  const gap = tier === 'desktop' || tier === 'tvDense' ? 'gap-2' : tier === 'tvCompact' ? 'gap-2 md:gap-2.5' : 'gap-3';
  const pill =
    tier === 'desktop'
      ? 'px-2.5 py-1.5 text-sm'
      : tier === 'tvDense'
        ? 'px-2 py-1 text-xs md:text-sm'
        : tier === 'tvCompact'
          ? 'px-3 py-1.5 text-sm md:text-base'
          : 'px-4 py-2.5 text-lg md:text-xl';
  const barW = tier === 'desktop' || tier === 'tvDense' ? 'max-w-16' : tier === 'tvCompact' ? 'max-w-[4rem] md:max-w-[4.25rem]' : 'max-w-[4.5rem]';

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`flex items-center justify-center gap-2 ${head.mb} text-[var(--muted)]`}>
        <IconSparkles className={head.icon} />
        <span className={head.title}>Spell slots</span>
      </div>
      <ul className={`flex flex-wrap justify-center ${gap}`}>
        {sorted.map((s) => {
          const left = Math.max(0, s.available - s.used);
          if (s.available <= 0 && s.used <= 0) return null;
          const label = SPELL_ORD[s.level] ?? `${s.level}`;
          return (
            <li key={s.level} className={`rounded-xl bg-black/25 shadow-sm border border-white/10 ${pill}`}>
              <span className="text-[var(--muted)]">{label}</span>{' '}
              <span className="font-mono font-semibold text-[var(--text)]">
                {left}/{s.available}
              </span>
              <div className={`mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden ${barW}`}>
                <div
                  className="h-full bg-violet-500/80 rounded-full"
                  style={{ width: s.available > 0 ? `${(left / s.available) * 100}%` : '0%' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function conditionTileSizeForCard(tier: SpellSlotTier): 'compact' | 'cozy' | 'tv' {
  if (tier === 'desktop') return 'cozy';
  if (tier === 'tvDense') return 'compact';
  if (tier === 'tvCompact') return 'cozy';
  return 'tv';
}

function renderConditions(d: PlayerCardData, o: PartyCardDisplayOptions, sc: PlayerCardScale): ReactNode | null {
  if (!o.showConditions || !d.conditions?.length) return null;
  const rawList = d.conditions.filter((x) => formatConditionLabel(x as unknown).trim());
  if (!rawList.length) return null;
  const tier = sc.spellSlotTier;
  const head =
    tier === 'desktop'
      ? { mb: 'mb-1', icon: 'h-5 w-5 shrink-0 text-amber-300', title: 'text-sm font-semibold' }
      : tier === 'tvDense'
        ? { mb: 'mb-1', icon: 'h-5 w-5 shrink-0 text-amber-300', title: 'text-xs md:text-sm font-display text-[var(--accent)]' }
        : tier === 'tvCompact'
          ? { mb: 'mb-1.5', icon: 'h-6 w-6 shrink-0 text-amber-300', title: 'text-sm md:text-base font-display text-[var(--accent)]' }
          : { mb: 'mb-2', icon: 'h-7 w-7 shrink-0 text-amber-300', title: 'text-lg md:text-xl font-display text-[var(--accent)]' };
  const gap =
    tier === 'desktop' || tier === 'tvDense' ? 'gap-2' : tier === 'tvCompact' ? 'gap-2 md:gap-2.5' : 'gap-3';
  const tileSize = conditionTileSizeForCard(tier);

  return (
    <div className="flex flex-col items-center text-center">
      <div className={`flex items-center justify-center gap-2 ${head.mb} text-[var(--muted)]`}>
        <IconConditions className={head.icon} />
        <span className={head.title}>Conditions</span>
      </div>
      <ul className={`flex flex-wrap justify-center ${gap}`}>
        {rawList.map((raw, i) => (
          <ConditionTile key={`${formatConditionLabel(raw)}-${i}`} raw={raw} size={tileSize} />
        ))}
      </ul>
    </div>
  );
}
