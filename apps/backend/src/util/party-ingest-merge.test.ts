import { describe, expect, it } from 'vitest';
import type { NormalizedCharacter, PartySnapshot } from '@ddb/shared-types';
import { mergeIngestParty } from './party-ingest-merge.js';

function ch(id: string, name: string, ingestedAt?: number): NormalizedCharacter {
  const base: NormalizedCharacter = {
    id,
    name,
    avatarUrl: '',
    ac: 10,
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    passivePerception: 10,
    passiveInvestigation: 10,
    passiveInsight: 10,
    conditions: [],
    source: 'manual',
  };
  return ingestedAt !== undefined ? { ...base, ingestedAt } : base;
}

function party(chars: NormalizedCharacter[]): PartySnapshot {
  return {
    campaign: null,
    characters: chars,
    fetchedAt: 't',
    upstreamDate: null,
    error: null,
  };
}

describe('mergeIngestParty', () => {
  it('replaces when merge false', () => {
    const existing = party([ch('1', 'A', 100), ch('2', 'B', 100)]);
    const incoming = party([ch('3', 'C')]);
    const out = mergeIngestParty(existing, incoming, false, 200);
    expect(out.characters.map((c) => c.id)).toEqual(['3']);
    expect(out.characters[0]!.ingestedAt).toBe(200);
  });

  it('merges single id and keeps others when merge true', () => {
    const existing = party([ch('1', 'A', 100), ch('2', 'B', 100)]);
    const incoming = party([{ ...ch('1', 'A-new'), name: 'A-new' }]);
    const out = mergeIngestParty(existing, incoming, true, 300);
    const byId = Object.fromEntries(out.characters.map((c) => [c.id, c]));
    expect(Object.keys(byId).sort()).toEqual(['1', '2']);
    expect(byId['1']!.name).toBe('A-new');
    expect(byId['1']!.ingestedAt).toBe(300);
    expect(byId['2']!.ingestedAt).toBe(100);
  });

  it('keeps newer cached character when incoming batch is older', () => {
    const existing = party([ch('1', 'Fresh', 500)]);
    const incoming = party([ch('1', 'Stale')]);
    const out = mergeIngestParty(existing, incoming, true, 400);
    expect(out.characters[0]!.name).toBe('Fresh');
    expect(out.characters[0]!.ingestedAt).toBe(500);
  });

  it('uses replace when merge true but no existing party', () => {
    const incoming = party([ch('1', 'Only')]);
    const out = mergeIngestParty(null, incoming, true, 100);
    expect(out.characters).toHaveLength(1);
  });
});
