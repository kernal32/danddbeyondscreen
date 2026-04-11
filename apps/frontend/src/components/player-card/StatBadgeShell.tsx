import type { CSSProperties, ReactNode } from 'react';

type StatBadgeShellProps = {
  frameClassName: string;
  className?: string;
  ariaLabel: string;
  icon: ReactNode;
  captionClassName: string;
  valueClassName: string;
  value: ReactNode;
  topCaption?: ReactNode;
  bottomCaption?: ReactNode;
  textOutlineStyle?: CSSProperties;
  iconGraphicStyle?: CSSProperties;
  textOverlayStyle?: CSSProperties;
};

export default function StatBadgeShell({
  frameClassName,
  className,
  ariaLabel,
  icon,
  captionClassName,
  valueClassName,
  value,
  topCaption,
  bottomCaption,
  textOutlineStyle,
  iconGraphicStyle,
  textOverlayStyle,
}: StatBadgeShellProps) {
  const blackTextOutline =
    textOutlineStyle ??
    ({ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' } as const);

  return (
    <div className={`${frameClassName} ${className ?? ''}`} role="img" aria-label={ariaLabel}>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="absolute inset-[3px] grid place-items-center overflow-hidden" style={iconGraphicStyle}>
          {icon}
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-1 text-center"
        style={textOverlayStyle}
      >
        <div className="grid place-items-center gap-0.5">
          {topCaption ? (
            <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
              {topCaption}
            </span>
          ) : null}
          <span
            className={`${valueClassName} numeric-stable max-w-full text-center leading-none text-white`}
            style={blackTextOutline}
          >
            {value}
          </span>
          {bottomCaption ? (
            <span className={`${captionClassName} w-full text-center text-white`} style={blackTextOutline}>
              {bottomCaption}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
