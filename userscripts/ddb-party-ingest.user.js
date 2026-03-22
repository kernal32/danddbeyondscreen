// Match www + apex via @match; @include regex covers deep paths, query, and hash (Tampermonkey).
// Cobalt/Bearer: @require vendors~characterTools (TeaWithLucas/ootz0rz). Update bundle filename if DDB redeploys.
// ==UserScript==
// @name         DDB → DM Screen party ingest (template)
// @namespace    https://github.com/your-org/ddb-dm-screen
// @version      0.7.0
// @description  POST party JSON to your DM Screen account (API key from Account page). Set BACKEND_URL + DND_API_KEY.
// @match        https://www.dndbeyond.com/*
// @match        https://www.dndbeyond.com/
// @match        https://dndbeyond.com/*
// @match        https://dndbeyond.com/
// @include      /^https:\/\/(www\.)?dndbeyond\.com(\/.*)?(\?.*)?(#.*)?$/
// @noframes
// @run-at       document-start
// @require      https://media.dndbeyond.com/character-tools/vendors~characterTools.bundle.dec3c041829e401e5940.min.js
// @connect      127.0.0.1
// @connect      localhost
// @connect      dnd.saltbushlabs.com
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  /** Only the top window — avoids hidden panels in iframes / embeds. */
  if (window.self !== window.top) {
    return;
  }

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  /** Keep in sync with `// @version` in the header (Tampermonkey update checks). */
  const INGEST_SCRIPT_VERSION = '0.7.0';

  /** How often to run pull→push when auto-sync is on (ms). */
  const AUTO_SYNC_EVERY_MS = 180000;
  /** `localStorage` key: set to `'1'` to remember auto-sync across reloads. */
  const AUTO_SYNC_STORAGE_KEY = 'ddbIngestAutoSync';

  const CHARS_KEY = '__ddbDmScreenIngestChars';
  const HOOK_KEY = '__ddbDmScreenIngestHooked';

  /** Origin of the DM Screen app (same as in the browser address bar), no trailing slash. */
  const BACKEND_URL = 'https://dnd.saltbushlabs.com';
  /** Account API key from DM Screen → Account → Generate API key (starts with dnd_). */
  const DND_API_KEY = 'PASTE_DND_API_KEY_HERE';

  /** Max characters of response body shown in the panel (avoid huge DOM). */
  const MAX_BODY_PREVIEW = 2400;

  /**
   * Verbose diagnostics: set `true` here, or on dndbeyond.com run:
   *   localStorage.setItem('ddbIngestDebug','1'); location.reload()
   * Then F12 → Console → `__ddbPartyIngestDebug.snapshot()` (see README).
   */
  const DEBUG_INGEST = false;

  /** Tampermonkey sandbox `window` — jsonpDDBCT + our auth bootstrap live here (see @require bundle). */
  const SW = window;

  /**
   * Legacy JSON matches backend `DDB_BASE_URL` default — usually **full** sheet (avatarUrl, inventory, …).
   * Character-service v5/v4 is slimmer on some accounts; try legacy **first** on Pull.
   */
  const LEGACY_CHAR_JSON = 'https://www.dndbeyond.com/character/';
  const LEGACY_CHAR_JSON_PLURAL = 'https://www.dndbeyond.com/characters/';
  /** Last successful Pull source per id (for snapshot debugging). */
  const LAST_PULL_META_KEY = '__ddbIngestLastPullMeta';
  /** Same bases as community DM screens (v5 = ootz0rz; v4 = TeaWithLucas). */
  const V5_CHAR_BASE = 'https://character-service.dndbeyond.com/character/v5/character/';
  const V4_CHAR_BASE = 'https://character-service.dndbeyond.com/character/v4/character/';

  /** Webpack module id for ingest-only auth shim (must not collide with DDB chunk ids). */
  const INGEST_AUTH_MODULE_ID = 999080;

  let ddbAuthWebpackBootstrapped = false;

  function isDebugEnabled() {
    if (DEBUG_INGEST) return true;
    try {
      return W.localStorage && W.localStorage.getItem('ddbIngestDebug') === '1';
    } catch (_) {
      return false;
    }
  }

  /** Never log full Bearer/Cobalt values. */
  function maskAuthRecordForLog(h) {
    if (!h || typeof h !== 'object') return {};
    const out = {};
    for (const k of Object.keys(h)) {
      const v = String(h[k] == null ? '' : h[k]);
      if (/authorization|bearer|token|cookie|x-auth|csrf/i.test(k)) {
        out[k] = v.length <= 14 ? '(short)' : v.slice(0, 8) + '… len=' + v.length;
      } else {
        out[k] = v.length > 60 ? v.slice(0, 40) + '… len=' + v.length : v;
      }
    }
    return out;
  }

  function debugLog(message) {
    if (!isDebugEnabled()) return;
    log('info', '[debug] ' + message);
  }

  /** Host node on the real page; panel lives in shadow DOM (page CSS cannot hide it). */
  let hostEl = null;
  let logEl = null;
  let panelCollapsed = false;
  let autoSyncIntervalId = null;
  let autoSyncRunning = false;
  let autoSyncCheckboxEl = null;

  /**
   * Same endpoints as community tools (e.g. DnDBeyond-Live-Campaign):
   * https://github.com/FaithLilley/DnDBeyond-Live-Campaign — charJSONurlBase + id
   */
  /** Campaign or character sheet — skip auto-sync elsewhere to avoid pushing a stale queue. */
  function isPartyIngestPage() {
    const p = String(W.location.pathname || '');
    return /\/campaigns\/\d+/i.test(p) || /\/characters\/\d+/i.test(p);
  }

  function isCharacterJsonUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return (
      /\/character\/\d+\/json(?:[?#]|$)/i.test(url) ||
      /character-service\.dndbeyond\.com\/character\/v5\/character\/\d+/i.test(url) ||
      /character-service\.dndbeyond\.com\/character\/v4\/character\/\d+/i.test(url) ||
      /character-service\.dndbeyond\.com\/api\/character\/\d+/i.test(url)
    );
  }

  function isHttpUrlString(s) {
    return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
  }

  /** Best portrait URL for ingest / DM screen (DDB uses several shapes). */
  function resolvedAvatarUrl(c) {
    if (!c || typeof c !== 'object') return '';
    const tryTop = ['avatarUrl', 'portraitUrl', 'thumbnailUrl', 'imageUrl'];
    for (let i = 0; i < tryTop.length; i++) {
      const v = c[tryTop[i]];
      if (isHttpUrlString(v)) return v.trim();
    }
    const db = c.defaultBackdrop;
    if (db && typeof db === 'object') {
      const tryBd = [
        'thumbnailBackdropAvatarUrl',
        'backdropAvatarUrl',
        'largeBackdropAvatarUrl',
        'smallBackdropAvatarUrl',
      ];
      for (let j = 0; j < tryBd.length; j++) {
        const v = db[tryBd[j]];
        if (isHttpUrlString(v)) return v.trim();
      }
    }
    return '';
  }

  /** Copy + set `avatarUrl` from any known DDB portrait field (nested backdrops, etc.). */
  function enrichCharacterForIngest(raw) {
    const c = Object.assign({}, raw);
    const url = resolvedAvatarUrl(raw);
    if (url) c.avatarUrl = url;
    return c;
  }

  /**
   * Character-service v5 often returns `{ success: true, data: { id, name, ... } }` **or**
   * the same with a **nested** full sheet under `data.character` (avatar lives there only).
   * Prefer nested sheet first so we do not keep a slim campaign summary as the character.
   * Legacy www `/character/{id}/json` is usually a bare object.
   */
  function unwrapCharacterPayload(j) {
    if (!j || typeof j !== 'object') return null;
    function innerFromData(d) {
      if (!d || typeof d !== 'object') return null;
      for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
        const nested = d[key];
        if (nested && typeof nested === 'object' && nested.id != null && nested.name != null) {
          return nested;
        }
      }
      if (d.id != null && d.name != null) return d;
      return null;
    }
    if (j.success === true && j.data && typeof j.data === 'object') {
      const inner = innerFromData(j.data);
      if (inner) return inner;
    }
    if (j.data && typeof j.data === 'object') {
      const inner = innerFromData(j.data);
      if (inner) return inner;
    }
    if (j.id != null && j.name != null) return j;
    return null;
  }

  /** Merge incoming capture into existing queue row so slim API responses cannot wipe `avatarUrl` / full sheet. */
  function mergeCapturedCharacter(existing, incoming) {
    if (!existing || typeof existing !== 'object') return incoming;
    if (!incoming || typeof incoming !== 'object') return existing;
    const merged = Object.assign({}, existing, incoming);
    const url = resolvedAvatarUrl(merged);
    if (url) merged.avatarUrl = url;
    else {
      const incA = typeof incoming.avatarUrl === 'string' ? incoming.avatarUrl.trim() : '';
      const exA = typeof existing.avatarUrl === 'string' ? existing.avatarUrl.trim() : '';
      if (!incA && exA) merged.avatarUrl = existing.avatarUrl;
    }
    return merged;
  }

  function upsertCharacterJson(j) {
    const raw = unwrapCharacterPayload(j);
    if (!raw || raw.id == null || raw.name == null) return;
    const char = enrichCharacterForIngest(raw);
    const id = Number(char.id);
    if (!Number.isFinite(id)) return;
    if (!W[CHARS_KEY]) W[CHARS_KEY] = [];
    const arr = W[CHARS_KEY];
    const ix = arr.findIndex((c) => Number(c && c.id) === id);
    if (ix >= 0) arr[ix] = mergeCapturedCharacter(arr[ix], char);
    else arr.push(char);
    try {
      W.dispatchEvent(new CustomEvent('ddb-dm-screen-ingest-captured', { detail: { id, count: arr.length } }));
    } catch (_) {}
  }

  /**
   * Discover numeric character IDs from the current page (campaign party or /characters/{id}).
   * Same approach as community GM screen scripts that scrape campaign cards.
   * @see https://github.com/ootz0rz/DNDBeyond-DM-Screen
   */
  function collectCharacterIdsFromDom() {
    const ids = new Set();
    const path = String(W.location.pathname || '');
    const single = path.match(/\/characters\/(\d+)/i);
    if (single) ids.add(Number(single[1]));

    /** TeaWithLucas / ootz0rz: campaign cards use these classes. */
    const cardSelectors = [
      '.ddb-campaigns-character-card-footer-links-item-view',
      '.ddb-campaigns-character-card-footer-links-item-edit',
    ];
    cardSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const href = el.href || el.getAttribute('href') || '';
        const m = href.match(/\/characters\/(\d+)/i);
        if (m) ids.add(Number(m[1]));
      });
    });

    const listing =
      document.querySelector('.ddb-campaigns-detail-body-listing-active') ||
      document.querySelector('.ddb-campaigns-detail-body-listings') ||
      document.querySelector('#site-main');
    if (listing) {
      listing.querySelectorAll('a[href*="/characters/"]').forEach((a) => {
        const href = a.href || a.getAttribute('href') || '';
        const m = href.match(/\/characters\/(\d+)/i);
        if (m) ids.add(Number(m[1]));
      });
    }

    return Array.from(ids).filter((n) => Number.isFinite(n) && n > 0);
  }

  /**
   * Exposed on the **page** `window` for DevTools (Console context = top frame).
   * Do not paste secrets into chats; snapshot uses masked headers only.
   */
  function installPageDebugApi() {
    W.__ddbPartyIngestDebug = {
      version: INGEST_SCRIPT_VERSION,
      help:
        'Auto-sync: panel checkbox or localStorage ddbIngestAutoSync=1. Verbose: localStorage.setItem("ddbIngestDebug","1"); reload — then snapshot(). ' +
        'Turn off debug: localStorage.removeItem("ddbIngestDebug"); reload',
      enableVerbose() {
        try {
          W.localStorage.setItem('ddbIngestDebug', '1');
        } catch (e) {
          console.error('[ddb-party-ingest]', e);
        }
        console.info('[ddb-party-ingest] Reload the tab to enable verbose panel logging.');
      },
      disableVerbose() {
        try {
          W.localStorage.removeItem('ddbIngestDebug');
        } catch (_) {}
        console.info('[ddb-party-ingest] Reload the tab to disable verbose logging.');
      },
      getQueue() {
        return Array.isArray(W[CHARS_KEY]) ? W[CHARS_KEY].slice() : [];
      },
      async snapshot() {
        const scrapedIds = collectCharacterIdsFromDom();
        let cobaltKeys = [];
        let cobaltMasked = {};
        let authError = null;
        try {
          const h = await resolveDdbAuthHeaders();
          cobaltKeys = Object.keys(h || {});
          cobaltMasked = maskAuthRecordForLog(h);
        } catch (e) {
          authError = e && e.message ? e.message : String(e);
        }
        let jsonpLen = 0;
        try {
          jsonpLen = SW.jsonpDDBCT && SW.jsonpDDBCT.length ? SW.jsonpDDBCT.length : 0;
        } catch (_) {}
        const q = Array.isArray(W[CHARS_KEY]) ? W[CHARS_KEY] : [];
        /** Per character: confirms DDB JSON `avatarUrl` survived unwrap + queue (no secrets). */
        const queueSummary = q.map((c) => {
          const url = resolvedAvatarUrl(c);
          const id = c && c.id != null ? Number(c.id) : NaN;
          const name = c && c.name != null ? String(c.name) : '';
          return {
            id: Number.isFinite(id) ? id : null,
            name: name.slice(0, 48),
            hasAvatarUrl: url.length > 0,
            avatarUrlPreview:
              url.length === 0
                ? ''
                : url.length <= 100
                  ? url
                  : url.slice(0, 100) + '…',
          };
        });
        /** Why no portrait? Compare `topLevelKeys` (~full sheet 80+) vs slim (~20). */
        const queueCharacterShape = q.map((c) => {
          const id = c && c.id != null ? Number(c.id) : NaN;
          const keys = c && typeof c === 'object' ? Object.keys(c).length : 0;
          const av = c && typeof c.avatarUrl === 'string' ? c.avatarUrl.length : 0;
          return {
            id: Number.isFinite(id) ? id : null,
            topLevelKeys: keys,
            hasInventoryArray: !!(c && Array.isArray(c.inventory)),
            avatarUrlFieldChars: av,
            resolvedPortraitChars: resolvedAvatarUrl(c).length,
          };
        });
        let lastPullByCharacterId = {};
        try {
          lastPullByCharacterId = W[LAST_PULL_META_KEY] && typeof W[LAST_PULL_META_KEY] === 'object' ? W[LAST_PULL_META_KEY] : {};
        } catch (_) {}
        const o = {
          pageUrl: W.location.href,
          scrapedCharacterIds: scrapedIds,
          queueLength: capturedCount(),
          queueSummary,
          queueCharacterShape,
          lastPullByCharacterId,
          autoSyncActive: autoSyncIntervalId != null,
          autoSyncIntervalMs: AUTO_SYNC_EVERY_MS,
          hookInstalled: !!W[HOOK_KEY],
          sandboxJsonpDDBCTLength: jsonpLen,
          hasWebpackAuthShim: !!(SW.__ddbDmScreenIngestAuth && typeof SW.__ddbDmScreenIngestAuth.getAuthHeaders === 'function'),
          cobaltHeaderKeys: cobaltKeys,
          cobaltHeadersMasked: cobaltMasked,
          resolveAuthError: authError,
          backendUrl: BACKEND_URL,
          apiKeyLooksConfigured: !!(
            DND_API_KEY &&
            DND_API_KEY !== 'PASTE_DND_API_KEY_HERE' &&
            DND_API_KEY.startsWith('dnd_')
          ),
          debugVerbose: isDebugEnabled(),
        };
        return o;
      },
    };
  }

  /**
   * Replay DDB’s webpack jsonp queue, register a tiny module that calls makeGetAuthorizationHeaders (module 710).
   * Adapted from https://github.com/TeaWithLucas/DNDBeyond-DM-Screen / ootz0rz loaders.
   */
  function bootstrapDdbAuthFromWebpack() {
    if (ddbAuthWebpackBootstrapped) return;
    ddbAuthWebpackBootstrapped = true;

    const modules = {};
    modules[INGEST_AUTH_MODULE_ID] = function (module, exports, __webpack_require__) {
      var dist = __webpack_require__(710);
      var dist_default = __webpack_require__.n(dist);
      SW.__ddbDmScreenIngestAuth = {
        getAuthHeaders: function () {
          return dist_default.a.makeGetAuthorizationHeaders({});
        },
      };
    };

    function webpackJsonpCallback(data) {
      var chunkIds = data[0];
      var moreModules = data[1];
      var executeModules = data[2];
      var moduleId;
      var chunkId;
      var i = 0;
      var resolves = [];
      for (; i < chunkIds.length; i++) {
        chunkId = chunkIds[i];
        if (Object.prototype.hasOwnProperty.call(installedChunks, chunkId) && installedChunks[chunkId]) {
          resolves.push(installedChunks[chunkId][0]);
        }
        installedChunks[chunkId] = 0;
      }
      for (moduleId in moreModules) {
        if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
          modules[moduleId] = moreModules[moduleId];
        }
      }
      if (parentJsonpFunction) parentJsonpFunction(data);
      while (resolves.length) {
        resolves.shift()();
      }
      deferredModules.push.apply(deferredModules, executeModules || []);
      return checkDeferredModules();
    }

    function checkDeferredModules() {
      var result;
      for (var i = 0; i < deferredModules.length; i++) {
        var deferredModule = deferredModules[i];
        var fulfilled = true;
        for (var j = 1; j < deferredModule.length; j++) {
          var depId = deferredModule[j];
          if (installedChunks[depId] !== 0) fulfilled = false;
        }
        if (fulfilled) {
          deferredModules.splice(i--, 1);
          result = __webpack_require__((__webpack_require__.s = deferredModule[0]));
        }
      }
      return result;
    }

    var installedModules = {};
    var installedChunks = { 0: 0 };
    var deferredModules = [];

    function __webpack_require__(moduleId) {
      if (installedModules[moduleId]) {
        return installedModules[moduleId].exports;
      }
      var module = (installedModules[moduleId] = {
        i: moduleId,
        l: false,
        exports: {},
      });
      if (!modules[moduleId]) {
        throw new Error('webpack missing module ' + moduleId + ' — update @require vendors~characterTools URL');
      }
      modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
      module.l = true;
      return module.exports;
    }

    __webpack_require__.m = modules;
    __webpack_require__.c = installedModules;
    __webpack_require__.d = function (exports, name, getter) {
      if (!__webpack_require__.o(exports, name)) {
        Object.defineProperty(exports, name, { enumerable: true, get: getter });
      }
    };
    __webpack_require__.r = function (exports) {
      if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
        Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
      }
      Object.defineProperty(exports, '__esModule', { value: true });
    };
    __webpack_require__.t = function (value, mode) {
      if (mode & 1) value = __webpack_require__(value);
      if (mode & 8) return value;
      if (mode & 4 && typeof value === 'object' && value && value.__esModule) return value;
      var ns = Object.create(null);
      __webpack_require__.r(ns);
      Object.defineProperty(ns, 'default', { enumerable: true, value: value });
      if (mode & 2 && typeof value != 'string') {
        for (var key in value) {
          __webpack_require__.d(
            ns,
            key,
            function (k) {
              return value[k];
            }.bind(null, key),
          );
        }
      }
      return ns;
    };
    __webpack_require__.n = function (module) {
      var getter =
        module && module.__esModule
          ? function getDefault() {
              return module.default;
            }
          : function getModuleExports() {
              return module;
            };
      __webpack_require__.d(getter, 'a', getter);
      return getter;
    };
    __webpack_require__.o = function (object, property) {
      return Object.prototype.hasOwnProperty.call(object, property);
    };
    __webpack_require__.p = '';

    var jsonpArray = (SW.jsonpDDBCT = SW.jsonpDDBCT || []);
    debugLog(
      'webpack bootstrap: sandbox jsonpDDBCT length before replay=' +
        (jsonpArray && jsonpArray.length ? jsonpArray.length : 0),
    );
    var oldJsonpFunction = jsonpArray.push.bind(jsonpArray);
    jsonpArray.push2 = webpackJsonpCallback;
    jsonpArray = jsonpArray.slice();
    for (var ri = 0; ri < jsonpArray.length; ri++) webpackJsonpCallback(jsonpArray[ri]);
    var parentJsonpFunction = oldJsonpFunction;

    deferredModules.push([INGEST_AUTH_MODULE_ID, 2]);
    checkDeferredModules();
    debugLog(
      'after auth shim: has __ddbDmScreenIngestAuth=' +
        !!(SW.__ddbDmScreenIngestAuth && typeof SW.__ddbDmScreenIngestAuth.getAuthHeaders === 'function'),
    );
  }

  function mergeAuthIntoHeaders(authRecord) {
    const h = new Headers();
    h.set('Accept', 'application/json');
    /** Matches backend `DndBeyondService` — some legacy `/character/{id}/json` paths expect this. */
    h.set('Content-Type', 'text/json');
    if (authRecord && typeof authRecord === 'object') {
      for (const k of Object.keys(authRecord)) {
        const v = authRecord[k];
        if (v != null && String(v).length > 0) {
          h.set(k, String(v));
        }
      }
    }
    return h;
  }

  async function resolveDdbAuthHeaders() {
    try {
      bootstrapDdbAuthFromWebpack();
      const auth = SW.__ddbDmScreenIngestAuth;
      if (!auth || typeof auth.getAuthHeaders !== 'function') {
        debugLog('resolveDdbAuthHeaders: no getAuthHeaders (webpack shim missing — wrong @require bundle hash?)');
        return {};
      }
      const headers = await auth.getAuthHeaders()();
      const h = headers && typeof headers === 'object' ? headers : {};
      debugLog('Cobalt headers keys: ' + Object.keys(h).join(', ') + ' — values: ' + JSON.stringify(maskAuthRecordForLog(h)));
      return h;
    } catch (e) {
      log('warn', 'Cobalt auth bootstrap failed: ' + (e && e.message ? e.message : e));
      debugLog((e && e.stack) || '');
      return {};
    }
  }

  /**
   * GET character JSON: legacy `/character/{id}/json` first (full sheet + portraits), then v5 / v4.
   */
  async function fetchCharacterEnvelope(charId, authHeaders) {
    const hdrs = mergeAuthIntoHeaders(authHeaders);
    /** Same as backend `DndBeyondService.requestHeaders` — legacy `/character/{id}/json` often checks Referer. */
    hdrs.set('Referer', 'https://www.dndbeyond.com/characters/' + charId + '/');
    let lastMsg = '';
    const tryUrls = [
      LEGACY_CHAR_JSON + charId + '/json',
      LEGACY_CHAR_JSON_PLURAL + charId + '/json',
      V5_CHAR_BASE + charId,
      V4_CHAR_BASE + charId,
    ];
    for (let u = 0; u < tryUrls.length; u++) {
      const url = tryUrls[u];
      try {
        const r = await W.fetch(url, { credentials: 'include', headers: hdrs });
        const text = await r.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          lastMsg = 'non-JSON (HTTP ' + r.status + ')';
          debugLog('GET id=' + charId + ' ' + url + ' → ' + lastMsg + ' preview=' + truncate(text, 280));
          continue;
        }
        if (!r.ok) {
          const msg =
            parsed && typeof parsed === 'object' && parsed.message != null ? String(parsed.message) : truncate(text, 160);
          lastMsg = 'HTTP ' + r.status + (msg ? ': ' + msg : '');
          debugLog('GET id=' + charId + ' ' + url + ' → ' + lastMsg + ' bodyKeys=' + (parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 8).join(',') : '?'));
          continue;
        }
        if (unwrapCharacterPayload(parsed)) {
          debugLog('GET id=' + charId + ' OK via ' + url + ' (recognized character JSON)');
          try {
            if (!W[LAST_PULL_META_KEY]) W[LAST_PULL_META_KEY] = {};
            let source = 'unknown';
            if (url.indexOf('character-service.dndbeyond.com') !== -1) {
              if (url.indexOf('/v5/') !== -1) source = 'v5';
              else if (url.indexOf('/v4/') !== -1) source = 'v4';
            } else if (url.indexOf('/characters/') !== -1 && url.indexOf('/json') !== -1) {
              source = 'legacy-plural';
            } else if (url.indexOf('/character/') !== -1 && url.indexOf('/json') !== -1) {
              source = 'legacy';
            }
            W[LAST_PULL_META_KEY][String(charId)] = { source: source, path: url.replace(/^https:\/\/[^/]+/, '') };
          } catch (_) {}
          return parsed;
        }
        lastMsg = 'OK but JSON shape not recognized';
        debugLog('GET id=' + charId + ' ' + url + ' → ' + lastMsg + ' topKeys=' + Object.keys(parsed).slice(0, 12).join(','));
      } catch (e) {
        lastMsg = e && e.message ? e.message : String(e);
        debugLog('GET id=' + charId + ' ' + url + ' → exception ' + lastMsg);
      }
    }
    throw new Error(lastMsg || 'request failed');
  }

  /**
   * Pull party JSON into the queue. Resolves when all fetches settle.
   * @returns {{ added: number, total: number, skipped: boolean }}
   */
  async function pullPartyFromDdbPageAsync() {
    ensurePanel();
    if (typeof W.fetch !== 'function') {
      log('err', 'window.fetch is not available.');
      return { added: 0, total: 0, skipped: true };
    }
    const ids = collectCharacterIdsFromDom();
    debugLog('scraped IDs: ' + (ids.length ? ids.join(', ') : '(none)'));
    if (ids.length === 0) {
      log(
        'warn',
        'No character links found. Open a campaign → Characters (active party) or a character sheet, wait for the page to finish loading, then click Pull from page again.',
      );
      log('info', 'Tip: enable debug (see script header), reload, run __ddbPartyIngestDebug.snapshot() in the page console.');
      return { added: 0, total: 0, skipped: true };
    }
    log('info', 'Pull: resolving Cobalt headers + fetching ' + ids.length + ' sheet(s) (legacy /character/{id}/json, then v5/v4)…');
    const authHeaders = await resolveDdbAuthHeaders();
    if (Object.keys(authHeaders).length < 1) {
      log('warn', 'No Cobalt headers from bundle — trying cookies only. If all IDs fail with 401, update @require URL in script header.');
    } else {
      log('info', 'Cobalt headers OK (' + Object.keys(authHeaders).length + ' key(s)).');
    }
    const settled = await Promise.allSettled(ids.map((charId) => fetchCharacterEnvelope(charId, authHeaders)));
    let added = 0;
    settled.forEach((res, i) => {
      const charId = ids[i];
      if (res.status !== 'fulfilled') {
        const reason = res.reason;
        log('warn', 'ID ' + charId + ': ' + (reason && reason.message ? reason.message : String(reason)));
        return;
      }
      const j = res.value;
      if (unwrapCharacterPayload(j)) {
        upsertCharacterJson(j);
        added++;
      } else {
        const keys = j && typeof j === 'object' ? Object.keys(j).slice(0, 14).join(', ') : '?';
        log('warn', 'ID ' + charId + ': unrecognized JSON (top keys: ' + keys + ')');
      }
    });
    log('ok', 'Pull finished. Stored ' + added + '/' + ids.length + '. Queue=' + capturedCount() + ' → Push now.');
    return { added, total: ids.length, skipped: false };
  }

  function pullPartyFromDdbPage() {
    void pullPartyFromDdbPageAsync();
  }

  /** Install early so we see fetches while the SPA loads (document-start). */
  function installNetworkCapture() {
    if (W[HOOK_KEY]) return;
    W[HOOK_KEY] = true;
    if (!W[CHARS_KEY]) W[CHARS_KEY] = [];

    if (typeof W.fetch === 'function') {
      const origFetch = W.fetch.bind(W);
      W.fetch = function (input, init) {
        const p = origFetch(input, init);
        return p.then((res) => {
          try {
            const url = typeof input === 'string' ? input : input && input.url;
            if (url && isCharacterJsonUrl(String(url))) {
              if (isDebugEnabled()) {
                console.info('[ddb-party-ingest] [debug] hook saw fetch:', String(url), 'status', res && res.status);
              }
              if (res && res.clone) {
                res
                  .clone()
                  .json()
                  .then((j) => upsertCharacterJson(j))
                  .catch(() => {});
              }
            }
          } catch (_) {}
          return res;
        });
      };
    }

    const NativeXHR = W.XMLHttpRequest;
    if (NativeXHR && NativeXHR.prototype) {
      const origOpen = NativeXHR.prototype.open;
      const origSend = NativeXHR.prototype.send;
      NativeXHR.prototype.open = function (method, url, ...rest) {
        this.__ddbIngestUrl = url;
        return origOpen.call(this, method, url, ...rest);
      };
      NativeXHR.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            const url = this.__ddbIngestUrl;
            if (!url || !isCharacterJsonUrl(String(url)) || !this.responseText) return;
            const j = JSON.parse(this.responseText);
            upsertCharacterJson(j);
          } catch (_) {}
        });
        return origSend.apply(this, args);
      };
    }
  }

  installNetworkCapture();
  installPageDebugApi();

  W.addEventListener('ddb-dm-screen-ingest-captured', function (e) {
    const d = e && e.detail;
    if (!d) return;
    log('info', 'Captured character id=' + d.id + ' (queue size ' + d.count + '). Push when ready.');
  });

  function ensurePanel() {
    if (!document.body) {
      return false;
    }
    if (hostEl && document.body.contains(hostEl)) {
      return true;
    }

    hostEl = document.createElement('div');
    hostEl.id = 'ddb-dm-screen-ingest-host';
    Object.assign(hostEl.style, {
      all: 'initial',
      position: 'fixed',
      bottom: '12px',
      right: '12px',
      zIndex: '2147483647',
      pointerEvents: 'auto',
    });

    const shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      .panel {
        width: min(420px, calc(100vw - 24px));
        max-height: min(45vh, 360px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font: 12px/1.4 ui-monospace, Consolas, monospace;
        color: #e2e8f0;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid #334155;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 10px;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        cursor: pointer;
        user-select: none;
      }
      .title { font-weight: 600; color: #38bdf8; }
      .hint { opacity: 0.7; font-size: 11px; }
      .auto-row {
        padding: 6px 10px;
        border-bottom: 1px solid #334155;
        font-size: 11px;
        color: #cbd5e1;
      }
      .auto-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
      }
      .auto-label input { cursor: pointer; }
      .actions {
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        border-bottom: 1px solid #334155;
        flex-wrap: wrap;
      }
      button {
        cursor: pointer;
        border: 1px solid #475569;
        background: #1e293b;
        color: #e2e8f0;
        border-radius: 4px;
        padding: 4px 8px;
        font: inherit;
      }
      .log {
        margin: 0;
        padding: 10px;
        overflow: auto;
        flex: 1;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 280px;
      }
      .line { margin-bottom: 6px; padding-left: 8px; border-left: 3px solid #94a3b8; }
      .line.ok { border-left-color: #4ade80; }
      .line.warn { border-left-color: #fbbf24; }
      .line.err { border-left-color: #f87171; }
    `;

    const panel = document.createElement('div');
    panel.className = 'panel';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = '<span class="title">DM Screen ingest</span><span class="hint">click bar to collapse log</span>';
    header.addEventListener('click', () => {
      panelCollapsed = !panelCollapsed;
      if (logEl) logEl.style.display = panelCollapsed ? 'none' : 'block';
    });

    const autoRow = document.createElement('div');
    autoRow.className = 'auto-row';
    const autoLabel = document.createElement('label');
    autoLabel.className = 'auto-label';
    const autoCb = document.createElement('input');
    autoCb.type = 'checkbox';
    autoSyncCheckboxEl = autoCb;
    try {
      autoCb.checked = W.localStorage.getItem(AUTO_SYNC_STORAGE_KEY) === '1';
    } catch (_) {
      autoCb.checked = false;
    }
    autoCb.addEventListener('change', toggleAutoSyncFromCheckbox);
    autoLabel.appendChild(autoCb);
    autoLabel.appendChild(
      document.createTextNode(
        ' Auto pull→push (every ' + Math.round(AUTO_SYNC_EVERY_MS / 60000) + ' min on campaign/character pages)',
      ),
    );
    autoRow.appendChild(autoLabel);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const mkBtn = (label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    actions.appendChild(
      mkBtn('Clear log', () => {
        if (logEl) logEl.textContent = '';
      }),
    );
    actions.appendChild(
      mkBtn('Clear queue', () => {
        W[CHARS_KEY] = [];
        log('info', 'Cleared captured character queue.');
      }),
    );
    actions.appendChild(
      mkBtn('Pull from page', () => {
        pullPartyFromDdbPage();
      }),
    );
    actions.appendChild(
      mkBtn('Push now', () => {
        pushParty();
      }),
    );
    actions.appendChild(
      mkBtn('Debug snapshot', () => {
        void W.__ddbPartyIngestDebug.snapshot().then((o) => {
          console.log('[ddb-party-ingest] snapshot', o);
          log('info', 'Printed __ddbPartyIngestDebug.snapshot() to browser console (F12).');
        });
      }),
    );

    logEl = document.createElement('div');
    logEl.className = 'log';

    panel.appendChild(header);
    panel.appendChild(autoRow);
    panel.appendChild(actions);
    panel.appendChild(logEl);
    shadow.appendChild(style);
    shadow.appendChild(panel);
    document.body.appendChild(hostEl);
    if (autoSyncCheckboxEl && autoSyncCheckboxEl.checked && autoSyncIntervalId == null) {
      startAutoSync();
    }
    return true;
  }

  function ts() {
    const d = new Date();
    return d.toTimeString().slice(0, 8);
  }

  function log(level, message) {
    const toConsole = level === 'err' ? console.error : level === 'warn' ? console.warn : console.info;
    toConsole.call(console, '[ddb-party-ingest]', message);

    if (!ensurePanel() || !logEl) {
      return;
    }
    const line = document.createElement('div');
    line.className = 'line' + (level === 'ok' ? ' ok' : level === 'warn' ? ' warn' : level === 'err' ? ' err' : '');
    line.textContent = '[' + ts() + '] ' + message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function truncate(s, n) {
    if (s == null) return '';
    const t = String(s);
    return t.length <= n ? t : t.slice(0, n) + '\n… (' + t.length + ' chars total)';
  }

  function capturedCount() {
    const arr = W[CHARS_KEY];
    return Array.isArray(arr) ? arr.length : 0;
  }

  /**
   * Uses JSON from automatic fetch/XHR capture and/or **Pull** (character-service v5/v4 + Cobalt headers).
   */
  function buildPayload() {
    const chars = Array.isArray(W[CHARS_KEY]) ? W[CHARS_KEY].slice() : [];
    return {
      format: 'ddb_characters',
      characters: chars,
    };
  }

  function pushParty() {
    void pushPartyAsync();
  }

  /** @returns {Promise<{ ok: boolean; status: number }>} */
  function pushPartyAsync() {
    if (!ensurePanel()) {
      console.warn('[ddb-party-ingest] No document.body yet — reload the tab or open from Tampermonkey menu after the page loads.');
    }

    const keyOk =
      DND_API_KEY &&
      DND_API_KEY !== 'PASTE_DND_API_KEY_HERE' &&
      DND_API_KEY.startsWith('dnd_');
    if (!keyOk) {
      log('err', 'Set DND_API_KEY in the script (full dnd_… key from Account → Generate).');
      return Promise.resolve({ ok: false, status: 0 });
    }

    const body = buildPayload();
    const base = BACKEND_URL.replace(/\/$/, '');
    const url = `${base}/api/ingest/party`;

    const nChar = Array.isArray(body.characters) ? body.characters.length : 0;
    if (nChar < 1 && body.format === 'ddb_characters') {
      log(
        'warn',
        'Queue empty — click Pull from page on a campaign or character sheet, or rely on automatic capture. See userscripts/README.',
      );
      return Promise.resolve({ ok: false, status: 0 });
    }

    const keyHint = DND_API_KEY.slice(0, 12) + '…';
    log('info', 'POST ' + url + '\nKey prefix: ' + keyHint + '\nPayload: format=' + (body.format || '?') + ', characters=' + nChar);

    const started = Date.now();
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + DND_API_KEY,
        },
        data: JSON.stringify(body),
        onload(res) {
          const ms = Date.now() - started;
          const preview = truncate(res.responseText, MAX_BODY_PREVIEW);
          const ok = res.status >= 200 && res.status < 300;
          if (ok) {
            let detail = '';
            try {
              const j = JSON.parse(res.responseText);
              if (j.storedCharacterCount != null) {
                detail =
                  '\nStored ' +
                  j.storedCharacterCount +
                  ' character(s) in account' +
                  (j.mergeMode ? ' · ingest mode: ' + j.mergeMode : '') +
                  (j.characterCount != null ? ' · this push: ' + j.characterCount : '');
              }
            } catch (_) {
              /* ignore */
            }
            log('ok', 'HTTP ' + res.status + ' in ' + ms + 'ms' + detail + '\n' + preview);
          } else {
            log(
              'warn',
              'HTTP ' +
                res.status +
                ' in ' +
                ms +
                'ms (not OK)\n' +
                preview +
                '\n— 401: bad API key · 413: nginx body too small (set client_max_body_size 32m; see DEPLOY.md) · 503: AUTH_SECRET off · 400: empty/invalid party',
            );
          }
          resolve({ ok: ok, status: res.status });
        },
        onerror(e) {
          log(
            'err',
            'Network / Tampermonkey error (CORS blocked? missing // @connect for host? wrong URL?)\n' + (e && e.error ? String(e.error) : JSON.stringify(e)),
          );
          resolve({ ok: false, status: 0 });
        },
        ontimeout() {
          log('err', 'Request timed out.');
          resolve({ ok: false, status: 0 });
        },
      });
    });
  }

  async function runAutoSyncCycle() {
    if (autoSyncRunning) return;
    if (!isPartyIngestPage()) {
      debugLog('auto-sync: skip (not campaign/character page)');
      return;
    }
    autoSyncRunning = true;
    try {
      log('info', 'Auto-sync: pull…');
      await pullPartyFromDdbPageAsync();
      if (capturedCount() < 1) {
        log('warn', 'Auto-sync: queue empty after pull — skipped push.');
        return;
      }
      log('info', 'Auto-sync: push…');
      await pushPartyAsync();
    } finally {
      autoSyncRunning = false;
    }
  }

  function clearAutoSyncTimer() {
    if (autoSyncIntervalId != null) {
      try {
        W.clearInterval(autoSyncIntervalId);
      } catch (_) {}
      autoSyncIntervalId = null;
    }
  }

  function stopAutoSync() {
    clearAutoSyncTimer();
    try {
      W.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, '0');
    } catch (_) {}
    if (autoSyncCheckboxEl) autoSyncCheckboxEl.checked = false;
    log('info', 'Auto-sync off.');
  }

  function startAutoSync() {
    clearAutoSyncTimer();
    try {
      W.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, '1');
    } catch (_) {}
    if (autoSyncCheckboxEl) autoSyncCheckboxEl.checked = true;
    log('info', 'Auto-sync on (every ' + Math.round(AUTO_SYNC_EVERY_MS / 1000) + 's on campaign/character pages).');
    void runAutoSyncCycle();
    autoSyncIntervalId = W.setInterval(() => {
      void runAutoSyncCycle();
    }, AUTO_SYNC_EVERY_MS);
  }

  function toggleAutoSyncFromCheckbox() {
    if (!autoSyncCheckboxEl) return;
    if (autoSyncCheckboxEl.checked) startAutoSync();
    else stopAutoSync();
  }

  function togglePanel() {
    if (!hostEl || !document.body.contains(hostEl)) {
      ensurePanel();
    }
    if (hostEl) {
      hostEl.style.display = hostEl.style.display === 'none' ? '' : 'none';
    }
  }

  GM_registerMenuCommand('DM Screen ingest: pull party from this DDB page', pullPartyFromDdbPage);
  GM_registerMenuCommand('Push party to DM Screen (account ingest)', pushParty);
  GM_registerMenuCommand('DM Screen ingest: toggle auto pull→push', () => {
    ensurePanel();
    if (autoSyncIntervalId != null) stopAutoSync();
    else startAutoSync();
  });
  GM_registerMenuCommand('DM Screen ingest: show / hide debug panel', togglePanel);
  GM_registerMenuCommand('DM Screen ingest: clear debug log', () => {
    ensurePanel();
    if (logEl) logEl.textContent = '';
  });
  GM_registerMenuCommand('DM Screen ingest: clear captured characters', () => {
    W[CHARS_KEY] = [];
    log('info', 'Captured character queue cleared.');
  });
  GM_registerMenuCommand('DM Screen ingest: print debug snapshot (browser console)', () => {
    ensurePanel();
    void W.__ddbPartyIngestDebug.snapshot().then((o) => {
      console.log('[ddb-party-ingest] snapshot', o);
      log('info', 'snapshot() logged to console. Verbose: localStorage ddbIngestDebug=1 + reload.');
    });
  });

  function boot() {
    try {
      if (!document.body) {
        setTimeout(boot, 100);
        return;
      }
      ensurePanel();
      log(
        'info',
        'v' +
          INGEST_SCRIPT_VERSION +
          ' — Console: __ddbPartyIngestDebug.snapshot() · verbose: localStorage ddbIngestDebug=1 + reload. Queue=' +
          capturedCount() +
          '.',
      );
    } catch (e) {
      console.error('[ddb-party-ingest] init failed', e);
    }
  }

  boot();
})();
