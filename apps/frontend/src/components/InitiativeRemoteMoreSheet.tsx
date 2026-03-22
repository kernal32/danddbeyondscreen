import { useMemo, useState } from 'react';
import type { PublicSessionState } from '@ddb/shared-types';

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function InitiativeRemoteMoreSheet({
  open,
  onClose,
  live,
  emit,
}: {
  open: boolean;
  onClose: () => void;
  live: PublicSessionState;
  emit: (event: string, payload?: unknown) => void;
}) {
  const [removeId, setRemoveId] = useState<string | null>(null);
  const partyIds = useMemo(() => new Set(live.party.characters.map((c) => c.id)), [live.party.characters]);

  const extraCombatants = useMemo(() => {
    const out: { entryId: string; label: string; entityId: string }[] = [];
    for (const id of live.initiative.turnOrder) {
      const e = live.initiative.entries[id];
      if (!e) continue;
      if (e.entityId && partyIds.has(e.entityId)) continue;
      out.push({ entryId: e.id, label: e.label, entityId: e.entityId });
    }
    return out;
  }, [live.initiative, partyIds]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="More options">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-white/15 bg-[var(--bg)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[var(--bg)] px-4 py-3">
          <h2 className="font-display text-lg font-semibold text-[var(--accent)]">More options</h2>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-sky-400 hover:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="space-y-6 p-4 pb-8">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">NPC templates</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">Spawn adds a row to initiative (same as DM console).</p>
            {live.npcTemplates.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No templates yet — DM saves them from the console.</p>
            ) : (
              <ul className="space-y-2">
                {live.npcTemplates.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <span className="text-[var(--text)]">
                      {t.name}{' '}
                      <span className="text-[var(--muted)]">
                        (AC {t.defaultAc}, HP {t.defaultMaxHp})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded bg-sky-700 px-2 py-1 text-xs text-white hover:bg-sky-600"
                      onClick={() => emit('npc:spawnFromTemplate', { templateId: t.id })}
                    >
                      Spawn
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Party — remove from session</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">Permanently drops the character from the party data (not the same as hide).</p>
            <ul className="space-y-2">
              {live.party.characters.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="truncate text-[var(--text)]">{c.name}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-red-900/50 px-2 py-1 text-xs text-red-100 hover:bg-red-800/60"
                    onClick={() => setRemoveId(c.id)}
                  >
                    Remove…
                  </button>
                </li>
              ))}
            </ul>
            {live.party.characters.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No party members in view.</p>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Hidden from table</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">Restore party cards and allow them back into initiative after Begin combat.</p>
            {(live.hiddenPartyMembers ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nobody is hidden.</p>
            ) : (
              <ul className="space-y-2">
                {(live.hiddenPartyMembers ?? []).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm">
                    <span className="text-[var(--text)]">{h.name}</span>
                    <button
                      type="button"
                      title="Show on table again"
                      aria-label={`Show ${h.name} on table`}
                      className="shrink-0 rounded-md p-2 text-sky-300 hover:bg-white/10"
                      onClick={() => emit('party:setHiddenFromTable', { characterId: h.id, hidden: false })}
                    >
                      <IconEye className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Extra combatants</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">NPCs and extras not tied to a party sheet row.</p>
            {extraCombatants.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">None.</p>
            ) : (
              <ul className="space-y-2">
                {extraCombatants.map((x) => (
                  <li key={x.entryId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <span className="truncate text-[var(--text)]">{x.label}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-600"
                      onClick={() => emit('initiative:remove', { entryId: x.entryId })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {removeId ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-sm rounded-xl border border-white/20 bg-[var(--surface)] p-4 shadow-xl">
            <p className="text-sm text-[var(--text)]">Remove this character from the session entirely?</p>
            <p className="mt-2 text-xs text-[var(--muted)]">This cannot be undone from the phone (re-import party from DM).</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-white/10"
                onClick={() => setRemoveId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-600"
                onClick={() => {
                  emit('party:removeCharacter', { characterId: removeId });
                  setRemoveId(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
