import type { WidgetViewProps } from './types';

export default function DiceLogWidget({ state }: WidgetViewProps) {
  const entries = state.diceLog.filter((e) => !e.dmOnly);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--surface)] p-4">
      <h2 className="font-display text-xl text-[var(--accent)] mb-2">Log</h2>
      <ul className="text-lg space-y-1 font-mono max-h-64 overflow-y-auto">
        {entries.map((e) => (
          <li key={e.at + e.message} className="text-[var(--muted)]">
            <span className="text-[var(--text)]">{e.at.slice(11, 19)}</span> {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
