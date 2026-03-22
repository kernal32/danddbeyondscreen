/** Table display themes (session + optional per-widget override). */
export const TABLE_THEME_IDS = [
  'minimal',
  'fantasy',
  'darkArcane',
  'parchment',
  'stoneDungeon',
] as const;

export type TableTheme = (typeof TABLE_THEME_IDS)[number];

export function isTableTheme(value: unknown): value is TableTheme {
  return typeof value === 'string' && (TABLE_THEME_IDS as readonly string[]).includes(value);
}
