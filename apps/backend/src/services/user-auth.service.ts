import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UserAuthService {
  constructor(private db: Database.Database) {}

  register(email: string, password: string): { ok: true; id: string } | { ok: false; reason: 'weak' | 'invalid_email' | 'exists' } {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return { ok: false, reason: 'invalid_email' };
    if (password.length < 10) return { ok: false, reason: 'weak' };
    const passwordHash = bcrypt.hashSync(password, 12);
    const id = randomUUID();
    const now = Date.now();
    try {
      this.db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
        id,
        em,
        passwordHash,
        now,
      );
      this.db.prepare('INSERT INTO user_preferences (user_id, updated_at) VALUES (?, ?)').run(id, now);
      return { ok: true, id };
    } catch {
      return { ok: false, reason: 'exists' };
    }
  }

  login(email: string, password: string): { id: string; email: string } | null {
    const em = email.trim().toLowerCase();
    const row = this.db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(em) as { id: string; email: string; password_hash: string } | undefined;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) return null;
    return { id: row.id, email: row.email };
  }

  getById(id: string): { id: string; email: string } | null {
    const row = this.db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as
      | { id: string; email: string }
      | undefined;
    return row ?? null;
  }
}
