import type { ReactNode, CSSProperties } from 'react';
import { borderVariantForTableTheme, type PanelBorderVariant } from '../../theme/uiTheme';
import { useTableTheme } from '../../theme/TableThemeContext';

const CORNER_BOX = 32;

/**
 * Single-corner trim in viewBox 0..32: sits in the widget corner, opening toward the panel interior.
 * Strokes use `vectorEffect: nonScalingStroke` so thickness stays ~1px at any panel size.
 */
function CornerMark({ variant }: { variant: PanelBorderVariant }) {
  const s = {
    vectorEffect: 'nonScalingStroke' as const,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (variant) {
    case 'modern':
      return null;
    case 'fantasy':
      return (
        <svg
          viewBox={`0 0 ${CORNER_BOX} ${CORNER_BOX}`}
          className="h-full w-full"
          preserveAspectRatio="xMinYMin meet"
          shapeRendering="geometricPrecision"
          aria-hidden
        >
          <path
            d="M 4 28 L 4 9 Q 4 6 7 6 L 26 6"
            stroke="currentColor"
            strokeWidth={1.05}
            opacity={0.88}
            {...s}
          />
          <path
            d="M 6 26 L 6 10 Q 6 8 8 8 L 24 8"
            stroke="var(--accent)"
            strokeWidth={0.7}
            strokeOpacity={0.35}
            {...s}
          />
        </svg>
      );
    case 'sciFi':
      return (
        <svg
          viewBox={`0 0 ${CORNER_BOX} ${CORNER_BOX}`}
          className="h-full w-full"
          preserveAspectRatio="xMinYMin meet"
          shapeRendering="geometricPrecision"
          aria-hidden
        >
          <path d="M 5 27 L 5 5 L 21 5" stroke="currentColor" strokeWidth={1} {...s} />
          <path
            d="M 8 24 L 8 8 L 18 8"
            stroke="var(--accent)"
            strokeWidth={0.65}
            strokeOpacity={0.5}
            {...s}
          />
        </svg>
      );
    case 'organic':
      return (
        <svg
          viewBox={`0 0 ${CORNER_BOX} ${CORNER_BOX}`}
          className="h-full w-full"
          preserveAspectRatio="xMinYMin meet"
          shapeRendering="geometricPrecision"
          aria-hidden
        >
          <path
            d="M 4 28 Q 4 15 7 9 Q 10 5 25 5"
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.85}
            {...s}
          />
        </svg>
      );
    default:
      return null;
  }
}

const CORNER_PLACES = ['tl', 'tr', 'br', 'bl'] as const;

function cornerWrapperClass(place: (typeof CORNER_PLACES)[number]): string {
  switch (place) {
    case 'tl':
      return 'left-0 top-0';
    case 'tr':
      return 'right-0 top-0 origin-top-right scale-x-[-1]';
    case 'br':
      return 'bottom-0 right-0 origin-bottom-right scale-[-1]';
    case 'bl':
      return 'bottom-0 left-0 origin-bottom-left scale-y-[-1]';
    default:
      return '';
  }
}

function PanelCorners({ variant }: { variant: PanelBorderVariant }) {
  if (variant === 'modern') return null;

  const size: CSSProperties = {
    width: 'var(--panel-corner-size, 1.125rem)',
    height: 'var(--panel-corner-size, 1.125rem)',
  };

  return (
    <>
      {CORNER_PLACES.map((place) => (
        <div
          key={place}
          className={`pointer-events-none absolute z-[1] text-[color:var(--ornament-stroke)] ${cornerWrapperClass(place)}`}
          style={size}
          aria-hidden
        >
          <CornerMark variant={variant} />
        </div>
      ))}
    </>
  );
}

type ThemedPanelFrameProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  /** @deprecated Corner trims do not use a full-frame filter; kept for API compatibility. */
  svgFilter?: boolean;
  /** Optional hook for `.ui-panel-anim[data-ui-anim='enter']` in `index.css`. */
  dataUiAnim?: 'enter';
};

/**
 * Panel shell: thin CSS rim + small corner SVG trims (thematic). Content stacks above ornaments (z-10).
 * Corner footprint is controlled by `--panel-corner-size` (typically 1rem–1.25rem).
 */
export default function ThemedPanelFrame({
  children,
  className = '',
  contentClassName = '',
  style,
  dataUiAnim,
}: ThemedPanelFrameProps) {
  const tableTheme = useTableTheme();
  const variant = borderVariantForTableTheme(tableTheme);

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[var(--panel-radius)] border border-[var(--border-subtle)] bg-[var(--surface)] [box-shadow:var(--shadow-panel)] ${className}`.trim()}
      style={style}
      data-ui-anim={dataUiAnim}
    >
      <PanelCorners variant={variant} />
      <div className={`relative z-10 min-h-0 min-w-0 ${contentClassName}`.trim()}>{children}</div>
    </div>
  );
}
