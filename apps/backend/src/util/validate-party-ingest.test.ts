import { describe, expect, it } from 'vitest';
import { parsePartySnapshotIngest } from './validate-party-ingest.js';

describe('parsePartySnapshotIngest', () => {
  it('accepts minimal valid party', () => {
    const p = parsePartySnapshotIngest({
      campaign: null,
      characters: [
        {
          id: '1',
          name: 'A',
          avatarUrl: '',
          ac: 15,
          maxHp: 10,
          currentHp: 10,
          tempHp: 0,
          passivePerception: 12,
          passiveInvestigation: 11,
          passiveInsight: 10,
          conditions: [],
          source: 'manual',
        },
      ],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    });
    expect(p?.characters).toHaveLength(1);
  });

  it('rejects empty characters', () => {
    expect(parsePartySnapshotIngest({ campaign: null, characters: [], fetchedAt: null, upstreamDate: null, error: null })).toBeNull();
  });
});
