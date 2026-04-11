import { type TableTheme, isTableTheme } from '@ddb/shared-types/themes';
import { mapPaletteToTheme } from './mapPaletteToTheme';
import { UI_THEME_CSS_VARS } from './uiTheme';

/** CSS classes on `document.documentElement` and optional widget wrappers (see `index.css`). */
export const ROOT_THEME_CLASSLIST = [
  'theme-minimal',
  'theme-fantasy',
  'theme-dark-arcane',
  'theme-parchment',
  'theme-stone-dungeon',
  'theme-sci-fi',
  'theme-organic',
] as const;

const TO_CLASS: Record<TableTheme, (typeof ROOT_THEME_CLASSLIST)[number]> = {
  minimal: 'theme-minimal',
  fantasy: 'theme-fantasy',
  darkArcane: 'theme-dark-arcane',
  parchment: 'theme-parchment',
  stoneDungeon: 'theme-stone-dungeon',
  sciFi: 'theme-sci-fi',
  organic: 'theme-organic',
};

export function tableThemeCssClass(theme: TableTheme): string {
  return TO_CLASS[theme];
}

export function applyRootTableTheme(theme: TableTheme): void {
  const safe: TableTheme = isTableTheme(theme) ? theme : 'minimal';
  const root = document.documentElement;
  for (const v of UI_THEME_CSS_VARS) root.style.removeProperty(v);
  for (const c of ROOT_THEME_CLASSLIST) root.classList.remove(c);
  root.classList.add(tableThemeCssClass(safe));
}

/** Apply base theme class and optional palette-derived CSS variables (display + master + settings). */
export function applySessionVisualTheme(theme: TableTheme, palette?: string[] | null): void {
  applyRootTableTheme(theme);
  if (!palette?.length) return;
  const mapped = mapPaletteToTheme(palette);
  const root = document.documentElement;
  for (const key of UI_THEME_CSS_VARS) {
    root.style.setProperty(key, mapped[key]);
  }
}

/** Per-widget `themeOverride` must be a valid `TableTheme` string; otherwise session theme is used. */
export function widgetThemeSurfaceClass(sessionTheme: TableTheme, override?: string | null): string {
  const t = override?.trim();
  if (t && isTableTheme(t)) return tableThemeCssClass(t);
  return tableThemeCssClass(sessionTheme);
}

/**
 * When `themePalette` is applied, tokens live on `document.documentElement` (inline). A nested `.theme-*`
 * would re-define the same `--*` variables and hide the palette (TV + editor preview).
 */
export function widgetThemeSurfaceClassFromSession(
  sessionTheme: TableTheme,
  override: string | null | undefined,
  themePalette: string[] | null | undefined,
): string {
  if (themePalette && themePalette.length > 0) return '';
  return widgetThemeSurfaceClass(sessionTheme, override);
}

export function resolveWidgetTableTheme(sessionTheme: TableTheme, override?: string | null): TableTheme {
  const t = override?.trim();
  if (t && isTableTheme(t)) return t;
  return sessionTheme;
}

export const THEME_LABELS: Record<TableTheme, string> = {
  minimal: 'Modern',
  fantasy: 'Fantasy',
  darkArcane: 'Dark arcane',
  parchment: 'Parchment',
  stoneDungeon: 'Stone dungeon',
  sciFi: 'Sci‑fi',
  organic: 'Organic',
};
