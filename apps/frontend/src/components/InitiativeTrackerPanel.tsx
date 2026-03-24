import { useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import type {
  InitiativeCombatTag,
  InitiativeEntry,
  InitiativeState,
  PartySnapshot,
  RollMode,
} from '@ddb/shared-types';
import {
  BUILTIN_GENERIC_PLAYER_AVATAR_URL,
  effectiveInitiativeRollMode,
  isInitiativeCombatTag,
} from '@ddb/shared-types';
import { IconEyeOff } from './icons/VisibilityEyes';
import InitiativeDualRollReveal from './initiative/InitiativeDualRollReveal';
import ThemedPanel from './ui/ThemedPanel';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';

const COMBAT_TAG_UI: { tag: InitiativeCombatTag; label: string; short: string }[] = [
  { tag: 'firstNextRound', label: 'Go first next round', short: '1st' },
  { tag: 'lastNextRound', label: 'Go last next round', short: 'Last' },
  { tag: 'advNextAttack', label: 'Initiative advantage — roll 2d20, keep the higher', short: 'Adv' },
  { tag: 'disNextAttack', label: 'Initiative disadvantage — roll 2d20, keep the lower', short: 'Dis' },
];

function combatTagLabel(tag: InitiativeCombatTag): string {
  return COMBAT_TAG_UI.find((x) => x.tag === tag)?.label ?? tag;
}

function toggleCombatTag(current: InitiativeCombatTag[], tag: InitiativeCombatTag): InitiativeCombatTag[] {
  if (current.includes(tag)) {
    return current.filter((t) => t !== tag);
  }
  let next = [...current];
  if (tag === 'firstNextRound') next = next.filter((t) => t !== 'lastNextRound');
  else if (tag === 'lastNextRound') next = next.filter((t) => t !== 'firstNextRound');
  else if (tag === 'advNextAttack') next = next.filter((t) => t !== 'disNextAttack');
  else if (tag === 'disNextAttack') next = next.filter((t) => t !== 'advNextAttack');
  next.push(tag);
  return next;
}

function formatInitiativeRollLine(
  e: InitiativeEntry,
  bd: NonNullable<InitiativeEntry['rollBreakdown']>,
  appliedMod: number,
): string {
  const total = e.initiativeTotal;
  const rolls = bd.rolls;
  if (rolls.length === 0) return `${bd.kept} + ${appliedMod} = ${total}`;

  const mode: RollMode = effectiveInitiativeRollMode(e);
  const multi =
    rolls.length >= 2 || mode === 'advantage' || mode === 'disadvantage';

  if (!multi) {
    return `${bd.kept} + ${appliedMod} = ${total}`;
  }

  const dice = rolls.join(', ');
  if (mode === 'advantage') {
    return `${dice} → ${bd.kept} (adv) + ${appliedMod} = ${total}`;
  }
  if (mode === 'disadvantage') {
    return `${dice} → ${bd.kept} (dis) + ${appliedMod} = ${total}`;
  }
  return `${dice} → ${bd.kept} + ${appliedMod} = ${total}`;
}

/** D&D 5e convention: one combat round ≈ 6 seconds in-world. */
const DND_IN_GAME_SECONDS_PER_ROUND = 6;

function formatInGameCombatDuration(round: number): string {
  const r = Math.max(0, Math.floor(Number(round) || 0));
  const totalSec = r * DND_IN_GAME_SECONDS_PER_ROUND;
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Shown in the TV layout editor when there is no `emit` and the session tracker is empty. */
const LAYOUT_PREVIEW_INIT: InitiativeState = {
  round: 2,
  currentTurnIndex: 0,
  turnOrder: ['demo-rogue', 'demo-cleric', 'demo-tank'],
  markedEntryId: 'demo-cleric',
  entries: {
    'demo-rogue': {
      id: 'demo-rogue',
      entityId: 'demo-rogue',
      label: 'Rogue (sample)',
      initiativeTotal: 18,
      rollMode: 'normal',
      mod: 4,
      dexMod: 4,
      locked: false,
      delayed: false,
      ready: false,
      rollBreakdown: { rolls: [14], kept: 14, mod: 4 },
      conditions: ['Hidden'],
    },
    'demo-cleric': {
      id: 'demo-cleric',
      entityId: 'demo-cleric',
      label: 'Cleric (sample)',
      initiativeTotal: 18,
      rollMode: 'advantage',
      mod: 2,
      dexMod: 1,
      locked: false,
      delayed: false,
      ready: false,
      rollBreakdown: { rolls: [8, 16], kept: 16, mod: 2 },
      conditions: ['Blessed'],
      combatTags: ['firstNextRound', 'advNextAttack'],
    },
    'demo-tank': {
      id: 'demo-tank',
      entityId: 'demo-tank',
      label: 'Fighter (sample)',
      initiativeTotal: 11,
      rollMode: 'normal',
      mod: 1,
      dexMod: 1,
      locked: false,
      delayed: false,
      ready: false,
      rollBreakdown: { rolls: [10], kept: 10, mod: 1 },
      conditions: ['Prone'],
    },
  },
};

function GenericPlayerAvatar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="24" cy="16" r="9" fill="currentColor" fillOpacity="0.35" />
      <path
        d="M8 44c2.5-10 8-14 16-14s13.5 4 16 14"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function resolveRow(e: InitiativeEntry, party: PartySnapshot) {
  const ch = (party.characters ?? []).find((c) => String(c.id) === String(e.entityId));
  const rawAvatar = (ch?.avatarUrl || e.avatarUrl || '').trim();
  const isBuiltinGeneric = rawAvatar === BUILTIN_GENERIC_PLAYER_AVATAR_URL;
  const dexFromEntry = e.dexMod;
  const dexFromParty = ch?.dexterityModifier;
  const dexModForTie =
    dexFromEntry != null && Number.isFinite(dexFromEntry)
      ? dexFromEntry
      : typeof dexFromParty === 'number' && Number.isFinite(dexFromParty)
        ? dexFromParty
        : null;
  return {
    label: ch?.name ?? e.label,
    avatarUrl: rawAvatar,
    isBuiltinGeneric,
    conditions: ch?.conditions?.length ? ch.conditions : (e.conditions ?? []),
    bonus: typeof ch?.initiativeBonus === 'number' ? ch.initiativeBonus : e.mod,
    dexModForTie,
    inspired: ch?.inspired === true,
  };
}

function formatSignedMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

type RowSizeTier = {
  btnPad: string;
  idx: string;
  av: string;
  avBox: string;
  avGenSvg: string;
  initialText: string;
  name: string;
  turnMark: string;
  roll: string;
  total: string;
  lockExtra: string;
  combatBtn: string;
  condSize: 'tv' | 'cozy';
  dualLarge: boolean;
};

function rowSizeTier(large: boolean | undefined, compact: boolean): RowSizeTier {
  if (compact) {
    return {
      btnPad: 'px-2 py-1.5 gap-2',
      idx: 'text-sm w-6',
      av: 'h-10 w-10 md:h-11 md:w-11',
      avBox: 'h-10 w-10 md:h-11 md:w-11',
      avGenSvg: 'h-7 w-7 md:h-8 md:w-8',
      initialText: 'text-lg md:text-xl',
      name: 'text-sm md:text-base',
      turnMark: 'text-xs md:text-sm',
      roll: 'text-[10px] md:text-xs mt-0.5',
      total: 'text-lg md:text-xl',
      lockExtra: 'text-sm',
      combatBtn: 'text-[9px] px-1.5 py-1 min-w-[2rem]',
      condSize: 'cozy',
      dualLarge: false,
    };
  }
  if (large) {
    return {
      btnPad: 'px-4 py-3 md:py-4 gap-3',
      idx: 'text-xl md:text-2xl w-10',
      av: 'h-16 w-16 md:h-20 md:w-20',
      avBox: 'h-16 w-16 md:h-20 md:w-20',
      avGenSvg: 'h-12 w-12 md:h-14 md:w-14',
      initialText: 'text-2xl',
      name: 'text-xl md:text-2xl',
      turnMark: 'text-lg',
      roll: 'text-base md:text-lg mt-1',
      total: 'text-2xl md:text-3xl',
      lockExtra: 'text-base',
      combatBtn: 'text-xs px-2 py-1.5 min-w-[2.75rem]',
      condSize: 'tv',
      dualLarge: true,
    };
  }
  return {
    btnPad: 'px-3 py-2 gap-3',
    idx: 'text-sm w-7',
    av: 'h-12 w-12',
    avBox: 'h-12 w-12',
    avGenSvg: 'h-8 w-8',
    initialText: 'text-lg',
    name: 'text-sm',
    turnMark: 'text-sm',
    roll: 'text-xs mt-0.5',
    total: 'text-lg',
    lockExtra: 'text-sm',
    combatBtn: 'text-[10px] px-1.5 py-1 min-w-[2.25rem]',
    condSize: 'cozy',
    dualLarge: false,
  };
}

export default function InitiativeTrackerPanel({
  init,
  party,
  large,
  emit,
  initiativeRemoteUrl,
  allowCombatCueControls,
  rowDensity,
  onOpenConditionsForCharacter,
  /** Table TV layout: hide the long “New combat / Next round” explainer under the buttons. */
  hideInitiativeControlHints,
}: {
  init: InitiativeState;
  party: PartySnapshot;
  large?: boolean;
  emit?: (event: string, payload?: unknown) => void;
  /** When set (display token URL), DM/TV can show a QR for phone initiative controls. */
  initiativeRemoteUrl?: string | null;
  /**
   * When true with a display socket (e.g. `/initiative-remote/...`), show 1st/Last/Adv/Dis toggles.
   * Kept off on the table TV so combat cues stay DM/phone-only.
   */
  allowCombatCueControls?: boolean;
  /** Denser rows for narrow initiative widget cells (TV). */
  rowDensity?: 'normal' | 'compact';
  hideInitiativeControlHints?: boolean;
  onOpenConditionsForCharacter?: (characterId: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const compact = rowDensity === 'compact';
  const rz = useMemo(() => rowSizeTier(large, compact), [large, compact]);
  const title = compact ? 'text-lg md:text-xl' : large ? 'text-2xl md:text-3xl' : 'text-lg';
  const canAct = typeof emit === 'function';
  const layoutPreview = !canAct;
  const usingPreviewSamples = layoutPreview && init.turnOrder.length === 0;
  const visInit = usingPreviewSamples ? LAYOUT_PREVIEW_INIT : init;
  const markedId = visInit.markedEntryId ?? null;
  const uiMode = useSessionRuntimeStore((s) => s.uiMode);
  const isDisplay = uiMode === 'display';

  const order = visInit.turnOrder.map((id) => visInit.entries[id]).filter(Boolean) as InitiativeEntry[];
  const initiativeTotalCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const id of visInit.turnOrder) {
      const ent = visInit.entries[id];
      if (!ent) continue;
      const t = ent.initiativeTotal;
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [visInit.turnOrder, visInit.entries]);
  const partyCharacterIds = useMemo(
    () => new Set((party.characters ?? []).map((c) => String(c.id))),
    [party.characters],
  );

  const onRowClick = (entryId: string) => {
    if (!canAct) return;
    const next = markedId === entryId ? null : entryId;
    emit!('initiative:markEntry', { entryId: next });
  };

  return (
    <ThemedPanel
      className="flex min-h-0 w-full min-w-0 flex-col"
      contentClassName={`flex flex-col ${compact ? 'p-2 md:p-3' : large ? 'p-5 md:p-6' : 'p-4'}`}
    >
      {layoutPreview && (
        <p
          className={`mb-3 rounded-lg border px-3 py-2 text-[var(--callout-text)] border-[var(--callout-border)] bg-[var(--callout-bg)] ${
            large ? 'text-sm md:text-base' : 'text-xs'
          }`}
          role="note"
        >
          {usingPreviewSamples ? (
            <>
              <strong className="text-[var(--callout-strong)]">Layout editor preview</strong> — sample rows show portraits, bonuses,
              rolls, and conditions. On the <strong className="text-[var(--text)]">display link</strong> or{' '}
              <strong className="text-[var(--text)]">DM console</strong> you get real party data plus New combat / Roll
              all; on the <strong className="text-[var(--text)]">TV</strong> use <strong className="text-[var(--text)]">Next round</strong>, on the{' '}
              <strong className="text-[var(--text)]">DM console</strong> use <strong className="text-[var(--text)]">Next turn</strong>.
            </>
          ) : (
            <>
              <strong className="text-[var(--callout-strong)]">Layout editor</strong> — showing this table&apos;s live initiative. Open
              the TV or DM console to use controls.
            </>
          )}
        </p>
      )}
      <div className={`flex flex-wrap items-start justify-between gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <h2 className={`font-display font-bold text-[var(--accent)] ${title}`}>Initiative tracker</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAct && initiativeRemoteUrl ? (
            <button
              type="button"
              className={`rounded-lg border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-elevated)_80%,transparent)] text-[var(--text)] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                compact ? 'px-2 py-1 text-xs' : large ? 'px-3 py-2 text-sm md:text-base' : 'px-2 py-1 text-xs'
              }`}
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
            >
              {showQr ? 'Hide QR code' : 'Show QR code'}
            </button>
          ) : null}
          <p className={`text-[var(--muted)] ${compact ? 'text-sm' : large ? 'text-lg md:text-xl' : 'text-sm'}`}>
            Round <strong className="text-[var(--text)]">{visInit.round}</strong>
          </p>
        </div>
      </div>
      {canAct && initiativeRemoteUrl && showQr ? (
        <div
          className={`mb-3 flex flex-col items-center gap-3 rounded-[var(--panel-radius)] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-elevated)_75%,transparent)] p-3 ${
            large ? 'p-4 md:p-5' : ''
          }`}
        >
          <div className="rounded-lg bg-white p-2 [&_svg]:block">
            <QRCode value={initiativeRemoteUrl} size={large ? 220 : 180} />
          </div>
          <button
            type="button"
            className={`rounded-lg text-white bg-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] ${large ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'}`}
            onClick={() => void navigator.clipboard?.writeText(initiativeRemoteUrl)}
          >
            Copy link
          </button>
          <p className={`text-center text-[var(--muted)] max-w-md ${large ? 'text-sm' : 'text-xs'}`}>
            This link uses the same token as the table display. Anyone who scans it can also open the full{' '}
            <strong className="text-[var(--text)]">display</strong> URL — treat it like sharing the TV link.
          </p>
        </div>
      ) : null}

      <ol className={`flex-1 min-h-0 ${compact ? 'space-y-1' : large ? 'space-y-3' : 'space-y-2'}`}>
        {order.map((e, idx) => {
          const row = resolveRow(e, party);
          const tieGroupSize = initiativeTotalCounts.get(e.initiativeTotal) ?? 0;
          const showDexTieHint = tieGroupSize >= 2;
          const active =
            !isDisplay && visInit.turnOrder[visInit.currentTurnIndex] === e.id;
          const marked = markedId === e.id;
          const bd = e.rollBreakdown;
          /** Prefer total − d20 so the line matches the big initiative number (breakdown.mod can be stale vs sheet bonus). */
          let appliedMod =
            bd && bd.rolls.length ? e.initiativeTotal - bd.kept : row.bonus;
          if (bd && bd.rolls.length && (!Number.isFinite(appliedMod) || appliedMod < 0)) {
            appliedMod = bd.mod;
          }
          const rollHint =
            bd && bd.rolls.length ? formatInitiativeRollLine(e, bd, appliedMod) : null;

          const entryCombatTags = (e.combatTags ?? []).filter(isInitiativeCombatTag);
          const showCombatCueStrip = canAct && (!isDisplay || Boolean(allowCombatCueControls));
          const effRoll = effectiveInitiativeRollMode(e);
          const initRollGlow =
            effRoll === 'advantage'
              ? 'shadow-[0_0_22px_color-mix(in_srgb,var(--ok)_32%,transparent)]'
              : effRoll === 'disadvantage'
                ? 'shadow-[0_0_22px_color-mix(in_srgb,var(--danger)_28%,transparent)]'
                : '';
          const dualRoll =
            bd && bd.rolls.length === 2
              ? ([bd.rolls[0], bd.rolls[1]] as [number, number])
              : null;
          const dualAnimKey =
            dualRoll != null && bd
              ? `${e.id}-${dualRoll[0]}-${dualRoll[1]}-${bd.kept}-${e.initiativeTotal}`
              : '';

          const showHideFromTableBar =
            canAct && allowCombatCueControls && large && e.entityId && partyCharacterIds.has(String(e.entityId));

          return (
            <li key={e.id}>
              <div
                className={`flex flex-col w-full rounded-[var(--panel-radius)] border transition-colors overflow-hidden ${initRollGlow} ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]/50'
                    : marked
                      ? 'border-[color-mix(in_srgb,var(--warn-status)_55%,transparent)] bg-[color-mix(in_srgb,var(--warn-status)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--warn-status)_35%,transparent)]'
                      : 'border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)]'
                }`}
              >
                <div
                  className={`flex w-full min-w-0 ${allowCombatCueControls ? 'flex-col sm:flex-row' : 'flex-row'}`}
                >
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => onRowClick(e.id)}
                  className={`flex flex-1 min-w-0 items-center text-left hover:bg-white/5 ${rz.btnPad} ${
                    showCombatCueStrip
                      ? allowCombatCueControls
                        ? 'rounded-none sm:rounded-l-xl'
                        : 'rounded-l-xl'
                      : 'rounded-xl'
                  } ${!canAct ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <span className={`shrink-0 font-mono font-bold text-[var(--muted)] ${rz.idx}`}>{idx + 1}</span>
                  {row.isBuiltinGeneric ? (
                    <div
                      className={`rounded-lg bg-white/10 text-slate-300 flex items-center justify-center shrink-0 ${rz.avBox}`}
                    >
                      <GenericPlayerAvatar className={rz.avGenSvg} />
                    </div>
                  ) : row.avatarUrl ? (
                    <img src={row.avatarUrl} alt="" className={`rounded-lg object-cover shrink-0 ${rz.av}`} />
                  ) : (
                    <div
                      className={`rounded-lg bg-white/10 flex items-center justify-center font-display text-[var(--accent)] shrink-0 ${rz.avBox} ${rz.initialText}`}
                    >
                      {row.label.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate text-[var(--text)] ${rz.name}`}>
                      {row.label}
                      {row.inspired ? <span className="ml-2 text-amber-300">★</span> : null}
                      {active && (
                        <span className={`ml-2 text-[var(--accent)] ${rz.turnMark}`}>(turn)</span>
                      )}
                      {marked && !active && (
                        <span className={`ml-2 text-[var(--warn-status)] ${rz.turnMark}`}>(last)</span>
                      )}
                    </div>
                    <div className={`text-[var(--muted)] ${rz.roll}`}>
                      {bd && bd.rolls.length ? (
                        <>
                          <span className="tabular-nums">
                            Roll <strong className="text-[var(--text)]">{rollHint}</strong>
                          </span>
                          {dualRoll && (
                            <InitiativeDualRollReveal
                              rolls={dualRoll}
                              kept={bd.kept}
                              rollMode={effRoll}
                              large={rz.dualLarge}
                              animKey={dualAnimKey}
                            />
                          )}
                          {row.bonus !== appliedMod && (
                            <span className="mt-0.5 block text-[color-mix(in_srgb,var(--warn-status)_88%,transparent)]">
                              Character sheet shows +{row.bonus}; this entry used +{appliedMod} —{' '}
                              <strong className="text-[var(--text)]">New combat</strong> reloads from the party;{' '}
                              {isDisplay ? (
                                <>
                                  <strong className="text-[var(--text)]">Next round</strong> re-rolls with current bonuses.
                                </>
                              ) : (
                                <>use <strong className="text-[var(--text)]">Roll</strong> (DM extras) or fix the row.</>
                              )}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Bonus <strong className="text-[var(--text)] tabular-nums">+{row.bonus}</strong>
                        </>
                      )}
                      {showDexTieHint ? (
                        <span className={`mt-0.5 block tabular-nums text-[var(--muted)] ${compact ? 'text-[10px]' : ''}`}>
                          Tiebreak DEX{' '}
                          <strong className="text-[var(--text)]">
                            {row.dexModForTie != null ? formatSignedMod(row.dexModForTie) : '—'}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                    {entryCombatTags.length > 0 && (
                      <ul
                        className={`flex flex-wrap list-none ${compact ? 'mt-1 gap-0.5' : large ? 'mt-2 gap-2' : 'mt-1.5 gap-1'}`}
                        aria-label="Combat cues"
                      >
                        {entryCombatTags.map((tag) => (
                          <li
                            key={tag}
                            className={`rounded-md border font-medium bg-[color-mix(in_srgb,var(--spell)_22%,transparent)] text-[var(--text)] border-[color-mix(in_srgb,var(--spell)_42%,transparent)] ${
                              compact ? rz.combatBtn : large ? 'px-2.5 py-1 text-xs md:text-sm' : 'px-2 py-0.5 text-[10px] md:text-xs'
                            }`}
                            title={combatTagLabel(tag)}
                          >
                            {COMBAT_TAG_UI.find((x) => x.tag === tag)?.short ?? tag}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.inspired ? (
                      <ul
                        className={`flex flex-wrap list-none ${compact ? 'mt-1 gap-0.5' : large ? 'mt-2 gap-2' : 'mt-1.5 gap-1'}`}
                        aria-label="Inspiration"
                      >
                        <li
                          className={`rounded-md border font-medium bg-amber-500/25 text-amber-50 border-amber-300/60 ${
                            compact ? rz.combatBtn : large ? 'px-2.5 py-1 text-xs md:text-sm' : 'px-2 py-0.5 text-[10px] md:text-xs'
                          }`}
                        >
                          Insp
                        </li>
                      </ul>
                    ) : null}
                  </div>
                  <div className="shrink-0 self-center pr-1 text-right">
                    <div className={rz.total}>
                      <span className="font-mono font-bold text-[var(--text)] tabular-nums">{e.initiativeTotal}</span>
                      {e.locked && <span className={`${rz.lockExtra} ml-1`}>🔒</span>}
                    </div>
                  </div>
                </button>
                {showCombatCueStrip ? (
                  <div
                    className={`shrink-0 flex justify-center gap-1 border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] px-2 py-2 ${
                      allowCombatCueControls
                        ? 'w-full flex-row flex-wrap border-t border-l-0 sm:w-auto sm:flex-nowrap sm:flex-col sm:border-l sm:border-t-0'
                        : 'flex-col border-l'
                    }`}
                    role="group"
                    aria-label="Combat cues and initiative adv/dis"
                  >
                    {COMBAT_TAG_UI.map(({ tag, label, short }) => {
                      const on = entryCombatTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          title={label}
                          onClick={() =>
                            emit!('initiative:setCombatTags', {
                              entryId: e.id,
                              combatTags: toggleCombatTag(entryCombatTags, tag),
                            })
                          }
                          className={`min-w-[2.25rem] rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight transition-colors ${
                            on
                              ? tag === 'advNextAttack'
                                ? 'border-emerald-400/70 bg-emerald-600/30 text-emerald-50'
                                : tag === 'disNextAttack'
                                  ? 'border-rose-400/70 bg-rose-600/25 text-rose-50'
                                  : 'border-violet-400/70 bg-violet-500/35 text-violet-50'
                              : 'border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)]'
                          } ${large ? 'text-xs px-2 py-1.5 min-w-[2.75rem]' : ''}`}
                        >
                          {short}
                        </button>
                      );
                    })}
                    {e.entityId && partyCharacterIds.has(String(e.entityId)) ? (
                      <button
                        type="button"
                        title="Toggle inspiration highlight for this party member"
                        onClick={() =>
                          emit!('party:setInspired', {
                            characterId: String(e.entityId),
                            inspired: !row.inspired,
                          })
                        }
                        className={`min-w-[2.25rem] rounded-md border px-1.5 py-1 text-[10px] font-semibold leading-tight transition-colors ${
                          row.inspired
                            ? 'border-amber-400/75 bg-amber-600/35 text-amber-50'
                            : 'border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)]'
                        } ${large ? 'text-xs px-2 py-1.5 min-w-[2.75rem]' : ''}`}
                      >
                        Insp
                      </button>
                    ) : null}
                  </div>
                ) : null}
                </div>
                {showHideFromTableBar ? (
                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--surface-elevated)_55%,transparent)] px-2 py-1.5">
                    {onOpenConditionsForCharacter ? (
                      <button
                        type="button"
                        title="Edit conditions for this player"
                        aria-label="Edit conditions for this player"
                        className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onOpenConditionsForCharacter(String(e.entityId));
                        }}
                      >
                        <svg className="h-5 w-5 md:h-6 md:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path
                            d="M10.4 2.7h3.2l.5 2.3a7.8 7.8 0 0 1 1.7.7l2-1.2 2.2 2.2-1.2 2a7.8 7.8 0 0 1 .7 1.7l2.3.5v3.2l-2.3.5a7.8 7.8 0 0 1-.7 1.7l1.2 2-2.2 2.2-2-1.2a7.8 7.8 0 0 1-1.7.7l-.5 2.3h-3.2l-.5-2.3a7.8 7.8 0 0 1-1.7-.7l-2 1.2-2.2-2.2 1.2-2a7.8 7.8 0 0 1-.7-1.7l-2.3-.5v-3.2l2.3-.5a7.8 7.8 0 0 1 .7-1.7l-1.2-2 2.2-2.2 2 1.2a7.8 7.8 0 0 1 1.7-.7l.5-2.3z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle cx="12" cy="12" r="2.9" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-8 md:w-9" />
                    )}
                    <button
                      type="button"
                      title="Hide from table and initiative"
                      aria-label="Hide from table and initiative"
                      className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--warn-status)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        emit!('party:setHiddenFromTable', { characterId: e.entityId, hidden: true });
                      }}
                    >
                      <IconEyeOff className="h-5 w-5 md:h-6 md:w-6" />
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!canAct && order.length > 0 ? (
        <div
          className={`mt-3 flex justify-end ${compact ? 'text-xs' : large ? 'text-sm md:text-base' : 'text-xs'}`}
          title="D&D 5e: 6 seconds × current round number (in-world time)"
        >
          <div className="text-right">
            <div className="text-[var(--muted)] leading-tight">Combat Time:</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--text)] leading-tight">
              {formatInGameCombatDuration(visInit.round)}
            </div>
          </div>
        </div>
      ) : null}
      {!usingPreviewSamples && order.length === 0 && (
        <p className={`text-[var(--muted)] ${large ? 'text-lg' : 'text-sm'}`}>
          No combatants — on the <strong className="text-[var(--text)]">display</strong> or{' '}
          <strong className="text-[var(--text)]">DM console</strong> use <strong className="text-[var(--text)]">New combat</strong>{' '}
          to load the party (skips <strong className="text-[var(--text)]">Absent</strong> PCs).
        </p>
      )}
      {canAct && order.length > 0 && (
        <p className={`mt-3 text-[var(--muted)] ${large ? 'text-sm md:text-base' : 'text-xs'}`}>
          Tap a row to mark <strong className="text-[var(--warn-status)]">last</strong> (e.g. before the DM acts). Tap again to
          clear.
        </p>
      )}
      {canAct && (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-[var(--border-subtle)] pt-4">
            <div className={`flex flex-wrap gap-2 ${large ? 'gap-3' : ''}`}>
              <button
                type="button"
                className={`rounded-lg font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] bg-[var(--btn-cta-bg)] hover:bg-[var(--btn-cta-hover)] ${
                  large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                }`}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Are you sure you want to start a new combat? This clears the tracker and re-rolls initiative for the party.',
                    )
                  ) {
                    return;
                  }
                  emit!('initiative:startCombat');
                }}
              >
                New combat
              </button>
              {isDisplay ? (
                <>
                  <button
                    type="button"
                    className={`rounded-lg text-white bg-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] ${
                      large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                    }`}
                    onClick={() => emit!('initiative:prevRound')}
                  >
                    Prev round
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg text-white bg-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] ${
                      large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                    }`}
                    onClick={() => emit!('initiative:nextRound')}
                  >
                    Next round
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={`rounded-lg text-white bg-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] ${
                      large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                    }`}
                    onClick={() => emit!('initiative:prev')}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg text-white bg-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] ${
                      large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                    }`}
                    onClick={() => emit!('initiative:next')}
                  >
                    Next turn
                  </button>
                </>
              )}
            </div>
            {order.length > 0 ? (
              <div
                className={`ml-auto shrink-0 text-right ${compact ? 'text-xs' : large ? 'text-sm md:text-base' : 'text-xs'}`}
                title="D&D 5e: 6 seconds × current round number (in-world time)"
              >
                <div className="text-[var(--muted)] leading-tight">Combat Time:</div>
                <div className="font-mono font-semibold tabular-nums text-[var(--text)] leading-tight">
                  {formatInGameCombatDuration(visInit.round)}
                </div>
              </div>
            ) : null}
          </div>
          {!hideInitiativeControlHints ? (
            <p className={`mt-2 text-[var(--muted)] ${large ? 'text-sm md:text-base' : 'text-xs'}`}>
              <strong className="text-[var(--text)]">New combat</strong> clears the tracker, adds everyone who is not{' '}
              <strong className="text-[var(--text)]">Absent</strong> or <strong className="text-[var(--text)]">hidden</strong>{' '}
              from the table, rolls initiative, and sorts (ties favor higher DEX, then bonus).
              {isDisplay ? (
                <>
                  {' '}
                  <strong className="text-[var(--text)]">Next round</strong> increases the round, re-rolls everyone (including
                  NPCs), sorts again, and returns to the top of the order.
                </>
              ) : (
                <>
                  {' '}
                  <strong className="text-[var(--text)]">Next turn</strong> advances whose turn it is (and ticks timed effects).
                </>
              )}
            </p>
          ) : null}
        </>
      )}
    </ThemedPanel>
  );
}
