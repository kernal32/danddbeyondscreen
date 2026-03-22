export type ModifierItem = {
  type?: string;
  subType?: string;
  value?: number;
  statId?: number;
};

export type GroupedModifiers = Record<string, ModifierItem[]>;

export function getModifiersByType(
  groupedModifiers: GroupedModifiers | undefined,
  type: string,
  subType?: string,
): ModifierItem[] {
  if (!groupedModifiers) return [];
  const matching: ModifierItem[] = [];
  for (const modifiers of Object.values(groupedModifiers)) {
    let filtered = modifiers.filter((item) => item.type === type);
    if (subType !== undefined) {
      filtered = filtered.filter((item) => item.subType === subType);
    }
    matching.push(...filtered);
  }
  return matching;
}

export function getTotalModifierValue(
  groupedModifiers: GroupedModifiers | undefined,
  type: string,
  subType: string,
): number {
  const modifiers = getModifiersByType(groupedModifiers, type, subType);
  return modifiers.reduce((sum, m) => sum + (m.value ?? 0), 0);
}
