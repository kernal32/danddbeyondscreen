import type { WidgetInstance } from '@ddb/shared-types/layout';

export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'center' | 'bottom';

export type WidgetLayoutV2 = {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  anchorX: AnchorX;
  anchorY: AnchorY;
};

type WidgetConfigWithLayoutV2 = {
  layoutV2?: Partial<WidgetLayoutV2>;
};

const DEFAULT_LAYOUT_V2: WidgetLayoutV2 = {
  xPct: 0,
  yPct: 0,
  wPct: 1 / 12,
  hPct: 1,
  anchorX: 'left',
  anchorY: 'top',
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampMin(n: number, min: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
}

function parseAnchorX(v: unknown): AnchorX {
  return v === 'center' || v === 'right' ? v : 'left';
}

function parseAnchorY(v: unknown): AnchorY {
  return v === 'center' || v === 'bottom' ? v : 'top';
}

export function legacyToLayoutV2(w: WidgetInstance, rowCount: number): WidgetLayoutV2 {
  const rows = Math.max(1, rowCount);
  const wPct = clamp01(w.w / 12);
  const hPct = clamp01(w.h / rows);
  return {
    xPct: clamp01(w.x / 12),
    yPct: clamp01(w.y / rows),
    wPct: clampMin(wPct, 1 / 12),
    hPct: clampMin(hPct, 1 / rows),
    anchorX: 'left',
    anchorY: 'top',
  };
}

export function getWidgetLayoutV2(w: WidgetInstance, rowCount: number): WidgetLayoutV2 {
  const cfg = w.config as WidgetConfigWithLayoutV2 | undefined;
  const raw = cfg?.layoutV2;
  if (!raw || typeof raw !== 'object') return legacyToLayoutV2(w, rowCount);
  const base = legacyToLayoutV2(w, rowCount);
  return {
    xPct: clamp01(typeof raw.xPct === 'number' ? raw.xPct : base.xPct),
    yPct: clamp01(typeof raw.yPct === 'number' ? raw.yPct : base.yPct),
    wPct: clampMin(clamp01(typeof raw.wPct === 'number' ? raw.wPct : base.wPct), 1 / 12),
    hPct: clampMin(clamp01(typeof raw.hPct === 'number' ? raw.hPct : base.hPct), 1 / Math.max(1, rowCount)),
    anchorX: parseAnchorX(raw.anchorX),
    anchorY: parseAnchorY(raw.anchorY),
  };
}

export function layoutV2ToLegacyGrid(
  v2: WidgetLayoutV2,
  rowCount: number,
): Pick<WidgetInstance, 'x' | 'y' | 'w' | 'h'> {
  const rows = Math.max(1, rowCount);
  const w = Math.max(1, Math.min(12, Math.round(v2.wPct * 12)));
  const h = Math.max(1, Math.round(v2.hPct * rows));
  const anchorCellX = Math.round(v2.xPct * 12);
  const anchorCellY = Math.round(v2.yPct * rows);

  const offsetX = v2.anchorX === 'left' ? 0 : v2.anchorX === 'center' ? Math.round(w / 2) : w;
  const offsetY = v2.anchorY === 'top' ? 0 : v2.anchorY === 'center' ? Math.round(h / 2) : h;

  let x = anchorCellX - offsetX;
  let y = anchorCellY - offsetY;
  x = Math.max(0, Math.min(12 - w, x));
  y = Math.max(0, y);
  return { x, y, w, h };
}

export function withWidgetLayoutV2Config(w: WidgetInstance, v2: WidgetLayoutV2): WidgetInstance {
  const prev = w.config && typeof w.config === 'object' ? (w.config as Record<string, unknown>) : {};
  return {
    ...w,
    config: {
      ...prev,
      layoutV2: {
        xPct: v2.xPct,
        yPct: v2.yPct,
        wPct: v2.wPct,
        hPct: v2.hPct,
        anchorX: v2.anchorX,
        anchorY: v2.anchorY,
      },
    },
  };
}
