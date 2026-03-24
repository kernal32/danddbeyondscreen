/* global chrome */

const STORAGE_KEYS = {
  apiKey: 'apiKey',
  campaignInput: 'campaignInput',
  campaignId: 'campaignId',
  pollingEnabled: 'pollingEnabled',
  pollIntervalMs: 'pollIntervalMs',
  telemetry: 'telemetry',
};

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
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadConfig() {
  const s = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    backend: BACKEND_URL,
    apiKey: String(s.apiKey || '').trim(),
    campaignInput: String(s.campaignInput || ''),
    campaignId: String(s.campaignId || ''),
    pollingEnabled: s.pollingEnabled === true,
    pollIntervalMs: clampIntervalMs(s.pollIntervalMs),
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

async function buildCookieHeader() {
  const all = await chrome.cookies.getAll({ url: 'https://www.dndbeyond.com/' });
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

function requestHeaders(cookieHeader, referer) {
  return {
    Accept: 'application/json, text/plain, */*',
    'Content-Type': 'text/json',
    Referer: referer,
    Cookie: cookieHeader,
  };
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

async function fetchCampaignCharacterIds(campaignId, cookieHeader) {
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
      if (ids.length > 0) return ids;
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
      if (ids.size > 0) return [...ids];
      lastErr = 'Campaign page loaded but no character links were found';
    } catch (err) {
      lastErr = safeError(err);
    }
  }
  throw new Error(lastErr);
}

function unwrapCharacterPayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (body.id != null && body.name != null) return body;
  const data = body.data;
  if (data && typeof data === 'object') {
    if (data.id != null && data.name != null) return data;
    for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
      const nested = data[key];
      if (nested && typeof nested === 'object' && nested.id != null && nested.name != null) return nested;
    }
  }
  return null;
}

async function fetchCharacterById(characterId, cookieHeader) {
  const refs = [
    `https://www.dndbeyond.com/character/${characterId}/json`,
    `https://www.dndbeyond.com/characters/${characterId}/json`,
    `https://character-service.dndbeyond.com/character/v5/character/${characterId}`,
    `https://character-service.dndbeyond.com/character/v4/character/${characterId}`,
  ];
  let lastErr = 'Character fetch failed';
  for (const url of refs) {
    try {
      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: requestHeaders(cookieHeader, `https://www.dndbeyond.com/characters/${characterId}`),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = asHttpErrorMessage(res.status, text);
        continue;
      }
      const body = JSON.parse(text);
      const unwrapped = unwrapCharacterPayload(body);
      if (unwrapped) return unwrapped;
      lastErr = 'Character response shape not recognized';
    } catch (err) {
      lastErr = safeError(err);
    }
  }
  throw new Error(`Character ${characterId}: ${lastErr}`);
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

async function uploadCharacters(config, characters) {
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

  const cookieHeader = await buildCookieHeader();
  if (!cookieHeader) throw new Error('No dndbeyond.com cookies found. Sign in first.');

  const ids = await fetchCampaignCharacterIds(campaignParsed.id, cookieHeader);
  if (ids.length < 1) throw new Error('Campaign returned no character IDs.');

  const fetched = await fetchCharactersByIds(ids, cookieHeader);
  if (fetched.characters.length < 1) {
    throw new Error(fetched.errors[0] || 'No characters fetched from campaign.');
  }

  await uploadCharacters(config, fetched.characters);
  const nowIso = new Date().toISOString();
  const warnings = fetched.errors.length ? fetched.errors.slice(0, 2).join(' | ') : '';
  await setTelemetry({
    state: 'idle',
    consecutiveFailures: 0,
    lastSuccessAt: nowIso,
    lastError: warnings,
    lastCharacterCount: fetched.characters.length,
    campaignId: campaignParsed.id,
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
      await setTelemetry({
        state: 'error',
        consecutiveFailures: failures,
        lastError: safeError(err),
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
  const cfg = await loadConfig();
  const alarm = await chrome.alarms.get(ALARM_NAME);
  return {
    backend: BACKEND_URL,
    campaignInput: cfg.campaignInput,
    campaignId: cfg.campaignId,
    apiKeyConfigured: cfg.apiKey.length > 0,
    pollingEnabled: cfg.pollingEnabled,
    pollIntervalMs: cfg.pollIntervalMs,
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

  await saveConfigPatch({
    [STORAGE_KEYS.apiKey]: apiKey,
    [STORAGE_KEYS.campaignInput]: campaignInput,
    [STORAGE_KEYS.campaignId]: parsed.id,
    [STORAGE_KEYS.pollIntervalMs]: pollIntervalMs,
    [STORAGE_KEYS.pollingEnabled]: pollingEnabled,
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
    if (type === 'refresh-now') return runGuardedPoll('manual');
    throw new Error('Unknown message.');
  })()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: safeError(err) }));
  return true;
});
