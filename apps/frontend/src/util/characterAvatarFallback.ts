import type { NormalizedCharacter } from '@ddb/shared-types/character';
import type { InitiativeState } from '@ddb/shared-types/initiative';

/**
 * Merged session `party` (ingest + manual overrides) is authoritative for conditions. Initiative rows
 * snapshot conditions at combat start and are **not** updated on later party reloads — falling back to them
 * when party `conditions` is empty would keep bogus lists (e.g. cleared after a fixed ingest).
 */
export function effectiveCharacterConditions(
  c: NormalizedCharacter,
  _initiative: InitiativeState | undefined,
): string[] {
  return [...(c.conditions ?? [])];
}

/**
 * Initiative rows snapshot `avatarUrl` when combat starts. If a later ingest clears party `avatarUrl`,
 * the tracker still shows the old URL via `ch?.avatarUrl || e.avatarUrl` — but player cards only read party.
 * Merge initiative snapshot URLs when party is empty so cards match the tracker.
 */
export function mergePartyAvatarFromInitiative(
  c: NormalizedCharacter,
  initiative: InitiativeState | undefined,
): NormalizedCharacter {
  const trimmed = (c.avatarUrl || '').trim();
  if (trimmed) return c;
  if (!initiative?.entries) return c;
  for (const e of Object.values(initiative.entries)) {
    if (String(e.entityId) !== String(c.id)) continue;
    const url = (e.avatarUrl || '').trim();
    if (url) return { ...c, avatarUrl: url };
  }
  return c;
}

export function mapPartyWithInitiativeAvatars(
  characters: NormalizedCharacter[],
  initiative: InitiativeState | undefined,
): NormalizedCharacter[] {
  return characters.map((c) => mergePartyAvatarFromInitiative(c, initiative));
}

/** Avatar merge plus initiative fallback for conditions (TV party cards match initiative strip). */
export function mapPartyForPartyWidget(
  characters: NormalizedCharacter[],
  initiative: InitiativeState | undefined,
): NormalizedCharacter[] {
  return mapPartyWithInitiativeAvatars(characters, initiative).map((c) => ({
    ...c,
    conditions: effectiveCharacterConditions(c, initiative),
  }));
}
