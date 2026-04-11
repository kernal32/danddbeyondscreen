import type { CSSProperties } from 'react';

/**
 * Scale primary-stat sublayers (Chromium/Safari: `zoom`; Firefox: `transform` — layout box unchanged).
 * `percent` 100 or omitted → no style.
 */
export function primaryStatZoomStyle(percent: number | undefined): CSSProperties | undefined {
  const p = percent ?? 100;
  if (!Number.isFinite(p) || Math.abs(p - 100) < 0.001) return undefined;
  const s = p / 100;
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1')) {
      return { zoom: s };
    }
  } catch {
    /* ignore */
  }
  return {
    transform: `scale(${s})`,
    transformOrigin: 'center center',
  };
}
