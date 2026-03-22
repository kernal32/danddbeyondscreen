import type { Database } from 'better-sqlite3';
import type { SessionRecord } from '@ddb/shared-types';

export type GameSessionListRow = {
  sessionId: string;
  displayToken: string;
  summaryLabel: string;
  updatedAt: number;
};

function sessionSummaryLabel(s: SessionRecord): string {
  const name = s.party?.campaign?.name?.trim();
  if (name) return name.slice(0, 120);
  const n = s.party?.characters?.length ?? 0;
  if (n > 0) return `${n} character${n === 1 ? '' : 's'}`;
  return 'Empty table';
}

function parseRecord(row: { session_id: string; state_json: string }): SessionRecord | null {
  try {
    const parsed = JSON.parse(row.state_json) as SessionRecord;
    if (typeof parsed?.sessionId !== 'string' || parsed.sessionId !== row.session_id) return null;
    if (typeof parsed.displayToken !== 'string' || typeof parsed.dmToken !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persists live table sessions to SQLite so they survive process restarts. */
export class GameSessionPersistence {
  constructor(private readonly db: Database) {}

  loadAll(): SessionRecord[] {
    const rows = this.db
      .prepare(`SELECT session_id, state_json FROM game_sessions`)
      .all() as { session_id: string; state_json: string }[];
    const out: SessionRecord[] = [];
    for (const row of rows) {
      const rec = parseRecord(row);
      if (rec) out.push(rec);
    }
    return out;
  }

  upsert(s: SessionRecord): void {
    const now = Date.now();
    const label = sessionSummaryLabel(s);
    const json = JSON.stringify(s);
    this.db
      .prepare(
        `INSERT INTO game_sessions (session_id, owner_user_id, display_token, dm_token, summary_label, state_json, updated_at)
         VALUES (@session_id, @owner_user_id, @display_token, @dm_token, @summary_label, @state_json, @updated_at)
         ON CONFLICT(session_id) DO UPDATE SET
           owner_user_id = excluded.owner_user_id,
           display_token = excluded.display_token,
           dm_token = excluded.dm_token,
           summary_label = excluded.summary_label,
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`,
      )
      .run({
        session_id: s.sessionId,
        owner_user_id: s.ownerUserId,
        display_token: s.displayToken,
        dm_token: s.dmToken,
        summary_label: label,
        state_json: json,
        updated_at: now,
      });
  }

  listForOwner(userId: string, limit = 50): GameSessionListRow[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, display_token, summary_label, updated_at
         FROM game_sessions
         WHERE owner_user_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(userId, limit) as {
      session_id: string;
      display_token: string;
      summary_label: string;
      updated_at: number;
    }[];
    return rows.map((r) => ({
      sessionId: r.session_id,
      displayToken: r.display_token,
      summaryLabel: r.summary_label || 'Table',
      updatedAt: r.updated_at,
    }));
  }
}
