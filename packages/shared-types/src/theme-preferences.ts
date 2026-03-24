import type { TableTheme } from './themes.js';
import { isTableTheme } from './themes.js';

export const THEME_PALETTE_MAX_COLORS = 12;
export const THEME_PALETTE_MIN_COLORS = 1;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function expandShortHex(s: string): string | null {
  const m = s.trim().match(HEX);
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h}`;
}

/** Normalize to `#rrggbb` or return null. */
export function normalizeHexColor(input: string): string | null {
  return expandShortHex(input);
}

/**
 * Validate session/API theme palette payload.
 * @returns `null` to clear palette; array of normalized hex; throws on invalid.
 */
export function assertValidThemePalette(value: unknown): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error('themePalette must be an array or null');
  if (value.length === 0) return null;
  if (value.length > THEME_PALETTE_MAX_COLORS) {
    throw new Error(`themePalette max ${THEME_PALETTE_MAX_COLORS} colors`);
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('themePalette entries must be strings');
    const n = normalizeHexColor(item);
    if (!n) throw new Error('themePalette contains invalid hex color');
    out.push(n);
  }
  if (out.length < THEME_PALETTE_MIN_COLORS) return null;
  return out;
}

export type SavedCustomTheme = {
  id: string;
  name: string;
  palette: string[];
  /** Structural theme class (panel frame variant, fallbacks). */
  baseTheme: TableTheme;
};

export type ThemePreferenceDefault =
  | { kind: 'builtin'; theme: TableTheme }
  | { kind: 'custom'; id: string }
  | null;

export type UserThemePreferences = {
  savedCustomThemes: SavedCustomTheme[];
  /** Applied when creating a new table session (logged-in DM). */
  preferredDefault: ThemePreferenceDefault;
};

const DEFAULT_USER_THEME_PREFS: UserThemePreferences = {
  savedCustomThemes: [],
  preferredDefault: null,
};

function isSavedThemeId(s: string): boolean {
  return /^[a-zA-Z0-9_-]{8,64}$/.test(s);
}

export function parseUserThemePreferences(value: unknown): UserThemePreferences {
  if (value == null || typeof value !== 'object') return { ...DEFAULT_USER_THEME_PREFS };
  const o = value as Record<string, unknown>;
  const savedRaw = o.savedCustomThemes;
  const savedCustomThemes: SavedCustomTheme[] = [];
  if (Array.isArray(savedRaw)) {
    for (const row of savedRaw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' && isSavedThemeId(r.id) ? r.id : null;
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
      const baseTheme = isTableTheme(r.baseTheme) ? r.baseTheme : null;
      let palette: string[] | null = null;
      try {
        palette = r.palette === undefined ? [] : assertValidThemePalette(r.palette);
      } catch {
        palette = null;
      }
      if (!id || !name || !baseTheme || !palette || palette.length < THEME_PALETTE_MIN_COLORS) continue;
      savedCustomThemes.push({ id, name, palette, baseTheme });
    }
  }
  let preferredDefault: ThemePreferenceDefault = null;
  const pref = o.preferredDefault;
  if (pref && typeof pref === 'object') {
    const p = pref as Record<string, unknown>;
    if (p.kind === 'builtin' && isTableTheme(p.theme)) {
      preferredDefault = { kind: 'builtin', theme: p.theme };
    } else if (p.kind === 'custom' && typeof p.id === 'string' && isSavedThemeId(p.id)) {
      preferredDefault = { kind: 'custom', id: p.id };
    }
  }
  if (preferredDefault && preferredDefault.kind === 'custom') {
    const customId = preferredDefault.id;
    const ok = savedCustomThemes.some((t) => t.id === customId);
    if (!ok) preferredDefault = null;
  }
  return { savedCustomThemes: savedCustomThemes.slice(0, 24), preferredDefault };
}
