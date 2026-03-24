/**
 * Armor class badge: single-stroke shield outline (shared geometry with `IconShield` / `ShieldHeaterOutline`).
 */

import type { CSSProperties } from 'react';
import { SHIELD_VIEWBOX, ShieldHeaterOutline } from '../party/PartyCardStatIcons';

type ArmorClassShieldBadgeProps = {
  ac: number | string;
  /** Outer square frame, e.g. statIconFrame from PlayerCard scale */
  frameClassName: string;
  className?: string;
  /** Shared style for "ARMOR" / "CLASS" lines */
  captionClassName: string;
  /** Large centered AC numeral */
  valueClassName: string;
  textOutlineStyle?: CSSProperties;
};

export default function ArmorClassShieldBadge({
  ac,
  frameClassName,
  className,
  captionClassName,
  valueClassName,
  textOutlineStyle,
}: ArmorClassShieldBadgeProps) {
  const label = typeof ac === 'number' && Number.isFinite(ac) ? String(ac) : String(ac);
  const blackTextOutline =
    textOutlineStyle ??
    ({ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' } as const);

  return (
    <div
      className={`${frameClassName} ${className ?? ''}`}
      role="img"
      aria-label={`Armor class ${label}`}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="absolute inset-[3px] flex items-center justify-center overflow-hidden">
          <svg
            className="h-full w-full text-[var(--ac-tint)] opacity-90"
            viewBox={SHIELD_VIEWBOX}
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <ShieldHeaterOutline />
          </svg>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 px-1 text-center">
        <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
          Armor
        </span>
        <span className={`${valueClassName} max-w-full text-center leading-none text-white`} style={blackTextOutline}>
          {label}
        </span>
        <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
          Class
        </span>
      </div>
    </div>
  );
}
