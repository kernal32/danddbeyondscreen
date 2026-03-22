import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export function hashApiKeyPlain(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

/** Plain keys start with this prefix so humans (and Tampermonkey) can tell them from JWTs. */
export const USER_API_KEY_PREFIX = 'dnd_';

const MAX_KEYS_PER_USER = 10;
const MAX_LABEL_LEN = 64;

export type UserApiKeyRow = {
  id: string;
  keyPrefix: string;
  label: string | null;
  createdAt: number;
  lastUsedAt: number | null;
};

export class UserApiKeyService {
  constructor(private db: Database.Database) {}

  create(userId: string, label: string | null): { id: string; plainKey: string; keyPrefix: string } {
    const c = (
      this.db.prepare('SELECT COUNT(*) as n FROM user_api_keys WHERE user_id = ?').get(userId) as { n: number }
    ).n;
    if (c >= MAX_KEYS_PER_USER) {
      throw new Error(`At most ${MAX_KEYS_PER_USER} API keys per account`);
    }
    const secret = randomBytes(24).toString('base64url');
    const plainKey = `${USER_API_KEY_PREFIX}${secret}`;
    const keyHash = hashApiKeyPlain(plainKey);
    const keyPrefix = plainKey.slice(0, 12);
    const id = randomUUID();
    const now = Date.now();
    const lab = label?.trim().slice(0, MAX_LABEL_LEN) || null;
    this.db
      .prepare(
        `INSERT INTO user_api_keys (id, user_id, key_hash, key_prefix, label, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(id, userId, keyHash, keyPrefix, lab, now);
    return { id, plainKey, keyPrefix };
  }

  list(userId: string): UserApiKeyRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, key_prefix as keyPrefix, label, created_at as createdAt, last_used_at as lastUsedAt
         FROM user_api_keys WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(userId) as UserApiKeyRow[];
    return rows;
  }

  revoke(userId: string, keyId: string): boolean {
    const r = this.db
      .prepare('DELETE FROM user_api_keys WHERE id = ? AND user_id = ?')
      .run(keyId, userId);
    return r.changes > 0;
  }

  /** Resolve Bearer secret to owning user; updates last_used_at. */
  resolveAndTouch(plainKey: string): { userId: string; keyId: string } | null {
    if (!plainKey.startsWith(USER_API_KEY_PREFIX) || plainKey.length > 200) return null;
    const keyHash = hashApiKeyPlain(plainKey);
    const row = this.db
      .prepare('SELECT id, user_id FROM user_api_keys WHERE key_hash = ?')
      .get(keyHash) as { id: string; user_id: string } | undefined;
    if (!row) return null;
    const now = Date.now();
    this.db.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE id = ?').run(now, row.id);
    return { userId: row.user_id, keyId: row.id };
  }
}
