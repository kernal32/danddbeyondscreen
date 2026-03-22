import { useState } from 'react';
import type { PartyCardDisplayOptions, PlayerCardSectionId } from '@ddb/shared-types';
import {
  DEFAULT_PARTY_CARD_DISPLAY_OPTIONS,
  DEFAULT_PLAYER_CARD_SECTION_ORDER,
  effectivePlayerCardSectionOrder,
  mergePartyCardDisplayOptions,
} from '@ddb/shared-types';
import PlayerCard from '../player-card/PlayerCard';
import { MOCK_PLAYER_CARDS } from '../player-card/mockPlayerCards';

const SECTION_LABELS: Record<PlayerCardSectionId, string> = {
  header: 'Header — portrait, name, subtitle, player',
  primaryStats: 'Combat row — HP, AC, spell save DC / initiative',
  movement: 'Movement — walk, climb, swim',
  abilities: 'Ability scores',
  savingThrows: 'Saving throws',
  senses: 'Passives & special senses',
  classSummary: 'Class / spell DC / attack',
  spellSlots: 'Spell slots',
  conditions: 'Conditions',
};

type BoolRow = { key: keyof PartyCardDisplayOptions; label: string };

const GROUPS: { title: string; rows: BoolRow[] }[] = [
  {
    title: 'Header',
    rows: [
      { key: 'showAvatar', label: 'Portrait' },
      { key: 'showCharacterName', label: 'Character name' },
      { key: 'showLevelRaceClass', label: 'Level / race / class line' },
      { key: 'showPlayerName', label: 'Player name' },
    ],
  },
  {
    title: 'Combat row',
    rows: [
      { key: 'showHitPoints', label: 'Hit points (numbers)' },
      { key: 'showHitPointsBar', label: 'Hit point bar' },
      { key: 'showArmorClass', label: 'Armor class' },
      { key: 'showSpellSaveDC', label: 'Spell save DC (when known)' },
      { key: 'showInitiative', label: 'Initiative (primary row)' },
    ],
  },
  {
    title: 'Movement & stats',
    rows: [
      { key: 'showMovement', label: 'Movement speeds' },
      { key: 'showAbilities', label: 'Ability scores' },
      { key: 'showSavingThrows', label: 'Saving throws' },
    ],
  },
  {
    title: 'Senses & class',
    rows: [
      { key: 'showPassivePerception', label: 'Passive perception' },
      { key: 'showPassiveInvestigation', label: 'Passive investigation' },
      { key: 'showPassiveInsight', label: 'Passive insight' },
      { key: 'showClassCombatSummary', label: 'Class line / spell save DC / attack bonus' },
    ],
  },
  {
    title: 'Other',
    rows: [
      { key: 'showSpellSlots', label: 'Spell slots (from D&D Beyond)' },
      { key: 'showConditions', label: 'Conditions' },
    ],
  },
];

function moveOrder(order: PlayerCardSectionId[], index: number, dir: -1 | 1): PlayerCardSectionId[] {
  const j = index + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export default function PartyWidgetOptionsPanel({
  value,
  onChange,
  onApplyToSession,
  applyDisabled,
  error,
}: {
  value: PartyCardDisplayOptions;
  onChange: (next: PartyCardDisplayOptions) => void;
  onApplyToSession: () => void;
  applyDisabled?: boolean;
  error?: string | null;
}) {
  const [previewIx, setPreviewIx] = useState(0);
  const mergedOpts = mergePartyCardDisplayOptions(value);
  const order = effectivePlayerCardSectionOrder(mergedOpts);

  const setBool = (key: BoolRow['key'], checked: boolean) => {
    onChange({ ...value, [key]: checked });
  };

  const setOrder = (nextOrder: PlayerCardSectionId[]) => {
    onChange({ ...value, sectionOrder: nextOrder });
  };

  const previewData = MOCK_PLAYER_CARDS[previewIx % MOCK_PLAYER_CARDS.length];

  return (
    <section className="rounded-xl border border-violet-500/25 bg-[var(--surface)] p-4 md:p-6 space-y-6">
      <h2 className="font-semibold text-lg text-[var(--accent)]">Widget options — Party / player cards</h2>
      <p className="text-sm text-[var(--muted)]">
        Choose what appears on each character card on the <strong className="text-[var(--text)]">public display</strong> and
        in the DM party column. Reorder sections for the TV layout. Use <strong className="text-[var(--text)]">Apply</strong>{' '}
        so the TV updates live.
      </p>
      {error ? (
        <p className="text-sm text-amber-300 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      {GROUPS.map((g) => (
        <div key={g.title} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{g.title}</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            {g.rows.map((row) => (
              <label
                key={String(row.key)}
                className="flex items-center gap-2 cursor-pointer select-none text-[var(--text)] rounded-lg border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  className="rounded border-white/30"
                  checked={!!mergedOpts[row.key]}
                  onChange={(e) => setBool(row.key, e.target.checked)}
                />
                {row.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Section order (top → bottom)</h3>
        <ul className="rounded-lg border border-white/10 divide-y divide-white/10 bg-black/20">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--text)]">
              <span className="flex-1 min-w-0">{SECTION_LABELS[id]}</span>
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                disabled={i === 0}
                onClick={() => setOrder(moveOrder(order, i, -1))}
                aria-label="Move up"
              >
                Up
              </button>
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                disabled={i >= order.length - 1}
                onClick={() => setOrder(moveOrder(order, i, 1))}
                aria-label="Move down"
              >
                Down
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-[var(--text)] hover:bg-white/5"
          onClick={() => setOrder([...DEFAULT_PLAYER_CARD_SECTION_ORDER])}
        >
          Reset section order
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Live preview (TV scale)</h3>
          <label className="text-sm text-[var(--muted)] flex items-center gap-2">
            Sample
            <select
              className="rounded bg-black/40 border border-white/20 px-2 py-1 text-[var(--text)]"
              value={previewIx}
              onChange={(e) => setPreviewIx(Number(e.target.value))}
            >
              {MOCK_PLAYER_CARDS.map((m, i) => (
                <option key={m.name} value={i}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 md:p-6">
          <PlayerCard data={previewData} displayOptions={mergedOpts} large />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          disabled={applyDisabled}
          onClick={onApplyToSession}
        >
          Apply to table &amp; display
        </button>
        <button
          type="button"
          className="rounded-lg border border-white/20 px-4 py-2 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onClick={() => onChange({ ...DEFAULT_PARTY_CARD_DISPLAY_OPTIONS })}
        >
          Reset all to defaults
        </button>
      </div>
    </section>
  );
}
