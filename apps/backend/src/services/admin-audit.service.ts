import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export class AdminAuditService {
  constructor(private db: Database.Database) {}

  log(entry: {
    actorUserId: string;
    action: string;
    targetUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    detail?: Record<string, unknown> | null;
  }): void {
    const id = randomUUID();
    const now = Date.now();
    const detailJson =
      entry.detail && Object.keys(entry.detail).length > 0 ? JSON.stringify(entry.detail) : null;
    this.db
      .prepare(
        `INSERT INTO admin_audit_log (id, actor_user_id, action, target_user_id, ip, user_agent, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.actorUserId,
        entry.action,
        entry.targetUserId ?? null,
        entry.ip ?? null,
        entry.userAgent ?? null,
        detailJson,
        now,
      );
  }
}
