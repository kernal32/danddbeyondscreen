import {
  getTotalModifierValue,
  type GroupedModifiers,
  type ModifierItem,
} from './data-modifier.js';

const ARMOR_TYPE_LIGHT = 1;
const ARMOR_TYPE_MEDIUM = 2;
const ARMOR_TYPE_HEAVY = 3;
const ARMOR_TYPE_SHIELD = 4;

export function isArmorItem(itemDefinition: Record<string, unknown>): boolean {
  return itemDefinition.filterType === 'Armor';
}

export function calculateItemAc(
  itemDefinition: Record<string, unknown>,
  dexMod = 0,
  includeItemMods = true,
): number {
  const armorTypeId = (itemDefinition.armorTypeId as number) ?? 0;
  let itemAc = (itemDefinition.armorClass as number) ?? 0;

  switch (armorTypeId) {
    case ARMOR_TYPE_LIGHT:
      itemAc += dexMod;
      break;
    case ARMOR_TYPE_MEDIUM:
      itemAc += Math.max(dexMod, 2);
      break;
    case ARMOR_TYPE_HEAVY:
    case ARMOR_TYPE_SHIELD:
    default:
      break;
  }

  if (includeItemMods && Array.isArray(itemDefinition.grantedModifiers)) {
    const grouped: GroupedModifiers = {
      item: itemDefinition.grantedModifiers as ModifierItem[],
    };
    itemAc += getTotalModifierValue(grouped, 'bonus', 'armor-class');
  }

  return itemAc;
}

export const ArmorType = {
  LIGHT: ARMOR_TYPE_LIGHT,
  MEDIUM: ARMOR_TYPE_MEDIUM,
  HEAVY: ARMOR_TYPE_HEAVY,
  SHIELD: ARMOR_TYPE_SHIELD,
} as const;
