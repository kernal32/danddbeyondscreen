/**
 * Spell save DC badge: white pentagon (same stat icon frame as heart/shield) + centered labels like {@link ArmorClassShieldBadge}.
 */

import type { CSSProperties } from 'react';
import { IconSpellSaveD20 } from '../party/PartyCardStatIcons';
import StatBadgeShell from './StatBadgeShell';

type SpellSaveBookBadgeProps = {
  spellSaveDc: number;
  /** Outer square frame, e.g. statIconFrame from PlayerCard scale */
  frameClassName: string;
  className?: string;
  captionClassName: string;
  valueClassName: string;
  textOutlineStyle?: CSSProperties;
  iconGraphicStyle?: CSSProperties;
  textOverlayStyle?: CSSProperties;
};

export default function SpellSaveBookBadge({
  spellSaveDc,
  frameClassName,
  className,
  captionClassName,
  valueClassName,
  textOutlineStyle,
  iconGraphicStyle,
  textOverlayStyle,
}: SpellSaveBookBadgeProps) {
  const label = String(spellSaveDc);

  return (
    <StatBadgeShell
      frameClassName={frameClassName}
      className={className}
      ariaLabel={`Spell save DC ${label}`}
      icon={<IconSpellSaveD20 className="h-full w-full" />}
      captionClassName={captionClassName}
      valueClassName={valueClassName}
      value={label}
      topCaption="Spell"
      bottomCaption="Save"
      textOutlineStyle={textOutlineStyle}
      iconGraphicStyle={iconGraphicStyle}
      textOverlayStyle={textOverlayStyle}
    />
  );
}
