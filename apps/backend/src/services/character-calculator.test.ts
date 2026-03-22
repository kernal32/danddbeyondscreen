import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  calculateAc,
  getMaxHp,
  getPassiveScore,
  getSpellSaveDc,
  getStatMod,
  type DdbCharacter,
} from './character-calculator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, '../__fixtures__/minimal-character.json'), 'utf8'),
) as DdbCharacter;

describe('character-calculator', () => {
  it('computes dex mod from fixture', () => {
    expect(getStatMod(fixture, 'dex')).toBe(2);
  });

  it('computes AC (unarmored)', () => {
    expect(calculateAc(fixture)).toBe(12);
  });

  it('computes max HP from hit dice', () => {
    const hp = getMaxHp(fixture);
    expect(hp).toBeGreaterThan(0);
  });

  it('computes passive perception baseline', () => {
    expect(getPassiveScore(fixture, 'perception')).toBe(12);
  });

  it('computes spell save DC for a single-class caster (8 + PB + spellcasting mod)', () => {
    const wiz: DdbCharacter = {
      stats: [
        { id: 4, value: 16 },
        { id: 2, value: 14 },
      ],
      overrideStats: [],
      modifiers: {},
      classes: [
        {
          level: 5,
          isStartingClass: true,
          definition: {
            canCastSpells: true,
            spellCastingAbilityId: 4,
            hitDice: 6,
          },
        },
      ],
      preferences: { hitPointType: 1 },
    };
    // PB +3 at level 5, INT +3 → 8+3+3 = 14
    expect(getSpellSaveDc(wiz)).toBe(14);
  });

  it('returns undefined when no class casts spells', () => {
    expect(getSpellSaveDc(fixture)).toBeUndefined();
  });
});
