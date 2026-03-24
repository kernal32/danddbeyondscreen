import { UI_THEME_CSS_VARS } from './uiTheme';

export type Theme = { [K in (typeof UI_THEME_CSS_VARS)[number]]: string };

type RGB = { r: number; g: number; b: number };

const FALLBACK_PALETTE = ['#0f1419', '#1a2332', '#38bdf8', '#94a3b8', '#f1f5f9'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function parseRgb(hex: string): RGB | null {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lin(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: RGB): number {
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrastRatio(lumA: number, lumB: number): number {
  const L1 = Math.max(lumA, lumB);
  const L2 = Math.min(lumA, lumB);
  return (L1 + 0.05) / (L2 + 0.05);
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  const l = (max + min) / 2;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: h * 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0,
    gp = 0,
    bp = 0;
  if (hh < 60) [rp, gp, bp] = [c, x, 0];
  else if (hh < 120) [rp, gp, bp] = [x, c, 0];
  else if (hh < 180) [rp, gp, bp] = [0, c, x];
  else if (hh < 240) [rp, gp, bp] = [0, x, c];
  else if (hh < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function toHex(rgb: RGB): string {
  const x = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${x(rgb.r)}${x(rgb.g)}${x(rgb.b)}`;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const u = clamp(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

function lightenHex(hex: string, amount: number): string {
  const rgb = parseRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb);
  return toHex(hslToRgb(h, s, clamp(l + amount, 0, 1)));
}

function darkenHex(hex: string, amount: number): string {
  return lightenHex(hex, -amount);
}

function rgbaFromRgb(rgb: RGB, a: number): string {
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${clamp(a, 0, 1)})`;
}

function semanticHue(kind: 'danger' | 'ok' | 'warn'): number {
  switch (kind) {
    case 'danger':
      return 0;
    case 'ok':
      return 142;
    case 'warn':
      return 38;
  }
}

/** Fixed semantic colours (red / green / amber) with lightness tuned for surfaces. */
function semanticHex(kind: 'danger' | 'ok' | 'warn', isDark: boolean, surfaceLum: number): string {
  const h = semanticHue(kind);
  const s = kind === 'warn' ? 0.9 : kind === 'danger' ? 0.72 : 0.58;
  const L =
    kind === 'danger'
      ? isDark
        ? 0.68
        : 0.42
      : kind === 'ok'
        ? isDark
          ? 0.62
          : 0.36
        : isDark
          ? 0.58
          : 0.4;
  const rgb = hslToRgb(h, s, L);
  /* Ensure at least ~3:1 vs surface for large UI text (soft target). */
  let out = rgb;
  let lum = relativeLuminance(out);
  let guard = 0;
  while (contrastRatio(lum, surfaceLum) < 3 && guard++ < 12) {
    const { h: hh, s: ss, l: ll } = rgbToHsl(out);
    out = hslToRgb(hh, ss, isDark ? ll + 0.04 : ll - 0.04);
    lum = relativeLuminance(out);
  }
  return toHex(out);
}

function pickAccent(scored: { rgb: RGB; L: number; hsl: { h: number; s: number; l: number } }[]): {
  rgb: RGB;
  h: number;
} {
  const mids = scored.filter((x) => x.L > 0.18 && x.L < 0.82);
  const pool = mids.length > 0 ? mids : scored;
  let best = pool[0];
  let bestScore = -1;
  for (const x of pool) {
    const sat = x.hsl.s;
    const midBonus = 1 - Math.abs(x.L - 0.5);
    const score = sat * 1.2 + midBonus * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return { rgb: best.rgb, h: best.hsl.h };
}

function nudgeTextForContrast(textHex: string, bgHex: string, minRatio = 4.5): string {
  const bg = parseRgb(bgHex);
  const txt = parseRgb(textHex);
  if (!bg || !txt) return textHex;
  const lumBg = relativeLuminance(bg);
  let { h, s, l } = rgbToHsl(txt);
  let rgb = txt;
  let lumT = relativeLuminance(rgb);
  let guard = 0;
  const needLightOnDark = lumBg < 0.5;
  while (contrastRatio(lumT, lumBg) < minRatio && guard++ < 24) {
    l = needLightOnDark ? clamp(l + 0.04, 0, 1) : clamp(l - 0.04, 0, 1);
    s = clamp(s * 0.92, 0, 1);
    rgb = hslToRgb(h, s, l);
    lumT = relativeLuminance(rgb);
  }
  return toHex(rgb);
}

export type ContrastIssue = {
  pair: string;
  ratio: number;
  minimum: number;
};

/** WCAG-style contrast checks for key pairs (normal text target 4.5:1). */
function colorToRgb(s: string): RGB | null {
  const t = s.trim();
  if (t.startsWith('#')) return parseRgb(t);
  const m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

export function validateThemeContrast(theme: Theme, minNormal = 4.5): ContrastIssue[] {
  const checks: [string, string, string, number][] = [
    ['text on bg', theme['--text'], theme['--bg'], minNormal],
    ['muted on bg', theme['--muted'], theme['--bg'], 3],
    ['text on surface', theme['--text'], theme['--surface'], minNormal],
    ['accent on bg', theme['--accent'], theme['--bg'], 3],
  ];
  const issues: ContrastIssue[] = [];
  for (const [pair, fg, bg, min] of checks) {
    const a = colorToRgb(fg);
    const b = colorToRgb(bg);
    if (!a || !b) continue;
    const r = contrastRatio(relativeLuminance(a), relativeLuminance(b));
    if (r < min) issues.push({ pair, ratio: Math.round(r * 100) / 100, minimum: min });
  }
  return issues;
}

/**
 * Map an arbitrary palette (hex strings) to the app’s UI CSS variables.
 * Uses luminance + saturation to assign structural roles; keeps danger/ok/warn as red/green/amber family.
 */
export function mapPaletteToTheme(palette: string[]): Theme {
  const normalized = palette
    .map((p) => {
      const t = p.trim();
      if (!t) return null;
      const m = t.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!m) return null;
      let h = m[1].toLowerCase();
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return `#${h}`;
    })
    .filter((x): x is string => !!x);

  const source = normalized.length > 0 ? normalized : FALLBACK_PALETTE;

  const rgbList = source.map(parseRgb).filter((x): x is RGB => !!x);
  const scored = rgbList.map((rgb) => ({
    rgb,
    L: relativeLuminance(rgb),
    hsl: rgbToHsl(rgb),
  }));

  const avgL = scored.reduce((a, b) => a + b.L, 0) / Math.max(1, scored.length);
  const isDark = avgL < 0.45;

  const byL = [...scored].sort((a, b) => a.L - b.L);
  const darkest = byL[0]?.rgb ?? { r: 15, g: 20, b: 25 };
  const lightest = byL[byL.length - 1]?.rgb ?? { r: 241, g: 245, b: 249 };

  const bgRgb = mixRgb(darkest, byL[Math.min(1, byL.length - 1)]?.rgb ?? darkest, 0.35);
  const surfaceRgb = mixRgb(bgRgb, byL[Math.min(2, byL.length - 1)]?.rgb ?? bgRgb, 0.5);
  const surfaceHex = toHex(surfaceRgb);
  const elevatedHex = lightenHex(surfaceHex, isDark ? 0.04 : -0.03);
  const elevated = parseRgb(elevatedHex) ?? surfaceRgb;

  const accentPick = pickAccent(scored);
  const accentHex = toHex(accentPick.rgb);
  const accentH = accentPick.h;

  let textHex = toHex(lightest);
  if (isDark) {
    textHex = lightenHex(toHex(lightest), 0.08);
    if (relativeLuminance(parseRgb(textHex)!) < 0.7) {
      textHex = '#f1f5f9';
    }
  } else {
    textHex = darkenHex(toHex(lightest), 0.12);
    if (relativeLuminance(parseRgb(textHex)!) > 0.25) {
      textHex = '#1c1917';
    }
  }

  const bgHex = toHex(bgRgb);
  textHex = nudgeTextForContrast(textHex, bgHex, 4.5);

  const surfaceLum = relativeLuminance(surfaceRgb);

  const mutedRgb = mixRgb(parseRgb(textHex)!, bgRgb, isDark ? 0.42 : 0.45);
  let mutedHex = toHex(mutedRgb);
  mutedHex = nudgeTextForContrast(mutedHex, bgHex, 3);

  const danger = semanticHex('danger', isDark, surfaceLum);
  const ok = semanticHex('ok', isDark, surfaceLum);
  const warn = semanticHex('warn', isDark, surfaceLum);

  const link = accentHex;
  const linkHover = lightenHex(accentHex, isDark ? 0.08 : -0.08);
  const focusRing = accentHex;

  const spellHue = (accentH + 268) % 360;
  const spellRgb = hslToRgb(spellHue, 0.55, isDark ? 0.72 : 0.42);
  const spell = toHex(spellRgb);
  const spellBar = rgbaFromRgb(spellRgb, 0.82);

  const borderSubtle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const borderStrong = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.18)';
  const ornamentStroke = rgbaFromRgb(accentPick.rgb, 0.5);
  const ornamentGlow = rgbaFromRgb(accentPick.rgb, isDark ? 0.35 : 0.22);

  const overlayScrim = rgbaFromRgb(bgRgb, isDark ? 0.78 : 0.42);
  const surfaceGlass = rgbaFromRgb(surfaceRgb, 0.88);

  const calloutBorder = rgbaFromRgb(accentPick.rgb, isDark ? 0.38 : 0.32);
  const calloutBg = rgbaFromRgb(mixRgb(bgRgb, accentPick.rgb, 0.25), isDark ? 0.28 : 0.2);
  const calloutStrong = lightenHex(accentHex, isDark ? 0.12 : -0.05);

  const btnPrimary = darkenHex(accentHex, isDark ? 0.12 : 0);
  const btnPrimaryHover = lightenHex(btnPrimary, isDark ? 0.06 : 0.08);
  const btnSecondary = toHex(mixRgb(surfaceRgb, parseRgb(textHex)!, isDark ? 0.15 : 0.12));
  const btnSecondaryHover = lightenHex(btnSecondary, isDark ? 0.06 : -0.06);
  const btnCta = toHex(hslToRgb((accentH + 52) % 360, 0.55, isDark ? 0.42 : 0.38));
  const btnCtaHover = lightenHex(btnCta, isDark ? 0.06 : 0.06);

  const shadowPanel = isDark ? '0 2px 14px rgba(0, 0, 0, 0.38)' : '0 4px 20px rgba(0, 0, 0, 0.12)';
  const glowPanel = `drop-shadow(0 0 3px ${rgbaFromRgb(accentPick.rgb, isDark ? 0.12 : 0.08)})`;

  const theme: Theme = {
    '--bg': bgHex,
    '--surface': surfaceHex,
    '--surface-elevated': toHex(elevated),
    '--surface-glass': surfaceGlass,
    '--overlay-scrim': overlayScrim,
    '--text': textHex,
    '--muted': mutedHex,
    '--accent': accentHex,
    '--danger': danger,
    '--ok': ok,
    '--warn': warn,
    '--border-subtle': borderSubtle,
    '--border-strong': borderStrong,
    '--ornament-stroke': ornamentStroke,
    '--ornament-glow': ornamentGlow,
    '--link': link,
    '--link-hover': linkHover,
    '--focus-ring': focusRing,
    '--spell': spell,
    '--spell-bar': spellBar,
    '--icon-conditions': warn,
    '--icon-spells': spell,
    '--hp-mid': warn,
    '--hp-bar-mid': lightenHex(accentHex, isDark ? -0.05 : 0.05),
    '--temp-hp': linkHover,
    '--ac-tint': accentHex,
    '--ac-caption': rgbaFromRgb(parseRgb(linkHover)!, 0.95),
    '--ability-mod': lightenHex(spell, isDark ? 0.04 : -0.04),
    '--saves-line': (() => {
      const w = parseRgb(warn);
      return w ? rgbaFromRgb(w, 0.92) : 'rgba(251, 191, 36, 0.92)';
    })(),
  };

  theme['--positive-status'] = ok;
  theme['--warn-status'] = warn;
  theme['--callout-border'] = calloutBorder;
  theme['--callout-bg'] = calloutBg;
  theme['--callout-text'] = 'var(--muted)';
  theme['--callout-strong'] = calloutStrong;
  theme['--shadow-panel'] = shadowPanel;
  theme['--glow-panel'] = glowPanel;
  theme['--panel-inset'] = '0.75rem';
  theme['--btn-primary-bg'] = btnPrimary;
  theme['--btn-primary-hover'] = btnPrimaryHover;
  theme['--btn-secondary-bg'] = btnSecondary;
  theme['--btn-secondary-hover'] = btnSecondaryHover;
  theme['--btn-cta-bg'] = btnCta;
  theme['--btn-cta-hover'] = btnCtaHover;
  theme['--panel-radius'] = '0.5rem';
  theme['--panel-corner-size'] = '1rem';

  return theme;
}
