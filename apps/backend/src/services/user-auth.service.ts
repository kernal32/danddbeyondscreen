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
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ? AND deleted_at IS NULL')
      .get(em) as { id: string; email: string; password_hash: string } | undefined;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) return null;
    return { id: row.id, email: row.email };
  }

  getById(id: string): { id: string; email: string } | null {
    const row = this.db
      .prepare('SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { id: string; email: string } | undefined;
    return row ?? null;
  }

  /** Active + deactivated (for admin list when includeDeleted). */
  getRowByIdAny(id: string): { id: string; email: string; createdAt: number; deletedAt: number | null } | null {
    const row = this.db
      .prepare('SELECT id, email, created_at as createdAt, deleted_at as deletedAt FROM users WHERE id = ?')
      .get(id) as
      | { id: string; email: string; createdAt: number; deletedAt: number | null }
      | undefined;
    return row ?? null;
  }

  listUsersForAdmin(opts: {
    q: string;
    limit: number;
    offset: number;
    includeDeleted: boolean;
  }): { users: { id: string; email: string; createdAt: number; deletedAt: number | null }[]; total: number } {
    const q = opts.q.trim().toLowerCase();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (!opts.includeDeleted) conditions.push('deleted_at IS NULL');
    if (q.length > 0) {
      conditions.push('LOWER(email) LIKE ?');
      params.push(`%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`);
    }
    const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
    const total = (this.db.prepare(`SELECT COUNT(*) as n FROM users WHERE ${where}`).get(...params) as { n: number })
      .n;
    const users = this.db
      .prepare(
        `SELECT id, email, created_at as createdAt, deleted_at as deletedAt FROM users
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, opts.limit, opts.offset) as {
        id: string;
        email: string;
        createdAt: number;
        deletedAt: number | null;
      }[];
    return { users, total };
  }

  countActiveAllowlistedUsers(allowlistEmails: readonly string[]): number {
    if (allowlistEmails.length === 0) return 0;
    const placeholders = allowlistEmails.map(() => '?').join(',');
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL AND email IN (${placeholders})`,
      )
      .get(...allowlistEmails) as { n: number };
    return row.n;
  }

  /**
   * Soft-delete: anonymize email, invalidate password, set deleted_at.
   * Refuses removing the last remaining active user whose email is on `adminAllowlist`.
   */
  softDeleteUser(
    targetId: string,
    adminAllowlist: Set<string>,
  ): { ok: true } | { ok: false; reason: 'not_found' | 'already_deleted' | 'last_admin' } {
    const row = this.getRowByIdAny(targetId);
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.deletedAt != null) return { ok: false, reason: 'already_deleted' };
    const em = row.email.toLowerCase();
    if (adminAllowlist.has(em)) {
      const activeOnList = this.countActiveAllowlistedUsers([...adminAllowlist]);
      if (activeOnList <= 1) return { ok: false, reason: 'last_admin' };
    }
    const tombstoneEmail = `deleted.${row.id}@invalid`;
    const deadHash = bcrypt.hashSync(randomUUID(), 12);
    const now = Date.now();
    this.db
      .prepare('UPDATE users SET email = ?, password_hash = ?, deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(tombstoneEmail, deadHash, now, targetId);
    return { ok: true };
  }

  adminDashboardStats(): { activeUserCount: number; deactivatedUserCount: number } {
    const active = (
      this.db.prepare('SELECT COUNT(*) as n FROM users WHERE deleted_at IS NULL').get() as { n: number }
    ).n;
    const deactivated = (
      this.db.prepare('SELECT COUNT(*) as n FROM users WHERE deleted_at IS NOT NULL').get() as { n: number }
    ).n;
    return { activeUserCount: active, deactivatedUserCount: deactivated };
  }

  getUserAdminDetail(userId: string): {
    user: { id: string; email: string; createdAt: number; deletedAt: number | null };
    apiKeyCount: number;
    ownedSessionsCount: number;
    billing: {
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      planTier: string | null;
      subscriptionStatus: string | null;
      currentPeriodEnd: number | null;
    } | null;
  } | null {
    const user = this.getRowByIdAny(userId);
    if (!user) return null;
    const apiKeyCount = (
      this.db.prepare('SELECT COUNT(*) as n FROM user_api_keys WHERE user_id = ?').get(userId) as { n: number }
    ).n;
    const ownedSessionsCount = (
      this.db.prepare('SELECT COUNT(*) as n FROM game_sessions WHERE owner_user_id = ?').get(userId) as { n: number }
    ).n;
    const bill = this.db
      .prepare(
        `SELECT stripe_customer_id as stripeCustomerId, stripe_subscription_id as stripeSubscriptionId,
                plan_tier as planTier, subscription_status as subscriptionStatus, current_period_end as currentPeriodEnd
         FROM user_billing WHERE user_id = ?`,
      )
      .get(userId) as
      | {
          stripeCustomerId: string | null;
          stripeSubscriptionId: string | null;
          planTier: string | null;
          subscriptionStatus: string | null;
          currentPeriodEnd: number | null;
        }
      | undefined;
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        deletedAt: user.deletedAt,
      },
      apiKeyCount,
      ownedSessionsCount,
      billing: bill ?? null,
    };
  }
}
