/**
 * Armor class badge: shield outline (shared geometry with `IconShield` / `ShieldHeaterOutline`).
 * Shield uses Lucide path (ISC) — see `PartyCardStatIcons.tsx`.
 */

import type { CSSProperties } from 'react';
import { SHIELD_VIEWBOX, ShieldHeaterOutline } from '../party/PartyCardStatIcons';
import StatBadgeShell from './StatBadgeShell';

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
  /** Scale shield SVG only (e.g. primaryStatZoomStyle(iconPercent)). */
  iconGraphicStyle?: CSSProperties;
  /** Scale captions + numeral (e.g. primaryStatZoomStyle(numeralPercent)). */
  textOverlayStyle?: CSSProperties;
};

export default function ArmorClassShieldBadge({
  ac,
  frameClassName,
  className,
  captionClassName,
  valueClassName,
  textOutlineStyle,
  iconGraphicStyle,
  textOverlayStyle,
}: ArmorClassShieldBadgeProps) {
  const label = typeof ac === 'number' && Number.isFinite(ac) ? String(ac) : String(ac);

  return (
    <StatBadgeShell
      frameClassName={frameClassName}
      className={className}
      ariaLabel={`Armor class ${label}`}
      icon={
        <svg
          className="h-full w-full text-[var(--ac-tint)] opacity-90"
          viewBox={SHIELD_VIEWBOX}
          fill="none"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
        >
          <ShieldHeaterOutline />
        </svg>
      }
      captionClassName={captionClassName}
      valueClassName={valueClassName}
      value={label}
      topCaption="Armor"
      bottomCaption="Class"
      textOutlineStyle={textOutlineStyle}
      iconGraphicStyle={iconGraphicStyle}
      textOverlayStyle={textOverlayStyle}
    />
  );
}
