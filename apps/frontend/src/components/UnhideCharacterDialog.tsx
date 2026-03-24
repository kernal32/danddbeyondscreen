import type { HiddenPartyMember } from '@ddb/shared-types';

type Emit = (event: string, payload?: unknown) => void;

/**
 * Reroll vs restore initiative when bringing a hidden PC back to the table.
 */
export default function UnhideCharacterDialog({
  member,
  onDismiss,
  emit,
  afterUnhide,
}: {
  member: HiddenPartyMember | null;
  onDismiss: () => void;
  emit: Emit;
  /** Optional (e.g. close phone More sheet). */
  afterUnhide?: () => void;
}) {
  if (!member) return null;

  const finish = () => {
    onDismiss();
    afterUnhide?.();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="max-w-sm rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-xl">
        <p className="text-sm font-medium text-[var(--text)]">Show {member.name} on the table</p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Put them back on initiative with a fresh roll, or restore the initiative total from when they were hidden.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-[var(--btn-primary-bg)] px-3 py-2 text-sm text-white hover:bg-[var(--btn-primary-hover)]"
            onClick={() => {
              emit('party:setHiddenFromTable', {
                characterId: member.id,
                hidden: false,
                unhideMode: 'reroll',
              });
              finish();
            }}
          >
            Unhide &amp; reroll
          </button>
          <button
            type="button"
            disabled={!member.hasSavedSnapshot}
            className="w-full rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] disabled:pointer-events-none disabled:opacity-40"
            onClick={() => {
              emit('party:setHiddenFromTable', {
                characterId: member.id,
                hidden: false,
                unhideMode: 'saved',
              });
              finish();
            }}
          >
            {member.hasSavedSnapshot && typeof member.savedInitiativeTotal === 'number'
              ? `Unhide with saved roll (${member.savedInitiativeTotal})`
              : 'Unhide with saved roll'}
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
            onClick={onDismiss}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
