import type { TableTheme } from '@ddb/shared-types/themes';

/** Decorative frame geometry used by `ThemedPanelFrame` (independent of session theme id). */
export type PanelBorderVariant = 'modern' | 'fantasy' | 'sciFi' | 'organic';

/** CSS custom properties defined on `.theme-*` scopes — documentation + optional validation lists. */
export const UI_THEME_CSS_VARS = [
  '--bg',
  '--surface',
  '--text',
  '--muted',
  '--accent',
  '--danger',
  '--ok',
  '--warn',
  '--surface-elevated',
  '--surface-glass',
  '--overlay-scrim',
  '--border-subtle',
  '--border-strong',
  '--ornament-stroke',
  '--ornament-glow',
  '--link',
  '--link-hover',
  '--focus-ring',
  '--spell',
  '--spell-bar',
  '--icon-conditions',
  '--icon-spells',
  '--hp-mid',
  '--hp-bar-mid',
  '--temp-hp',
  '--ac-tint',
  '--ac-caption',
  '--ability-mod',
  '--saves-line',
  '--positive-status',
  '--warn-status',
  '--callout-border',
  '--callout-bg',
  '--callout-text',
  '--callout-strong',
  '--shadow-panel',
  '--glow-panel',
  '--panel-inset',
  '--btn-primary-bg',
  '--btn-primary-hover',
  '--btn-secondary-bg',
  '--btn-secondary-hover',
  '--btn-cta-bg',
  '--btn-cta-hover',
  '--panel-radius',
  /** Corner ornament box (width/height); ~1rem–1.25rem keeps trims subtle. */
  '--panel-corner-size',
] as const;

export function borderVariantForTableTheme(theme: TableTheme): PanelBorderVariant {
  switch (theme) {
    case 'fantasy':
    case 'stoneDungeon':
      return 'fantasy';
    case 'sciFi':
    case 'darkArcane':
      return 'sciFi';
    case 'organic':
      return 'organic';
    case 'minimal':
    case 'parchment':
    default:
      return 'modern';
  }
}
