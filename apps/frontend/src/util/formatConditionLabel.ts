function isLikelySpellSlotLeakInConditions(o: Record<string, unknown>): boolean {
  if (typeof o.name === 'string' && o.name.trim()) return false;
  if (typeof o.label === 'string' && o.label.trim()) return false;
  const def = o.definition;
  if (def && typeof def === 'object' && typeof (def as Record<string, unknown>).name === 'string') return false;
  if (typeof o.id !== 'number' || !Number.isFinite(o.id)) return false;
  const lv = o.level;
  if (lv !== null && lv !== undefined && typeof lv !== 'number') return false;
  return true;
}

/** Match backend `conditionToLabel` — safe for legacy party rows where conditions were objects. */
export function formatConditionLabel(x: unknown): string {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
    if (typeof o.label === 'string' && o.label.trim()) return o.label.trim();
    const def = o.definition;
    if (def && typeof def === 'object') {
      const d = def as Record<string, unknown>;
      if (typeof d.name === 'string' && d.name.trim()) return d.name.trim();
    }
    if (isLikelySpellSlotLeakInConditions(o)) return '';
  }
  if (x == null) return '';
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}
