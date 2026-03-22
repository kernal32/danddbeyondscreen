import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePastedCookieHeader } from './util/normalize-dnd-cookie.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  const raw = process.env.DDB_COOKIE?.trim();
  const normalized = raw ? normalizePastedCookieHeader(raw) : '';
  const rawCookie = normalized || undefined;
  return {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN === 'true' ? true : process.env.CORS_ORIGIN || true,
    ddbBaseUrl: process.env.DDB_BASE_URL || 'https://www.dndbeyond.com/character/',
    /** Session cookie string from your browser (see README). Acts as a static “logged in” proxy for fetches. */
    ddbCookie: rawCookie,
    fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS) || 15_000,
    ddbCacheTtlMs: Number(process.env.DDB_CACHE_TTL_MS) || 300_000,
    rateLimitPerSecond: Number(process.env.RATE_LIMIT_RPS) || 2,
    diceLogMax: Number(process.env.DICE_LOG_MAX) || 100,
    /**
     * If set to a string of at least 32 characters, enables user accounts (SQLite + JWT).
     * Used for signing user JWTs and encrypting stored D&D Beyond cookies at rest.
     */
    authSecret: process.env.AUTH_SECRET?.trim() ?? '',
    /** SQLite database file; default under repo `data/`. */
    databasePath:
      process.env.DATABASE_PATH?.trim() || join(__dirname, '../../../data/ddb-screen.db'),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
