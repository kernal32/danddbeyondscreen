import type {
  PlayerCardLayoutVisibilityPredicate,
  PlayerCardLayoutVisibilityRule,
  PlayerCardLayoutViewModelInput,
} from '@ddb/shared-types';

function getPath(root: PlayerCardLayoutViewModelInput, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function evalPredicate(pred: PlayerCardLayoutVisibilityPredicate, vm: PlayerCardLayoutViewModelInput): boolean {
  const v = getPath(vm, pred.path);
  if ('eq' in pred) {
    return v === pred.eq;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  if ('gt' in pred) return v > pred.gt;
  if ('gte' in pred) return v >= pred.gte;
  if ('lt' in pred) return v < pred.lt;
  if ('lte' in pred) return v <= pred.lte;
  return false;
}

function evalList(
  list: PlayerCardLayoutVisibilityPredicate[] | undefined,
  vm: PlayerCardLayoutViewModelInput,
  mode: 'all' | 'any',
): boolean {
  if (!list || list.length === 0) return true;
  if (mode === 'all') return list.every((p) => evalPredicate(p, vm));
  return list.some((p) => evalPredicate(p, vm));
}

/**
 * Returns true when the element should be shown.
 * Empty / undefined rule → visible.
 */
export function evaluatePlayerCardLayoutVisibility(
  rule: PlayerCardLayoutVisibilityRule | undefined,
  vm: PlayerCardLayoutViewModelInput,
): boolean {
  if (rule == null) return true;
  const allOk = evalList(rule.all, vm, 'all');
  const anyOk = evalList(rule.any, vm, 'any');
  const hasAny = rule.any && rule.any.length > 0;
  const hasAll = rule.all && rule.all.length > 0;
  let branch = true;
  if (hasAll && hasAny) {
    branch = allOk && anyOk;
  } else if (hasAll) {
    branch = allOk;
  } else if (hasAny) {
    branch = anyOk;
  }
  const notList = rule.not ?? [];
  const notOk = notList.every((p) => !evalPredicate(p, vm));
  return branch && notOk;
}
