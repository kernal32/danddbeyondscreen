import { describe, expect, it } from 'vitest';
import { decryptSecretField, encryptSecretField } from './field-crypto.js';

describe('field-crypto', () => {
  it('roundtrips', () => {
    const secret = 'x'.repeat(32);
    const plain = 'cobaltSession=abc; other=1';
    const enc = encryptSecretField(plain, secret);
    expect(decryptSecretField(enc, secret)).toBe(plain);
  });

  it('rejects bad blob', () => {
    expect(decryptSecretField('not-valid', 'y'.repeat(32))).toBeNull();
  });
});
