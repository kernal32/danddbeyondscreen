/** Inline SVGs for party stat rows (TV + DM). */

/**
 * **Heart + shield:** Paths from [Lucide](https://lucide.dev) (ISC License — see lucide.dev/license).
 * Same `viewBox` as the DM app + `ddb-campaign-initiative-bar.user.js` stat badges.
 *
 * **Spell save:** Filled white regular pentagon (original geometry).
 */
export const SHIELD_VIEWBOX = '0 0 24 24';

/** lucide-static heart @0.460 — stroke in source is 2px; we use fill + hairline for parity with legacy cards. */
const LUCIDE_HEART_PATH_D =
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';

/** lucide-static shield @0.460 */
const LUCIDE_SHIELD_PATH_D =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

/** Regular pentagon, point up — scaled to ~match Lucide heart/shield extent in 24×24 (r≈10.5, cy 12.8). */
const SPELL_SAVE_PENTAGON_PATH_D = 'M12 2.3L21.99 9.56L18.17 21.3L5.83 21.3L2.01 9.56Z';

const PRIMARY_ICON_BLACK_OUTLINE = 0.8;

/** 24×24 top-stat icon hairline (heart / shield filled glyphs). */
export const PRIMARY_STAT_ICON_STROKE = PRIMARY_ICON_BLACK_OUTLINE;

export function ShieldHeaterOutline({
  strokeWidth = PRIMARY_STAT_ICON_STROKE,
}: {
  strokeWidth?: number;
}) {
  return (
    <path
      d={LUCIDE_SHIELD_PATH_D}
      fill="currentColor"
      stroke="#000"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function IconHeart({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={SHIELD_VIEWBOX}
      fill="none"
      stroke="#000"
      strokeWidth={PRIMARY_ICON_BLACK_OUTLINE}
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <path d={LUCIDE_HEART_PATH_D} fill="currentColor" />
    </svg>
  );
}

export function IconShield({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={SHIELD_VIEWBOX}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <ShieldHeaterOutline />
    </svg>
  );
}

/**
 * Spell save DC — filled white pentagon + black hairline (like heart/shield) so overlaid DC reads clearly.
 * Config key `spellStar` is historical.
 */
export function IconSpellSaveD20({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={SHIELD_VIEWBOX}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}
    >
      <path
        d={SPELL_SAVE_PENTAGON_PATH_D}
        fill="#ffffff"
        stroke="#000"
        strokeWidth={PRIMARY_STAT_ICON_STROKE}
      />
    </svg>
  );
}

/** @deprecated Prefer {@link IconSpellSaveD20}; kept for existing imports. */
export const IconSpellSaveTriangle = IconSpellSaveD20;

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
