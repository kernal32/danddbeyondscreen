import { describe, expect, it } from 'vitest';
import { displayPinsEqual, normalizeDisplayGatePin, randomDisplayGatePin } from './display-gate-pin.js';

describe('display-gate-pin', () => {
  it('normalizes 4 digits', () => {
    expect(normalizeDisplayGatePin('1234')).toBe('1234');
    expect(normalizeDisplayGatePin(' 12-34 ')).toBe('1234');
    expect(normalizeDisplayGatePin('abc1234x')).toBe('1234');
    expect(normalizeDisplayGatePin('12')).toBeNull();
  });

  it('randomDisplayGatePin is four digits', () => {
    expect(randomDisplayGatePin()).toMatch(/^\d{4}$/);
  });

  it('displayPinsEqual is true for matching pins', () => {
    expect(displayPinsEqual('0800', '0800')).toBe(true);
    expect(displayPinsEqual('1234', '12-34')).toBe(true);
  });

  it('displayPinsEqual is false for mismatch', () => {
    expect(displayPinsEqual('0800', '0801')).toBe(false);
    expect(displayPinsEqual('0800', '12345')).toBe(false);
  });
});
