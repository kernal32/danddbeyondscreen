import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  conditionToLabel,
  extractClassResources,
  extractConditions,
  extractSpellSlots,
  isDdbConditionUiPlaceholder,
  normalizeCharacter,
  isDdbGeneratedDefaultCharacterName,
  resolveDdbCharacterName,
  refreshDdbCharacterNamesFromSheetJson,
  sanitizeNormalizedPartyConditions,
  stripGroupedDdbSpellTableScrapeNoise,
} from './character.service.js';
import type { DdbCharacter } from './character-calculator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('conditionToLabel', () => {
  it('reads name from rich objects', () => {
    expect(conditionToLabel('Blessed')).toBe('Blessed');
    expect(conditionToLabel({ name: 'Hexed' })).toBe('Hexed');
    expect(conditionToLabel({ label: 'Slow' })).toBe('Slow');
    expect(conditionToLabel({ definition: { name: 'Faerie Fire' } })).toBe('Faerie Fire');
  });

  it('resolves legacy /json condition rows that only have definition id + level', () => {
    expect(conditionToLabel({ id: 7, level: null })).toBe('Incapacitated');
    expect(conditionToLabel({ id: 12, level: null })).toBe('Prone');
    expect(conditionToLabel({ id: 13, level: null })).toBe('Restrained');
    expect(conditionToLabel({ id: 9, level: null })).toBe('Paralyzed');
  });

  it('formats exhaustion when level is present', () => {
    expect(conditionToLabel({ id: 4, level: 2 })).toBe('Exhaustion 2');
  });

  it('drops spell-slot-shaped leaks when id is not a standard condition definition', () => {
    expect(conditionToLabel({ id: 240678, level: null })).toBe('');
  });
});

describe('isDdbConditionUiPlaceholder', () => {
  it('flags DDB empty-state CTA text', () => {
    expect(isDdbConditionUiPlaceholder('Add Active Conditions')).toBe(true);
    expect(isDdbConditionUiPlaceholder('  add active conditions  ')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Manage Conditions')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Poisoned')).toBe(false);
  });

  it('flags character sheet nav tabs', () => {
    expect(isDdbConditionUiPlaceholder('Actions')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Proficiencies & Training')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Limited Use')).toBe(true);
  });

  it('flags numeric scrap noise as conditions', () => {
    expect(isDdbConditionUiPlaceholder('+0')).toBe(true);
    expect(isDdbConditionUiPlaceholder('0')).toBe(true);
  });

  it('flags DDB spell damage table rows scraped as one label', () => {
    expect(isDdbConditionUiPlaceholder('Heal, Damage, 13, --')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Heal, Damage, --')).toBe(true);
    expect(isDdbConditionUiPlaceholder('Heal, Damage, 13')).toBe(true);
    expect(isDdbConditionUiPlaceholder(`Heal, Damage, 13, \u2013`)).toBe(true);
    expect(isDdbConditionUiPlaceholder('Incapacitated, Prone, Restrained')).toBe(false);
  });
});

describe('sanitizeNormalizedPartyConditions', () => {
  it('strips spell-table scrap noise from stored conditions', () => {
    const party = {
      campaign: null,
      characters: [
        {
          id: '1',
          name: 'A',
          avatarUrl: '',
          ac: 10,
          maxHp: 10,
          currentHp: 10,
          tempHp: 0,
          initiativeBonus: 0,
          dexterityModifier: 0,
          passivePerception: 10,
          passiveInvestigation: 10,
          passiveInsight: 10,
          conditions: ['Poisoned', 'Heal, Damage, 13, --'],
          source: 'ddb' as const,
          ddbCharacterId: 1,
        },
      ],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    const out = sanitizeNormalizedPartyConditions(party);
    expect(out.characters[0]?.conditions).toEqual(['Poisoned']);
  });

  it('removes split spell-table labels after per-label filter', () => {
    const party = {
      campaign: null,
      characters: [
        {
          id: '1',
          name: 'A',
          avatarUrl: '',
          ac: 10,
          maxHp: 10,
          currentHp: 10,
          tempHp: 0,
          initiativeBonus: 0,
          dexterityModifier: 0,
          passivePerception: 10,
          passiveInvestigation: 10,
          passiveInsight: 10,
          conditions: ['Heal', 'Damage', '10', '--'],
          source: 'ddb' as const,
          ddbCharacterId: 1,
        },
      ],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    expect(sanitizeNormalizedPartyConditions(party).characters[0]?.conditions).toEqual([]);
  });

  it('clears stored full PHB catalog mistaken for actives (string list)', () => {
    const catalog = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhaustion 3',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
    ];
    const party = {
      campaign: null,
      characters: [
        {
          id: '1',
          name: 'Drevan',
          avatarUrl: '',
          ac: 18,
          maxHp: 15,
          currentHp: 15,
          tempHp: 10,
          initiativeBonus: 0,
          dexterityModifier: 0,
          passivePerception: 13,
          passiveInvestigation: 9,
          passiveInsight: 13,
          conditions: catalog,
          source: 'ddb' as const,
          ddbCharacterId: 1,
        },
      ],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    expect(sanitizeNormalizedPartyConditions(party).characters[0]?.conditions).toEqual([]);
  });
});

describe('refreshDdbCharacterNamesFromSheetJson', () => {
  it('updates normalized name from embedded ddbSheetJson when socialName escapes placeholder', () => {
    const party = {
      campaign: null,
      characters: [
        {
          id: '43993',
          name: "WardenMain049's Character",
          avatarUrl: '',
          ac: 11,
          maxHp: 11,
          currentHp: 11,
          tempHp: 0,
          initiativeBonus: 0,
          dexterityModifier: 0,
          passivePerception: 14,
          passiveInvestigation: 9,
          passiveInsight: 14,
          conditions: [],
          source: 'ddb' as const,
          ddbCharacterId: 43993,
          ddbSheetJson: {
            id: 43993,
            name: "WardenMain049's Character",
            socialName: 'Brother Marcus',
          },
        },
      ],
      fetchedAt: null,
      upstreamDate: null,
      error: null,
    };
    const out = refreshDdbCharacterNamesFromSheetJson(party);
    expect(out.characters[0]?.name).toBe('Brother Marcus');
  });
});

describe('stripGroupedDdbSpellTableScrapeNoise', () => {
  it('no-ops without heal+damage pair', () => {
    expect(stripGroupedDdbSpellTableScrapeNoise(['Blessed', 'Hex'])).toEqual(['Blessed', 'Hex']);
  });
});

describe('extractConditions', () => {
  it('extracts conditions from Hope-style legacy ids (no embedded names)', () => {
    const raw = {
      conditions: [{ id: 7, level: null }, { id: 12, level: null }, { id: 13, level: null }],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Incapacitated', 'Prone', 'Restrained']);
  });

  it('drops spell damage table row strings', () => {
    const raw = {
      conditions: ['Poisoned', 'Heal, Damage, 10, --'],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Poisoned']);
  });

  it('drops spell table cells when scraped as separate condition strings', () => {
    const raw = { conditions: ['Heal', 'Damage', '13', '--'] } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual([]);
  });

  it('keeps real conditions when heal/damage pair is absent', () => {
    const raw = { conditions: ['Incapacitated', 'Prone', 'Restrained'] } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Incapacitated', 'Prone', 'Restrained']);
  });

  it('drops spell fragments but keeps Poisoned in same list', () => {
    const raw = { conditions: ['Poisoned', 'Heal', 'Damage', '8', '--'] } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Poisoned']);
  });

  it('reads top-level conditions', () => {
    const raw = { conditions: ['Poisoned', { name: 'Blessed' }] } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Poisoned', 'Blessed']);
  });

  it('drops Add Active Conditions placeholder', () => {
    const raw = { conditions: ['Add Active Conditions', 'Grappled'] } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Grappled']);
  });

  it('merges activeConditions when present', () => {
    const raw = {
      conditions: ['Frightened'],
      activeConditions: [{ name: 'Slow' }, 'Deafened'],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Frightened', 'Slow', 'Deafened']);
  });

  it('dedupes the same label from both arrays', () => {
    const raw = {
      conditions: ['Poisoned'],
      activeConditions: ['Poisoned', { name: 'Grappled' }],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Poisoned', 'Grappled']);
  });

  it('drops D&D Beyond sheet tab labels mistaken for conditions', () => {
    const raw = {
      conditions: ['Actions', 'Proficiencies & Training', 'Grappled'],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Grappled']);
  });

  it('drops numeric UI scrap mistaken for conditions', () => {
    const raw = {
      conditions: ['+0', 'Blessed'],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Blessed']);
  });

  it('splits glued PascalCase PHB conditions into separate entries', () => {
    const raw = {
      conditions: ['IncapacitatedProneRestrained'],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Incapacitated', 'Prone', 'Restrained']);
  });

  it('drops consecutive standard condition ids 1…N (full definition list mistaken for actives)', () => {
    const leak = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      level: i + 1 === 4 ? 3 : null,
    }));
    const raw = { conditions: leak } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual([]);
  });

  it('drops consecutive catalog when each row includes embedded names (DDB definition list shape)', () => {
    const labels = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhaustion 3',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
    ];
    const leak = labels.map((name, i) => ({ id: i + 1, name, level: i + 1 === 4 ? 3 : null }));
    const raw = { conditions: leak } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual([]);
  });

  it('drops consecutive catalog when conditions are plain strings (same PHB list)', () => {
    const labels = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhaustion 3',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
    ];
    const raw = { conditions: labels } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual([]);
  });

  it('drops consecutive catalog when rows use v5 instance id + definitionId (not 1…15 on `id`)', () => {
    const names1to12 = [
      'Blinded',
      'Charmed',
      'Deafened',
      'Exhaustion',
      'Frightened',
      'Grappled',
      'Incapacitated',
      'Invisible',
      'Paralyzed',
      'Petrified',
      'Poisoned',
      'Prone',
    ];
    const leak = Array.from({ length: 12 }, (_, i) => ({
      id: 500_000 + i,
      definitionId: i + 1,
      name: names1to12[i],
      level: i + 1 === 4 ? 3 : null,
    }));
    const raw = { conditions: leak } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual([]);
  });

  it('still uses activeConditions when top-level conditions is a consecutive-id leak', () => {
    const leak = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, level: null }));
    const raw = {
      conditions: leak,
      activeConditions: [{ id: 7, level: null }, { id: 12, level: null }],
    } as unknown as DdbCharacter;
    expect(extractConditions(raw)).toEqual(['Incapacitated', 'Prone']);
  });
});

describe('extractSpellSlots', () => {
  it('merges pactMagic when spellSlots are all zeros', () => {
    const raw = {
      spellSlots: [
        { level: 1, used: 0, available: 0 },
        { level: 2, used: 0, available: 0 },
      ],
      pactMagic: [
        { level: 1, used: 0, available: 2 },
        /** 1 slot used of 2 — DDB `available` is usually *remaining* here */
        { level: 2, used: 1, available: 1 },
      ],
    } as unknown as DdbCharacter;
    const slots = extractSpellSlots(raw);
    expect(slots).toEqual([
      { level: 1, available: 2, used: 0 },
      { level: 2, available: 2, used: 1 },
    ]);
  });

  it('prefers higher available per level', () => {
    const raw = {
      spellSlots: [{ level: 1, used: 0, available: 4 }],
      pactMagic: [{ level: 1, used: 0, available: 2 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 4, used: 0 }]);
  });

  it('when duplicate rows conflict, prefers lower used (fresher remaining)', () => {
    const raw = {
      spellSlots: [
        { level: 1, used: 1, available: 1 },
        { level: 1, used: 0, available: 2 },
      ],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 2, used: 0 }]);
  });

  it('uses max when available is missing', () => {
    const raw = {
      pactMagic: [{ level: 3, used: 1, max: 3 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 3, available: 3, used: 1 }]);
  });

  it('derives max slots from remaining + used (expended alias)', () => {
    const raw = {
      spellSlots: [{ level: 2, remaining: 1, expended: 2 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 2, available: 3, used: 2 }]);
  });

  it('treats DDB available as slots remaining when no table/max disambiguates (used + raw = pool)', () => {
    const raw = {
      spellSlots: [{ level: 1, used: 1, available: 2 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 3, used: 1 }]);
  });

  it('keeps explicit row max when DDB sends the same value as max pool (not remaining)', () => {
    const raw = {
      pactMagic: [{ level: 2, used: 1, available: 2, max: 2 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 2, available: 2, used: 1 }]);
  });

  it('infers all slots expended when one source reports 0 remaining and another echoes the pool (used still 0)', () => {
    const levelSpellSlots = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const raw = {
      classes: [
        {
          level: 1,
          definition: {
            spellRules: { multiClassSpellSlotDivisor: 1, levelSpellSlots },
          },
        },
      ],
      spellSlots: [{ level: 1, used: 0, available: 2 }],
      pactMagic: [{ level: 1, used: 0, available: 0 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 2, used: 2 }]);
  });

  it('prefers smallest positive raw available when spellSlots and pact disagree (remaining vs structural)', () => {
    const levelSpellSlots = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const raw = {
      classes: [
        {
          level: 1,
          definition: {
            spellRules: { multiClassSpellSlotDivisor: 1, levelSpellSlots },
          },
        },
      ],
      spellSlots: [{ level: 1, used: 0, available: 2 }],
      pactMagic: [{ level: 1, used: 0, available: 1 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 2, used: 1 }]);
  });

  it('infers expended count when DDB omits used but available is remaining below table cap', () => {
    /** Row index 0 unused in DDB; row 1 = 1st-level character spell slot row */
    const levelSpellSlots = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const raw = {
      classes: [
        {
          level: 1,
          definition: {
            spellRules: { multiClassSpellSlotDivisor: 1, levelSpellSlots },
          },
        },
      ],
      spellSlots: [{ level: 1, used: 0, available: 1 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 2, used: 1 }]);
  });

  it('infers level from 9-length spellSlots when level is null', () => {
    const spellSlots = Array.from({ length: 9 }, (_, i) =>
      i === 0
        ? { id: 1, level: null, max: 4, used: 2 }
        : { level: i + 1, used: 0, available: 0 },
    );
    const raw = { spellSlots } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 4, used: 2 }]);
  });

  it('reads pactMagicSlots like pactMagic', () => {
    const raw = {
      spellSlots: [{ level: 1, used: 0, available: 0 }],
      pactMagicSlots: [{ level: 2, used: 0, available: 3 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 2, available: 3, used: 0 }]);
  });

  it('fills capacity from levelSpellSlots when spellSlots are all zero (DDB sheet JSON)', () => {
    const levelSpellSlots = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
    ];
    const raw = {
      classes: [
        {
          level: 1,
          definition: {
            spellRules: {
              multiClassSpellSlotDivisor: 1,
              levelSpellSlots,
            },
          },
        },
      ],
      spellSlots: Array.from({ length: 9 }, (_, i) => ({
        level: i + 1,
        used: 0,
        available: 0,
      })),
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 1, available: 2, used: 0 }]);
  });

  it('uses combined spellcaster level for multiclass levelSpellSlots row', () => {
    const table = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [2, 0, 0, 0, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0, 0, 0],
      [4, 2, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 0, 0, 0, 0, 0, 0, 0],
      [4, 3, 2, 0, 0, 0, 0, 0, 0],
    ];
    const spellRules = { multiClassSpellSlotDivisor: 1, levelSpellSlots: table };
    const raw = {
      classes: [
        { level: 3, definition: { spellRules } },
        { level: 2, definition: { spellRules } },
      ],
      spellSlots: [],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([
      { level: 1, available: 4, used: 0 },
      { level: 2, available: 3, used: 0 },
      { level: 3, available: 2, used: 0 },
    ]);
  });
});

describe('extractClassResources', () => {
  it('collects limitedUse from actions.class / race / feat', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Ki', limitedUse: { numberUsed: 2, maxUses: 5 } },
          { name: 'Rage', limitedUse: { numberUsed: 0, maxUses: 4 } },
        ],
        race: [{ name: 'Breath Weapon', limitedUse: { numberUsed: 1, maxUses: 1 } }],
        feat: [],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([
      { label: 'Ki', available: 5, used: 2 },
      { label: 'Rage', available: 4, used: 0 },
      { label: 'Breath Weapon', available: 1, used: 1 },
    ]);
  });

  it('skips usesSpellSlot actions and dedupes by name', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Ki', limitedUse: { numberUsed: 0, maxUses: 4 } },
          { name: 'Fireball', usesSpellSlot: true, limitedUse: { numberUsed: 0, maxUses: 1 } },
          { name: 'ki', limitedUse: { numberUsed: 1, maxUses: 4 } },
        ],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([{ label: 'Ki', available: 4, used: 0 }]);
  });

  it('merges duplicate feature labels by minimum numberUsed (Lay on Hands)', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Lay on Hands', limitedUse: { numberUsed: 2, maxUses: 25 } },
          { name: 'Lay on Hands', limitedUse: { numberUsed: 0, maxUses: 25 } },
        ],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([{ label: 'Lay on Hands', available: 25, used: 0 }]);
  });

  it('merges Lay on Hands healing pool row with titled variant under one key', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Lay On Hands: Healing Pool', limitedUse: { numberUsed: 2, maxUses: 5 } },
          { name: 'Lay on Hands', limitedUse: { numberUsed: 0, maxUses: 25 } },
        ],
      },
    } as unknown as DdbCharacter;
    const rows = extractClassResources(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.used).toBe(0);
    expect(rows[0]?.available).toBe(25);
    expect(rows[0]?.label).toContain('Healing Pool');
  });

  it('merges DDB orphan title "Healing Pool" (no Lay on Hands in string) with full Lay on Hands row', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Healing Pool', limitedUse: { numberUsed: 2, maxUses: 5 } },
          { name: 'Lay on Hands', limitedUse: { numberUsed: 0, maxUses: 25 } },
        ],
      },
    } as unknown as DdbCharacter;
    const rows = extractClassResources(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.used).toBe(0);
    expect(rows[0]?.available).toBe(25);
  });

  it('floors Lay on Hands to paladin level × 5 when DDB only exposes the small Healing Pool row', () => {
    const raw = {
      classes: [{ level: 5, definition: { name: 'Paladin' } }],
      actions: {
        class: [
          { name: 'Lay On Hands: Healing Pool', limitedUse: { numberUsed: 2, maxUses: 5 } },
        ],
      },
    } as unknown as DdbCharacter;
    const rows = extractClassResources(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.available).toBe(25);
    expect(rows[0]?.used).toBe(2);
  });

  it('counts only paladin class levels for Lay on Hands cap when multiclassed', () => {
    const raw = {
      classes: [
        { level: 2, definition: { name: 'Fighter' } },
        { level: 3, definition: { name: 'Paladin' } },
      ],
      actions: {
        class: [{ name: 'Healing Pool', limitedUse: { numberUsed: 1, maxUses: 5 } }],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([expect.objectContaining({ available: 15, used: 1 })]);
  });

  it('reads limitedUse used/max from DDB aliases (used / max)', () => {
    const raw = {
      actions: {
        class: [
          { name: 'Lay On Hands: Healing Pool', limitedUse: { used: 2, max: 5 } },
          { name: 'Lay on Hands', limitedUse: { numberUsed: 0, maxUses: 25 } },
        ],
      },
    } as unknown as DdbCharacter;
    const rows = extractClassResources(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.used).toBe(0);
    expect(rows[0]?.available).toBe(25);
  });

  it('reads name from definition and clamps used to available', () => {
    const raw = {
      actions: {
        class: [{ definition: { name: 'Bardic Inspiration' }, limitedUse: { numberUsed: 99, maxUses: 5 } }],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([{ label: 'Bardic Inspiration', available: 5, used: 5 }]);
  });
});

describe('isDdbGeneratedDefaultCharacterName', () => {
  it('detects ASCII and typographic apostrophe default names', () => {
    expect(isDdbGeneratedDefaultCharacterName("WardenMain049's Character")).toBe(true);
    expect(isDdbGeneratedDefaultCharacterName('WardenMain049\u2019s Character')).toBe(true);
    expect(isDdbGeneratedDefaultCharacterName('Kira Thornwood')).toBe(false);
  });
});

describe('resolveDdbCharacterName', () => {
  it('prefers campaign.characters[].characterName when top-level name is DDB placeholder', () => {
    const raw = {
      id: 163111300,
      name: "WardenMain049's Character",
      campaign: {
        characters: [{ userId: 1, characterId: 163111300, characterName: 'Moonleaf' }],
      },
    } as unknown as DdbCharacter;
    expect(resolveDdbCharacterName(raw)).toBe('Moonleaf');
  });

  it('uses campaign roster displayName when characterName is still the Username\'s Character placeholder', () => {
    const raw = {
      id: 163111300,
      name: "WardenMain049's Character",
      campaign: {
        characters: [
          {
            userId: 1,
            characterId: 163111300,
            characterName: "WardenMain049's Character",
            displayName: 'Circaea Nightbloom',
          },
        ],
      },
    } as unknown as DdbCharacter;
    expect(resolveDdbCharacterName(raw)).toBe('Circaea Nightbloom');
  });

  it('uses root displayName when campaign roster still has the placeholder', () => {
    const raw = {
      id: 163111300,
      name: "WardenMain049's Character",
      displayName: 'True Name',
      campaign: {
        characters: [{ userId: 1, characterId: 163111300, characterName: "WardenMain049's Character" }],
      },
    } as unknown as DdbCharacter;
    expect(resolveDdbCharacterName(raw)).toBe('True Name');
  });

  it('returns placeholder when no better source exists (matches Warden snapshot)', () => {
    const raw = {
      id: 163111300,
      name: "WardenMain049's Character",
      socialName: null,
      campaign: {
        characters: [{ userId: 1, characterId: 163111300, characterName: "WardenMain049's Character" }],
      },
    } as unknown as DdbCharacter;
    expect(resolveDdbCharacterName(raw)).toBe("WardenMain049's Character");
  });
});

describe('normalizeCharacter', () => {
  const base = {
    id: 1,
    name: 'Test',
    removedHitPoints: 0,
    temporaryHitPoints: 0,
  } as unknown as DdbCharacter;

  it('uses socialName when top-level name is DDB default Username\'s Character', () => {
    const n = normalizeCharacter({
      ...base,
      id: 99,
      name: "WardenMain049's Character",
      socialName: 'Kira Thornwood',
      stats: [{ id: 2, value: 10 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
      classes: [],
      preferences: { hitPointType: 1 },
      overrideHitPoints: 10,
    } as unknown as DdbCharacter);
    expect(n.name).toBe('Kira Thornwood');
  });

  it('sets inspired when DDB inspiration is true', () => {
    const n = normalizeCharacter({ ...base, inspiration: true } as DdbCharacter);
    expect(n.inspired).toBe(true);
  });

  it('prefers nested character.name over stale top-level name (v5 + legacy merge)', () => {
    const n = normalizeCharacter({
      ...base,
      name: 'Old Table Name',
      character: { id: 1, name: 'Renamed Adventurer' },
      stats: [{ id: 2, value: 10 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
      classes: [],
      preferences: { hitPointType: 1 },
      overrideHitPoints: 10,
    } as unknown as DdbCharacter);
    expect(n.name).toBe('Renamed Adventurer');
  });

  it('sets inspired when DDB inspiration is 1', () => {
    const n = normalizeCharacter({ ...base, inspiration: 1 } as DdbCharacter);
    expect(n.inspired).toBe(true);
  });

  it('omits inspired when not present or false', () => {
    expect(normalizeCharacter(base).inspired).toBeUndefined();
    expect(normalizeCharacter({ ...base, inspiration: false } as DdbCharacter).inspired).toBeUndefined();
  });

  it('sets inspired from DDB alias hasInspiration / heroicInspiration / isInspired', () => {
    expect(normalizeCharacter({ ...base, hasInspiration: true } as DdbCharacter).inspired).toBe(true);
    expect(normalizeCharacter({ ...base, heroicInspiration: 1 } as DdbCharacter).inspired).toBe(true);
    expect(normalizeCharacter({ ...base, isInspired: true } as DdbCharacter).inspired).toBe(true);
  });

  it('explicit inspiration false wins over stale alias fields', () => {
    const n = normalizeCharacter({
      ...base,
      inspiration: false,
      hasInspiration: true,
      heroicInspiration: 1,
    } as DdbCharacter);
    expect(n.inspired).toBeUndefined();
  });

  it('embeds spellSlotSourceDebug when raw has spell slot arrays', () => {
    const spellSlots = [{ level: 1, used: 1, available: 3 }];
    const pactMagic = [{ level: 2, used: 0, available: 2 }];
    const n = normalizeCharacter({
      ...base,
      stats: [{ id: 2, value: 10 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
      classes: [],
      preferences: { hitPointType: 1 },
      overrideHitPoints: 10,
      spellSlots,
      pactMagic,
    } as unknown as DdbCharacter);
    expect(n.spellSlotSourceDebug).toEqual({ spellSlots, pactMagic });
  });

  it('omits spellSlotSourceDebug when raw has no slot arrays', () => {
    expect(normalizeCharacter(base).spellSlotSourceDebug).toBeUndefined();
  });

  it('normalizes HP fields from real DDB fixture shape', () => {
    const raw = JSON.parse(
      readFileSync(join(__dirname, '../../../../docs/examplejson.json'), 'utf8'),
    ) as DdbCharacter;
    const n = normalizeCharacter(raw);
    expect(n.maxHp).toBe(8);
    expect(n.currentHp).toBe(8);
    expect(n.tempHp).toBe(0);
    expect(n.ddbSheetJson).toBeDefined();
    expect(Object.keys(n.ddbSheetJson ?? {}).length).toBeGreaterThan(20);
  });

  it('falls back to currentHitPoints when removedHitPoints is absent', () => {
    const raw = {
      id: 42,
      name: 'Fallback HP',
      currentHitPoints: 7,
      temporaryHitPoints: 3,
      overrideHitPoints: 12,
      stats: [{ id: 2, value: 14 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
      classes: [],
      preferences: { hitPointType: 1 },
    } as unknown as DdbCharacter;
    const n = normalizeCharacter(raw);
    expect(n.maxHp).toBe(12);
    expect(n.currentHp).toBe(7);
    expect(n.tempHp).toBe(3);
  });

  it('prefers currentHitPoints when both current and removed are present but disagree', () => {
    const raw = {
      id: 77,
      name: 'Conflicting HP',
      currentHitPoints: 8,
      removedHitPoints: 0,
      temporaryHitPoints: 0,
      overrideHitPoints: 12,
      stats: [{ id: 2, value: 14 }],
      overrideStats: [],
      modifiers: {},
      inventory: [],
      classes: [],
      preferences: { hitPointType: 1 },
    } as unknown as DdbCharacter;
    const n = normalizeCharacter(raw);
    expect(n.maxHp).toBe(12);
    expect(n.currentHp).toBe(8);
  });
});
