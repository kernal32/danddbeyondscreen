export const PLAYER_CARD_LAYOUT_SCHEMA_VERSION = 1;

export type PlayerCardLayoutMode = 'legacy' | 'schema' | 'auto';

export type PlayerCardLayoutAnchorX = 'left' | 'center' | 'right';
export type PlayerCardLayoutAnchorY = 'top' | 'center' | 'bottom';

export type PlayerCardLayoutAnchor = {
  x: PlayerCardLayoutAnchorX;
  y: PlayerCardLayoutAnchorY;
};

export type PlayerCardLayoutVisibilityPredicate =
  | { path: string; eq: boolean | number | string | null }
  | { path: string; gt: number }
  | { path: string; gte: number }
  | { path: string; lt: number }
  | { path: string; lte: number };

export type PlayerCardLayoutVisibilityRule = {
  all?: PlayerCardLayoutVisibilityPredicate[];
  any?: PlayerCardLayoutVisibilityPredicate[];
  not?: PlayerCardLayoutVisibilityPredicate[];
};

export const PLAYER_CARD_KNOWN_BLOCK_TYPES = [
  'container',
  'migratedSection',
  'mockLabel',
] as const;

export type PlayerCardKnownBlockType = (typeof PLAYER_CARD_KNOWN_BLOCK_TYPES)[number];

export type PlayerCardLayoutElement = {
  id: string;
  type: PlayerCardKnownBlockType;
  parentId?: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor?: PlayerCardLayoutAnchor;
  zIndex?: number;
  visibility?: PlayerCardLayoutVisibilityRule;
  styleOverrides?: Record<string, string>;
  props?: Record<string, unknown>;
};

export type PlayerCardLayoutSchema = {
  version: number;
  elements: PlayerCardLayoutElement[];
};

export type PlayerCardLayoutViewModelInput = {
  data: Record<string, unknown>;
  options: Record<string, unknown>;
  context: Record<string, unknown>;
};

const BLOCK_TYPE_SET = new Set<string>(PLAYER_CARD_KNOWN_BLOCK_TYPES);

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function isAnchorX(v: unknown): v is PlayerCardLayoutAnchorX {
  return v === 'left' || v === 'center' || v === 'right';
}

function isAnchorY(v: unknown): v is PlayerCardLayoutAnchorY {
  return v === 'top' || v === 'center' || v === 'bottom';
}

function parseAnchor(raw: unknown): PlayerCardLayoutAnchor | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const x = o.x;
  const y = o.y;
  if (!isAnchorX(x) || !isAnchorY(y)) return undefined;
  return { x, y };
}

function parseVisibilityRule(raw: unknown): PlayerCardLayoutVisibilityRule | undefined {
  if (raw == null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: PlayerCardLayoutVisibilityRule = {};
  for (const key of ['all', 'any', 'not'] as const) {
    const arr = o[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return undefined;
    const preds: PlayerCardLayoutVisibilityPredicate[] = [];
    for (const p of arr) {
      if (p == null || typeof p !== 'object') return undefined;
      const pr = p as Record<string, unknown>;
      if (typeof pr.path !== 'string' || !pr.path.trim()) return undefined;
      const path = pr.path.trim();
      if ('eq' in pr) {
        const v = pr.eq;
        if (v !== null && typeof v !== 'boolean' && typeof v !== 'number' && typeof v !== 'string') return undefined;
        preds.push({ path, eq: v as boolean | number | string | null });
      } else if ('gt' in pr) {
        if (typeof pr.gt !== 'number' || !Number.isFinite(pr.gt)) return undefined;
        preds.push({ path, gt: pr.gt });
      } else if ('gte' in pr) {
        if (typeof pr.gte !== 'number' || !Number.isFinite(pr.gte)) return undefined;
        preds.push({ path, gte: pr.gte });
      } else if ('lt' in pr) {
        if (typeof pr.lt !== 'number' || !Number.isFinite(pr.lt)) return undefined;
        preds.push({ path, lt: pr.lt });
      } else if ('lte' in pr) {
        if (typeof pr.lte !== 'number' || !Number.isFinite(pr.lte)) return undefined;
        preds.push({ path, lte: pr.lte });
      } else return undefined;
    }
    out[key] = preds;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseElement(raw: unknown): PlayerCardLayoutElement | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.trim()) return null;
  if (typeof o.type !== 'string' || !BLOCK_TYPE_SET.has(o.type)) return null;
  const x = typeof o.x === 'number' ? o.x : Number(o.x);
  const y = typeof o.y === 'number' ? o.y : Number(o.y);
  const w = typeof o.w === 'number' ? o.w : Number(o.w);
  const h = typeof o.h === 'number' ? o.h : Number(o.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  if (x < 0 || x > 100 || y < 0 || y > 100 || w <= 0 || w > 100 || h <= 0 || h > 100) return null;

  const el: PlayerCardLayoutElement = {
    id: o.id.trim(),
    type: o.type as PlayerCardKnownBlockType,
    x: clampPct(x),
    y: clampPct(y),
    w: clampPct(w),
    h: clampPct(h),
  };
  if (o.parentId != null) {
    if (typeof o.parentId !== 'string' || !o.parentId.trim()) return null;
    el.parentId = o.parentId.trim();
  }
  const anchor = parseAnchor(o.anchor);
  if (anchor) el.anchor = anchor;
  if (o.zIndex !== undefined) {
    if (typeof o.zIndex !== 'number' || !Number.isFinite(o.zIndex)) return null;
    el.zIndex = Math.round(o.zIndex);
  }
  const vis = parseVisibilityRule(o.visibility);
  if (vis) el.visibility = vis;
  if (o.styleOverrides != null) {
    if (typeof o.styleOverrides !== 'object' || Array.isArray(o.styleOverrides)) return null;
    const so: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.styleOverrides as Record<string, unknown>)) {
      if (typeof v !== 'string') return null;
      so[k] = v;
    }
    el.styleOverrides = so;
  }
  if (o.props != null) {
    if (typeof o.props !== 'object' || Array.isArray(o.props)) return null;
    el.props = { ...(o.props as Record<string, unknown>) };
  }
  return el;
}

export type ValidatePlayerCardLayoutResult =
  | { ok: true; schema: PlayerCardLayoutSchema }
  | { ok: false; error: string };

export function validatePlayerCardLayoutSchema(raw: unknown): ValidatePlayerCardLayoutResult {
  if (raw == null || typeof raw !== 'object') return { ok: false, error: 'Schema must be an object' };
  const o = raw as Record<string, unknown>;
  const version = o.version;
  if (version !== PLAYER_CARD_LAYOUT_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported layout schema version: ${String(version)}` };
  }
  if (!Array.isArray(o.elements)) return { ok: false, error: 'elements must be an array' };
  const elements: PlayerCardLayoutElement[] = [];
  const ids = new Set<string>();
  for (const item of o.elements) {
    const el = parseElement(item);
    if (!el) return { ok: false, error: 'Invalid element' };
    if (ids.has(el.id)) return { ok: false, error: `Duplicate element id: ${el.id}` };
    ids.add(el.id);
    elements.push(el);
  }
  for (const el of elements) {
    if (el.parentId != null && el.parentId !== '' && !ids.has(el.parentId)) {
      return { ok: false, error: `Unknown parentId: ${el.parentId}` };
    }
  }
  return { ok: true, schema: { version: PLAYER_CARD_LAYOUT_SCHEMA_VERSION, elements } };
}

export function parsePlayerCardLayoutSchemaField(raw: unknown): PlayerCardLayoutSchema | null {
  if (raw === undefined || raw === null) return null;
  const r = validatePlayerCardLayoutSchema(raw);
  return r.ok ? r.schema : null;
}
