import { useEffect, useState } from 'react';
import type { PartyCardDisplayOptions, PlayerCardSectionId } from '@ddb/shared-types/party-card-display';
import {
  clampHpHeartNumeralSpacingPx,
  clampPrimaryStatScalePercent,
  DEFAULT_PARTY_CARD_DISPLAY_OPTIONS,
  DEFAULT_PLAYER_CARD_SECTION_ORDER,
  effectivePlayerCardSectionOrder,
  HP_HEART_NUMERAL_SPACING_PX_MAX,
  HP_HEART_NUMERAL_SPACING_PX_MIN,
  mergePartyCardDisplayOptions,
  PRIMARY_STAT_SCALE_PERCENT_MAX,
  PRIMARY_STAT_SCALE_PERCENT_MIN,
} from '@ddb/shared-types/party-card-display';
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
  spellSlots: 'Spell slots & class resources',
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
      {
        key: 'hitPointsCurrentOnly',
        label: 'HP: current only (hide max — lines up with AC / spell DC)',
      },
      {
        key: 'showTemporaryHitPoints',
        label: 'Temporary HP (under heart + combined Temp HP block)',
      },
      { key: 'showArmorClass', label: 'Armor class' },
      { key: 'showSpellSaveDC', label: 'Spell save DC (when known)' },
      { key: 'showInitiative', label: 'Initiative (primary row)' },
    ],
  },
  {
    title: 'Bars',
    rows: [
      { key: 'showHitPointsBar', label: 'Hit point bar' },
      { key: 'showSpellSlotBars', label: 'Spell slot bars' },
      { key: 'showSpellSlotPips', label: 'Spell slots as pips' },
      { key: 'showClassResourceBars', label: 'Class resource bars' },
      { key: 'showClassResourcePips', label: 'Class resources as pips' },
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
      { key: 'showSpellSlots', label: 'Spell slots & class resources (D&D Beyond)' },
      { key: 'showSpellSlotIngestRaw', label: 'Show raw DDB spell slot JSON (debug)' },
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

  const [numeralDraft, setNumeralDraft] = useState('');
  const [iconDraft, setIconDraft] = useState('');
  const [hpHeartDraft, setHpHeartDraft] = useState('');

  useEffect(() => {
    setNumeralDraft(
      value.primaryStatNumeralScalePercent === undefined ? '' : String(value.primaryStatNumeralScalePercent),
    );
    setIconDraft(value.primaryStatIconScalePercent === undefined ? '' : String(value.primaryStatIconScalePercent));
    setHpHeartDraft(value.hpHeartNumeralSpacingPx === undefined ? '' : String(value.hpHeartNumeralSpacingPx));
  }, [value.primaryStatNumeralScalePercent, value.primaryStatIconScalePercent, value.hpHeartNumeralSpacingPx]);

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

      <details className="rounded-lg border border-amber-500/35 bg-amber-950/25 p-3 space-y-3">
        <summary className="cursor-pointer text-sm font-medium text-[var(--accent)] select-none">
          Primary stat size (devtools)
        </summary>
        <p className="text-xs text-[var(--muted)]">
          Percentage of the <strong className="text-[var(--text)]">density-based</strong> size (TV / desktop).{' '}
          <strong className="text-[var(--text)]">100</strong> matches the built-in default for the current layout; leave empty to use
          that default. <strong className="text-[var(--text)]">Numerals</strong> = HP, AC, spell DC, initiative text;{' '}
          <strong className="text-[var(--text)]">SVG</strong> = heart / shield / spell graphics only. Allowed{' '}
          {PRIMARY_STAT_SCALE_PERCENT_MIN}–{PRIMARY_STAT_SCALE_PERCENT_MAX}. Use <strong className="text-[var(--text)]">Apply</strong>{' '}
          to sync the TV.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1 text-[var(--muted)]">
            <span>Numerals (%)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-[var(--text)]"
                placeholder="default"
                value={numeralDraft}
                onChange={(e) => setNumeralDraft(e.target.value)}
                onBlur={() => {
                  const t = numeralDraft.trim();
                  if (t === '') {
                    onChange({ ...value, primaryStatNumeralScalePercent: undefined });
                    return;
                  }
                  const n = Number(t);
                  if (!Number.isFinite(n)) {
                    setNumeralDraft(
                      value.primaryStatNumeralScalePercent === undefined
                        ? ''
                        : String(value.primaryStatNumeralScalePercent),
                    );
                    return;
                  }
                  onChange({ ...value, primaryStatNumeralScalePercent: clampPrimaryStatScalePercent(n) });
                }}
                aria-label="Primary stat numeral scale percent"
              />
              <button
                type="button"
                className="shrink-0 rounded border border-white/20 px-2 py-1.5 text-xs text-[var(--text)] hover:bg-white/10"
                onClick={() => onChange({ ...value, primaryStatNumeralScalePercent: undefined })}
              >
                Default
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[var(--muted)]">
            <span>SVG graphics (%)</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="min-w-0 flex-1 rounded border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-[var(--text)]"
                placeholder="default"
                value={iconDraft}
                onChange={(e) => setIconDraft(e.target.value)}
                onBlur={() => {
                  const t = iconDraft.trim();
                  if (t === '') {
                    onChange({ ...value, primaryStatIconScalePercent: undefined });
                    return;
                  }
                  const n = Number(t);
                  if (!Number.isFinite(n)) {
                    setIconDraft(
                      value.primaryStatIconScalePercent === undefined ? '' : String(value.primaryStatIconScalePercent),
                    );
                    return;
                  }
                  onChange({ ...value, primaryStatIconScalePercent: clampPrimaryStatScalePercent(n) });
                }}
                aria-label="Primary stat icon SVG scale percent"
              />
              <button
                type="button"
                className="shrink-0 rounded border border-white/20 px-2 py-1.5 text-xs text-[var(--text)] hover:bg-white/10"
                onClick={() => onChange({ ...value, primaryStatIconScalePercent: undefined })}
              >
                Default
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 text-xs text-[var(--muted)] hover:bg-white/10"
          onClick={() =>
            onChange({
              ...value,
              primaryStatNumeralScalePercent: undefined,
              primaryStatIconScalePercent: undefined,
            })
          }
        >
          Default both (follow density only)
        </button>

        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">Heart HP</strong> — extra vertical margin (px) on <em>both sides</em> of the thin
            line between current (top) and max (bottom). <strong className="text-[var(--text)]">0</strong> or empty = default.{' '}
            <strong className="text-[var(--text)]">Negative</strong> pulls the numbers closer (try <code className="text-[var(--text)]">-4</code>{' '}
            to <code className="text-[var(--text)]">-12</code>). Range {HP_HEART_NUMERAL_SPACING_PX_MIN}…{HP_HEART_NUMERAL_SPACING_PX_MAX}.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span className="shrink-0">Spacing (px)</span>
            <input
              type="text"
              inputMode="numeric"
              className="min-w-[6rem] rounded border border-white/20 bg-black/40 px-2 py-1.5 font-mono text-[var(--text)]"
              placeholder="0"
              value={hpHeartDraft}
              onChange={(e) => setHpHeartDraft(e.target.value)}
              onBlur={() => {
                const t = hpHeartDraft.trim();
                if (t === '') {
                  onChange({ ...value, hpHeartNumeralSpacingPx: undefined });
                  return;
                }
                const n = Number(t);
                if (!Number.isFinite(n)) {
                  setHpHeartDraft(value.hpHeartNumeralSpacingPx === undefined ? '' : String(value.hpHeartNumeralSpacingPx));
                  return;
                }
                onChange({ ...value, hpHeartNumeralSpacingPx: clampHpHeartNumeralSpacingPx(n) });
              }}
              aria-label="Heart HP spacing between current and max in pixels"
            />
            <button
              type="button"
              className="rounded border border-white/20 px-2 py-1.5 text-xs text-[var(--text)] hover:bg-white/10"
              onClick={() => onChange({ ...value, hpHeartNumeralSpacingPx: undefined })}
            >
              Default
            </button>
          </div>
        </div>
      </details>

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
