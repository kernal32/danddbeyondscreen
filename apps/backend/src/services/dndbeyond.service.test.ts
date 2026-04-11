import { describe, expect, it } from 'vitest';
import { extractCharacterFromV5Envelope } from './dndbeyond.service.js';

describe('extractCharacterFromV5Envelope', () => {
  it('prefers nested data.character over slim data summary (avatar lives on nested sheet)', () => {
    const body = {
      success: true,
      data: {
        id: 163111290,
        name: 'Hope Istiny',
        character: {
          id: 163111290,
          name: 'Hope Istiny',
          avatarUrl: 'https://www.dndbeyond.com/avatars/thumbnails/1/2/150/150/example.jpeg',
          classes: [{ level: 1, definition: { hitDice: 8 } }],
        },
      },
    };
    const sheet = extractCharacterFromV5Envelope(body as Record<string, unknown>);
    expect(sheet).not.toBeNull();
    expect(sheet!.avatarUrl).toBe(
      'https://www.dndbeyond.com/avatars/thumbnails/1/2/150/150/example.jpeg',
    );
  });

  it('falls back to data when no nested sheet exists', () => {
    const body = {
      success: true,
      data: {
        id: 1,
        name: 'Slim',
        avatarUrl: 'https://example.com/a.png',
      },
    };
    const sheet = extractCharacterFromV5Envelope(body as Record<string, unknown>);
    expect(sheet).not.toBeNull();
    expect(sheet!.avatarUrl).toBe('https://example.com/a.png');
  });
});
