import type { WidgetInstance } from '@ddb/shared-types/layout';

/** Shown when `instance.type` is not in `WIDGET_REGISTRY` (stale client or forward-incompatible layout JSON). */
export default function UnknownWidget({ instance }: { instance: WidgetInstance }) {
  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-4 text-[var(--muted)]">
      <p className="font-display text-lg text-amber-200">Unknown widget</p>
      <p className="mt-1 font-mono text-sm break-all text-[var(--text)]">
        id={instance.id} type={String(instance.type)}
      </p>
    </div>
  );
}
