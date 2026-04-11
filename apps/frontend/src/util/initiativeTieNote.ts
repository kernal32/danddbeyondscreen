import type { NormalizedCharacter } from '@ddb/shared-types/character';
import type { InitiativeEntry, InitiativeState } from '@ddb/shared-types/initiative';

function dexModForEntry(entry: InitiativeEntry, chars: NormalizedCharacter[]): number | undefined {
  if (entry.dexMod != null && Number.isFinite(entry.dexMod)) return entry.dexMod;
  return chars.find((ch) => ch.id === entry.entityId)?.dexterityModifier;
}

export function buildInitiativeTieNote(
  entry: InitiativeEntry | undefined,
  initState: InitiativeState | undefined,
  chars: NormalizedCharacter[],
): string | null {
  if (!entry || !initState) return null;
  const peers = Object.values(initState.entries).filter(
    (e) => e.id !== entry.id && e.initiativeTotal === entry.initiativeTotal,
  );
  if (!peers.length) return null;
  const myDex = dexModForEntry(entry, chars);
  const parts = peers.map((p) => {
    const od = dexModForEntry(p, chars);
    const label = p.label || 'Combatant';
    if (myDex != null && od != null) {
      if (myDex > od) return `vs ${label}: win tie (Dex ${myDex}>${od})`;
      if (myDex < od) return `vs ${label}: lose tie (Dex ${myDex}<${od})`;
      return `vs ${label}: Dex tie (${myDex})`;
    }
    return `vs ${label}: same init`;
  });
  return parts.join(' · ');
}
