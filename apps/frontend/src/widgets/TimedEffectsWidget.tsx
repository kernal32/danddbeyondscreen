import type { WidgetViewProps } from './types';

export default function TimedEffectsWidget({ state }: WidgetViewProps) {
  if (state.timedEffects.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
      <h2 className="font-display text-xl text-[var(--accent)] mb-2">Effects</h2>
      <ul className="text-lg space-y-1">
        {state.timedEffects.map((e) => (
          <li key={e.id} className="text-[var(--muted)]">
            {e.label} <span className="text-[var(--text)]">({e.roundsRemaining}r)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
