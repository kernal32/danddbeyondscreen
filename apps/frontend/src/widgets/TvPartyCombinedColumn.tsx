import type { ClassResourceSummary, NormalizedCharacter, SpellSlotSummary } from '@ddb/shared-types/character';
import type { InitiativeEntry } from '@ddb/shared-types/initiative';
import { effectiveInitiativeRollMode } from '@ddb/shared-types/initiative';
import type { PartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import { mergePartyCardDisplayOptions } from '@ddb/shared-types/party-card-display';
import type { CombinedCardComponentLayout, CombinedCardLayoutConfig } from '@ddb/shared-types/widget-config';
import { clampCombinedBlockScalePercent, clampCombinedSectionGapPx } from '@ddb/shared-types/widget-config';
import type { ReactNode } from 'react';
import CombinedDecorSvgGraphic from './CombinedDecorSvgGraphic';

function safeNum(v: number | undefined): number {
  return Number.isFinite(v) ? Number(v) : 0;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 1).toUpperCase();
}

function formatRollSummary(initiative: InitiativeEntry): string {
  const mode = effectiveInitiativeRollMode(initiative);
  const rb = initiative.rollBreakdown;
  if (rb && rb.rolls.length >= 2 && (mode === 'advantage' || mode === 'disadvantage')) {
    const tag = mode === 'advantage' ? 'Adv' : 'Dis';
    return `${tag}: ${rb.rolls.join(' · ')} → keep ${rb.kept} + ${rb.mod} = ${initiative.initiativeTotal}`;
  }
  if (rb && rb.rolls.length === 1) {
    return `${rb.rolls[0]} + ${rb.mod} = ${initiative.initiativeTotal}`;
  }
  if (mode !== 'normal') {
    return `${mode} (no breakdown)`;
  }
  return '';
}

/** Scales avatar, text, and nested content together (e.g. header block). */
function ScaledBlock({ factor, children }: { factor: number; children: ReactNode }) {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.001) {
    return <div className="h-full min-h-0 w-full min-w-0">{children}</div>;
  }
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 items-start justify-start overflow-hidden">
      <div
        className="min-h-0 min-w-0"
        style={{
          transform: `scale(${factor})`,
          transformOrigin: 'top left',
          width: `${100 / factor}%`,
          height: `${100 / factor}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function blockScaleFactor(part: CombinedCardComponentLayout): number {
  const p = part.blockScalePercent;
  if (p == null || !Number.isFinite(p)) return 1;
  return clampCombinedBlockScalePercent(p) / 100;
}

/** Vertical placement in the grid cell (`undefined` = center, previous default). */
function blockVerticalJustifyClass(part: CombinedCardComponentLayout): string {
  const v = part.blockVerticalAlign;
  if (v === 'top') return 'justify-start';
  if (v === 'bottom') return 'justify-end';
  return 'justify-center';
}

/** Block-level text alignment from layout customizer (`undefined` = keep per-block defaults). */
function blockTextAlignClass(part: CombinedCardComponentLayout): string {
  const a = part.blockTextAlign;
  if (a === 'left') return 'text-left';
  if (a === 'center') return 'text-center';
  if (a === 'right') return 'text-right';
  return '';
}

/** Flex placement when a block is a flex container; `fallback` matches previous hard-coded defaults. */
function blockFlexAlignClass(part: CombinedCardComponentLayout, fallback: 'center' | 'start'): string {
  const a = part.blockTextAlign;
  if (a === 'left') return 'justify-start items-start text-left';
  if (a === 'center') return 'justify-center items-center text-center';
  if (a === 'right') return 'justify-end items-end text-right';
  return fallback === 'center'
    ? 'justify-center items-center text-center'
    : 'justify-start items-start text-left';
}

function renderSpellSlotLines(
  slots: SpellSlotSummary[],
  showBars: boolean,
  showPips: boolean,
  dataOnly?: boolean,
): ReactNode {
  if (!slots.length) return <p className="text-[11px] text-[var(--muted)]">—</p>;
  return (
    <ul className="space-y-1 text-[11px] tabular-nums">
      {slots.slice(0, 8).map((s) => {
        const left = Math.max(0, s.available - s.used);
        const usePips = showPips && s.available <= 10;
        return (
          <li key={`slot-${s.level}`} className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1">
              {!dataOnly ? <span className="text-[var(--muted)]">L{s.level}</span> : null}
              {usePips ? (
                <span className="inline-flex flex-wrap gap-0.5" aria-label={`${left} of ${s.available} remaining`}>
                  {Array.from({ length: s.available }, (_, ix) => (
                    <span
                      // eslint-disable-next-line react/no-array-index-key
                      key={`pip-${ix}`}
                      className="inline-block h-2 w-2 shrink-0 rounded-full border"
                      style={
                        ix < left
                          ? {
                              borderColor: 'var(--spell-bar)',
                              backgroundColor: 'var(--spell-bar)',
                            }
                          : {
                              borderColor: 'color-mix(in srgb, var(--spell-bar) 42%, transparent)',
                              backgroundColor: 'transparent',
                              opacity: 0.74,
                            }
                      }
                    />
                  ))}
                </span>
              ) : (
                <span>
                  {left}/{s.available}
                </span>
              )}
            </div>
            {showBars && !usePips ? (
              <div className="h-1 max-w-[6rem] overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-[var(--spell-bar)]"
                  style={{ width: s.available > 0 ? `${(left / s.available) * 100}%` : '0%' }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function renderClassResourceLines(
  resources: ClassResourceSummary[],
  showBars: boolean,
  showPips: boolean,
  dataOnly?: boolean,
): ReactNode {
  if (!resources.length) return <p className="text-[11px] text-[var(--muted)]">—</p>;
  return (
    <ul className="space-y-1 text-[11px] tabular-nums">
      {resources.slice(0, 8).map((r) => {
        const left = Math.max(0, r.available - r.used);
        const usePips = showPips && r.available <= 10;
        return (
          <li key={`res-${r.label}`} className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-1">
              {!dataOnly ? (
                <span className="line-clamp-2 min-w-0 break-words text-[var(--muted)]" title={r.label}>
                  {r.label}
                </span>
              ) : null}
              {usePips ? (
                <span className="inline-flex flex-wrap gap-0.5" aria-label={`${left} of ${r.available} remaining`}>
                  {Array.from({ length: r.available }, (_, ix) => (
                    <span
                      // eslint-disable-next-line react/no-array-index-key
                      key={`pip-${ix}`}
                      className="inline-block h-2 w-2 shrink-0 rounded-full border"
                      style={
                        ix < left
                          ? {
                              borderColor: 'var(--spell-bar)',
                              backgroundColor: 'var(--spell-bar)',
                            }
                          : {
                              borderColor: 'color-mix(in srgb, var(--spell-bar) 42%, transparent)',
                              backgroundColor: 'transparent',
                              opacity: 0.74,
                            }
                      }
                    />
                  ))}
                </span>
              ) : (
                <span>
                  {left}/{r.available}
                </span>
              )}
            </div>
            {showBars && !usePips ? (
              <div className="h-1 max-w-[6rem] overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-[var(--spell-bar)]"
                  style={{ width: r.available > 0 ? `${(left / r.available) * 100}%` : '0%' }}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function TvPartyCombinedColumn({
  c,
  initiative,
  layoutConfig,
  initiativeTieNote,
  initiativeDetailVisible = true,
  stretch,
  displayOptions: displayOptionsProp,
}: {
  c: NormalizedCharacter;
  initiative?: InitiativeEntry;
  layoutConfig: CombinedCardLayoutConfig;
  initiativeTieNote?: string | null;
  /** When false (display privacy), hide initiative total and roll lines for this character. */
  initiativeDetailVisible?: boolean;
  stretch?: boolean;
  /** Session party card options (bars, spell pips, etc.) — same as full player cards. */
  displayOptions?: PartyCardDisplayOptions | null;
}) {
  const o = mergePartyCardDisplayOptions(displayOptionsProp);
  const hpNow = safeNum(c.currentHp);
  const hpMax = Math.max(0, safeNum(c.maxHp));
  const hpPct = hpMax > 0 ? Math.max(0, Math.min(1, hpNow / hpMax)) : 0;
  const tempHp = safeNum(c.tempHp);
  const spellSlots = c.spellSlots ?? [];
  const classResources = c.classResources ?? [];

  const textScale = (layoutConfig.textScalePercent ?? 100) / 100;
  const bigInitSize = `${Math.max(1.75, Math.round(28 * textScale) / 16)}rem`;
  const sectionGapPx =
    layoutConfig.sectionGapPx != null && Number.isFinite(layoutConfig.sectionGapPx)
      ? clampCombinedSectionGapPx(Number(layoutConfig.sectionGapPx))
      : 6 * textScale;

  function shell(part: CombinedCardComponentLayout, extra: string): string {
    const vj = blockVerticalJustifyClass(part);
    const framed = 'rounded-md border border-white/10 bg-black/20 p-2 text-[var(--text)] min-h-0';
    if (part.borderless) {
      return `flex h-full min-h-0 w-full min-w-0 flex-col ${vj} overflow-hidden p-0 ${extra}`.trim();
    }
    return `${framed} flex h-full min-h-0 w-full min-w-0 flex-col ${vj} ${extra}`.trim();
  }

  const renderSection = (part: CombinedCardComponentLayout) => {
    if (part.visible === false) return null;
    /** When `part.dataOnly`, omit block titles (AC, HP, …) and show values only. */
    const showFieldLabel = part.dataOnly !== true;

    if (part.key === 'decorSvg') {
      return (
        <div className={shell(part, `flex min-h-0 ${blockFlexAlignClass(part, 'center')}`)}>
          <CombinedDecorSvgGraphic
            id={part.decorSvgId ?? 'heart'}
            colorMode={part.decorColorMode ?? 'theme'}
            colorCustom={part.decorColorCustom}
          />
        </div>
      );
    }

    if (part.key === 'initiativeValue' || part.key === 'initiative') {
      const val =
        initiative && initiativeDetailVisible ? initiative.initiativeTotal : null;
      const shown =
        val == null ? '—' : val === 0 ? '0' : val > 0 ? `+${val}` : `${val}`;
      return (
        <div
          className={shell(
            part,
            `flex min-h-0 tabular-nums font-bold leading-none tracking-tight text-[var(--accent)] ${blockFlexAlignClass(part, 'center')}`,
          )}
          style={{ fontSize: bigInitSize }}
        >
          {shown}
        </div>
      );
    }

    if (part.key === 'initiativeResults') {
      const rollLine =
        initiative && initiativeDetailVisible ? formatRollSummary(initiative) : '';
      const tieLine = initiativeDetailVisible ? (initiativeTieNote?.trim() ?? '') : '';
      const emptyAlign = blockTextAlignClass(part) || 'text-center';
      if (!initiativeDetailVisible) {
        return (
          <div className={shell(part, `text-[11px] text-[var(--muted)] ${emptyAlign}`)}>—</div>
        );
      }
      if (!rollLine && !tieLine) {
        return <div className={shell(part, `text-[11px] text-[var(--muted)] ${emptyAlign}`)}>—</div>;
      }
      const bodyAlign = blockTextAlignClass(part) || 'text-left';
      return (
        <div
          className={shell(part, `space-y-1 text-[11px] leading-snug text-[var(--text)] ${bodyAlign}`)}
        >
          {rollLine ? <p className="break-words tabular-nums">{rollLine}</p> : null}
          {tieLine ? <p className="break-words text-[var(--muted)]">{tieLine}</p> : null}
        </div>
      );
    }

    if (part.key === 'header') {
      const ha = part.blockTextAlign;
      const headerRow =
        ha === 'center'
          ? 'flex min-w-0 items-center justify-center gap-2'
          : ha === 'right'
            ? 'flex min-w-0 flex-row-reverse items-center justify-end gap-2'
            : 'flex min-w-0 items-center gap-2';
      return (
        <div className={shell(part, `min-w-0 ${blockTextAlignClass(part)}`)}>
          <div className={headerRow}>
            {!part.dataOnly ? (
              c.avatarUrl ? (
                <img
                  src={c.avatarUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-md border border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-black/30 text-sm font-semibold text-[var(--text)]">
                  {initials(c.name)}
                </div>
              )
            ) : null}
            <h3
              className={`min-w-0 break-words text-sm font-semibold leading-tight text-[var(--text)] ${
                part.dataOnly ? '' : 'flex-1'
              }`}
              title={c.name}
            >
              {c.name}
            </h3>
          </div>
        </div>
      );
    }

    if (part.key === 'hp') {
      const hpLine = o.hitPointsCurrentOnly ? hpNow : `${hpNow}/${hpMax}`;
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">HP</p> : null}
          {hpLine}
          {o.showHitPointsBar ? (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
              <div
                className="h-full rounded-full bg-[color-mix(in_srgb,var(--ok)_60%,transparent)]"
                style={{ width: `${hpPct * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (part.key === 'ac') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">AC</p> : null}
          {safeNum(c.ac) || '—'}
        </div>
      );
    }

    if (part.key === 'tempHp') {
      if (o.showTemporaryHitPoints === false) return null;
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Temp HP</p> : null}
          {tempHp > 0 ? tempHp : '—'}
        </div>
      );
    }

    if (part.key === 'hpAc') {
      const hpFrag = o.hitPointsCurrentOnly ? hpNow : `${hpNow}/${hpMax}`;
      const ta = blockTextAlignClass(part);
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`${shell(part, `tabular-nums ${ta}`)}`}>
            {showFieldLabel ? <>HP {hpFrag}</> : hpFrag}
            {o.showHitPointsBar ? (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-[color-mix(in_srgb,var(--ok)_60%,transparent)]"
                  style={{ width: `${hpPct * 100}%` }}
                />
              </div>
            ) : null}
          </div>
          <div className={`${shell(part, `tabular-nums ${ta}`)}`}>
            {showFieldLabel ? <>AC {safeNum(c.ac) || '—'}</> : safeNum(c.ac) || '—'}
          </div>
        </div>
      );
    }

    if (part.key === 'spellDc') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Spell DC</p> : null}
          {c.spellSaveDC ?? '—'}
        </div>
      );
    }

    if (part.key === 'spellSlots') {
      return (
        <div className={shell(part, blockTextAlignClass(part))}>
          {showFieldLabel ? <p className="mb-1 text-xs font-medium">Spell slots</p> : null}
          {renderSpellSlotLines(spellSlots, o.showSpellSlotBars, o.showSpellSlotPips, part.dataOnly === true)}
          {o.showSpellSlotIngestRaw && c.spellSlotSourceDebug ? (
            <details className="mt-1 w-full min-w-0 text-left">
              <summary className="cursor-pointer text-[9px] text-[var(--muted)]">Raw DDB spell JSON</summary>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-tight text-[var(--muted)]">
                {JSON.stringify(c.spellSlotSourceDebug, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      );
    }

    if (part.key === 'spellDcSlots') {
      const ta = blockTextAlignClass(part);
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className={`${shell(part, `tabular-nums ${ta}`)}`}>
            {showFieldLabel ? <>Spell DC {c.spellSaveDC ?? '—'}</> : (c.spellSaveDC ?? '—')}
          </div>
          <div className={shell(part, ta)}>
            {showFieldLabel ? <p className="mb-1 font-medium">Spell slots</p> : null}
            {renderSpellSlotLines(spellSlots, o.showSpellSlotBars, o.showSpellSlotPips, part.dataOnly === true)}
            {o.showSpellSlotIngestRaw && c.spellSlotSourceDebug ? (
              <details className="mt-1 w-full min-w-0 text-left">
                <summary className="cursor-pointer text-[9px] text-[var(--muted)]">Raw DDB spell JSON</summary>
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[8px] leading-tight text-[var(--muted)]">
                  {JSON.stringify(c.spellSlotSourceDebug, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      );
    }

    if (part.key === 'passivePerception') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <span className="font-medium">PP </span> : null}
          {c.passivePerception ?? '—'}
        </div>
      );
    }
    if (part.key === 'passiveInvestigation') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <span className="font-medium">Inv </span> : null}
          {c.passiveInvestigation ?? '—'}
        </div>
      );
    }
    if (part.key === 'passiveInsight') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <span className="font-medium">Ins </span> : null}
          {c.passiveInsight ?? '—'}
        </div>
      );
    }

    if (part.key === 'passives') {
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? (
            <>
              PP {c.passivePerception ?? '—'} · Inv {c.passiveInvestigation ?? '—'} · Ins {c.passiveInsight ?? '—'}
            </>
          ) : (
            <>
              {c.passivePerception ?? '—'} · {c.passiveInvestigation ?? '—'} · {c.passiveInsight ?? '—'}
            </>
          )}
        </div>
      );
    }

    if (part.key === 'initiativeBonus') {
      const b = c.initiativeBonus;
      const initBonusText =
        b == null ? '—' : b === 0 ? '0' : b > 0 ? `+${b}` : `${b}`;
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Init bonus</p> : null}
          {initBonusText}
        </div>
      );
    }

    if (part.key === 'dexMod') {
      const d = c.dexterityModifier;
      const dexText = d == null ? '—' : d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`;
      return (
        <div className={`${shell(part, `text-xs tabular-nums ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Dex</p> : null}
          {dexText}
        </div>
      );
    }

    if (part.key === 'inspiration') {
      return (
        <div className={`${shell(part, `text-xs ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Inspiration</p> : null}
          <p className="tabular-nums">{c.inspired ? 'Yes' : '—'}</p>
        </div>
      );
    }

    if (part.key === 'absent') {
      return (
        <div className={`${shell(part, `text-xs ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Absent</p> : null}
          <p>{c.absent ? 'Yes' : '—'}</p>
        </div>
      );
    }

    if (part.key === 'classResources') {
      return (
        <div className={`${shell(part, `text-xs ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Class resources</p> : null}
          {renderClassResourceLines(
            classResources,
            o.showClassResourceBars,
            o.showClassResourcePips,
            part.dataOnly === true,
          )}
        </div>
      );
    }

    if (part.key === 'conditions') {
      if (!o.showConditions) return null;
      return (
        <div className={`${shell(part, `text-xs ${blockTextAlignClass(part)}`)}`}>
          {showFieldLabel ? <p className="mb-1 font-medium">Conditions</p> : null}
          {c.conditions?.length ? (
            <ul className="space-y-0.5 text-[11px]">
              {c.conditions.slice(0, 6).map((cond) => (
                <li key={`cond-${cond}`} className="truncate">
                  {cond}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[var(--muted)]">—</p>
          )}
        </div>
      );
    }

    return (
      <div className={`${shell(part, `text-[10px] text-[var(--muted)] ${blockTextAlignClass(part)}`)}`}>
        Unknown: {String(part.key)}
      </div>
    );
  };

  return (
    <article
      className={`grid min-h-0 min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 ${
        stretch ? 'h-full min-h-0 flex-1 self-stretch' : 'h-auto max-h-full self-start'
      }`}
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, layoutConfig.cols)}, minmax(0,1fr))`,
        gridTemplateRows: `repeat(${Math.max(1, layoutConfig.rows)}, minmax(0,1fr))`,
        gap: sectionGapPx,
        fontSize: `${Math.max(10, Math.round(12 * textScale))}px`,
      }}
    >
      {layoutConfig.components.map((part) => (
        <div
          key={part.id}
          className="relative h-full min-h-0 min-w-0 overflow-hidden"
          style={{
            gridColumn: `${part.x + 1} / span ${part.w}`,
            gridRow: `${part.y + 1} / span ${part.h}`,
            zIndex: part.key === 'decorSvg' && part.decorSendToBack === true ? 0 : 1,
          }}
        >
          <ScaledBlock factor={blockScaleFactor(part)}>{renderSection(part)}</ScaledBlock>
        </div>
      ))}
    </article>
  );
}
