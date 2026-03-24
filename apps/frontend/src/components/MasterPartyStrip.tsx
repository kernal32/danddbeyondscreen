import { useState } from 'react';
import type { HiddenPartyMember, NormalizedCharacter } from '@ddb/shared-types';
import { BUILTIN_GENERIC_PLAYER_AVATAR_URL } from '@ddb/shared-types';
import { IconEye, IconEyeOff } from './icons/VisibilityEyes';
import UnhideCharacterDialog from './UnhideCharacterDialog';

type Emit = (event: string, payload?: unknown) => void;

function hiddenMeta(
  hiddenPartyMembers: HiddenPartyMember[] | undefined,
  characterId: string,
): HiddenPartyMember | undefined {
  return hiddenPartyMembers?.find((h) => h.id === String(characterId));
}

export default function MasterPartyStrip({
  characters,
  hiddenPartyMembers,
  emit,
}: {
  characters: NormalizedCharacter[];
  hiddenPartyMembers: HiddenPartyMember[] | undefined;
  emit: Emit;
}) {
  const [unhideTarget, setUnhideTarget] = useState<HiddenPartyMember | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {characters.map((c) => {
          const id = String(c.id);
          const hidden = !!hiddenMeta(hiddenPartyMembers, id);
          const inspired = c.inspired === true;
          const avatarUrl = (c.avatarUrl || '').trim();
          const showImg = avatarUrl && avatarUrl !== BUILTIN_GENERIC_PLAYER_AVATAR_URL;
          const initial = c.name.slice(0, 1).toUpperCase();

          return (
            <div
              key={c.id}
              className={`rounded-lg border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_5%,transparent)] p-2 ${
                inspired ? '!border-amber-400/75 bg-amber-300/10 ring-1 ring-amber-300/70' : ''
              } ${
                hidden ? 'opacity-60' : ''
              }`}
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                {showImg ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] font-display text-lg text-[var(--accent)]">
                    {initial}
                  </div>
                )}
                <p
                  className={`w-full truncate text-xs font-semibold leading-tight ${
                    hidden ? 'text-[var(--muted)]' : 'text-[var(--text)]'
                  }`}
                  title={c.name}
                >
                  {c.name}
                  {inspired ? <span className="ml-1 text-amber-300">★</span> : null}
                </p>
                <button
                  type="button"
                  title={hidden ? 'Show on table' : 'Hide from table'}
                  aria-label={hidden ? `Show ${c.name} on table` : `Hide ${c.name} from table`}
                  className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  onClick={() => {
                    if (hidden) {
                      const meta = hiddenMeta(hiddenPartyMembers, id);
                      if (meta) setUnhideTarget(meta);
                    } else {
                      emit('party:setHiddenFromTable', { characterId: id, hidden: true });
                    }
                  }}
                >
                  {hidden ? <IconEye className="h-5 w-5" /> : <IconEyeOff className="h-5 w-5" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <UnhideCharacterDialog
        member={unhideTarget}
        onDismiss={() => setUnhideTarget(null)}
        emit={emit}
      />
    </>
  );
}
