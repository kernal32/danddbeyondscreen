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
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-sky-400/90"
        viewBox={SHIELD_VIEWBOX}
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <ShieldHeaterOutline />
      </svg>
      {/* `w-max` + translate: center column, then fine-tune vs shield (+3px right; 12px up from pure vertical center). */}
      <div className="pointer-events-none absolute left-1/2 top-[63%] z-10 flex w-max min-w-0 max-w-[calc(100%-0.35rem)] translate-x-[calc(-50%+3px)] translate-y-[calc(-50%-12px)] flex-col items-stretch gap-0.5 text-center">
        <span className={`${captionClassName} text-center`}>Armor</span>
        <span className={`${valueClassName} max-w-full text-center leading-none`}>{label}</span>
        <span className={`${captionClassName} text-center`}>Class</span>
      </div>
    </div>
  );
}
