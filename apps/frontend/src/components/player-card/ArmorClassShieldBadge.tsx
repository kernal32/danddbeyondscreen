/**
 * Armor class badge: single-stroke shield outline (shared geometry with `IconShield` / `ShieldHeaterOutline`).
 */

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
};

export default function ArmorClassShieldBadge({
  ac,
  frameClassName,
  className,
  captionClassName,
  valueClassName,
}: ArmorClassShieldBadgeProps) {
  const label = typeof ac === 'number' && Number.isFinite(ac) ? String(ac) : String(ac);

  return (
    <div
      className={`${frameClassName} ${className ?? ''}`}
      role="img"
      aria-label={`Armor class ${label}`}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg
          className="h-full w-full text-sky-400/90"
          viewBox={SHIELD_VIEWBOX}
          fill="none"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <ShieldHeaterOutline />
        </svg>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex -translate-x-[2px] flex-col items-center justify-center gap-0.5 px-1 text-center">
        <span className={`${captionClassName} w-full text-center`}>Armor</span>
        <span className={`${valueClassName} max-w-full text-center leading-none`}>{label}</span>
        <span className={`${captionClassName} w-full text-center`}>Class</span>
      </div>
    </div>
  );
}
