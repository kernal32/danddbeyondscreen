import type { ReactNode, CSSProperties } from 'react';
import ThemedPanelFrame from './ThemedPanelFrame';

type ThemedPanelProps = {
  children: ReactNode;
  /** Outer wrapper (surface + frame). */
  className?: string;
  /** Inner content area (padding, flex, etc.). */
  contentClassName?: string;
  style?: CSSProperties;
  /** Optional enter animation (respects prefers-reduced-motion in CSS). */
  animEnter?: boolean;
  svgFilter?: boolean;
};

export default function ThemedPanel({
  children,
  className,
  contentClassName,
  style,
  animEnter,
  svgFilter,
}: ThemedPanelProps) {
  return (
    <ThemedPanelFrame
      className={`ui-panel-anim ${className ?? ''}`.trim()}
      contentClassName={contentClassName ?? ''}
      style={style}
      dataUiAnim={animEnter ? 'enter' : undefined}
      svgFilter={svgFilter}
    >
      {children}
    </ThemedPanelFrame>
  );
}
