import type { PartyCardDisplayOptions, PlayerCardSectionId } from './party-card-display.js';
import { effectivePlayerCardSectionOrder } from './party-card-display.js';
import {
  PLAYER_CARD_LAYOUT_SCHEMA_VERSION,
  type PlayerCardLayoutElement,
  type PlayerCardLayoutSchema,
  type PlayerCardLayoutVisibilityRule,
} from './player-card-layout-schema.js';

const SECTION_HEIGHT_WEIGHT: Record<PlayerCardSectionId, number> = {
  header: 18,
  primaryStats: 22,
  movement: 8,
  abilities: 14,
  savingThrows: 12,
  senses: 10,
  classSummary: 10,
  spellSlots: 14,
  conditions: 12,
};

function visibilityRuleForSection(section: PlayerCardSectionId, o: PartyCardDisplayOptions): PlayerCardLayoutVisibilityRule {
  switch (section) {
    case 'header':
      return {
        any: [
          { path: 'options.showAvatar', eq: true },
          { path: 'options.showCharacterName', eq: true },
          { path: 'options.showLevelRaceClass', eq: true },
          { path: 'options.showPlayerName', eq: true },
        ],
      };
    case 'primaryStats':
      return {
        any: [
          { path: 'options.showHitPoints', eq: true },
          { path: 'options.showHitPointsBar', eq: true },
          { path: 'options.showArmorClass', eq: true },
          { path: 'options.showSpellSaveDC', eq: true },
          { path: 'options.showInitiative', eq: true },
        ],
      };
    case 'movement':
      return { all: [{ path: 'options.showMovement', eq: true }] };
    case 'abilities':
      return { all: [{ path: 'options.showAbilities', eq: true }] };
    case 'savingThrows':
      return { all: [{ path: 'options.showSavingThrows', eq: true }] };
    case 'senses':
      return {
        any: [
          { path: 'options.showPassivePerception', eq: true },
          { path: 'options.showPassiveInvestigation', eq: true },
          { path: 'options.showPassiveInsight', eq: true },
        ],
      };
    case 'classSummary':
      return { all: [{ path: 'options.showClassCombatSummary', eq: true }] };
    case 'spellSlots':
      return { all: [{ path: 'options.showSpellSlots', eq: true }] };
    case 'conditions':
      return { all: [{ path: 'options.showConditions', eq: true }] };
    default:
      return {};
  }
}

function styleOverridesFromOptions(o: PartyCardDisplayOptions): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (o.primaryStatNumeralScalePercent != null && Number.isFinite(o.primaryStatNumeralScalePercent)) {
    out['--pc-primary-numeral-scale'] = `${o.primaryStatNumeralScalePercent}%`;
  }
  if (o.primaryStatIconScalePercent != null && Number.isFinite(o.primaryStatIconScalePercent)) {
    out['--pc-primary-icon-scale'] = `${o.primaryStatIconScalePercent}%`;
  }
  if (o.hpHeartNumeralSpacingPx != null && Number.isFinite(o.hpHeartNumeralSpacingPx)) {
    out['--pc-hp-heart-spacing-px'] = `${Math.round(o.hpHeartNumeralSpacingPx)}px`;
  }
  return Object.keys(out).length ? out : undefined;
}

export function migrateLegacyPartyCardOptionsToSchema(o: PartyCardDisplayOptions): PlayerCardLayoutSchema {
  const order = effectivePlayerCardSectionOrder(o);
  let totalW = 0;
  for (const id of order) totalW += SECTION_HEIGHT_WEIGHT[id] ?? 10;
  const elements: PlayerCardLayoutElement[] = [];
  let y = 0;
  const sharedStyles = styleOverridesFromOptions(o);
  let z = 0;
  for (const sectionId of order) {
    const weight = SECTION_HEIGHT_WEIGHT[sectionId] ?? 10;
    const h = (weight / totalW) * 100;
    elements.push({
      id: `mig-${sectionId}`,
      type: 'migratedSection',
      x: 0,
      y,
      w: 100,
      h,
      anchor: { x: 'left', y: 'top' },
      zIndex: z++,
      visibility: visibilityRuleForSection(sectionId, o),
      styleOverrides: sharedStyles,
      props: { sectionId },
    });
    y += h;
  }
  return { version: PLAYER_CARD_LAYOUT_SCHEMA_VERSION, elements };
}
