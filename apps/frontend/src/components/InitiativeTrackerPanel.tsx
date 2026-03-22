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
import ConditionTile from './conditions/ConditionTile';
import InitiativeDualRollReveal from './initiative/InitiativeDualRollReveal';
import { useSessionRuntimeStore } from '../stores/sessionRuntimeStore';
import { formatConditionLabel } from '../util/formatConditionLabel';

const COMBAT_TAG_UI: { tag: InitiativeCombatTag; label: string; short: string }[] = [
  { tag: 'firstNextRound', label: 'Go first next round', short: '1st' },
  { tag: 'lastNextRound', label: 'Go last next round', short: 'Last' },
  { tag: 'advNextAttack', label: 'Initiative advantage — roll 2d20, keep the higher', short: 'Adv' },
  { tag: 'disNextAttack', label: 'Initiative disadvantage — roll 2d20, keep the lower', short: 'Dis' },
];

function combatTagLabel(tag: InitiativeCombatTag): string {
  return COMBAT_TAG_UI.find((x) => x.tag === tag)?.label ?? tag;
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 10-4.24-4.24"
      />
      <path strokeLinecap="round" d="M1 1l22 22" />
    </svg>
  );
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
      initiativeTotal: 17,
      rollMode: 'advantage',
      mod: 2,
      locked: false,
      delayed: false,
      ready: false,
      rollBreakdown: { rolls: [8, 15], kept: 15, mod: 2 },
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
  return {
    label: ch?.name ?? e.label,
    avatarUrl: rawAvatar,
    isBuiltinGeneric,
    conditions: ch?.conditions?.length ? ch.conditions : (e.conditions ?? []),
    bonus: typeof ch?.initiativeBonus === 'number' ? ch.initiativeBonus : e.mod,
  };
}

export default function InitiativeTrackerPanel({
  init,
  party,
  large,
  emit,
  initiativeRemoteUrl,
  allowCombatCueControls,
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
}) {
  const [showQr, setShowQr] = useState(false);
  const title = large ? 'text-2xl md:text-3xl' : 'text-lg';
  const canAct = typeof emit === 'function';
  const layoutPreview = !canAct;
  const usingPreviewSamples = layoutPreview && init.turnOrder.length === 0;
  const visInit = usingPreviewSamples ? LAYOUT_PREVIEW_INIT : init;
  const markedId = visInit.markedEntryId ?? null;
  const uiMode = useSessionRuntimeStore((s) => s.uiMode);
  const isDisplay = uiMode === 'display';

  const order = visInit.turnOrder.map((id) => visInit.entries[id]).filter(Boolean) as InitiativeEntry[];
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
    <div
      className={`rounded-xl border border-white/10 bg-[var(--surface)] p-4 flex flex-col ${large ? 'p-5 md:p-6' : ''}`}
    >
      {layoutPreview && (
        <p
          className={`mb-3 rounded-lg border border-cyan-500/35 bg-cyan-950/25 px-3 py-2 text-[var(--muted)] ${
            large ? 'text-sm md:text-base' : 'text-xs'
          }`}
          role="note"
        >
          {usingPreviewSamples ? (
            <>
              <strong className="text-cyan-200">Layout editor preview</strong> — sample rows show portraits, bonuses,
              rolls, and conditions. On the <strong className="text-[var(--text)]">display link</strong> or{' '}
              <strong className="text-[var(--text)]">DM console</strong> you get real party data plus Begin combat / Roll
              all; on the <strong className="text-[var(--text)]">TV</strong> use <strong className="text-[var(--text)]">Next round</strong>, on the{' '}
              <strong className="text-[var(--text)]">DM console</strong> use <strong className="text-[var(--text)]">Next turn</strong>.
            </>
          ) : (
            <>
              <strong className="text-cyan-200">Layout editor</strong> — showing this table&apos;s live initiative. Open
              the TV or DM console to use controls.
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <h2 className={`font-display font-bold text-[var(--accent)] ${title}`}>Initiative tracker</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAct && initiativeRemoteUrl ? (
            <button
              type="button"
              className={`rounded-lg border border-white/20 bg-black/25 text-[var(--text)] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                large ? 'px-3 py-2 text-sm md:text-base' : 'px-2 py-1 text-xs'
              }`}
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
            >
              {showQr ? 'Hide QR code' : 'Show QR code'}
            </button>
          ) : null}
          <p className={`text-[var(--muted)] ${large ? 'text-lg md:text-xl' : 'text-sm'}`}>
            Round <strong className="text-[var(--text)]">{visInit.round}</strong>
          </p>
        </div>
      </div>
      {canAct && initiativeRemoteUrl && showQr ? (
        <div
          className={`mb-3 rounded-xl border border-white/15 bg-black/30 p-3 flex flex-col items-center gap-3 ${
            large ? 'p-4 md:p-5' : ''
          }`}
        >
          <div className="rounded-lg bg-white p-2 [&_svg]:block">
            <QRCode value={initiativeRemoteUrl} size={large ? 220 : 180} />
          </div>
          <button
            type="button"
            className={`rounded-lg bg-slate-600 text-white ${large ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'}`}
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

      <ol className={`space-y-2 flex-1 min-h-0 ${large ? 'space-y-3' : ''}`}>
        {order.map((e, idx) => {
          const row = resolveRow(e, party);
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
              ? 'shadow-[0_0_22px_rgba(52,211,153,0.3)]'
              : effRoll === 'disadvantage'
                ? 'shadow-[0_0_22px_rgba(248,113,113,0.28)]'
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
                className={`flex flex-col w-full rounded-xl border transition-colors overflow-hidden ${initRollGlow} ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 ring-2 ring-[var(--accent)]/50'
                    : marked
                      ? 'border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-400/40'
                      : 'border-white/10 bg-black/20'
                }`}
              >
                <div
                  className={`flex w-full min-w-0 ${allowCombatCueControls ? 'flex-col sm:flex-row' : 'flex-row'}`}
                >
                <button
                  type="button"
                  disabled={!canAct}
                  onClick={() => onRowClick(e.id)}
                  className={`flex flex-1 min-w-0 gap-3 items-center text-left px-3 py-2 hover:bg-white/5 ${
                    showCombatCueStrip
                      ? allowCombatCueControls
                        ? 'rounded-none sm:rounded-l-xl'
                        : 'rounded-l-xl'
                      : 'rounded-xl'
                  } ${large ? 'py-3 md:py-4 px-4' : ''} ${!canAct ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <span
                    className={`shrink-0 font-mono font-bold text-[var(--muted)] ${large ? 'text-xl md:text-2xl w-10' : 'text-sm w-7'}`}
                  >
                    {idx + 1}
                  </span>
                  {row.isBuiltinGeneric ? (
                    <div
                      className={`rounded-lg bg-white/10 text-slate-300 flex items-center justify-center shrink-0 ${
                        large ? 'h-16 w-16 md:h-20 md:w-20' : 'h-12 w-12'
                      }`}
                    >
                      <GenericPlayerAvatar className={large ? 'h-12 w-12 md:h-14 md:w-14' : 'h-8 w-8'} />
                    </div>
                  ) : row.avatarUrl ? (
                    <img
                      src={row.avatarUrl}
                      alt=""
                      className={`rounded-lg object-cover shrink-0 ${large ? 'h-16 w-16 md:h-20 md:w-20' : 'h-12 w-12'}`}
                    />
                  ) : (
                    <div
                      className={`rounded-lg bg-white/10 flex items-center justify-center font-display text-[var(--accent)] shrink-0 ${
                        large ? 'h-16 w-16 md:h-20 md:w-20 text-2xl' : 'h-12 w-12 text-lg'
                      }`}
                    >
                      {row.label.slice(0, 1)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate text-[var(--text)] ${large ? 'text-xl md:text-2xl' : ''}`}>
                      {row.label}
                      {active && (
                        <span className={`ml-2 text-[var(--accent)] ${large ? 'text-lg' : 'text-sm'}`}>(turn)</span>
                      )}
                      {marked && !active && (
                        <span className={`ml-2 text-amber-300 ${large ? 'text-lg' : 'text-sm'}`}>(last)</span>
                      )}
                    </div>
                    <div className={`text-[var(--muted)] ${large ? 'text-base md:text-lg mt-1' : 'text-xs mt-0.5'}`}>
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
                              large={large}
                              animKey={dualAnimKey}
                            />
                          )}
                          {row.bonus !== appliedMod && (
                            <span className="block text-amber-200/90 mt-0.5">
                              Character sheet shows +{row.bonus}; this entry used +{appliedMod} —{' '}
                              <strong className="text-[var(--text)]">Begin combat</strong> reloads from the party;{' '}
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
                    </div>
                    {entryCombatTags.length > 0 && (
                      <ul
                        className={`flex flex-wrap gap-1 mt-1.5 list-none ${large ? 'gap-2 mt-2' : ''}`}
                        aria-label="Combat cues"
                      >
                        {entryCombatTags.map((tag) => (
                          <li
                            key={tag}
                            className={`rounded-md bg-violet-500/20 text-violet-100 border border-violet-400/45 font-medium ${
                              large ? 'px-2.5 py-1 text-xs md:text-sm' : 'px-2 py-0.5 text-[10px] md:text-xs'
                            }`}
                            title={combatTagLabel(tag)}
                          >
                            {COMBAT_TAG_UI.find((x) => x.tag === tag)?.short ?? tag}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.conditions.length > 0 && (
                      <ul className={`flex flex-wrap mt-1.5 list-none ${large ? 'gap-2 mt-2' : 'gap-1.5'}`}>
                        {row.conditions.map((c, ci) => {
                          if (!formatConditionLabel(c as unknown).trim()) return null;
                          return <ConditionTile key={ci} raw={c} size={large ? 'tv' : 'cozy'} />;
                        })}
                      </ul>
                    )}
                  </div>
                  <div className={`shrink-0 text-right self-center pr-1 ${large ? 'text-2xl md:text-3xl' : 'text-lg'}`}>
                    <span className="font-mono font-bold text-[var(--text)] tabular-nums">{e.initiativeTotal}</span>
                    {e.locked && <span className="text-base ml-1">🔒</span>}
                  </div>
                </button>
                {showCombatCueStrip ? (
                  <div
                    className={`shrink-0 flex justify-center gap-1 border-white/10 bg-black/25 px-2 py-2 ${
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
                              : 'border-white/15 bg-black/20 text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]'
                          } ${large ? 'text-xs px-2 py-1.5 min-w-[2.75rem]' : ''}`}
                        >
                          {short}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                </div>
                {showHideFromTableBar ? (
                  <div className="flex justify-end border-t border-white/10 bg-black/30 px-2 py-1.5">
                    <button
                      type="button"
                      title="Hide from table and initiative"
                      aria-label="Hide from table and initiative"
                      className="rounded-md p-1.5 text-[var(--muted)] hover:bg-white/10 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
      {!usingPreviewSamples && order.length === 0 && (
        <p className={`text-[var(--muted)] ${large ? 'text-lg' : 'text-sm'}`}>
          No combatants — on the <strong className="text-[var(--text)]">display</strong> or{' '}
          <strong className="text-[var(--text)]">DM console</strong> use <strong className="text-[var(--text)]">Begin combat</strong>{' '}
          to load the party (skips <strong className="text-[var(--text)]">Absent</strong> PCs).
        </p>
      )}
      {canAct && order.length > 0 && (
        <p className={`mt-3 text-[var(--muted)] ${large ? 'text-sm md:text-base' : 'text-xs'}`}>
          Tap a row to mark <strong className="text-amber-200">last</strong> (e.g. before the DM acts). Tap again to
          clear.
        </p>
      )}
      {canAct && (
        <>
          <div
            className={`mt-4 pt-4 border-t border-white/10 flex flex-wrap gap-2 ${large ? 'gap-3' : ''}`}
          >
            <button
              type="button"
              className={`rounded-lg bg-violet-700 text-white font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
                large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
              }`}
              onClick={() => emit!('initiative:startCombat')}
            >
              Begin combat
            </button>
            {isDisplay ? (
              <>
                <button
                  type="button"
                  className={`rounded-lg bg-slate-700 text-white ${
                    large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                  }`}
                  onClick={() => emit!('initiative:prevRound')}
                >
                  Prev round
                </button>
                <button
                  type="button"
                  className={`rounded-lg bg-slate-700 text-white ${
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
                  className={`rounded-lg bg-slate-700 text-white ${
                    large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                  }`}
                  onClick={() => emit!('initiative:prev')}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className={`rounded-lg bg-slate-700 text-white ${
                    large ? 'px-4 py-3 text-base md:text-lg' : 'px-3 py-1.5 text-sm'
                  }`}
                  onClick={() => emit!('initiative:next')}
                >
                  Next turn
                </button>
              </>
            )}
          </div>
          <p className={`mt-2 text-[var(--muted)] ${large ? 'text-sm md:text-base' : 'text-xs'}`}>
            <strong className="text-[var(--text)]">Begin combat</strong> clears the tracker, adds everyone who is not{' '}
            <strong className="text-[var(--text)]">Absent</strong> or <strong className="text-[var(--text)]">hidden</strong>{' '}
            from the table, rolls initiative, and sorts (ties favor higher bonus).
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
        </>
      )}
    </div>
  );
}
