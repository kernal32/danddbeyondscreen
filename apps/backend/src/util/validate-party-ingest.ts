import type { NormalizedCharacter, PartySnapshot } from '@ddb/shared-types';

const MAX_CHARS = 50;

function isNonNegInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && Math.floor(n) === n;
}

function isSpellSlotSummary(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (!isNonNegInt(o.level) || o.level < 1 || o.level > 9) return false;
  if (!isNonNegInt(o.available)) return false;
  if (!isNonNegInt(o.used)) return false;
  return true;
}

export function isNormalizedCharacter(x: unknown): x is NormalizedCharacter {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (typeof o.name !== 'string') return false;
  if (typeof o.avatarUrl !== 'string') return false;
  if (!isNonNegInt(o.ac)) return false;
  if (!isNonNegInt(o.maxHp)) return false;
  if (!isNonNegInt(o.currentHp)) return false;
  if (!isNonNegInt(o.tempHp)) return false;
  if (!isNonNegInt(o.passivePerception)) return false;
  if (!isNonNegInt(o.passiveInvestigation)) return false;
  if (!isNonNegInt(o.passiveInsight)) return false;
  if (!Array.isArray(o.conditions) || !o.conditions.every((c) => typeof c === 'string')) return false;
  if (o.source !== 'ddb' && o.source !== 'manual') return false;
  if (o.ddbCharacterId !== undefined && (typeof o.ddbCharacterId !== 'number' || !Number.isFinite(o.ddbCharacterId))) {
    return false;
  }
  if (o.spellSlots !== undefined) {
    if (!Array.isArray(o.spellSlots) || !o.spellSlots.every(isSpellSlotSummary)) return false;
  }
  if (o.initiativeBonus !== undefined) {
    if (typeof o.initiativeBonus !== 'number' || !Number.isFinite(o.initiativeBonus)) return false;
  }
  if (o.spellSaveDC !== undefined) {
    if (typeof o.spellSaveDC !== 'number' || !Number.isFinite(o.spellSaveDC)) return false;
    const dc = Math.round(o.spellSaveDC);
    if (dc < 8 || dc > 30) return false;
  }
  if (o.absent !== undefined && typeof o.absent !== 'boolean') return false;
  if (o.ingestedAt !== undefined) {
    if (typeof o.ingestedAt !== 'number' || !Number.isFinite(o.ingestedAt)) return false;
  }
  return true;
}

function isCampaignRef(x: unknown): boolean {
  if (x === null) return true;
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    (o.id === null || typeof o.id === 'number') &&
    typeof o.name === 'string' &&
    typeof o.link === 'string' &&
    typeof o.description === 'string' &&
    Array.isArray(o.characterIds) &&
    o.characterIds.every((id) => typeof id === 'number')
  );
}

/** Validate client-supplied party snapshot for ingest. */
export function parsePartySnapshotIngest(raw: unknown): PartySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isCampaignRef(o.campaign)) return null;
  if (!Array.isArray(o.characters)) return null;
  if (o.characters.length === 0 || o.characters.length > MAX_CHARS) return null;
  if (!o.characters.every(isNormalizedCharacter)) return null;
  if (o.fetchedAt !== null && typeof o.fetchedAt !== 'string') return null;
  if (o.upstreamDate !== null && typeof o.upstreamDate !== 'string') return null;
  if (o.error !== null && typeof o.error !== 'string') return null;
  return {
    campaign: o.campaign as PartySnapshot['campaign'],
    characters: o.characters as NormalizedCharacter[],
    fetchedAt: (o.fetchedAt as string | null) ?? new Date().toISOString(),
    upstreamDate: (o.upstreamDate as string | null) ?? null,
    error: (o.error as string | null) ?? null,
  };
}
