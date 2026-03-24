import { useEffect, useMemo, useRef, useState } from 'react';
import type { HiddenPartyMember, PublicSessionState } from '@ddb/shared-types';
import { BUILTIN_GENERIC_PLAYER_AVATAR_URL } from '@ddb/shared-types';
import { IconEye } from './icons/VisibilityEyes';
import UnhideCharacterDialog from './UnhideCharacterDialog';

type HpDraftRow = { cur: string; tmp: string };

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
  const [unhideTarget, setUnhideTarget] = useState<HiddenPartyMember | null>(null);
  const [newExtraName, setNewExtraName] = useState('');
  const [hpDrafts, setHpDrafts] = useState<Record<string, HpDraftRow>>({});
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setHpDrafts(
        Object.fromEntries(
          live.party.characters.map((c) => [
            String(c.id),
            { cur: String(c.currentHp), tmp: String(c.tempHp) },
          ]),
        ),
      );
    }
    wasOpenRef.current = open;
  }, [open, live.party.characters]);

  const partyIds = useMemo(() => new Set(live.party.characters.map((c) => String(c.id))), [live.party.characters]);

  const extraCombatants = useMemo(() => {
    const out: { entryId: string; label: string; entityId: string }[] = [];
    for (const id of live.initiative.turnOrder) {
      const e = live.initiative.entries[id];
      if (!e) continue;
      if (e.entityId && partyIds.has(String(e.entityId))) continue;
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
          <details className="rounded-xl border border-white/10 bg-black/10 p-3">
            <summary className="cursor-pointer list-none font-semibold text-[var(--accent)] [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="text-[var(--muted)]">
                  ▸
                </span>
                Party HP
              </span>
            </summary>
            <p className="mt-2 text-xs text-[var(--muted)]">Set current and temporary HP (pushed to the table via socket).</p>
            {live.party.characters.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No party members.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {live.party.characters.map((c) => {
                  const id = String(c.id);
                  const row = hpDrafts[id] ?? { cur: String(c.currentHp), tmp: String(c.tempHp) };
                  return (
                    <li key={c.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      <div className="mb-2 truncate font-medium text-[var(--text)]">{c.name}</div>
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                          Current
                          <input
                            type="number"
                            inputMode="numeric"
                            className="w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-[var(--text)]"
                            value={row.cur}
                            onChange={(e) => setHpDrafts((m) => ({ ...m, [id]: { ...row, cur: e.target.value } }))}
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-xs text-[var(--muted)]">
                          Temp
                          <input
                            type="number"
                            inputMode="numeric"
                            className="w-24 rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-[var(--text)]"
                            value={row.tmp}
                            onChange={(e) => setHpDrafts((m) => ({ ...m, [id]: { ...row, tmp: e.target.value } }))}
                          />
                        </label>
                        <button
                          type="button"
                          className="rounded-lg bg-sky-800 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700"
                          onClick={() => {
                            const currentHp = Number.parseInt(row.cur, 10);
                            const tempHp = Number.parseInt(row.tmp, 10);
                            if (Number.isNaN(currentHp) || Number.isNaN(tempHp)) return;
                            emit('party:manualHp', { characterId: id, currentHp, tempHp });
                          }}
                        >
                          Apply
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </details>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Hidden from table</h3>
            <p className="mb-2 text-xs text-[var(--muted)]">Restore party cards and put them back on initiative.</p>
            {(live.hiddenPartyMembers ?? []).length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Nobody is hidden.</p>
            ) : (
              <ul className="space-y-2">
                {(live.hiddenPartyMembers ?? []).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-sm">
                    <span className="text-[var(--text)]">{h.name}</span>
                    <button
                      type="button"
                      title="Choose how to show on table again"
                      aria-label={`Unhide ${h.name}`}
                      className="shrink-0 rounded-md p-2 text-sky-300 hover:bg-white/10"
                      onClick={() => setUnhideTarget(h)}
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

          <details className="rounded-xl border border-white/10 bg-black/10 p-3">
            <summary className="cursor-pointer list-none font-semibold text-[var(--accent)] [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="text-[var(--muted)]">
                  ▸
                </span>
                Party — remove from session
              </span>
            </summary>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Permanently drops the character from the party data (not the same as hide). Add a name-only combatant below for
              quick extras.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="min-w-[8rem] flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--text)]"
                placeholder="New combatant name"
                value={newExtraName}
                onChange={(e) => setNewExtraName(e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-sky-800 px-3 py-2 text-sm text-white hover:bg-sky-700"
                onClick={() => {
                  const label = newExtraName.trim();
                  if (!label) return;
                  emit('initiative:add', {
                    label,
                    mod: 0,
                    avatarUrl: BUILTIN_GENERIC_PLAYER_AVATAR_URL,
                    rollAndSort: true,
                  });
                  setNewExtraName('');
                }}
              >
                Add combatant
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {live.party.characters.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="truncate text-[var(--text)]">{c.name}</span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-red-900/50 px-2 py-1 text-xs text-red-100 hover:bg-red-800/60"
                    onClick={() => setRemoveId(String(c.id))}
                  >
                    Remove…
                  </button>
                </li>
              ))}
            </ul>
            {live.party.characters.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No party members in view.</p>
            ) : null}
          </details>
        </div>
      </div>

      {removeId ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-sm rounded-xl border border-white/20 bg-[var(--surface)] p-4 shadow-xl">
            <p className="text-sm text-[var(--text)]">Remove this character from the session entirely?</p>
            <p className="mt-2 text-xs text-[var(--muted)]">This cannot be undone from the phone (re-import party from Master).</p>
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

      <UnhideCharacterDialog
        member={unhideTarget}
        onDismiss={() => setUnhideTarget(null)}
        emit={emit}
        afterUnhide={onClose}
      />
    </div>
  );
}
