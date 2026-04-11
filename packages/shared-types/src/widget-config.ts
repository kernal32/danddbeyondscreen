import type { WidgetInstance } from './layout.js';

/**
 * Party widget TV layout: full `PartyCard` grid, compact strip, initiative-first combined columns,
 * or full 3-column grid with per-card `combinedLayout` (`TvPartyCombinedColumn`).
 */
export type PartyWidgetView = 'full' | 'compact' | 'combined' | 'customFull';
export type PartyHighestRollSide = 'left' | 'right';

/** Keys allowed in persisted `combinedLayout` (includes legacy keys for migration). */
export type CombinedCardComponentKey =
  | 'initiativeValue'
  | 'initiativeResults'
  /** @deprecated split into initiativeValue + initiativeResults */
  | 'initiative'
  | 'header'
  | 'hp'
  | 'ac'
  | 'tempHp'
  | 'spellDc'
  | 'spellSlots'
  /** @deprecated use hp + ac */
  | 'hpAc'
  /** @deprecated use spellDc + spellSlots */
  | 'spellDcSlots'
  | 'passivePerception'
  | 'passiveInvestigation'
  | 'passiveInsight'
  /** @deprecated use the three passive keys */
  | 'passives'
  | 'initiativeBonus'
  | 'dexMod'
  | 'inspiration'
  | 'absent'
  | 'classResources'
  | 'conditions'
  /** Preset themed SVG (heart, shield, spell save pentagon, etc.); use `decorSvgId` + optional color fields. */
  | 'decorSvg';

/** Built-in SVG presets for combined `decorSvg` blocks (same glyphs as player-card stat icons). `spellStar` = white pentagon. */
export const COMBINED_DECOR_SVG_IDS = [
  'heart',
  'shield',
  'spellStar',
  'eye',
  'search',
  'insight',
  'sparkles',
  'conditions',
] as const;
export type CombinedDecorSvgId = (typeof COMBINED_DECOR_SVG_IDS)[number];

export function isCombinedDecorSvgId(s: string): s is CombinedDecorSvgId {
  return (COMBINED_DECOR_SVG_IDS as readonly string[]).includes(s);
}

/** How to tint the decor SVG (`theme` ≈ player-card AC tint). */
export const COMBINED_SVG_COLOR_MODES = [
  'theme',
  'accent',
  'text',
  'muted',
  'spellBar',
  'ok',
  'custom',
] as const;
export type CombinedSvgColorMode = (typeof COMBINED_SVG_COLOR_MODES)[number];

export function isCombinedSvgColorMode(s: string): s is CombinedSvgColorMode {
  return (COMBINED_SVG_COLOR_MODES as readonly string[]).includes(s);
}

/** Validate hex for `decorColorCustom` when mode is `custom`. */
export function normalizeCombinedDecorColorCustom(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return undefined;
  return s;
}

/** Per-block UI scale in combined columns; 100 = default. */
export const COMBINED_BLOCK_SCALE_PERCENT_MIN = 25;
export const COMBINED_BLOCK_SCALE_PERCENT_MAX = 800;

export function clampCombinedBlockScalePercent(n: number): number {
  if (!Number.isFinite(n)) return 100;
  return Math.min(
    COMBINED_BLOCK_SCALE_PERCENT_MAX,
    Math.max(COMBINED_BLOCK_SCALE_PERCENT_MIN, Math.round(n)),
  );
}

/** Grid gap between combined blocks (px). Omit `sectionGapPx` in layout to use default (~6px scaled by text scale). */
export const COMBINED_SECTION_GAP_PX_MIN = 0;
export const COMBINED_SECTION_GAP_PX_MAX = 32;

export function clampCombinedSectionGapPx(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(
    COMBINED_SECTION_GAP_PX_MAX,
    Math.max(COMBINED_SECTION_GAP_PX_MIN, Math.round(n)),
  );
}

export const COMBINED_BLOCK_TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type CombinedBlockTextAlign = (typeof COMBINED_BLOCK_TEXT_ALIGNS)[number];

export function isCombinedBlockTextAlign(s: string): s is CombinedBlockTextAlign {
  return (COMBINED_BLOCK_TEXT_ALIGNS as readonly string[]).includes(s);
}

export const COMBINED_BLOCK_VERTICAL_ALIGNS = ['top', 'center', 'bottom'] as const;
export type CombinedBlockVerticalAlign = (typeof COMBINED_BLOCK_VERTICAL_ALIGNS)[number];

export function isCombinedBlockVerticalAlign(s: string): s is CombinedBlockVerticalAlign {
  return (COMBINED_BLOCK_VERTICAL_ALIGNS as readonly string[]).includes(s);
}

export type CombinedCardComponentLayout = {
  id: string;
  key: CombinedCardComponentKey;
  x: number;
  y: number;
  w: number;
  h: number;
  visible?: boolean;
  /** Optional; omitted or 100 = match layout text scale only. */
  blockScalePercent?: number;
  /** Omit border/background on this block (text or SVG only). */
  borderless?: boolean;
  /** When true, hide field labels (e.g. show `18` instead of `AC` + `18`). */
  dataOnly?: boolean;
  /** When key is `decorSvg`, which preset to render. */
  decorSvgId?: CombinedDecorSvgId;
  decorColorMode?: CombinedSvgColorMode;
  /** When `decorColorMode` is `custom`, CSS hex color (e.g. `#aabbcc`). */
  decorColorCustom?: string;
  /** When `key` is `decorSvg`, paint this block under overlapping blocks (z-index). */
  decorSendToBack?: boolean;
  /** Horizontal text alignment for block content; omit for layout defaults. */
  blockTextAlign?: CombinedBlockTextAlign;
  /** Vertical placement within the grid cell; omit = center (matches prior behavior). */
  blockVerticalAlign?: CombinedBlockVerticalAlign;
};

export type CombinedCardLayoutConfig = {
  cols: number;
  rows: number;
  components: CombinedCardComponentLayout[];
  textScalePercent?: number;
  iconScalePercent?: number;
  /** Fixed grid gap in px between blocks; omit for default gap scaled by text size. */
  sectionGapPx?: number;
};

const KNOWN_COMBINED_KEYS = new Set<string>([
  'initiativeValue',
  'initiativeResults',
  'initiative',
  'header',
  'hp',
  'ac',
  'tempHp',
  'spellDc',
  'spellSlots',
  'hpAc',
  'spellDcSlots',
  'passivePerception',
  'passiveInvestigation',
  'passiveInsight',
  'passives',
  'initiativeBonus',
  'dexMod',
  'inspiration',
  'absent',
  'classResources',
  'conditions',
  'decorSvg',
]);

export function isCombinedCardComponentKey(k: string): k is CombinedCardComponentKey {
  return KNOWN_COMBINED_KEYS.has(k);
}

/** Keys offered in the initiative customizer “add block” list (legacy keys omitted). */
export const COMBINED_CARD_PALETTE_KEYS: readonly CombinedCardComponentKey[] = [
  'initiativeValue',
  'initiativeResults',
  'header',
  'hp',
  'ac',
  'tempHp',
  'spellDc',
  'spellSlots',
  'passivePerception',
  'passiveInvestigation',
  'passiveInsight',
  'initiativeBonus',
  'dexMod',
  'inspiration',
  'absent',
  'classResources',
  'conditions',
  'decorSvg',
];

function parseCombinedBlockTextAlign(raw: unknown): Pick<CombinedCardComponentLayout, 'blockTextAlign'> | Record<string, never> {
  if (typeof raw !== 'string' || !isCombinedBlockTextAlign(raw)) return {};
  return { blockTextAlign: raw };
}

function parseCombinedBlockVerticalAlign(
  raw: unknown,
): Pick<CombinedCardComponentLayout, 'blockVerticalAlign'> | Record<string, never> {
  if (typeof raw !== 'string' || !isCombinedBlockVerticalAlign(raw)) return {};
  return { blockVerticalAlign: raw };
}

function parseCombinedComponentDecor(
  o: Record<string, unknown>,
  key: CombinedCardComponentKey,
): Pick<
  CombinedCardComponentLayout,
  'borderless' | 'dataOnly' | 'decorSvgId' | 'decorColorMode' | 'decorColorCustom' | 'decorSendToBack'
> {
  const out: Pick<
    CombinedCardComponentLayout,
    'borderless' | 'dataOnly' | 'decorSvgId' | 'decorColorMode' | 'decorColorCustom' | 'decorSendToBack'
  > = {};
  if (o.borderless === true) out.borderless = true;
  if (o.dataOnly === true) out.dataOnly = true;
  if (key !== 'decorSvg') return out;
  const idRaw = String(o.decorSvgId ?? 'heart');
  out.decorSvgId = isCombinedDecorSvgId(idRaw) ? idRaw : 'heart';
  const modeRaw = String(o.decorColorMode ?? 'theme');
  out.decorColorMode = isCombinedSvgColorMode(modeRaw) ? modeRaw : 'theme';
  if (out.decorColorMode === 'custom') {
    const col = normalizeCombinedDecorColorCustom(o.decorColorCustom);
    if (col) out.decorColorCustom = col;
  }
  if (o.decorSendToBack === true) out.decorSendToBack = true;
  return out;
}

function minRowsForComponents(components: CombinedCardComponentLayout[]): number {
  if (!components.length) return 1;
  return components.reduce((m, c) => Math.max(m, c.y + c.h), 0);
}

/**
 * Expands legacy composite blocks into atomic components. Safe to run repeatedly on already-migrated layouts.
 */
export function migrateLegacyCombinedComponents(
  components: CombinedCardComponentLayout[],
  cols: number,
  rows: number,
): { components: CombinedCardComponentLayout[]; rows: number } {
  const hasLegacy = components.some(
    (c) => c.key === 'hpAc' || c.key === 'spellDcSlots' || c.key === 'passives' || c.key === 'initiative',
  );
  if (!hasLegacy) {
    const r = Math.max(rows, minRowsForComponents(components), 1);
    return { components, rows: Math.min(48, r) };
  }

  const out: CombinedCardComponentLayout[] = [];
  for (const c of components) {
    if (c.key === 'hpAc') {
      const lw = Math.max(1, Math.floor(c.w / 2));
      const rw = Math.max(1, c.w - lw);
      out.push({ ...c, id: `${c.id}__hp`, key: 'hp', w: lw, x: c.x, visible: c.visible });
      out.push({ ...c, id: `${c.id}__ac`, key: 'ac', w: rw, x: c.x + lw, visible: c.visible });
    } else if (c.key === 'spellDcSlots') {
      const lw = Math.max(1, Math.floor(c.w / 2));
      const rw = Math.max(1, c.w - lw);
      out.push({ ...c, id: `${c.id}__sdc`, key: 'spellDc', w: lw, x: c.x, visible: c.visible });
      out.push({ ...c, id: `${c.id}__slots`, key: 'spellSlots', w: rw, x: c.x + lw, visible: c.visible });
    } else if (c.key === 'passives') {
      const h1 = Math.max(1, Math.floor(c.h / 3));
      const h2 = Math.max(1, Math.floor((c.h - h1) / 2));
      const h3 = Math.max(1, c.h - h1 - h2);
      let y0 = c.y;
      out.push({
        ...c,
        id: `${c.id}__pp`,
        key: 'passivePerception',
        w: c.w,
        h: h1,
        y: y0,
        visible: c.visible,
      });
      y0 += h1;
      out.push({
        ...c,
        id: `${c.id}__pinv`,
        key: 'passiveInvestigation',
        w: c.w,
        h: h2,
        y: y0,
        visible: c.visible,
      });
      y0 += h2;
      out.push({
        ...c,
        id: `${c.id}__pins`,
        key: 'passiveInsight',
        w: c.w,
        h: h3,
        y: y0,
        visible: c.visible,
      });
    } else if (c.key === 'initiative') {
      const hVal = Math.max(2, c.h);
      out.push({
        ...c,
        id: `${c.id}__iv`,
        key: 'initiativeValue',
        h: hVal,
        visible: c.visible,
      });
      const resultsH = 2;
      const yRes = c.y + hVal;
      out.push({
        id: `${c.id}__ir`,
        key: 'initiativeResults',
        x: c.x,
        y: yRes,
        w: c.w,
        h: resultsH,
        visible: c.visible,
      });
    } else {
      out.push(c);
    }
  }

  const nextRows = Math.min(48, Math.max(rows, minRowsForComponents(out)));
  return { components: out, rows: nextRows };
}

/** Initiative row density; omit or `auto` uses widget width/height heuristics on the client. */
export type InitiativeWidgetDensityMode = 'auto' | 'normal' | 'compact';

export function getPartyWidgetView(instance: WidgetInstance): PartyWidgetView {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object') {
    const view = (cfg as { view?: string }).view;
    if (view === 'compact') return 'compact';
    if (view === 'combined') return 'combined';
    if (view === 'customFull') return 'customFull';
  }
  return 'full';
}

export function getPartyHighestRollSide(instance: WidgetInstance): PartyHighestRollSide {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object' && (cfg as { highestRollSide?: string }).highestRollSide === 'right') {
    return 'right';
  }
  return 'left';
}

/** When true, combined party columns stretch to the full height of the party widget cell. */
export function getPartyCombinedStretch(instance: WidgetInstance): boolean {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object' && (cfg as { combinedStretch?: unknown }).combinedStretch === true) {
    return true;
  }
  return false;
}

export function defaultCombinedCardLayoutConfig(): CombinedCardLayoutConfig {
  return {
    cols: 4,
    rows: 22,
    components: [
      { id: 'cc-init-val', key: 'initiativeValue', x: 0, y: 0, w: 4, h: 2 },
      { id: 'cc-init-res', key: 'initiativeResults', x: 0, y: 2, w: 4, h: 2 },
      { id: 'cc-header', key: 'header', x: 0, y: 4, w: 4, h: 2 },
      { id: 'cc-hp', key: 'hp', x: 0, y: 6, w: 2, h: 2 },
      { id: 'cc-ac', key: 'ac', x: 2, y: 6, w: 2, h: 2 },
      { id: 'cc-spelldc', key: 'spellDc', x: 0, y: 8, w: 2, h: 2 },
      { id: 'cc-slots', key: 'spellSlots', x: 2, y: 8, w: 2, h: 2 },
      { id: 'cc-pp', key: 'passivePerception', x: 0, y: 10, w: 4, h: 1 },
      { id: 'cc-pinv', key: 'passiveInvestigation', x: 0, y: 11, w: 4, h: 1 },
      { id: 'cc-pins', key: 'passiveInsight', x: 0, y: 12, w: 4, h: 1 },
      { id: 'cc-temphp', key: 'tempHp', x: 0, y: 13, w: 4, h: 1 },
      { id: 'cc-initbon', key: 'initiativeBonus', x: 0, y: 14, w: 2, h: 1 },
      { id: 'cc-dex', key: 'dexMod', x: 2, y: 14, w: 2, h: 1 },
      { id: 'cc-insp', key: 'inspiration', x: 0, y: 15, w: 2, h: 1 },
      { id: 'cc-abs', key: 'absent', x: 2, y: 15, w: 2, h: 1 },
      { id: 'cc-res', key: 'classResources', x: 0, y: 16, w: 4, h: 2 },
      { id: 'cc-cond', key: 'conditions', x: 0, y: 18, w: 4, h: 4 },
    ],
  };
}

function clampCell(n: unknown, min: number, max: number, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function getCombinedCardLayoutConfig(instance: WidgetInstance): CombinedCardLayoutConfig {
  const d = defaultCombinedCardLayoutConfig();
  const cfg = instance.config;
  if (!cfg || typeof cfg !== 'object') return d;
  const raw = (cfg as { combinedLayout?: unknown }).combinedLayout;
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  let cols = clampCell(r.cols, 1, 24, d.cols);
  let rows = clampCell(r.rows, 1, 48, d.rows);
  const src = Array.isArray(r.components) ? r.components : d.components;
  const parsed: CombinedCardComponentLayout[] = src
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      const keyRaw = String(o.key ?? '');
      if (!isCombinedCardComponentKey(keyRaw)) return null;
      const key = keyRaw;
      const w = clampCell(o.w, 1, cols, 1);
      const h = clampCell(o.h, 1, rows, 1);
      const x0 = clampCell(o.x, 0, Math.max(0, cols - w), 0);
      const y0 = clampCell(o.y, 0, Math.max(0, rows - h), 0);
      const blockScaleRaw = Number(o.blockScalePercent);
      return {
        id: String(o.id || `${key}-${x0}-${y0}`),
        key,
        x: x0,
        y: y0,
        w,
        h,
        ...(o.visible === false ? { visible: false } : {}),
        ...(Number.isFinite(blockScaleRaw) && blockScaleRaw !== 100
          ? { blockScalePercent: clampCombinedBlockScalePercent(blockScaleRaw) }
          : {}),
        ...parseCombinedBlockTextAlign(o.blockTextAlign),
        ...parseCombinedBlockVerticalAlign(o.blockVerticalAlign),
        ...parseCombinedComponentDecor(o, key),
      };
    })
    .filter((x): x is CombinedCardComponentLayout => !!x);

  const baseComponents = parsed.length ? parsed : d.components;
  const migrated = migrateLegacyCombinedComponents(baseComponents, cols, rows);
  let nextRows = Math.min(48, Math.max(migrated.rows, minRowsForComponents(migrated.components)));

  const componentsFinal = migrated.components.map((c) => {
    const w = clampCell(c.w, 1, cols, 1);
    const h = clampCell(c.h, 1, nextRows, 1);
    const x0 = clampCell(c.x, 0, Math.max(0, cols - w), 0);
    const y0 = clampCell(c.y, 0, Math.max(0, nextRows - h), 0);
    const next: CombinedCardComponentLayout = { ...c, x: x0, y: y0, w, h };
    if (c.blockScalePercent != null && Number.isFinite(c.blockScalePercent)) {
      const cl = clampCombinedBlockScalePercent(Number(c.blockScalePercent));
      if (cl === 100) delete next.blockScalePercent;
      else next.blockScalePercent = cl;
    } else {
      delete next.blockScalePercent;
    }
    if (next.borderless !== true) delete next.borderless;
    if (next.dataOnly !== true) delete next.dataOnly;
    if (next.key !== 'decorSvg') {
      delete next.decorSvgId;
      delete next.decorColorMode;
      delete next.decorColorCustom;
      delete next.decorSendToBack;
    } else {
      const idRaw = String(next.decorSvgId ?? 'heart');
      next.decorSvgId = isCombinedDecorSvgId(idRaw) ? idRaw : 'heart';
      const modeRaw = String(next.decorColorMode ?? 'theme');
      next.decorColorMode = isCombinedSvgColorMode(modeRaw) ? modeRaw : 'theme';
      if (next.decorColorMode === 'custom') {
        const col = normalizeCombinedDecorColorCustom(next.decorColorCustom);
        if (col) next.decorColorCustom = col;
        else {
          delete next.decorColorCustom;
          next.decorColorMode = 'theme';
        }
      } else {
        delete next.decorColorCustom;
      }
      if (next.decorSendToBack !== true) delete next.decorSendToBack;
    }
    const ba = next.blockTextAlign;
    if (ba != null && isCombinedBlockTextAlign(String(ba))) next.blockTextAlign = ba;
    else delete next.blockTextAlign;
    const va = next.blockVerticalAlign;
    if (va != null && isCombinedBlockVerticalAlign(String(va))) next.blockVerticalAlign = va;
    else delete next.blockVerticalAlign;
    return next;
  });

  nextRows = Math.min(48, Math.max(nextRows, minRowsForComponents(componentsFinal)));

  const gapRaw = Number(r.sectionGapPx);
  return {
    cols,
    rows: nextRows,
    components: componentsFinal.length ? componentsFinal : d.components,
    ...(Number.isFinite(Number(r.textScalePercent))
      ? { textScalePercent: clampCell(r.textScalePercent, 60, 180, 100) }
      : {}),
    ...(Number.isFinite(Number(r.iconScalePercent))
      ? { iconScalePercent: clampCell(r.iconScalePercent, 60, 180, 100) }
      : {}),
    ...(Number.isFinite(gapRaw) ? { sectionGapPx: clampCombinedSectionGapPx(gapRaw) } : {}),
  };
}

/** Effective initiative row density for rendering. */
export function getInitiativeWidgetDensity(instance: WidgetInstance): 'normal' | 'compact' {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object') {
    const d = (cfg as { density?: string }).density;
    if (d === 'compact') return 'compact';
    if (d === 'normal') return 'normal';
  }
  if (instance.w <= 3) return 'compact';
  // Single layout row tall (layout designer / shrunk TV cell) → compact rows in auto mode.
  if (instance.h <= 1) return 'compact';
  return 'normal';
}

export function getInitiativeDensitySelectValue(instance: WidgetInstance): InitiativeWidgetDensityMode {
  const cfg = instance.config;
  if (cfg && typeof cfg === 'object') {
    const d = (cfg as { density?: string }).density;
    if (d === 'compact') return 'compact';
    if (d === 'normal') return 'normal';
  }
  return 'auto';
}
