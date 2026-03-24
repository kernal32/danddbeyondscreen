import { describe, expect, it } from 'vitest';
import {
  conditionToLabel,
  extractClassResources,
  extractSpellSlots,
  normalizeCharacter,
} from './character.service.js';
import type { DdbCharacter } from './character-calculator.js';

describe('conditionToLabel', () => {
  it('reads name from rich objects', () => {
    expect(conditionToLabel('Blessed')).toBe('Blessed');
    expect(conditionToLabel({ name: 'Hexed' })).toBe('Hexed');
    expect(conditionToLabel({ label: 'Slow' })).toBe('Slow');
    expect(conditionToLabel({ definition: { name: 'Faerie Fire' } })).toBe('Faerie Fire');
  });

  it('drops spell-slot-shaped leaks from conditions', () => {
    expect(conditionToLabel({ id: 9, level: null })).toBe('');
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
        { level: 2, used: 1, available: 2 },
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

  it('uses max when available is missing', () => {
    const raw = {
      pactMagic: [{ level: 3, used: 1, max: 3 }],
    } as unknown as DdbCharacter;
    expect(extractSpellSlots(raw)).toEqual([{ level: 3, available: 3, used: 1 }]);
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

  it('reads name from definition and clamps used to available', () => {
    const raw = {
      actions: {
        class: [{ definition: { name: 'Bardic Inspiration' }, limitedUse: { numberUsed: 99, maxUses: 5 } }],
      },
    } as unknown as DdbCharacter;
    expect(extractClassResources(raw)).toEqual([{ label: 'Bardic Inspiration', available: 5, used: 5 }]);
  });
});

describe('normalizeCharacter', () => {
  const base = {
    id: 1,
    name: 'Test',
    removedHitPoints: 0,
    temporaryHitPoints: 0,
  } as unknown as DdbCharacter;

  it('sets inspired when DDB inspiration is true', () => {
    const n = normalizeCharacter({ ...base, inspiration: true } as DdbCharacter);
    expect(n.inspired).toBe(true);
  });

  it('sets inspired when DDB inspiration is 1', () => {
    const n = normalizeCharacter({ ...base, inspiration: 1 } as DdbCharacter);
    expect(n.inspired).toBe(true);
  });

  it('omits inspired when not present or false', () => {
    expect(normalizeCharacter(base).inspired).toBeUndefined();
    expect(normalizeCharacter({ ...base, inspiration: false } as DdbCharacter).inspired).toBeUndefined();
  });
});
