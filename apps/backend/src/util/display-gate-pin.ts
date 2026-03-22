import { randomInt, timingSafeEqual } from 'node:crypto';

/** Normalize user input to exactly four digits, or null. */
export function normalizeDisplayGatePin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '').slice(-4);
  if (digits.length !== 4) return null;
  return digits;
}

export function randomDisplayGatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

export function displayPinsEqual(expected: string, attempt: string): boolean {
  const a = normalizeDisplayGatePin(expected);
  const b = normalizeDisplayGatePin(attempt);
  if (!a || !b) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}
