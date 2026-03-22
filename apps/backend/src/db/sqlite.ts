import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export function openAppDatabase(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      default_seed_character_id INTEGER,
      ddb_cookie_cipher TEXT,
      table_layout_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON user_api_keys(user_id);
    CREATE TABLE IF NOT EXISTS user_ddb_uploads (
      user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      party_json TEXT NOT NULL,
      character_count INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_sessions (
      session_id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT,
      display_token TEXT NOT NULL UNIQUE,
      dm_token TEXT NOT NULL UNIQUE,
      summary_label TEXT NOT NULL DEFAULT '',
      state_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_game_sessions_owner ON game_sessions(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_game_sessions_updated ON game_sessions(updated_at);
  `);
  const prefCols = db.prepare(`PRAGMA table_info(user_preferences)`).all() as { name: string }[];
  if (!prefCols.some((c) => c.name === 'party_card_display_json')) {
    db.exec(`ALTER TABLE user_preferences ADD COLUMN party_card_display_json TEXT`);
  }
  return db;
}
