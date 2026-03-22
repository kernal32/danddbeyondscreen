import { useLayoutEffect, useRef } from 'react';

const MIN_ZOOM = 0.52;
const PAD = 8;

/**
 * Shrinks content to fit a bounded container (TV party grid in a fixed-height cell).
 * Uses CSS `zoom` when supported (Chromium / Safari / modern Firefox) so layout height matches the visual scale.
 */
export function useFitContentZoom(enabled: boolean, deps: readonly unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!enabled) {
      if (content) content.style.zoom = '';
      return;
    }
    const container = containerRef.current;
    if (!container || !content) return;

    const supportsZoom =
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1');

    const clear = () => {
      content.style.zoom = '';
    };

    const run = () => {
      clear();
      const avail = container.clientHeight;
      if (avail < PAD) return;
      const need = content.scrollHeight;
      if (need < 1) return;
      const z = need <= avail + 2 ? 1 : Math.max(MIN_ZOOM, Math.min(1, (avail - PAD) / need));
      if (z >= 0.999 || !supportsZoom) return;
      content.style.zoom = String(z);
    };

    run();
    const ro = new ResizeObserver(() => requestAnimationFrame(run));
    ro.observe(container);
    ro.observe(content);
    return () => {
      ro.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes meaningful dep list
  }, [enabled, ...deps]);

  return { containerRef, contentRef };
}
