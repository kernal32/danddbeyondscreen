import type Database from 'better-sqlite3';
import type { PartySnapshot } from '@ddb/shared-types';
import {
  refreshDdbCharacterNamesFromSheetJson,
  sanitizeNormalizedPartyConditions,
} from './character.service.js';

function sanitizeUserDdbParty(party: PartySnapshot): PartySnapshot {
  return refreshDdbCharacterNamesFromSheetJson(sanitizeNormalizedPartyConditions(party));
}

export class UserDdbUploadService {
  constructor(private db: Database.Database) {}

  saveParty(userId: string, party: PartySnapshot): void {
    const json = JSON.stringify(sanitizeUserDdbParty(party));
    const n = party.characters.length;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO user_ddb_uploads (user_id, party_json, character_count, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           party_json = excluded.party_json,
           character_count = excluded.character_count,
           updated_at = excluded.updated_at`,
      )
      .run(userId, json, n, now);
  }

  getParty(userId: string): PartySnapshot | null {
    const row = this.db
      .prepare('SELECT party_json FROM user_ddb_uploads WHERE user_id = ?')
      .get(userId) as { party_json: string } | undefined;
    if (!row?.party_json) return null;
    try {
      return sanitizeUserDdbParty(JSON.parse(row.party_json) as PartySnapshot);
    } catch {
      return null;
    }
  }

  getMeta(userId: string): { characterCount: number; updatedAt: number } | null {
    const row = this.db
      .prepare('SELECT character_count, updated_at FROM user_ddb_uploads WHERE user_id = ?')
      .get(userId) as { character_count: number; updated_at: number } | undefined;
    if (!row) return null;
    return { characterCount: row.character_count, updatedAt: row.updated_at };
  }
}
