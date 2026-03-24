import type { PlayerCardData } from './types';

export const MOCK_MARTIAL: PlayerCardData = {
  name: 'Godric',
  avatarUrl: '',
  level: 8,
  race: 'Human',
  class: 'Battle Master Fighter',
  playerName: 'Jordan',
  hp: { current: 52, max: 68, tempHp: 5 },
  ac: 19,
  initiativeMod: 2,
  speed: { walk: 30, climb: 15, swim: 30 },
  abilities: { str: 18, dex: 14, con: 16, int: 10, wis: 12, cha: 8 },
  saves: { str: 7, dex: 2, con: 6, int: 0, wis: 1, cha: -1 },
  passives: { perception: 11, investigation: 10, insight: 9 },
  senses: ['Darkvision 60 ft'],
  classSummaryLines: ['Fighter 8'],
  combat: { attackBonus: 9 },
  classResources: [
    { label: 'Superiority Dice', available: 5, used: 2 },
    { label: 'Second Wind', available: 1, used: 0 },
  ],
  conditions: ['Blessed'],
};

export const MOCK_CASTER: PlayerCardData = {
  name: 'Briza Melarn',
  avatarUrl: '',
  level: 12,
  race: 'Elf',
  class: 'Warlock',
  playerName: 'Altheviking',
  hp: { current: 5, max: 87 },
  ac: 15,
  initiativeMod: 4,
  speed: { walk: 30 },
  abilities: { str: 8, dex: 16, con: 14, int: 12, wis: 10, cha: 20 },
  saves: { str: -1, dex: 6, con: 2, int: 1, wis: 0, cha: 9 },
  passives: { perception: 13, investigation: 14, insight: 9 },
  senses: ['Darkvision 120 ft', 'Devil\'s Sight 120 ft'],
  classSummaryLines: ['Warlock 12'],
  combat: { spellSaveDC: 18, attackBonus: 8 },
  spellSlots: [
    { level: 1, available: 4, used: 2 },
    { level: 2, available: 3, used: 0 },
    { level: 3, available: 3, used: 1 },
    { level: 4, available: 3, used: 3 },
    { level: 5, available: 2, used: 0 },
    { level: 6, available: 1, used: 0 },
  ],
};

export const MOCK_HALF_CASTER: PlayerCardData = {
  name: 'Sera Dawnshield',
  avatarUrl: '',
  level: 6,
  race: 'Dwarf',
  class: 'Paladin',
  playerName: 'Morgan',
  hp: { current: 45, max: 45 },
  ac: 18,
  initiativeMod: 0,
  speed: { walk: 25 },
  abilities: { str: 16, dex: 10, con: 16, int: 8, wis: 12, cha: 16 },
  saves: { str: 6, dex: 0, con: 6, int: -1, wis: 1, cha: 6 },
  passives: { perception: 11, investigation: 9, insight: 11 },
  senses: ['Darkvision 60 ft'],
  classSummaryLines: ['Paladin 6'],
  combat: { spellSaveDC: 14, attackBonus: 7 },
  spellSlots: [
    { level: 1, available: 4, used: 1 },
    { level: 2, available: 2, used: 2 },
  ],
  classResources: [{ label: 'Lay on Hands', available: 30, used: 10 }],
};

export const MOCK_PLAYER_CARDS: PlayerCardData[] = [MOCK_MARTIAL, MOCK_CASTER, MOCK_HALF_CASTER];
