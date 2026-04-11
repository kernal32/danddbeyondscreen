import { describe, expect, it } from 'vitest';
import type { NormalizedCharacter, PartySnapshot, SessionRecord } from '@ddb/shared-types';
import {
  applyManualHpPatch,
  clearManualTempHpOverridesForParty,
  mergePartyOverrides,
} from './session.service.js';

function ch(id: string, name: string, conditions: string[]): NormalizedCharacter {
  return {
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
    conditions,
    source: 'ddb',
  };
}

function party(chars: NormalizedCharacter[]): PartySnapshot {
  return {
    campaign: null,
    characters: chars,
    fetchedAt: null,
    upstreamDate: null,
    error: null,
  };
}

describe('mergePartyOverrides', () => {
  it('does not let empty manual conditions wipe non-empty party ingest', () => {
    const p = party([ch('1', 'Hope', ['Incapacitated', 'Prone', 'Restrained'])]);
    const merged = mergePartyOverrides(p, {
      '1': { conditions: [] },
    });
    expect(merged.characters[0]?.conditions).toEqual(['Incapacitated', 'Prone', 'Restrained']);
  });

  it('still applies explicit non-empty manual conditions', () => {
    const p = party([ch('1', 'A', ['Grappled'])]);
    const merged = mergePartyOverrides(p, {
      '1': { conditions: ['Poisoned'] },
    });
    expect(merged.characters[0]?.conditions).toEqual(['Poisoned']);
  });

  it('applies empty override when party also has no conditions', () => {
    const p = party([ch('1', 'B', [])]);
    const merged = mergePartyOverrides(p, {
      '1': { conditions: [] },
    });
    expect(merged.characters[0]?.conditions).toEqual([]);
  });

  it('after clearing manual temp override, merged party uses ingest tempHp', () => {
    const p = party([{ ...ch('1', 'Drevan', []), tempHp: 0 }]);
    const session = {
      party: p,
      manualOverrides: { '1': { tempHp: 10 } } as SessionRecord['manualOverrides'],
    };
    clearManualTempHpOverridesForParty(session);
    const merged = mergePartyOverrides(session.party, session.manualOverrides);
    expect(merged.characters[0]?.tempHp).toBe(0);
  });
});

describe('applyManualHpPatch', () => {
  it('drops prior tempHp when only currentHp is sent (stops freezing old temp)', () => {
    const overrides: SessionRecord['manualOverrides'] = {
      '1': { currentHp: 12, tempHp: 10 },
    };
    applyManualHpPatch(overrides, '1', { currentHp: 15 });
    expect(overrides['1']?.currentHp).toBe(15);
    expect(overrides['1']?.tempHp).toBeUndefined();
  });

  it('sets tempHp when both fields are sent', () => {
    const overrides: SessionRecord['manualOverrides'] = {};
    applyManualHpPatch(overrides, '1', { currentHp: 10, tempHp: 15 });
    expect(overrides['1']?.currentHp).toBe(10);
    expect(overrides['1']?.tempHp).toBe(15);
  });

  it('can set only tempHp without clearing it', () => {
    const overrides: SessionRecord['manualOverrides'] = {
      '1': { currentHp: 8 },
    };
    applyManualHpPatch(overrides, '1', { tempHp: 5 });
    expect(overrides['1']?.currentHp).toBe(8);
    expect(overrides['1']?.tempHp).toBe(5);
  });
});
