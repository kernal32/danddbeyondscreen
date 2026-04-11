import { calculateModifier } from './ability-score.js';
import {
  getModifiersByType,
  getTotalModifierValue,
  type GroupedModifiers,
} from './data-modifier.js';
import { calculateItemAc, isArmorItem, ArmorType } from './item-ac.js';

const statMap: Record<number, string> = {
  1: 'strength',
  2: 'dexterity',
  3: 'constitution',
  4: 'intelligence',
  5: 'wisdom',
  6: 'charisma',
};

export type DdbCharacter = Record<string, unknown>;

export function getStatMod(character: DdbCharacter, statName: string | number): number {
  let name = statName;
  if (typeof statName === 'number') {
    name = statMap[statName] ?? '';
  }
  name = String(name).toLowerCase();

  let statId: number | false = false;
  for (const [dndId, allowed] of Object.entries(statMap)) {
    if (name === allowed || allowed.slice(0, 3) === name) {
      statId = Number(dndId);
      break;
    }
  }
  if (statId === false) return 0;

  const overrideStats = character.overrideStats as { id: number; value: number }[] | undefined;
  const stats = character.stats as { id: number; value: number }[] | undefined;
  let statValues: Record<number, number> = {};
  if (overrideStats?.length) {
    statValues = Object.fromEntries(overrideStats.map((s) => [s.id, s.value]));
  }
  if (!statValues[statId] && stats?.length) {
    statValues = Object.fromEntries(stats.map((s) => [s.id, s.value]));
  }
  if (!statValues[statId]) return 0;

  const modifiers = character.modifiers as GroupedModifiers | undefined;
  const statKey = statMap[statId];
  statValues[statId] += getTotalModifierValue(modifiers, 'bonus', `${statKey}-score`);

  return calculateModifier(statValues[statId]);
}

export function calculateAc(character: DdbCharacter): number {
  const dexMod = getStatMod(character, 'dex');
  let characterAc = 10 + dexMod;
  let armorAc = 0;
  let shieldAc = 0;
  const modifiers = character.modifiers as GroupedModifiers | undefined;
  const inventory = (character.inventory as Record<string, unknown>[]) ?? [];

  const equippedItems = inventory.filter(
    (item) => item.equipped && item.definition && typeof item.definition === 'object',
  );

  const equippedShields = equippedItems.filter((item) => {
    const def = item.definition as Record<string, unknown>;
    return def.armorTypeId === ArmorType.SHIELD;
  });

  const equippedArmor = equippedItems.filter((item) => {
    const def = item.definition as Record<string, unknown>;
    return isArmorItem(def) && def.armorTypeId !== ArmorType.SHIELD;
  });

  if (equippedShields.length) {
    shieldAc = Math.max(
      0,
      ...equippedShields.map((item) =>
        calculateItemAc(item.definition as Record<string, unknown>, dexMod, false),
      ),
    );
  }

  if (equippedArmor.length) {
    armorAc = Math.max(
      0,
      ...equippedArmor.map((item) =>
        calculateItemAc(item.definition as Record<string, unknown>, dexMod, false),
      ),
    );
  } else {
    const unarmored = getModifiersByType(modifiers, 'set', 'unarmored-armor-class');
    armorAc = Math.max(
      0,
      ...unarmored.map((modifier) => {
        let ac = characterAc;
        if (modifier.statId != null) {
          ac += getStatMod(character, Number(modifier.statId));
        }
        if (modifier.value != null) {
          ac += modifier.value;
        }
        return ac;
      }),
    );
  }

  const bonusAc = getTotalModifierValue(modifiers, 'bonus', 'armor-class');
  return Math.max(characterAc, armorAc) + shieldAc + bonusAc;
}

function armorClassFromDdbField(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    if (n >= 0 && n <= 50) return n;
    return null;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d+$/.test(t)) {
      const n = Number(t);
      if (n >= 0 && n <= 50) return n;
    }
  }
  return null;
}

/**
 * Prefer DDB’s computed total AC when the payload includes it. Partial merges / stripped
 * inventory often break `calculateAc`; the sheet’s `armorClass` stays authoritative.
 */
export function resolveDisplayArmorClass(character: DdbCharacter): number {
  const r = character as Record<string, unknown>;
  for (const key of ['armorClass', 'armor_class', 'calculatedArmorClass']) {
    const n = armorClassFromDdbField(r[key]);
    if (n != null) return n;
  }
  return calculateAc(character);
}

export function getMaxHp(character: DdbCharacter): number {
  if (character.overrideHitPoints != null && character.overrideHitPoints !== '') {
    return Number(character.overrideHitPoints);
  }

  const preferences = character.preferences as Record<string, unknown> | undefined;
  const modifiers = character.modifiers as GroupedModifiers | undefined;
  const classes = (character.classes as Record<string, unknown>[]) ?? [];

  let maxHp = 0;
  if (preferences?.hitPointType) {
    const bonusPerLevel = getTotalModifierValue(modifiers, 'bonus', 'hit-points-per-level');
    const con = getStatMod(character, 'con');
    for (const cls of classes) {
      const definition = cls.definition as Record<string, unknown> | undefined;
      const hitDie = Number(definition?.hitDice) || 0;
      let adjustedLevel = Number(cls.level) || 0;
      if (cls.isStartingClass) {
        maxHp += hitDie + con;
        adjustedLevel--;
      }
      maxHp += (Math.ceil(hitDie / 2 + 1) + con) * adjustedLevel + bonusPerLevel * Number(cls.level || 0);
    }
  } else {
    maxHp = Number(character.baseHitPoints) || 0;
  }

  maxHp += Number(character.bonusHitPoints) || 0;
  return maxHp;
}

/** Dexterity check + optional proficiency on “initiative” + flat bonuses (covers Jack of All Trades etc. from DDB payloads). */
export function getInitiativeBonus(character: DdbCharacter): number {
  const dexMod = getStatMod(character, 'dex');
  const modifiers = character.modifiers as GroupedModifiers | undefined;
  let bonus = dexMod;
  const prof = getModifiersByType(modifiers, 'proficiency', 'initiative');
  if (prof.length) {
    bonus += getProficiencyBonus(character);
  }
  bonus += getTotalModifierValue(modifiers, 'bonus', 'initiative');
  return bonus;
}

export function getPassiveScore(character: DdbCharacter, proficiencyName: string): number {
  let statMod = 0;
  switch (proficiencyName) {
    case 'insight':
    case 'perception':
      statMod = getStatMod(character, 'wis');
      break;
    case 'investigation':
      statMod = getStatMod(character, 'int');
      break;
    default:
      statMod = 0;
  }

  const modifiers = character.modifiers as GroupedModifiers | undefined;
  let skillMod = 0;
  const profBonuses = getModifiersByType(modifiers, 'proficiency', proficiencyName);
  if (profBonuses.length) {
    skillMod += getProficiencyBonus(character);
  }
  const passiveBonuses = getModifiersByType(modifiers, 'bonus', `passive-${proficiencyName}`);
  skillMod += passiveBonuses.reduce((s, m) => s + (m.value ?? 0), 0);

  return 10 + statMod + skillMod;
}

const skillProficiencyByLevel = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

export function getProficiencyBonus(character: DdbCharacter): number {
  const classes = (character.classes as { level: number }[]) ?? [];
  const level = Math.max(1, Math.min(20, classes.reduce((s, c) => s + (c.level || 0), 0)));
  return skillProficiencyByLevel[level - 1];
}

function spellcastingAbilityIdFromClass(cls: Record<string, unknown>): number | undefined {
  const def = cls.definition as Record<string, unknown> | undefined;
  const sub = cls.subclassDefinition as Record<string, unknown> | undefined;
  for (const block of [def, sub]) {
    if (!block || block.canCastSpells !== true) continue;
    const id = block.spellCastingAbilityId;
    if (id == null || id === '') continue;
    const n = Number(id);
    if (Number.isFinite(n) && n >= 1 && n <= 6) return n;
  }
  return undefined;
}

/**
 * Spell save DC from D&D Beyond–style JSON: 8 + proficiency bonus + spellcasting ability modifier,
 * plus flat `bonus` modifiers with subType `spell-save-dc` (when present).
 * If multiple classes cast spells, uses the **starting** class’s spellcasting ability when it casts;
 * otherwise the first class in the list that can cast.
 */
export function getSpellSaveDc(character: DdbCharacter): number | undefined {
  const classes = (character.classes as Record<string, unknown>[]) ?? [];
  if (!classes.length) return undefined;

  const prof = getProficiencyBonus(character);
  const modifiers = character.modifiers as GroupedModifiers | undefined;
  const flatBonus =
    getTotalModifierValue(modifiers, 'bonus', 'spell-save-dc') +
    getTotalModifierValue(modifiers, 'bonus', 'spell-save');

  let fromStarting: number | undefined;
  let fromFirst: number | undefined;

  for (const cls of classes) {
    const abilityId = spellcastingAbilityIdFromClass(cls);
    if (abilityId === undefined) continue;
    const mod = getStatMod(character, abilityId);
    const dc = 8 + prof + mod + flatBonus;
    if (fromFirst === undefined) fromFirst = dc;
    if (cls.isStartingClass === true) fromStarting = dc;
  }

  const raw = fromStarting ?? fromFirst;
  if (raw === undefined) return undefined;
  return Math.max(8, Math.min(30, Math.round(raw)));
}
