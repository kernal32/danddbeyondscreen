import type { AppConfig } from '../config.js';
import { createHash } from 'node:crypto';

/** Cookie header used for outgoing D&D Beyond fetches (server `DDB_COOKIE` env only). */
export function effectiveDdbCookie(config: AppConfig): string | undefined {
  return config.ddbCookie?.trim() || undefined;
}

/** Cache namespace so different cookies do not share character JSON. */
export function ddbCookieCacheTag(cookie: string | undefined): string {
  if (!cookie) return 'noauth';
  return createHash('sha256').update(cookie).digest('base64url').slice(0, 20);
}
