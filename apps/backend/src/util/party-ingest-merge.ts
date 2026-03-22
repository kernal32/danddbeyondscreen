import type { NormalizedCharacter, PartySnapshot } from '@ddb/shared-types';

/** Strip fields the server owns (ignore client spoofing). */
export function stripInternalCharacterFields(c: NormalizedCharacter): NormalizedCharacter {
  const { ingestedAt: _i, ...rest } = c as NormalizedCharacter & { ingestedAt?: number };
  return rest;
}

function sortByName(chars: NormalizedCharacter[]): NormalizedCharacter[] {
  return [...chars].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function combineErrors(a: string | null, b: string | null): string | null {
  const parts = [a, b].filter((x): x is string => Boolean(x?.trim()));
  return parts.length ? parts.join('; ') : null;
}

/**
 * Persisted party uploads: either replace the whole snapshot or merge by character `id`.
 * On merge, a character is updated only if this batch is at least as new as the stored copy
 * (`ingestedAt` wall-clock ms from the server at ingest time).
 */
export function mergeIngestParty(
  existing: PartySnapshot | null,
  incoming: PartySnapshot,
  merge: boolean,
  batchTime: number,
): PartySnapshot {
  const incomingStamped: NormalizedCharacter[] = incoming.characters.map((c) => ({
    ...stripInternalCharacterFields(c),
    ingestedAt: batchTime,
  }));

  const useReplace = !merge || !existing?.characters?.length;

  if (useReplace) {
    return {
      campaign: incoming.campaign ?? null,
      characters: sortByName(incomingStamped),
      fetchedAt: new Date().toISOString(),
      upstreamDate: incoming.upstreamDate ?? null,
      error: incoming.error,
    };
  }

  const map = new Map<string, NormalizedCharacter>();
  for (const c of existing!.characters) {
    const clean = stripInternalCharacterFields(c);
    const prevAt = c.ingestedAt;
    const stored: NormalizedCharacter =
      prevAt !== undefined && Number.isFinite(prevAt) ? { ...clean, ingestedAt: prevAt } : clean;
    map.set(c.id, stored);
  }

  for (const c of incomingStamped) {
    const prev = map.get(c.id);
    const prevAt = prev?.ingestedAt ?? 0;
    if (!prev || prevAt <= batchTime) {
      map.set(c.id, c);
    }
  }

  return {
    campaign: incoming.campaign ?? existing!.campaign ?? null,
    characters: sortByName([...map.values()]),
    fetchedAt: new Date().toISOString(),
    upstreamDate: incoming.upstreamDate ?? existing!.upstreamDate ?? null,
    error: combineErrors(existing!.error, incoming.error),
  };
}
