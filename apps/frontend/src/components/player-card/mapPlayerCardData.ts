import type { NormalizedCharacter } from '@ddb/shared-types';
import type { PlayerCardData } from './types';

export function normalizedCharacterToPlayerCardData(c: NormalizedCharacter): PlayerCardData {
  const combat =
    c.spellSaveDC != null
      ? { spellSaveDC: c.spellSaveDC }
      : undefined;
  return {
    name: c.name,
    avatarUrl: c.avatarUrl?.trim() || undefined,
    hp: {
      current: Number(c.currentHp) || 0,
      max: Number(c.maxHp) || 0,
      tempHp: c.tempHp != null ? Number(c.tempHp) : undefined,
    },
    ac: c.ac,
    initiativeMod: c.initiativeBonus ?? 0,
    passives: {
      perception: c.passivePerception,
      investigation: c.passiveInvestigation,
      insight: c.passiveInsight,
    },
    conditions: c.conditions.length > 0 ? [...c.conditions] : undefined,
    spellSlots: c.spellSlots && c.spellSlots.length > 0 ? c.spellSlots : undefined,
    classResources:
      c.classResources && c.classResources.length > 0 ? c.classResources : undefined,
    ...(combat ? { combat } : {}),
  };
}
