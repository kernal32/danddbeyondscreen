/* global chrome */

const STORAGE_KEYS = {
  apiKey: 'apiKey',
  campaignInput: 'campaignInput',
  campaignId: 'campaignId',
  pollingEnabled: 'pollingEnabled',
  pollIntervalMs: 'pollIntervalMs',
  telemetry: 'telemetry',
  debugLogging: 'debugLogging',
  /** When true (default), merge CONDITIONS scraped from open DDB sheet tabs into uploads. */
  sheetScrapeConditions: 'sheetScrapeConditions',
};

/** Persisted map: character id string → { labels, at, strategy?, url? } */
const DOM_SCRAPED_CONDITIONS_KEY = 'domScrapedConditions';
const DOM_CONDITIONS_TTL_MS = 15 * 60 * 1000;

/** Mirrors backend `DDB_SHEET_NAV_LABELS` + empty-state CTAs — never treat as conditions. */
const DDB_SHEET_NAV_LABELS = new Set([
  'proficiencies & training',
  'actions',
  'inventory',
  'features & traits',
  'extras',
  'all',
  'attack',
  'action',
  'bonus action',
  'reaction',
  'other',
  'limited use',
  'spells',
]);

function normalizeDomConditionLabelKey(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isDomSpellTablePlaceholderSegment(raw) {
  const t = String(raw || '').trim();
  if (t === '' || t === '…' || t === '...') return true;
  const low = t.toLowerCase();
  if (low === '--' || low === '—' || low === '–') return true;
  if (/^[\u002d\u2010\u2011\u2012\u2013\u2014\u2015\u2212]{1,6}$/.test(t)) return true;
  return false;
}

/** Spell/cantrip table rows — mirrors backend `isDdbSpellDamageTableRowNoise`. */
function isDomSpellDamageTableRowNoise(raw) {
  const s = String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s.includes(',')) return false;
  const parts = s.split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 0);
  if (parts.length < 3) return false;
  if (!parts.some((p) => p.toLowerCase() === 'damage')) return false;
  const last = parts[parts.length - 1];
  if (isDomSpellTablePlaceholderSegment(last)) return true;
  if (/^\d+$/.test(last)) return true;
  if (/^\d+d\d+$/i.test(last)) return true;
  return false;
}

/** When DDB reports spell row cells as separate labels (`Heal`, `Damage`, `13`, `--`). */
function stripGroupedDomSpellTableScrapeNoise(labels) {
  const trimmed = labels.map((l) => String(l || '').trim()).filter((l) => l.length > 0);
  if (trimmed.length < 2) return trimmed;
  const lower = new Set(trimmed.map((l) => l.toLowerCase()));
  if (!lower.has('heal') || !lower.has('damage')) return trimmed;
  return trimmed.filter((l) => {
    const t = l.toLowerCase();
    if (t === 'heal' || t === 'damage') return false;
    if (/^\d+$/.test(l)) return false;
    if (isDomSpellTablePlaceholderSegment(l)) return false;
    return true;
  });
}

function isDomConditionNoiseLabel(s) {
  if (isDomSpellDamageTableRowNoise(s)) return true;
  const rawTrim = String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (rawTrim && isDomSpellTablePlaceholderSegment(rawTrim)) return true;
  const t = normalizeDomConditionLabelKey(s);
  if (!t || t.length < 2) return true;
  if (DDB_SHEET_NAV_LABELS.has(t)) return true;
  if (t === 'add active conditions') return true;
  if (t === 'manage conditions') return true;
  if (t === 'no active conditions' || t === 'no conditions') return true;
  if (t.startsWith('add ') && t.includes('condition')) return true;
  if (t.includes('add active conditions')) return true;
  return false;
}

function jsonConditionEntryToLabel(x) {
  if (typeof x === 'string') return String(x).trim();
  if (x && typeof x === 'object') {
    if (typeof x.name === 'string' && x.name.trim()) return x.name.trim();
    if (typeof x.label === 'string' && x.label.trim()) return x.label.trim();
    const def = x.definition;
    if (def && typeof def === 'object' && typeof def.name === 'string' && def.name.trim()) return def.name.trim();
  }
  return '';
}

/** Union JSON + DOM labels; drops noise; preserves API casing order (JSON first). */
function mergeCharacterConditionsWithDom(c, domFiltered) {
  const existingArr = Array.isArray(c.conditions) ? c.conditions : [];
  const fromJson = existingArr.map(jsonConditionEntryToLabel).filter((lb) => lb && !isDomConditionNoiseLabel(lb));
  const seen = new Set();
  const out = [];
  for (const lb of fromJson) {
    const k = lb.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(lb);
  }
  for (const lb of domFiltered) {
    const t = String(lb || '').trim();
    if (!t || isDomConditionNoiseLabel(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  c.conditions = stripGroupedDomSpellTableScrapeNoise(out);
}

const ALARM_NAME = 'ddbCampaignPoll';
const BACKEND_URL = 'https://dnd.saltbushlabs.com';
const DEFAULT_INTERVAL_MS = 180000;
const MIN_INTERVAL_MS = 60000;
const MAX_INTERVAL_MS = 1800000;
const POLL_CONCURRENCY = 3;
const MAX_RETRY_EXPONENT = 5;
const MAX_ERROR_TEXT = 240;
const REQUEST_TIMEOUT_MS = 25000;

function normalizeId(raw) {
  return String(raw || '').trim().replace(/^\/+|\/+$/g, '');
}

function isValidId(id) {
  return /^[A-Za-z0-9_-]{3,128}$/.test(id);
}

function looksLikeUrl(raw) {
  return /^https?:\/\//i.test(String(raw || '').trim());
}

function extractIdFromUrl(urlText) {
  const u = new URL(urlText);
  const qp = ['campaignId', 'campaign_id', 'id'];
  for (const key of qp) {
    const val = u.searchParams.get(key);
    if (val && isValidId(normalizeId(val))) return normalizeId(val);
  }

  const parts = u.pathname.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const knownContainers = new Set(['campaigns', 'campaign']);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (knownContainers.has(parts[i].toLowerCase())) {
      const candidate = normalizeId(parts[i + 1]);
      if (isValidId(candidate)) return candidate;
    }
  }

  const fallback = normalizeId(parts[parts.length - 1]);
  return isValidId(fallback) ? fallback : null;
}

function parseCampaignInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { ok: false, error: 'Campaign ID or link is required.' };
  if (!looksLikeUrl(text)) {
    const id = normalizeId(text);
    if (!isValidId(id)) {
      return { ok: false, error: 'Invalid campaign ID format.' };
    }
    return { ok: true, id, source: 'id' };
  }
  try {
    const id = extractIdFromUrl(text);
    if (!id) return { ok: false, error: 'Could not extract campaign ID from URL.' };
    return { ok: true, id, source: 'url' };
  } catch {
    return { ok: false, error: 'Invalid URL. Paste a full http(s) URL or campaign ID.' };
  }
}

function clampIntervalMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_MS;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.floor(n)));
}

function safeError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, MAX_ERROR_TEXT);
}

function asHttpErrorMessage(status, bodyText) {
  const trimmed = String(bodyText || '').trim();
  if (!trimmed) return `HTTP ${status}`;
  return `HTTP ${status}: ${trimmed.slice(0, MAX_ERROR_TEXT)}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      // Avoid stale CDN/browser responses during active combat HP updates.
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function loadConfig() {
  const s = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  const debugLogging = s.debugLogging === true;
  debugLoggingEnabled = debugLogging;
  return {
    backend: BACKEND_URL,
    apiKey: String(s.apiKey || '').trim(),
    campaignInput: String(s.campaignInput || ''),
    campaignId: String(s.campaignId || ''),
    pollingEnabled: s.pollingEnabled === true,
    pollIntervalMs: clampIntervalMs(s.pollIntervalMs),
    debugLogging,
    sheetScrapeConditions: s[STORAGE_KEYS.sheetScrapeConditions] !== false,
    telemetry:
      s.telemetry && typeof s.telemetry === 'object'
        ? s.telemetry
        : {
            state: 'idle',
            consecutiveFailures: 0,
            lastError: '',
          },
  };
}

async function saveConfigPatch(patch) {
  await chrome.storage.local.set(patch);
}

async function setTelemetry(patch) {
  const cfg = await loadConfig();
  const telemetry = { ...cfg.telemetry, ...patch };
  await saveConfigPatch({ telemetry });
  return telemetry;
}

function nextBackoffDelayMs(failures) {
  const exponent = Math.min(MAX_RETRY_EXPONENT, Math.max(0, failures - 1));
  return 30000 * Math.pow(2, exponent);
}

async function scheduleAlarm(msFromNow) {
  const when = Date.now() + Math.max(1000, Math.floor(msFromNow));
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when });
  return when;
}

async function scheduleFromConfig(cfg, failures) {
  const enabled = cfg.pollingEnabled === true;
  if (!enabled) {
    await chrome.alarms.clear(ALARM_NAME);
    await setTelemetry({ nextPollAt: null });
    return null;
  }
  const delay = failures > 0 ? nextBackoffDelayMs(failures) : cfg.pollIntervalMs;
  const when = await scheduleAlarm(delay);
  await setTelemetry({ nextPollAt: new Date(when).toISOString() });
  return when;
}

/** MV3 service workers suspend; one-shot alarms can be lost. Reschedule if polling is on but no alarm exists. */
async function ensurePollingAlarm(cfg) {
  if (cfg.pollingEnabled !== true) return;
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) return;
  const failures = Number(cfg.telemetry?.consecutiveFailures || 0);
  await scheduleFromConfig(cfg, failures);
}

const STALE_POLLING_MS = 20 * 60 * 1000;

/** If worker died mid-poll, telemetry can stay "polling" forever — clear so UI and alarms make sense. */
async function recoverStalePollingState(cfg) {
  const t = cfg.telemetry || {};
  if (t.state !== 'polling' || !t.lastAttemptAt) return cfg;
  const started = new Date(t.lastAttemptAt).valueOf();
  if (!Number.isFinite(started) || Date.now() - started < STALE_POLLING_MS) return cfg;
  await setTelemetry({
    state: 'error',
    lastError: 'Previous sync was interrupted (browser may have suspended the extension). Open this popup or tap Refresh now to resume.',
  });
  return loadConfig();
}

async function buildCookieHeader() {
  const all = await chrome.cookies.getAll({ url: 'https://www.dndbeyond.com/' });
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

function requestHeaders(cookieHeader, referer) {
  return {
    Accept: 'application/json, text/plain, */*',
    Referer: referer,
    Cookie: cookieHeader,
  };
}

function isCharacterServiceUrl(url) {
  try {
    return new URL(url).host === 'character-service.dndbeyond.com';
  } catch {
    return false;
  }
}

function requestOptionsForUrl(url, cookieHeader, referer) {
  const headers = {
    Accept: 'application/json, text/plain, */*',
    Referer: referer,
  };
  if (isCharacterServiceUrl(url)) {
    return {
      method: 'GET',
      headers,
      credentials: 'include',
      mode: 'cors',
    };
  }
  return {
    method: 'GET',
    headers: {
      ...headers,
      Cookie: cookieHeader,
    },
  };
}

const endpointTrace = [];

/** In-memory lines for the current poll; copied to `telemetry.lastDebugFeed` when debug is on. */
const debugFeed = [];
const MAX_DEBUG_FEED = 220;

/** Set from `loadConfig()` at poll start and when debug mode toggles — avoids async reads in `recordEndpointTrace`. */
let debugLoggingEnabled = false;

function pushDebugFeed(entry) {
  if (!debugLoggingEnabled) return;
  debugFeed.push({ at: new Date().toISOString(), ...entry });
  if (debugFeed.length > MAX_DEBUG_FEED) debugFeed.splice(0, debugFeed.length - MAX_DEBUG_FEED);
}

function dlog(msg, ...rest) {
  if (!debugLoggingEnabled) return;
  const detail = rest.length === 0 ? undefined : rest.length === 1 ? rest[0] : rest;
  pushDebugFeed({ kind: 'log', message: String(msg), detail });
  console.log('[ddb-campaign-sync]', msg, ...rest);
}

function recordEndpointTrace(entry) {
  const row = {
    at: new Date().toISOString(),
    ...entry,
  };
  endpointTrace.push(row);
  if (endpointTrace.length > 60) endpointTrace.splice(0, endpointTrace.length - 60);
  if (debugLoggingEnabled) {
    console.log('[ddb-campaign-sync] endpoint', row);
    pushDebugFeed({
      kind: 'http',
      url: row.url,
      status: row.status,
      ok: row.ok,
      note: row.note,
      phase: row.phase,
    });
  }
}

function collectCandidateCharacterIds(body) {
  const out = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const v = value;
    const direct = [v.characterId, v.id, v.character_id, v.entityId];
    for (const raw of direct) {
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) out.add(num);
    }
    if (v.character && typeof v.character === 'object') visit(v.character);
    if (v.members) visit(v.members);
    if (v.characters) visit(v.characters);
    if (v.data) visit(v.data);
    if (v.campaign) visit(v.campaign);
    if (v.party) visit(v.party);
  };
  visit(body);
  return [...out];
}

/**
 * Same row can keep **`characterName`** as DDB’s default while **`displayName`** / **`socialName`** / **`name`**
 * hold the label the campaign page shows.
 * @param {Record<string, unknown>} o
 * @returns {string}
 */
function pickSttRosterRowDisplayName(o) {
  const keys = ['characterName', 'displayName', 'socialName', 'social_name', 'nickname', 'name'];
  for (const k of keys) {
    const c = ddbTrimStr(typeof o[k] === 'string' ? o[k] : '');
    if (c && !isDdbGeneratedDefaultCharacterName(c)) return c;
  }
  return '';
}

/**
 * Walk STT campaign JSON for roster rows with `characterId` + any non-placeholder display field.
 * The campaign UI often shows a name that never made it onto `characterName` or sheet `/json`.
 * @param {unknown} body
 * @returns {Map<number, string>}
 */
function collectSttCampaignRosterNames(body) {
  /** @type {Map<number, string>} */
  const map = new Map();
  const visit = (value, depth) => {
    if (depth > 16) return;
    if (Array.isArray(value)) {
      for (const x of value) visit(x, depth + 1);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const o = /** @type {Record<string, unknown>} */ (value);
    const cid = Number(o.characterId ?? o.character_id);
    if (Number.isFinite(cid) && cid > 0) {
      const label = pickSttRosterRowDisplayName(o);
      if (label) map.set(cid, label);
    }
    for (const k of Object.keys(o)) {
      if (k === '__proto__') continue;
      visit(o[k], depth + 1);
    }
  };
  visit(body, 0);
  return map;
}

/**
 * Prefer earlier/API names; add HTML / embedded JSON only when missing or still DDB’s **`…'s Character`** placeholder.
 * @param {Map<number, string>} base
 * @param {Map<number, string>} extra
 * @returns {Map<number, string>}
 */
function mergeCampaignRosterNameSources(base, extra) {
  const out = new Map(base);
  for (const [id, label] of extra) {
    if (!label || isDdbGeneratedDefaultCharacterName(label)) continue;
    const prev = out.get(id);
    if (prev === undefined || isDdbGeneratedDefaultCharacterName(prev)) out.set(id, label);
  }
  return out;
}

/**
 * Decode JSON string contents captured from HTML (minimal escapes).
 * @param {string} inner
 * @returns {string}
 */
function roughUnescapeJsonStringInner(inner) {
  return String(inner || '')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * @param {number} id
 * @param {string} rawLabel
 * @param {Map<number, string>} bestById
 */
function considerCampaignHtmlCharacterLabel(id, rawLabel, bestById) {
  const t = ddbTrimStr(String(rawLabel || '').replace(/\s+/g, ' '));
  if (!t || isDdbGeneratedDefaultCharacterName(t)) return;
  if (t.length < 2 || t.length > 96) return;
  if (/^(view|edit|open)(\s+sheet|\s+character)?$/i.test(t)) return;
  if (/^character\s*#?\d+$/i.test(t)) return;
  if (/^go to /i.test(t)) return;
  const prev = bestById.get(id);
  if (!prev || t.length > prev.length) bestById.set(id, t);
}

/**
 * Next.js bootstrap — often includes hydrated campaign roster while visible names are client-only.
 * @param {string} html
 * @returns {Map<number, string>}
 */
function scrapeNextDataCharacterNames(html) {
  const m = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return new Map();
  try {
    return collectSttCampaignRosterNames(JSON.parse(m[1]));
  } catch {
    return new Map();
  }
}

/**
 * Inline JSON blobs (state, LD+json, etc.).
 * @param {string} html
 * @returns {Map<number, string>}
 */
function scrapeApplicationJsonScriptCharacterNames(html) {
  let acc = new Map();
  const re =
    /<script[^>]*\btype=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    if (raw.length < 20 || raw.length > 2_500_000) continue;
    try {
      acc = mergeCampaignRosterNameSources(acc, collectSttCampaignRosterNames(JSON.parse(raw)));
    } catch {
      /* skip invalid JSON */
    }
  }
  return acc;
}

/**
 * Anchor text / aria-label on character links (works when SSR includes party cards).
 * @param {string} html
 * @returns {Map<number, string>}
 */
function scrapeCharacterLinkDomLabels(html) {
  /** @type {Map<number, string>} */
  const bestById = new Map();
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const a of doc.querySelectorAll('a[href*="/characters/"]')) {
      const href = a.getAttribute('href') || '';
      const hm = href.match(/\/characters\/(\d+)/i);
      if (!hm) continue;
      const id = Number(hm[1]);
      if (!Number.isFinite(id) || id < 1) continue;
      considerCampaignHtmlCharacterLabel(id, a.textContent || '', bestById);
      considerCampaignHtmlCharacterLabel(id, a.getAttribute('aria-label') || '', bestById);
      considerCampaignHtmlCharacterLabel(id, a.getAttribute('title') || '', bestById);
    }
  } catch {
    /* ignore */
  }
  return bestById;
}

/**
 * Heuristic: `"characterId":12345` … `"characterName":"…"` within a window (SSR chunks, inline config).
 * @param {string} html
 * @returns {Map<number, string>}
 */
function scrapeLooseCharacterIdNamePairs(html) {
  /** @type {Map<number, string>} */
  const bestById = new Map();
  const re = /"characterId"\s*:\s*(\d{4,12})/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[1]);
    if (!Number.isFinite(id) || id < 1) continue;
    const start = Math.max(0, m.index - 80);
    const slice = html.slice(start, m.index + 1600);
    const nameM = slice.match(/"characterName"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    if (nameM) considerCampaignHtmlCharacterLabel(id, roughUnescapeJsonStringInner(nameM[1]), bestById);
    const dispM = slice.match(/"displayName"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
    if (dispM) considerCampaignHtmlCharacterLabel(id, roughUnescapeJsonStringInner(dispM[1]), bestById);
  }
  return bestById;
}

/** Merge strategies for one campaign HTML document (SSR + inline JSON + link text). */
function scrapeCampaignHtmlForCharacterNames(html) {
  if (!html || typeof html !== 'string' || html.length < 200) return new Map();
  let acc = new Map();
  acc = mergeCampaignRosterNameSources(acc, scrapeNextDataCharacterNames(html));
  acc = mergeCampaignRosterNameSources(acc, scrapeApplicationJsonScriptCharacterNames(html));
  acc = mergeCampaignRosterNameSources(acc, scrapeLooseCharacterIdNamePairs(html));
  acc = mergeCampaignRosterNameSources(acc, scrapeCharacterLinkDomLabels(html));
  return acc;
}

/**
 * Extra GET of the campaign page to recover names rendered for the listing but missing from STT payloads.
 * @param {string} campaignId
 * @param {string} cookieHeader
 * @returns {Promise<Map<number, string>>}
 */
async function fetchCampaignPageCharacterNameMap(campaignId, cookieHeader) {
  const urls = [
    `https://www.dndbeyond.com/campaigns/${encodeURIComponent(campaignId)}`,
    `https://dndbeyond.com/campaigns/${encodeURIComponent(campaignId)}`,
  ];
  let acc = new Map();
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: requestHeaders(cookieHeader, url),
      });
      const html = await res.text();
      if (!res.ok) continue;
      acc = mergeCampaignRosterNameSources(acc, scrapeCampaignHtmlForCharacterNames(html));
    } catch {
      /* try next URL */
    }
  }
  return acc;
}

/**
 * @returns {Promise<{ ids: number[], rosterNamesByCharacterId: Map<number, string> }>}
 */
async function fetchCampaignSnapshot(campaignId, cookieHeader) {
  const emptyNames = () => new Map();
  const refs = [
    `https://www.dndbeyond.com/api/campaign/stt/active-campaigns/${encodeURIComponent(campaignId)}`,
    `https://www.dndbeyond.com/api/campaign/stt/campaigns/${encodeURIComponent(campaignId)}`,
    `https://www.dndbeyond.com/api/campaign/stt/campaign/${encodeURIComponent(campaignId)}`,
    `https://www.dndbeyond.com/api/campaign/${encodeURIComponent(campaignId)}`,
  ];
  let lastErr = 'Campaign lookup failed';
  for (const url of refs) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: requestHeaders(cookieHeader, `https://www.dndbeyond.com/campaigns/${campaignId}`),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = asHttpErrorMessage(res.status, text);
        continue;
      }
      const body = JSON.parse(text);
      const ids = collectCandidateCharacterIds(body);
      if (ids.length > 0) {
        const sttMap = collectSttCampaignRosterNames(body);
        let merged = sttMap;
        try {
          const htmlMap = await fetchCampaignPageCharacterNameMap(campaignId, cookieHeader);
          merged = mergeCampaignRosterNameSources(sttMap, htmlMap);
          if (debugLoggingEnabled) {
            dlog('campaign roster names merged', {
              stt: sttMap.size,
              html: htmlMap.size,
              merged: merged.size,
            });
          }
        } catch (err) {
          if (debugLoggingEnabled) dlog('campaign HTML name scrape failed', safeError(err));
        }
        return { ids, rosterNamesByCharacterId: merged };
      }
      lastErr = 'Campaign endpoint returned no character IDs';
    } catch (err) {
      lastErr = safeError(err);
    }
  }

  // Fallback: fetch campaign page HTML and scrape /characters/{id} links.
  // DDB often changes/guards JSON campaign endpoints, but the page markup still contains character links.
  const htmlRefs = [
    `https://www.dndbeyond.com/campaigns/${encodeURIComponent(campaignId)}`,
    `https://dndbeyond.com/campaigns/${encodeURIComponent(campaignId)}`,
  ];
  for (const url of htmlRefs) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: requestHeaders(cookieHeader, url),
      });
      const html = await res.text();
      if (!res.ok) {
        lastErr = asHttpErrorMessage(res.status, html);
        continue;
      }
      const ids = new Set();
      const re = /\/characters\/(\d+)/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const id = Number(m[1]);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
      if (ids.size > 0) {
        return {
          ids: [...ids],
          rosterNamesByCharacterId: scrapeCampaignHtmlForCharacterNames(html),
        };
      }
      lastErr = 'Campaign page loaded but no character links were found';
    } catch (err) {
      lastErr = safeError(err);
    }
  }
  throw new Error(lastErr);
}

/**
 * Prefer nested full sheet (avatarUrl, inventory, …) over slim v5 summary objects that only have id/name.
 * Matches userscript `unwrapCharacterPayload` in ddb-party-ingest.user.js.
 */
function innerCharacterFromDataBlock(d) {
  if (!d || typeof d !== 'object') return null;
  for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
    const nested = d[key];
    if (nested && typeof nested === 'object' && nested.id != null && nested.name != null) return nested;
  }
  if (d.id != null && d.name != null) return d;
  return null;
}

function unwrapCharacterPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.success === true && body.data && typeof body.data === 'object') {
    const inner = innerCharacterFromDataBlock(body.data);
    if (inner) return inner;
  }
  if (body.data && typeof body.data === 'object') {
    const inner = innerCharacterFromDataBlock(body.data);
    if (inner) return inner;
  }
  if (body.id != null && body.name != null) return body;
  return null;
}

const SPELL_SLOT_MERGE_KEYS = ['spellSlots', 'pactMagic', 'pactMagicSlots'];

/**
 * Stable key for matching a row in `actions.class` / `actions.race` / … between legacy `/json` and v5.
 * @param {unknown} item
 * @returns {string | null}
 */
function actionRowStableKey(item) {
  if (!item || typeof item !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  if (typeof o.id === 'number' && Number.isFinite(o.id)) return `id:${o.id}`;
  if (typeof o.id === 'string' && o.id.trim()) return `id:${o.id.trim()}`;
  const et = o.entityTypeId;
  const cc = o.componentId ?? o.componentTypeId;
  if (
    typeof et === 'number' &&
    Number.isFinite(et) &&
    cc != null &&
    (typeof cc === 'number' || typeof cc === 'string')
  ) {
    return `et:${et}:${cc}`;
  }
  if (typeof cc === 'number' && Number.isFinite(cc)) return `cid:${cc}`;
  if (typeof cc === 'string' && cc.trim()) return `cid:${cc.trim()}`;
  const def = o.definition;
  if (def && typeof def === 'object') {
    const did = /** @type {Record<string, unknown>} */ (def).id;
    if (typeof did === 'number' && Number.isFinite(did)) return `def:${did}`;
  }
  return null;
}

/** Lowercase trimmed display name for matching Lay on Hands / Ki when ids differ between `/json` and v5. */
function actionRowDisplayNameKey(item) {
  if (!item || typeof item !== 'object') return '';
  const o = /** @type {Record<string, unknown>} */ (item);
  if (typeof o.name === 'string' && o.name.trim()) return o.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const def = o.definition;
  if (def && typeof def === 'object') {
    const n = /** @type {Record<string, unknown>} */ (def).name;
    if (typeof n === 'string' && n.trim()) return n.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  return '';
}

/** Same bucket as backend `classResourceDedupeKey` so "Healing Pool" + main Lay on Hands rows merge `limitedUse`. */
function actionRowLimitedUseDedupeKey(item) {
  const k = actionRowDisplayNameKey(item);
  if (!k) return '';
  if (k.includes('lay on hands')) return 'lay on hands';
  if (k === 'healing pool') return 'lay on hands';
  return k;
}

/**
 * Combine two DDB `limitedUse` objects from duplicate rows: lowest `numberUsed`, highest `maxUses`.
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 */
function mergeLimitedUseObjectsPreferMinUsed(a, b) {
  const out = { ...a, ...b };
  const maxA = Math.floor(Number(a.maxUses ?? a.max));
  const maxB = Math.floor(Number(b.maxUses ?? b.max));
  const pool = Math.max(
    Number.isFinite(maxA) && maxA > 0 ? maxA : 0,
    Number.isFinite(maxB) && maxB > 0 ? maxB : 0,
  );
  const uA = Math.max(0, Math.floor(Number(a.numberUsed ?? a.used ?? a.numberExpended) || 0));
  const uB = Math.max(0, Math.floor(Number(b.numberUsed ?? b.used ?? b.numberExpended) || 0));
  out.numberUsed = Math.min(uA, uB);
  out.maxUses = pool || maxB || maxA;
  return out;
}

/**
 * When we keep legacy `actions.*` arrays (live payload looks slimmer), still copy `limitedUse` from live
 * so Lay on Hands, Ki, Channel Divinity, etc. match the sheet.
 * @param {unknown[]} targetArr — mutated in place (legacy clone rows)
 * @param {unknown[]} liveArr
 */
function mergeLimitedUseFromLiveOntoLegacyActionArrays(targetArr, liveArr) {
  if (!Array.isArray(targetArr) || !Array.isArray(liveArr) || liveArr.length < 1) return;
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const byName = new Map();
  for (const item of liveArr) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const k = actionRowStableKey(item);
    if (k) {
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, row);
      } else if (prev.limitedUse && typeof prev.limitedUse === 'object' && row.limitedUse && typeof row.limitedUse === 'object') {
        prev.limitedUse = mergeLimitedUseObjectsPreferMinUsed(
          /** @type {Record<string, unknown>} */ (prev.limitedUse),
          /** @type {Record<string, unknown>} */ (row.limitedUse),
        );
      }
    }
    if (row.limitedUse && typeof row.limitedUse === 'object') {
      const nk = actionRowLimitedUseDedupeKey(item);
      if (nk) {
        const prevN = byName.get(nk);
        if (!prevN) {
          byName.set(nk, row);
        } else if (
          prevN.limitedUse &&
          typeof prevN.limitedUse === 'object' &&
          row.limitedUse &&
          typeof row.limitedUse === 'object'
        ) {
          prevN.limitedUse = mergeLimitedUseObjectsPreferMinUsed(
            /** @type {Record<string, unknown>} */ (prevN.limitedUse),
            /** @type {Record<string, unknown>} */ (row.limitedUse),
          );
        }
      }
    }
  }
  if (byKey.size < 1 && byName.size < 1) return;
  for (const tItem of targetArr) {
    if (!tItem || typeof tItem !== 'object') continue;
    const tgt = /** @type {Record<string, unknown>} */ (tItem);
    let liveRow = null;
    const sk = actionRowStableKey(tItem);
    if (sk) liveRow = byKey.get(sk) ?? null;
    if (
      (!liveRow || !liveRow.limitedUse || typeof liveRow.limitedUse !== 'object') &&
      byName.size > 0
    ) {
      const nk = actionRowLimitedUseDedupeKey(tItem);
      if (nk) liveRow = byName.get(nk) ?? liveRow;
    }
    if (!liveRow || !liveRow.limitedUse || typeof liveRow.limitedUse !== 'object') continue;
    tgt.limitedUse = cloneJsonValue(liveRow.limitedUse);
  }
}

/**
 * `conditions` only — always prefer live array when present (length / slim-array heuristics elsewhere).
 * HP primitives are handled at the bottom of the overlay so we can skip slim v5 zeros.
 * @param {Record<string, unknown>} target
 * @param {string} key
 * @param {unknown} lv
 * @returns {boolean} true if handled (caller should continue)
 */
function applyLiveAuthoritativeOverlay(target, key, lv) {
  if (key === 'conditions') {
    if (!Array.isArray(lv)) return false;
    target[key] = cloneJsonValue(lv);
    return true;
  }
  return false;
}

/** @param {unknown} v */
function cloneJsonValue(v) {
  if (v === null || typeof v !== 'object') return v;
  try {
    return structuredClone(v);
  } catch {
    return JSON.parse(JSON.stringify(v));
  }
}

/** @param {unknown} v */
function jsonByteLength(v) {
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

/** @param {Record<string, unknown>} row */
function spellSlotRowUsed(row) {
  if (!row || typeof row !== 'object') return 0;
  const o = row;
  return Math.max(
    0,
    Math.floor(
      Number(o.used ?? o.numberUsed ?? o.expended ?? o.spent ?? o.numberExpended) || 0,
    ),
  );
}

/** @param {Record<string, unknown>} row — align with backend `readSpellSlotParts` (`remaining` / `slotsRemaining`). */
function spellSlotRowRawAvail(row) {
  if (!row || typeof row !== 'object') return 0;
  const o = row;
  const fromAvail = Math.max(0, Math.floor(Number(o.available ?? o.numberAvailable ?? o.slots) || 0));
  const remRaw = o.remaining ?? o.slotsRemaining;
  if (remRaw != null && remRaw !== '' && Number.isFinite(Number(remRaw))) {
    const rem = Math.max(0, Math.floor(Number(remRaw) || 0));
    if (fromAvail === 0) return rem;
  }
  return fromAvail;
}

/**
 * @param {unknown[]} arr
 * @param {boolean} inferNine
 * @returns {Map<number, Record<string, unknown>>}
 */
function indexSpellSlotsByLevel(arr, inferNine) {
  const m = new Map();
  if (!Array.isArray(arr)) return m;
  const useNine = inferNine === true && arr.length === 9;
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (!row || typeof row !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (row);
    let lv = Math.floor(Number(o.level ?? o.spellLevel ?? o.slotLevel));
    if ((!Number.isFinite(lv) || lv < 1 || lv > 9) && useNine) lv = i + 1;
    if (!Number.isFinite(lv) || lv < 1 || lv > 9) continue;
    m.set(lv, o);
  }
  return m;
}

/**
 * Per spell level: `used` prefers the lower count when live &lt; legacy (rest / sync), else max.
 * For `available` when both show `used === 0`: DDB often has one endpoint still echo **pool size** (2)
 * while the other has **slots remaining** (1). `Math.max` picked the stale 2 — use **min** when both
 * are positive. When `used > 0`, keep `available` from the side with higher `used`.
 * @param {unknown} legacyArr
 * @param {unknown} liveArr
 * @param {boolean} inferNine
 */
function mergeSpellSlotArrays(legacyArr, liveArr, inferNine) {
  const leg = indexSpellSlotsByLevel(/** @type {unknown[]} */ (legacyArr), inferNine);
  const liv = indexSpellSlotsByLevel(/** @type {unknown[]} */ (liveArr), inferNine);
  const levels = [...new Set([...leg.keys(), ...liv.keys()])].sort((a, b) => a - b);
  const out = [];
  for (const lv of levels) {
    const L = leg.get(lv);
    const V = liv.get(lv);
    if (!L) {
      out.push(cloneJsonValue(V));
      continue;
    }
    if (!V) {
      out.push(cloneJsonValue(L));
      continue;
    }
    const uL = spellSlotRowUsed(L);
    const uV = spellSlotRowUsed(V);
    /** After a rest, legacy `/json` often lags high `used` while v5 already has 0 — max() kept stale usage. */
    let u;
    if (Number.isFinite(uL) && Number.isFinite(uV)) {
      u = uV < uL ? uV : Math.max(uL, uV);
    } else {
      u = Math.max(uL, uV);
    }
    const aL = spellSlotRowRawAvail(L);
    const aV = spellSlotRowRawAvail(V);
    let av;
    if (u === 0) {
      if (aL > 0 && aV > 0) {
        av = Math.min(aL, aV);
      } else {
        av = Math.max(aL, aV);
      }
    } else {
      av = uL >= uV ? aL : aV;
    }
    out.push({ ...L, ...V, level: lv, used: u, available: av });
  }
  return out;
}

/**
 * Overlay live character-service fields onto a legacy `/json` sheet (full inventory, spells, …).
 * Keeps legacy arrays when the live copy looks like a slim/partial payload.
 * @param {Record<string, unknown>} target — mutated legacy clone
 * @param {Record<string, unknown>} live
 * @param {{ underActions?: boolean }} [ctx]
 */
function overlayLiveCharacterOntoLegacyTarget(target, live, ctx) {
  if (!live || typeof live !== 'object') return;
  const underActions = ctx?.underActions === true;
  for (const key of Object.keys(live)) {
    const lv = live[key];
    if (lv === undefined) continue;

    if (key === 'inspiration') {
      // Prefer character-service value when present (including false). OR-merge kept stale legacy `true`
      // when the sheet had cleared inspiration but `/json` lagged behind v5.
      const on = lv === true || lv === 1;
      target.inspiration = on;
      target.hasInspiration = on;
      target.isInspired = on;
      target.heroicInspiration = on ? 1 : 0;
      continue;
    }

    if (applyLiveAuthoritativeOverlay(target, key, lv)) continue;

    if (!(key in target)) {
      target[key] = cloneJsonValue(lv);
      continue;
    }

    const tv = target[key];

    if (lv === null) {
      target[key] = null;
      continue;
    }

    const lvIsArr = Array.isArray(lv);
    const tvIsArr = Array.isArray(tv);

    if (lvIsArr) {
      if (SPELL_SLOT_MERGE_KEYS.includes(key)) {
        if (!tvIsArr) {
          target[key] = cloneJsonValue(lv);
          continue;
        }
        const inferNine = key === 'spellSlots';
        target[key] = mergeSpellSlotArrays(tv, lv, inferNine);
        continue;
      }
      if (tvIsArr && tv.length > 0) {
        const slv = jsonByteLength(lv);
        const stv = jsonByteLength(tv);
        let skipFullReplace = false;
        if (stv >= 24 && slv < stv * 0.35) skipFullReplace = true;
        else if (lv.length < tv.length) skipFullReplace = true;
        else if (lv.length === tv.length && slv < stv * 0.5) skipFullReplace = true;
        if (skipFullReplace) {
          if (underActions) mergeLimitedUseFromLiveOntoLegacyActionArrays(tv, lv);
          continue;
        }
      }
      target[key] = cloneJsonValue(lv);
      continue;
    }

    if (typeof lv === 'object') {
      if (tv !== null && typeof tv === 'object' && !tvIsArr) {
        overlayLiveCharacterOntoLegacyTarget(/** @type {Record<string, unknown>} */ (tv), /** @type {Record<string, unknown>} */ (lv), {
          underActions: key === 'actions' || underActions,
        });
      } else {
        target[key] = cloneJsonValue(lv);
      }
      continue;
    }

    target[key] = lv;
  }
}

/**
 * v5/character-service often **omits** `temporaryHitPoints` when it is 0. The overlay only iterates keys
 * present on `live`, so legacy `/json` can keep a stale positive temp. Clear when live has no temp keys
 * but is clearly a real sheet payload (HP primitives or rich shape — v5 may use `removedHitPoints` only
 * or fewer than 40 top-level keys).
 */
function liveLooksLikeAuthoritativeSheet(live) {
  if (!live || typeof live !== 'object') return false;
  if (Object.keys(live).length >= 25) return true;
  if (jsonByteLength(live) >= 4000) return true;
  const act = live.actions;
  if (act && typeof act === 'object' && !Array.isArray(act) && Object.keys(act).length > 0) return true;
  if (Array.isArray(live.spellSlots) && live.spellSlots.length > 0) return true;
  if (Array.isArray(live.classes) && live.classes.length > 0) return true;
  return false;
}

/** Root-level HP fields v5/legacy use (either can be present without the other). */
function liveHasRootHpSignal(live) {
  if (!live || typeof live !== 'object') return false;
  if (
    Object.prototype.hasOwnProperty.call(live, 'currentHitPoints') &&
    Number.isFinite(Number(live.currentHitPoints))
  ) {
    return true;
  }
  if (
    Object.prototype.hasOwnProperty.call(live, 'removedHitPoints') &&
    Number.isFinite(Number(live.removedHitPoints))
  ) {
    return true;
  }
  return false;
}

function reconcileOmittedTempHpAfterLiveOverlay(target, live) {
  if (!target || typeof target !== 'object' || !live || typeof live !== 'object') return;
  if (
    Object.prototype.hasOwnProperty.call(live, 'temporaryHitPoints') ||
    Object.prototype.hasOwnProperty.call(live, 'tempHitPoints')
  ) {
    return;
  }
  if (!liveLooksLikeAuthoritativeSheet(live) && !liveHasRootHpSignal(live)) return;
  target.temporaryHitPoints = 0;
  if (Object.prototype.hasOwnProperty.call(target, 'tempHitPoints')) {
    target.tempHitPoints = 0;
  }
}

/**
 * Full legacy sheet + live service overlay (HP, stats, conditions, …).
 * @param {Record<string, unknown> | null} legacy
 * @param {Record<string, unknown> | null} live
 */
function isDdbGeneratedDefaultCharacterName(name) {
  const t = String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^.+?['\u2019]s Character$/i.test(t);
}

function ddbTrimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function ddbSocialOrNickname(o) {
  if (!o || typeof o !== 'object') return '';
  return ddbTrimStr(o.socialName || o.social_name || o.nickname);
}

/** Match backend `characterNameFromCampaignRoster`: any non-placeholder display field on the roster row. */
function characterNameFromCampaignRoster(target) {
  const id = Number(target.id);
  if (!Number.isFinite(id)) return '';
  const camp = target.campaign;
  if (!camp || typeof camp !== 'object' || Array.isArray(camp)) return '';
  const chars = camp.characters;
  if (!Array.isArray(chars)) return '';
  for (const row of chars) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const cid = Number(row.characterId ?? row.id);
    if (!Number.isFinite(cid) || cid !== id) continue;
    return pickSttRosterRowDisplayName(/** @type {Record<string, unknown>} */ (row));
  }
  return '';
}

/**
 * Match backend `resolveDdbCharacterName`: nested `character.name`, then `socialName` / `nickname`, then
 * `campaign.characters[].characterName`, then root `displayName` / `characterName`, when `name` is still
 * DDB’s **`Username's Character`** placeholder.
 */
function liftMergedCharacterNameFromNested(target) {
  if (!target || typeof target !== 'object') return;
  for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
    const sub = target[key];
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) continue;
    const n = ddbTrimStr(sub.name);
    if (n && !isDdbGeneratedDefaultCharacterName(n)) {
      target.name = n;
      return;
    }
    const soc = ddbSocialOrNickname(sub);
    if (soc) {
      target.name = soc;
      return;
    }
    if (n) {
      target.name = n;
      return;
    }
  }
  const top = ddbTrimStr(target.name);
  const topSoc = ddbSocialOrNickname(target);
  if (top && !isDdbGeneratedDefaultCharacterName(top)) return;
  if (topSoc) {
    target.name = topSoc;
    return;
  }
  const fromCamp = characterNameFromCampaignRoster(target);
  if (fromCamp) {
    target.name = fromCamp;
    return;
  }
  for (const key of ['displayName', 'characterName']) {
    const n = ddbTrimStr(target[key]);
    if (n && !isDdbGeneratedDefaultCharacterName(n)) {
      target.name = n;
      return;
    }
  }
}

/**
 * STT campaign API can carry a roster `characterName` that matches the campaign page while `/json` is stale.
 * Apply after {@link liftMergedCharacterNameFromNested} so we do not lose this to nested placeholder copies.
 * @param {Record<string, unknown>} target
 * @param {Map<number, string>} rosterNamesByCharacterId
 */
function applySttRosterNameOverlay(target, rosterNamesByCharacterId) {
  if (!target || typeof target !== 'object' || !rosterNamesByCharacterId || rosterNamesByCharacterId.size < 1) {
    return;
  }
  const id = Number(target.id);
  if (!Number.isFinite(id)) return;
  const stt = rosterNamesByCharacterId.get(id);
  if (!stt || isDdbGeneratedDefaultCharacterName(stt)) return;
  const top = ddbTrimStr(target.name);
  if (!top || isDdbGeneratedDefaultCharacterName(top)) target.name = stt;
}

function deepMergeLiveOntoLegacy(legacy, live) {
  if (!legacy || typeof legacy !== 'object') return cloneJsonValue(live) ?? legacy;
  if (!live || typeof live !== 'object') return cloneJsonValue(legacy);
  const target = cloneJsonValue(legacy);
  overlayLiveCharacterOntoLegacyTarget(target, live, {});
  reconcileOmittedTempHpAfterLiveOverlay(target, live);
  liftMergedCharacterNameFromNested(target);
  return target;
}

/** When v5 is unavailable, a second `/json` read shortly after the first can pick up fresher spell slots / resources. */
const LEGACY_STAGGER_MS = 750;

/** Mirrors backend `LIMITED_USE_ACTION_BUCKETS` for debug counts only. */
const LIMITED_USE_ACTION_BUCKETS_DEBUG = [
  'class',
  'race',
  'feat',
  'background',
  'bonusAction',
  'special',
];

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Record<string, unknown> | null | undefined} merged
 */
function sumSpellSlotsUsedForDebug(merged) {
  if (!merged || typeof merged !== 'object') return undefined;
  let sum = 0;
  for (const key of ['spellSlots', 'pactMagic', 'pactMagicSlots']) {
    const arr = merged[key];
    if (!Array.isArray(arr)) continue;
    for (const row of arr) {
      if (row && typeof row === 'object') sum += spellSlotRowUsed(/** @type {Record<string, unknown>} */ (row));
    }
  }
  return sum;
}

/**
 * @param {Record<string, unknown> | null | undefined} merged
 */
function countLimitedUseActionsForDebug(merged) {
  if (!merged || typeof merged !== 'object') return undefined;
  const actions = merged.actions;
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) return 0;
  let n = 0;
  for (const bucket of LIMITED_USE_ACTION_BUCKETS_DEBUG) {
    const arr = actions[bucket];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      if (item.usesSpellSlot === true) continue;
      const lu = item.limitedUse;
      if (!lu || typeof lu !== 'object') continue;
      const maxUses = Math.floor(Number(lu.maxUses));
      if (!Number.isFinite(maxUses) || maxUses <= 0) continue;
      n++;
    }
  }
  return n;
}

/**
 * Second legacy snapshot merged like v5 overlay (spell-slot `used` prefers lower when newer, etc.).
 * @param {number} characterId
 * @param {string} cookieHeader
 * @param {Record<string, unknown>} firstLegacy
 * @returns {Promise<{ merged: Record<string, unknown>, staggered: boolean }>}
 */
async function fetchSecondLegacySnapshotAndMerge(characterId, cookieHeader, firstLegacy) {
  await delay(LEGACY_STAGGER_MS);
  const ts2 = Date.now();
  const referer = `https://www.dndbeyond.com/characters/${characterId}`;
  const urls = [
    `https://www.dndbeyond.com/character/${characterId}/json?_ts=${ts2}`,
    `https://www.dndbeyond.com/characters/${characterId}/json?_ts=${ts2}`,
  ];
  const second = await fetchUnwrappedFromUrls(urls, cookieHeader, referer);
  if (!second) return { merged: firstLegacy, staggered: false };
  return { merged: deepMergeLiveOntoLegacy(firstLegacy, second), staggered: true };
}

/**
 * @param {Record<string, unknown>} merged
 * @param {string} mergeKind
 */
function logCharacterMergeTelemetry(merged, mergeKind) {
  if (!debugLoggingEnabled || !merged || typeof merged !== 'object') return;
  const cond = merged.conditions;
  let conditionsCount;
  if (Array.isArray(cond)) conditionsCount = cond.length;
  else if (cond === undefined) conditionsCount = 'absent';
  else conditionsCount = 'non-array';
  pushDebugFeed({
    kind: 'characterMerge',
    mergeKind,
    characterId: merged.id,
    name: typeof merged.name === 'string' ? merged.name : undefined,
    conditionsCount,
    tempHp: typeof merged.temporaryHitPoints === 'number' ? merged.temporaryHitPoints : undefined,
    spellSlotsUsedSum: sumSpellSlotsUsedForDebug(merged),
    limitedUseCount: countLimitedUseActionsForDebug(merged),
  });
}

/**
 * @param {string[]} urls
 * @param {string} cookieHeader
 * @param {string} referer
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function fetchUnwrappedFromUrls(urls, cookieHeader, referer) {
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, requestOptionsForUrl(url, cookieHeader, referer));
      const text = await res.text();
      recordEndpointTrace({ url, status: res.status, ok: res.ok });
      if (!res.ok) continue;
      const u = unwrapCharacterPayload(JSON.parse(text));
      if (u && typeof u === 'object') return u;
      recordEndpointTrace({ url, status: res.status, ok: false, note: 'unrecognized-shape' });
    } catch {
      recordEndpointTrace({ url, ok: false, note: 'fetch-error' });
      /* next */
    }
  }
  return null;
}

/**
 * @param {number} characterId
 * @param {string} cookieHeader
 * @param {Record<string, unknown>} svc
 */
async function mergeServiceWithLegacyFetch(characterId, cookieHeader, svc) {
  const ts = Date.now();
  const referer = `https://www.dndbeyond.com/characters/${characterId}`;
  const leg = await fetchUnwrappedFromUrls(
    [
      `https://www.dndbeyond.com/character/${characterId}/json?_ts=${ts}`,
      `https://www.dndbeyond.com/characters/${characterId}/json?_ts=${ts}`,
    ],
    cookieHeader,
    referer,
  );
  if (leg) {
    const merged = deepMergeLiveOntoLegacy(leg, svc);
    logCharacterMergeTelemetry(merged, 'v5-then-legacy-merge');
    return merged;
  }
  logCharacterMergeTelemetry(svc, 'v5-only-no-legacy-json');
  return svc;
}

async function fetchCharacterByIdSequentialFallback(characterId, cookieHeader, ts) {
  const referer = `https://www.dndbeyond.com/characters/${characterId}`;
  const refs = [
    `https://character-service.dndbeyond.com/character/v5/character/${characterId}?_ts=${ts}`,
    `https://www.dndbeyond.com/character/${characterId}/json?_ts=${ts}`,
    `https://www.dndbeyond.com/characters/${characterId}/json?_ts=${ts}`,
  ];
  let lastErr = 'Character fetch failed';
  for (const url of refs) {
    try {
      const res = await fetchWithTimeout(url, requestOptionsForUrl(url, cookieHeader, referer));
      const text = await res.text();
      recordEndpointTrace({ url, status: res.status, ok: res.ok, phase: 'sequential-fallback' });
      if (!res.ok) {
        lastErr = asHttpErrorMessage(res.status, text);
        continue;
      }
      const unwrapped = unwrapCharacterPayload(JSON.parse(text));
      if (unwrapped && typeof unwrapped === 'object') {
        if (String(url).includes('character-service.dndbeyond.com')) {
          return mergeServiceWithLegacyFetch(characterId, cookieHeader, unwrapped);
        }
        const { merged, staggered } = await fetchSecondLegacySnapshotAndMerge(
          characterId,
          cookieHeader,
          unwrapped,
        );
        logCharacterMergeTelemetry(merged, staggered ? 'legacy-double-stagger' : 'sequential-legacy-json');
        return merged;
      }
      lastErr = 'Character response shape not recognized';
    } catch (err) {
      lastErr = safeError(err);
    }
  }
  throw new Error(`Character ${characterId}: ${lastErr}`);
}

async function fetchCharacterById(characterId, cookieHeader) {
  const ts = Date.now();
  const referer = `https://www.dndbeyond.com/characters/${characterId}`;
  const legacyUrls = [
    `https://www.dndbeyond.com/character/${characterId}/json?_ts=${ts}`,
    `https://www.dndbeyond.com/characters/${characterId}/json?_ts=${ts}`,
  ];
  const serviceUrls = [
    `https://character-service.dndbeyond.com/character/v5/character/${characterId}?_ts=${ts}`,
  ];

  const [leg, svc] = await Promise.all([
    fetchUnwrappedFromUrls(legacyUrls, cookieHeader, referer),
    fetchUnwrappedFromUrls(serviceUrls, cookieHeader, referer),
  ]);

  if (leg && svc) {
    const merged = deepMergeLiveOntoLegacy(leg, svc);
    logCharacterMergeTelemetry(merged, 'parallel-legacy+v5');
    return merged;
  }
  if (leg) {
    const { merged, staggered } = await fetchSecondLegacySnapshotAndMerge(characterId, cookieHeader, leg);
    logCharacterMergeTelemetry(
      merged,
      staggered ? 'legacy-double-stagger' : 'legacy-only-v5-failed-or-absent',
    );
    return merged;
  }
  if (svc) return mergeServiceWithLegacyFetch(characterId, cookieHeader, svc);

  return fetchCharacterByIdSequentialFallback(characterId, cookieHeader, ts);
}

async function fetchCharactersByIds(ids, cookieHeader) {
  const unique = [...new Set(ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  const out = [];
  const errors = [];
  for (let i = 0; i < unique.length; i += POLL_CONCURRENCY) {
    const chunk = unique.slice(i, i + POLL_CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map((id) => fetchCharacterById(id, cookieHeader)));
    settled.forEach((result, idx) => {
      if (result.status === 'fulfilled') out.push(result.value);
      else errors.push(`Character ${chunk[idx]}: ${safeError(result.reason)}`);
    });
  }
  return { characters: out, errors };
}

/**
 * Drop expired or empty scrape rows; persist pruned map.
 * @returns {Promise<Record<string, { labels: string[], at: number, strategy?: string, url?: string }>>}
 */
async function pruneDomScrapedConditionsMap() {
  const got = await chrome.storage.local.get(DOM_SCRAPED_CONDITIONS_KEY);
  const prev = got[DOM_SCRAPED_CONDITIONS_KEY];
  const now = Date.now();
  const next = {};
  if (prev && typeof prev === 'object') {
    for (const [id, row] of Object.entries(prev)) {
      if (!row || typeof row !== 'object' || typeof row.at !== 'number') continue;
      if (now - row.at > DOM_CONDITIONS_TTL_MS) continue;
      if (!Array.isArray(row.labels) || row.labels.length < 1) continue;
      next[id] = row;
    }
  }
  await chrome.storage.local.set({ [DOM_SCRAPED_CONDITIONS_KEY]: next });
  return next;
}

async function mergeDomScrapedConditionsIntoParty(characters, cfg) {
  if (cfg.sheetScrapeConditions === false || !Array.isArray(characters)) return;
  const map = await pruneDomScrapedConditionsMap();
  let mergedAny = false;
  for (const c of characters) {
    if (!c || typeof c !== 'object' || c.id == null) continue;
    const id = String(c.id);
    const row = map[id];
    if (!row || !Array.isArray(row.labels) || row.labels.length < 1) continue;
    const domFiltered = row.labels
      .map((x) => (typeof x === 'string' ? x.trim() : String(x)).trim())
      .filter(Boolean)
      .filter((lb) => !isDomConditionNoiseLabel(lb));
    /** DOM scrape must not wipe API conditions when it only captured sheet nav tabs. */
    if (domFiltered.length < 1) continue;
    mergedAny = true;
    const jsonCount = Array.isArray(c.conditions) ? c.conditions.length : 0;
    mergeCharacterConditionsWithDom(c, domFiltered);
    const merged = Array.isArray(c.conditions) ? c.conditions : [];
    const mergedStr = merged.map((x) => (typeof x === 'string' ? x : jsonConditionEntryToLabel(x))).filter(Boolean);
    if (debugLoggingEnabled) {
      dlog('dom conditions merged into upload', {
        characterId: c.id,
        name: c.name,
        strategy: row.strategy,
        domFiltered,
        merged: mergedStr,
        previousJsonConditionsCount: jsonCount,
      });
      pushDebugFeed({
        kind: 'domScrapeMerge',
        characterId: c.id,
        name: typeof c.name === 'string' ? c.name : undefined,
        strategy: row.strategy,
        labelsCount: mergedStr.length,
        labelsPreview: mergedStr.slice(0, 12),
        replacedJsonConditionsCount: jsonCount,
      });
    }
  }
  if (debugLoggingEnabled && cfg.sheetScrapeConditions !== false && characters.length > 0 && !mergedAny) {
    const cachedIds = Object.keys(map);
    const missing = characters
      .filter((ch) => ch && ch.id != null && !map[String(ch.id)])
      .map((ch) => String(ch.name || ch.id));
    pushDebugFeed({
      kind: 'domScrapeHint',
      cachedCharacterIds: cachedIds,
      missingNamesPreview: missing.slice(0, 8),
      message:
        cachedIds.length < 1
          ? 'No DOM condition cache — open each character on www.dndbeyond.com/characters/{id}, wait ~2s after load, extension 2.0.30+ (reload DDB tabs after update).'
          : `DOM cache has IDs [${cachedIds.join(', ')}] but no overlap with this party — open missing sheets or confirm character IDs match.`,
    });
  }
}

async function handleDomConditionsMessage(payload) {
  if (!payload || payload.characterId == null) return;
  const cfg = await loadConfig();
  if (cfg.sheetScrapeConditions === false) return;
  const id = String(payload.characterId);
  const got = await chrome.storage.local.get(DOM_SCRAPED_CONDITIONS_KEY);
  const base =
    got[DOM_SCRAPED_CONDITIONS_KEY] && typeof got[DOM_SCRAPED_CONDITIONS_KEY] === 'object'
      ? got[DOM_SCRAPED_CONDITIONS_KEY]
      : {};
  const raw = { ...base };
  const labels = Array.isArray(payload.labels) ? payload.labels : [];
  const filtered = stripGroupedDomSpellTableScrapeNoise(
    labels
      .map((x) => (typeof x === 'string' ? x.trim() : String(x)).trim())
      .filter(Boolean)
      .filter((lb) => !isDomConditionNoiseLabel(lb)),
  );
  if (filtered.length < 1) {
    delete raw[id];
    await chrome.storage.local.set({ [DOM_SCRAPED_CONDITIONS_KEY]: raw });
    return;
  }
  raw[id] = {
    labels: filtered,
    at: typeof payload.at === 'number' ? payload.at : Date.now(),
    strategy: typeof payload.strategy === 'string' ? payload.strategy : '',
    url: typeof payload.url === 'string' ? payload.url : '',
  };
  await chrome.storage.local.set({ [DOM_SCRAPED_CONDITIONS_KEY]: raw });
  const reason = String(payload.reason || '');
  const reportRetry = reason.startsWith('retry-') && filtered.length > 0;
  if (
    debugLoggingEnabled &&
    (['load', 'pageshow', 'hashchange', 'force'].includes(reason) || reportRetry)
  ) {
    pushDebugFeed({
      kind: 'domScrapeReport',
      characterId: id,
      labelsCount: filtered.length,
      labelsPreview: filtered.slice(0, 12),
      strategy: payload.strategy,
      reason,
    });
    dlog('dom conditions reported from tab', { characterId: id, labels: filtered, strategy: payload.strategy, reason });
  }
}

async function uploadCharacters(config, characters, rosterNamesByCharacterId) {
  const sttNames =
    rosterNamesByCharacterId && rosterNamesByCharacterId.size > 0 ? rosterNamesByCharacterId : null;
  if (Array.isArray(characters)) {
    for (const c of characters) {
      liftMergedCharacterNameFromNested(c);
      if (sttNames) applySttRosterNameOverlay(c, sttNames);
    }
  }
  const url = `${BACKEND_URL}/api/ingest/party`;
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      format: 'ddb_characters',
      replaceParty: true,
      characters,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(asHttpErrorMessage(res.status, text));
  return text;
}

async function runPollCycle(reason) {
  const config = await loadConfig();
  if (!config.pollingEnabled && reason !== 'manual') {
    return { ok: false, skipped: true, error: 'Polling is disabled.' };
  }

  const campaignParsed = parseCampaignInput(config.campaignInput || config.campaignId);
  if (!campaignParsed.ok) throw new Error(campaignParsed.error);
  if (!config.apiKey) throw new Error('API key is required.');

  const telemetryStart = await setTelemetry({
    state: 'polling',
    lastAttemptAt: new Date().toISOString(),
    lastError: '',
  });
  void telemetryStart;
  endpointTrace.length = 0;
  debugFeed.length = 0;

  dlog('poll start', { reason, campaignId: campaignParsed.id });

  const cookieHeader = await buildCookieHeader();
  if (!cookieHeader) throw new Error('No dndbeyond.com cookies found. Sign in first.');
  dlog('cookies', { headerLength: cookieHeader.length });

  const snapshot = await fetchCampaignSnapshot(campaignParsed.id, cookieHeader);
  if (snapshot.ids.length < 1) throw new Error('Campaign returned no character IDs.');
  dlog('character ids', {
    count: snapshot.ids.length,
    sample: snapshot.ids.slice(0, 8),
    sttRosterNames: snapshot.rosterNamesByCharacterId.size,
  });

  const fetched = await fetchCharactersByIds(snapshot.ids, cookieHeader);
  dlog('fetched sheets', {
    ok: fetched.characters.length,
    errors: fetched.errors.length,
  });
  if (fetched.characters.length < 1) {
    throw new Error(fetched.errors[0] || 'No characters fetched from campaign.');
  }

  await mergeDomScrapedConditionsIntoParty(fetched.characters, config);
  await uploadCharacters(config, fetched.characters, snapshot.rosterNamesByCharacterId);
  const nowIso = new Date().toISOString();
  const warnings = fetched.errors.length ? fetched.errors.slice(0, 2).join(' | ') : '';
  const traceSlice = endpointTrace.slice(-25);
  await setTelemetry({
    state: 'idle',
    consecutiveFailures: 0,
    lastSuccessAt: nowIso,
    lastError: warnings,
    lastCharacterCount: fetched.characters.length,
    campaignId: campaignParsed.id,
    endpointTrace: traceSlice,
    ...(config.debugLogging
      ? { lastEndpointTrace: traceSlice, lastDebugFeed: debugFeed.slice(-MAX_DEBUG_FEED) }
      : {}),
  });
  await scheduleFromConfig(config, 0);
  return {
    ok: true,
    characterCount: fetched.characters.length,
    warnings: fetched.errors,
  };
}

let pollInFlight = null;
async function runGuardedPoll(reason) {
  if (pollInFlight) return pollInFlight;
  pollInFlight = (async () => {
    const config = await loadConfig();
    try {
      const result = await runPollCycle(reason);
      return result;
    } catch (err) {
      const failures = Number(config.telemetry?.consecutiveFailures || 0) + 1;
      const errTrace = endpointTrace.slice(-30);
      dlog('poll failed', safeError(err), errTrace.length ? { traceSteps: errTrace.length } : {});
      await setTelemetry({
        state: 'error',
        consecutiveFailures: failures,
        lastError: safeError(err),
        ...(config.debugLogging
          ? {
              lastEndpointTrace: errTrace,
              endpointTrace: errTrace,
              lastDebugFeed: debugFeed.slice(-MAX_DEBUG_FEED),
            }
          : {}),
      });
      await scheduleFromConfig(config, failures);
      throw err;
    } finally {
      pollInFlight = null;
    }
  })();
  return pollInFlight;
}

async function getStatus() {
  let cfg = await loadConfig();
  cfg = await recoverStalePollingState(cfg);
  await ensurePollingAlarm(cfg);
  cfg = await loadConfig();
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return {
    backend: BACKEND_URL,
    campaignInput: cfg.campaignInput,
    campaignId: cfg.campaignId,
    apiKeyConfigured: cfg.apiKey.length > 0,
    pollingEnabled: cfg.pollingEnabled,
    pollIntervalMs: cfg.pollIntervalMs,
    debugLogging: cfg.debugLogging === true,
    sheetScrapeConditions: cfg.sheetScrapeConditions !== false,
    telemetry: cfg.telemetry,
    alarmScheduledFor: alarm && alarm.scheduledTime ? new Date(alarm.scheduledTime).toISOString() : null,
  };
}

async function saveSettings(payload) {
  const existing = await loadConfig();
  const campaignInput = String(payload.campaignInput || existing.campaignInput || '').trim();
  const parsed = parseCampaignInput(campaignInput);
  if (!parsed.ok) throw new Error(parsed.error);
  const pollIntervalMs = clampIntervalMs(payload.pollIntervalMs);
  const pollingEnabled = payload.pollingEnabled === true;
  const apiKey = String(payload.apiKey || existing.apiKey || '').trim();
  if (!apiKey) throw new Error('API key is required.');
  const sheetScrapeConditions =
    'sheetScrapeConditions' in payload
      ? payload.sheetScrapeConditions === true
      : existing.sheetScrapeConditions !== false;

  await saveConfigPatch({
    [STORAGE_KEYS.apiKey]: apiKey,
    [STORAGE_KEYS.campaignInput]: campaignInput,
    [STORAGE_KEYS.campaignId]: parsed.id,
    [STORAGE_KEYS.pollIntervalMs]: pollIntervalMs,
    [STORAGE_KEYS.pollingEnabled]: pollingEnabled,
    [STORAGE_KEYS.sheetScrapeConditions]: sheetScrapeConditions,
  });
  const cfg = await loadConfig();
  await scheduleFromConfig(cfg, Number(cfg.telemetry?.consecutiveFailures || 0));
  return getStatus();
}

chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await loadConfig();
  await saveConfigPatch({
    [STORAGE_KEYS.pollIntervalMs]: cfg.pollIntervalMs || DEFAULT_INTERVAL_MS,
    [STORAGE_KEYS.pollingEnabled]: cfg.pollingEnabled === true,
    [STORAGE_KEYS.telemetry]: cfg.telemetry || {
      state: 'idle',
      consecutiveFailures: 0,
      lastError: '',
    },
  });
  await scheduleFromConfig(await loadConfig(), Number(cfg.telemetry?.consecutiveFailures || 0));
});

chrome.runtime.onStartup.addListener(async () => {
  const cfg = await loadConfig();
  await scheduleFromConfig(cfg, Number(cfg.telemetry?.consecutiveFailures || 0));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  void runGuardedPoll('alarm');
});

// When the service worker wakes (after sleep), alarms may be missing — restore schedule.
void (async () => {
  try {
    const cfg = await loadConfig();
    await ensurePollingAlarm(cfg);
  } catch {
    /* ignore */
  }
})();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const type = msg && msg.type;
  (async () => {
    if (type === 'get-status') return getStatus();
    if (type === 'save-settings') return saveSettings(msg.payload || {});
    if (type === 'set-polling-enabled') {
      const enabled = msg.enabled === true || (msg.payload && msg.payload.enabled === true);
      await saveConfigPatch({ [STORAGE_KEYS.pollingEnabled]: enabled });
      const cfg = await loadConfig();
      await scheduleFromConfig(cfg, Number(cfg.telemetry?.consecutiveFailures || 0));
      return getStatus();
    }
    if (type === 'set-debug-logging') {
      const enabled = msg.enabled === true || (msg.payload && msg.payload.enabled === true);
      await saveConfigPatch({ [STORAGE_KEYS.debugLogging]: enabled });
      await loadConfig();
      return getStatus();
    }
    if (type === 'set-sheet-scrape') {
      const enabled = msg.enabled === true || (msg.payload && msg.payload.enabled === true);
      await saveConfigPatch({ [STORAGE_KEYS.sheetScrapeConditions]: enabled });
      await loadConfig();
      return getStatus();
    }
    if (type === 'ddb-dom-conditions') {
      await handleDomConditionsMessage(msg.payload || {});
      return { received: true };
    }
    if (type === 'refresh-now') return runGuardedPoll('manual');
    throw new Error('Unknown message.');
  })()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: safeError(err) }));
  return true;
});
