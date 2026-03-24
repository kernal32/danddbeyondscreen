import { useEffect, useMemo, useState } from 'react';
import type { PublicSessionState } from '@ddb/shared-types';
import { formatConditionLabel } from '../util/formatConditionLabel';

const BASE_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

function normalizeKey(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function conditionCatalog(current: string[]): string[] {
  const baseByKey = new Map(BASE_CONDITIONS.map((c) => [normalizeKey(c), c]));
  const extra = current
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !baseByKey.has(normalizeKey(c)))
    .sort((a, b) => a.localeCompare(b));
  return [...BASE_CONDITIONS, ...extra];
}

export default function InitiativeRemoteSettingsSheet({
  open,
  onClose,
  live,
  emit,
  selectedCharacterId,
}: {
  open: boolean;
  onClose: () => void;
  live: PublicSessionState;
  emit: (event: string, payload?: unknown) => void;
  selectedCharacterId?: string | null;
}) {
  const [mode, setMode] = useState<'menu' | 'conditions'>('menu');

  useEffect(() => {
    if (!open) return;
    setMode(selectedCharacterId ? 'conditions' : 'menu');
  }, [open, selectedCharacterId]);

  const rows = useMemo(
    () =>
      live.party.characters
        .filter((c) => !selectedCharacterId || String(c.id) === selectedCharacterId)
        .map((c) => {
        const current = Array.from(
          new Set((c.conditions ?? []).map((x) => formatConditionLabel(x)).map((x) => x.trim()).filter(Boolean)),
        );
        const currentKeys = new Set(current.map((x) => normalizeKey(x)));
        return {
          id: String(c.id),
          name: c.name,
          current,
          currentKeys,
          options: conditionCatalog(current),
        };
      }),
    [live.party.characters, selectedCharacterId],
  );

  if (!open) return null;

  const renderMenu = () => (
    <div className="space-y-3 p-4 pb-6">
      <button
        type="button"
        className="w-full rounded-lg border border-white/15 bg-black/25 px-4 py-3 text-left text-sm font-semibold text-[var(--text)] hover:bg-black/35"
        onClick={() => setMode('conditions')}
      >
        Conditions
      </button>
    </div>
  );

  const renderConditions = () => (
    <div className="space-y-4 p-4 pb-8">
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No party members.</p>
      ) : (
        rows.map((row) => (
          <section key={row.id} className="rounded-xl border border-white/10 bg-black/15 p-3">
            <h3 className="mb-2 truncate text-sm font-semibold text-[var(--text)]">{row.name}</h3>
            <ul className="space-y-2">
              {row.options.map((label) => {
                const key = normalizeKey(label);
                const on = row.currentKeys.has(key);
                return (
                  <li key={`${row.id}-${key}`} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-2">
                    <span className="text-sm text-[var(--text)]">{label}</span>
                    <button
                      type="button"
                      aria-label={`${on ? 'Disable' : 'Enable'} ${label} for ${row.name}`}
                      className={`h-6 min-w-[2.4rem] rounded-full border px-1 transition-colors ${
                        on
                          ? 'border-emerald-400/70 bg-emerald-500/35'
                          : 'border-white/20 bg-white/10'
                      }`}
                      onClick={() => {
                        const next = on
                          ? row.current.filter((c) => normalizeKey(c) !== key)
                          : [...row.current, label];
                        emit('party:setConditions', { characterId: row.id, conditions: next });
                      }}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                          on ? 'translate-x-[1rem]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Settings">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close settings"
        onClick={() => {
          setMode('menu');
          onClose();
        }}
      />
      <div className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-white/15 bg-[var(--bg)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[var(--bg)] px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === 'conditions' ? (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-sky-400 hover:bg-white/10"
                onClick={() => setMode('menu')}
              >
                Back
              </button>
            ) : null}
            <h2 className="font-display text-lg font-semibold text-[var(--accent)]">
              {mode === 'conditions' ? 'Conditions' : 'Settings'}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-sky-400 hover:bg-white/10"
            onClick={() => {
              setMode('menu');
              onClose();
            }}
          >
            Close
          </button>
        </div>
        {mode === 'conditions' ? renderConditions() : renderMenu()}
      </div>
    </div>
  );
}

