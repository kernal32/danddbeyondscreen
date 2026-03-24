/** Inline SVGs for party stat rows (TV + DM). */

/**
 * Heater shield outline from project-supplied SVG (high-res path + `translate` / `scale(0.1,-0.1)`).
 * Only the **outer** subpath is used here (stroke); the source’s inner `m216…` ring was for a filled double edge.
 * If this trace came from third-party UI, confirm you have rights to use it.
 */
const SHIELD_TRANSFORM = 'translate(0,105) scale(0.1,-0.1)';
const SHIELD_OUTER_PATH_D =
  'M505 958 c-33 -11 -97 -31 -142 -45 -46 -14 -83 -29 -84 -32 -8 -68 -45 -132 -87 -151 l-33 -15 3 -120 c3 -118 4 -122 45 -208 51 -105 89 -163 147 -220 63 -62 124 -102 185 -122 l53 -17 76 38 c127 65 232 187 298 348 31 75 34 89 34 193 l0 111 -29 10 c-32 11 -63 57 -82 120 -12 42 -14 43 -83 63 -39 11 -105 32 -146 45 -86 28 -77 27 -155 2z';

/**
 * Square viewBox so the shield scales like the 24×24 heart inside the same square `statIconFrame`
 * (112×105 letterboxing had made the glyph sit visually lower than the heart).
 */
export const SHIELD_VIEWBOX = '10.01431718061674 9.39498 88.10506607929516 97.72004';

/** Stroke width in **path** units (before `scale(0.1)`); tuned for ~3-4px visual outline. */
const SHIELD_STROKE_PATH_UNITS = 34;

const PRIMARY_ICON_BLACK_OUTLINE = 0.8;
/**
 * Square-ish crop so heart occupies similar vertical space as the shield
 * when both are rendered in the same square stat frame.
 */
const HEART_VIEWBOX = '3.16 4.08 17.68 17.68';

/** 24x24 top-stat icon outline thickness (heart / pentagram). */
export const PRIMARY_STAT_ICON_STROKE = PRIMARY_ICON_BLACK_OUTLINE;

const SHIELD_VERTICAL_NUDGE = (112 - 105) / 2;
/** Path bounds after `scale(0.1,-0.1)` are slightly right-heavy in 112×112; shift left for optical center. */
const SHIELD_HORIZONTAL_NUDGE = -4;

export function ShieldHeaterOutline({ strokeWidth = SHIELD_STROKE_PATH_UNITS }: { strokeWidth?: number }) {
  return (
    <g transform={`translate(${SHIELD_HORIZONTAL_NUDGE},${SHIELD_VERTICAL_NUDGE})`}>
      <g transform={SHIELD_TRANSFORM}>
        <path
          d={SHIELD_OUTER_PATH_D}
          fill="currentColor"
          stroke="#000"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

export function IconHeart({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="1.31 2.76 21.37 18.7"
      fill="none"
      stroke="#000"
      strokeWidth={PRIMARY_ICON_BLACK_OUTLINE}
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={SHIELD_VIEWBOX} fill="none" aria-hidden>
      <ShieldHeaterOutline />
    </svg>
  );
}

/**
 * Pentagram for spell save DC — five-point star inside an enclosing circle that
 * touches the outer tips.
 */
export function IconSpellSaveTriangle({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#000"
      strokeWidth={PRIMARY_STAT_ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 3.2L17.17 19.12L3.64 9.28H20.36L6.83 19.12L12 3.2z" fill="currentColor" />
    </svg>
  );
}

export function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconSearch({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconInsight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2a7 7 0 0 1 7 7c0 4-7 13-7 13S5 13 5 9a7 7 0 0 1 7-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2" />
    </svg>
  );
}

export function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 3v2M9 19v2M3 9h2M19 9h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Section header for conditions strip on player cards. */
export function IconConditions({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 5h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h5" strokeLinecap="round" />
    </svg>
  );
}
