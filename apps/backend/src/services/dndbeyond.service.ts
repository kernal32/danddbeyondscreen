import type { AppConfig } from '../config.js';
import { TtlCache } from '../cache/ttl-cache.js';
import { RateLimiter } from './rate-limiter.js';
import { ddbCookieCacheTag } from './ddb-session-cookie.js';

export type DdbFetchResult = {
  json: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
};

export class DdbError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'PRIVATE' | 'UPSTREAM' | 'RATE_LIMIT',
  ) {
    super(message);
    this.name = 'DdbError';
  }
}

const CHARACTER_SERVICE_BASE = 'https://character-service.dndbeyond.com/character/v5/character/';

/** Exported for unit tests — prefers nested full character JSON over slim v5 summaries. */
export function extractCharacterFromV5Envelope(body: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof body.id === 'number' && typeof body.name === 'string' && Array.isArray(body.classes)) {
    return body;
  }
  const data = body.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    // Prefer nested full sheet (avatarUrl, inventory, …) over slim v5 summaries with only id/name.
    for (const key of ['character', 'characterSheet', 'sheet', 'characterData'] as const) {
      const nested = d[key];
      if (nested && typeof nested === 'object') {
        const n = nested as Record<string, unknown>;
        if (typeof n.id === 'number' && n.name !== undefined) return n;
      }
    }
    if (typeof d.id === 'number' && d.name !== undefined) return d;
  }
  return null;
}

export class DndBeyondService {
  private cache: TtlCache<DdbFetchResult>;
  private limiter: RateLimiter;

  constructor(
    private config: Pick<
      AppConfig,
      'ddbBaseUrl' | 'fetchTimeoutMs' | 'ddbCacheTtlMs' | 'rateLimitPerSecond' | 'ddbCookie'
    >,
  ) {
    this.cache = new TtlCache(config.ddbCacheTtlMs);
    this.limiter = new RateLimiter(config.rateLimitPerSecond, Math.max(3, config.rateLimitPerSecond));
  }

  /** Mimic a normal sheet view + JSON request (DDB sometimes checks Referer). */
  private requestHeaders(cookieHeader: string | undefined, characterId: number): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'text/json',
      Accept: 'application/json, text/plain, */*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      Referer: `https://www.dndbeyond.com/characters/${characterId}`,
    };
    if (cookieHeader) {
      h.Cookie = cookieHeader;
    }
    return h;
  }

  private urlForLegacyJson(characterId: number): string {
    const base = this.config.ddbBaseUrl.endsWith('/')
      ? this.config.ddbBaseUrl
      : `${this.config.ddbBaseUrl}/`;
    return `${base}${characterId}/json`;
  }

  private cacheKey(characterId: number, cookie: string | undefined): string {
    return `${ddbCookieCacheTag(cookie)}:${characterId}`;
  }

  clearCache(): void {
    this.cache.clear();
  }

  async headCharacter(characterId: number, cookie?: string | undefined): Promise<boolean> {
    const cookieHeader = (cookie ?? this.config.ddbCookie?.trim()) || undefined;
    await this.limiter.acquire();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs);
    try {
      const res = await fetch(this.urlForLegacyJson(characterId), {
        method: 'HEAD',
        headers: this.requestHeaders(cookieHeader, characterId),
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  private async fetchViaCharacterService(
    characterId: number,
    cookieForRequest: string,
    signal: AbortSignal,
  ): Promise<DdbFetchResult | null> {
    await this.limiter.acquire();
    const url = `${CHARACTER_SERVICE_BASE}${characterId}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: this.requestHeaders(cookieForRequest, characterId),
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    if (body.success === false) return null;
    const sheet = extractCharacterFromV5Envelope(body);
    if (!sheet) return null;
    const headers: Record<string, string | string[] | undefined> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { json: sheet, headers };
  }

  async getCharacterJson(
    characterId: number,
    bypassCache = false,
    cookieHeader?: string | undefined,
  ): Promise<DdbFetchResult> {
    const cookieForRequest = (cookieHeader ?? this.config.ddbCookie?.trim()) || undefined;
    const key = this.cacheKey(characterId, cookieForRequest);
    if (!bypassCache) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }

    await this.limiter.acquire();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs);
    try {
      const res = await fetch(this.urlForLegacyJson(characterId), {
        method: 'GET',
        headers: this.requestHeaders(cookieForRequest, characterId),
        signal: controller.signal,
      });

      if (res.status === 403) {
        throw new DdbError('Character is private or inaccessible', 'PRIVATE');
      }

      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        const headers: Record<string, string | string[] | undefined> = {};
        res.headers.forEach((v, k) => {
          headers[k] = v;
        });
        const result: DdbFetchResult = { json, headers };
        this.cache.set(key, result);
        return result;
      }

      let legacy404Detail = '';
      if (res.status === 404) {
        try {
          const errJson = (await res.json()) as { errorMessage?: string };
          if (errJson.errorMessage) legacy404Detail = `: ${errJson.errorMessage}`;
        } catch {
          /* ignore */
        }
      }

      if (res.status === 404 && cookieForRequest) {
        const viaService = await this.fetchViaCharacterService(
          characterId,
          cookieForRequest,
          controller.signal,
        );
        if (viaService) {
          this.cache.set(key, viaService);
          return viaService;
        }
      }

      if (res.status === 404) {
        const looksGoogleHeavy =
          cookieForRequest &&
          cookieForRequest.includes('HSID=') &&
          cookieForRequest.includes('SAPISID=') &&
          !/cobalt|dndbeyond|ddb/i.test(cookieForRequest);
        const hint = looksGoogleHeavy
          ? ' This cookie line looks like **Google** sign-in cookies (HSID/SAPISID, etc.), not the **dndbeyond.com** request. In Network, click the **`json`** row whose URL starts with `https://www.dndbeyond.com/character/` and copy **that** request’s `cookie` header—or use the Chrome extension on a tab where you are logged into D&D Beyond.'
          : ' In Network, copy the `cookie` header from the request to `https://www.dndbeyond.com/character/{id}/json` (same browser, logged in).';
        throw new DdbError(
          `D&D Beyond returned 404 for legacy /character/{id}/json${legacy404Detail}.${hint}`,
          'NOT_FOUND',
        );
      }

      throw new DdbError(`Upstream HTTP ${res.status}`, 'UPSTREAM');
    } catch (e) {
      if (e instanceof DdbError) throw e;
      if (e instanceof Error && e.name === 'AbortError') {
        throw new DdbError('Request timed out', 'UPSTREAM');
      }
      throw new DdbError(e instanceof Error ? e.message : 'Unknown fetch error', 'UPSTREAM');
    } finally {
      clearTimeout(t);
    }
  }

  invalidateCharacter(characterId: number, cookie?: string | undefined): void {
    const cookieForRequest = (cookie ?? this.config.ddbCookie?.trim()) || undefined;
    this.cache.delete(this.cacheKey(characterId, cookieForRequest));
  }
}
