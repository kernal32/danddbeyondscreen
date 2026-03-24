/**
 * Spell save DC badge: arcane triangle (same stat icon frame as heart/shield) + centered labels like {@link ArmorClassShieldBadge}.
 */

import type { CSSProperties } from 'react';
import { IconSpellSaveTriangle } from '../party/PartyCardStatIcons';

type SpellSaveBookBadgeProps = {
  spellSaveDc: number;
  /** Outer square frame, e.g. statIconFrame from PlayerCard scale */
  frameClassName: string;
  className?: string;
  captionClassName: string;
  valueClassName: string;
  textOutlineStyle?: CSSProperties;
};

export default function SpellSaveBookBadge({
  spellSaveDc,
  frameClassName,
  className,
  captionClassName,
  valueClassName,
  textOutlineStyle,
}: SpellSaveBookBadgeProps) {
  const label = String(spellSaveDc);
  const blackTextOutline =
    textOutlineStyle ??
    ({ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' } as const);

  return (
    <div
      className={`${frameClassName} ${className ?? ''}`}
      role="img"
      aria-label={`Spell save DC ${label}`}
    >
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="absolute inset-[3px] flex items-center justify-center overflow-hidden">
          <IconSpellSaveTriangle className="h-full w-full text-[var(--ac-tint)] opacity-90" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 px-1 text-center">
        <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
          Spell
        </span>
        <span className={`${valueClassName} max-w-full text-center leading-none text-white`} style={blackTextOutline}>
          {label}
        </span>
        <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
          Save
        </span>
      </div>
    </div>
  );
}
