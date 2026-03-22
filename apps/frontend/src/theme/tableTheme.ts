import { type TableTheme, isTableTheme } from '@ddb/shared-types';

/** CSS classes on `document.documentElement` and optional widget wrappers (see `index.css`). */
export const ROOT_THEME_CLASSLIST = [
  'theme-minimal',
  'theme-fantasy',
  'theme-dark-arcane',
  'theme-parchment',
  'theme-stone-dungeon',
] as const;

const TO_CLASS: Record<TableTheme, (typeof ROOT_THEME_CLASSLIST)[number]> = {
  minimal: 'theme-minimal',
  fantasy: 'theme-fantasy',
  darkArcane: 'theme-dark-arcane',
  parchment: 'theme-parchment',
  stoneDungeon: 'theme-stone-dungeon',
};

export function tableThemeCssClass(theme: TableTheme): string {
  return TO_CLASS[theme];
}

export function applyRootTableTheme(theme: TableTheme): void {
  const root = document.documentElement;
  for (const c of ROOT_THEME_CLASSLIST) root.classList.remove(c);
  root.classList.add(tableThemeCssClass(theme));
}

/** Per-widget `themeOverride` must be a valid `TableTheme` string; otherwise session theme is used. */
export function widgetThemeSurfaceClass(sessionTheme: TableTheme, override?: string | null): string {
  const t = override?.trim();
  if (t && isTableTheme(t)) return tableThemeCssClass(t);
  return tableThemeCssClass(sessionTheme);
}

export const THEME_LABELS: Record<TableTheme, string> = {
  minimal: 'Minimal',
  fantasy: 'Fantasy',
  darkArcane: 'Dark arcane',
  parchment: 'Parchment',
  stoneDungeon: 'Stone dungeon',
};
