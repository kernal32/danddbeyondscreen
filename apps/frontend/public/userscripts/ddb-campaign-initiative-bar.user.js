// ==UserScript==
// @name         DDB Campaign — left initiative bar (local)
// @namespace    https://github.com/your-org/ddb-dm-screen
// @version      1.6.7
// @description  Fullscreen DM overlay on /campaigns/*: Start Combat / Next Round; sheet conditions + death saves from DDB/module JSON (legacy+v5 merge, modifiers); tracker conditions; Adv/Dis prompt; ▶ → next round when full reveal. Wiki: https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output — legacy+v5 merge → v4. Cobalt 999080.
// @match        https://www.dndbeyond.com/*
// @match        https://www.dndbeyond.com/
// @match        https://dndbeyond.com/*
// @match        https://dndbeyond.com/
// @include      /^https:\/\/(www\.)?dndbeyond\.com(\/.*)?(\?.*)?(#.*)?$/
// @noframes
// @run-at       document-idle
// @require      https://media.dndbeyond.com/character-tools/vendors~characterTools.bundle.dec3c041829e401e5940.min.js
// @connect      character-service.dndbeyond.com
// @connect      www.dndbeyond.com
// @connect      dndbeyond.com
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  if (window.self !== window.top) return;

  /** Page window — localStorage timers only (Tampermonkey isolated storage otherwise). */
  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  /** Sandbox window — jsonpDDBCT, moduleExport (TeaWithLucas), __ddbDmScreenIngestAuth. */
  const SW = window;

  const POLL_MS = 60000;
  const INIT_STORAGE_KEY = 'ddbCampaignInitBarInitiativeV1';
  /** Same id as ddb-party-ingest / ootz0rz — do not change arbitrarily. */
  const INGEST_AUTH_MODULE_ID = 999080;
  const LEGACY = 'https://www.dndbeyond.com/character/';
  const LEGACY_PLURAL = 'https://www.dndbeyond.com/characters/';
  const V4_CHAR_BASE = 'https://character-service.dndbeyond.com/character/v4/character/';
  const V5_CHAR_BASE = 'https://character-service.dndbeyond.com/character/v5/character/';

  let hostEl = null;
  let rosterEl = null;
  let rosterMo = null;
  let partyById = {};
  let pollTimer = null;
  let spaMoTimer = null;
  let lastDomIdKey = '';
  let lastRoutedCampaignPath = '';
  let navHooksInstalled = false;
  let ddbAuthWebpackBootstrapped = false;
  let localInitState = null;
  let initiativeUi = {
    meta: null,
    list: null,
    nextRoundBtn: null,
    confirmStartOverlay: null,
    condEditorOverlay: null,
    condEditorTitle: null,
    condEditorList: null,
    condEditorName: null,
    condEditorDur: null,
    rerollModeOverlay: null,
    rerollModeMsg: null,
    _rerollModeOnYes: null,
    _rerollModeOnNo: null,
  };
  let condEditorEntryId = null;
  let restoreFab = null;

  function removeRestoreFab() {
    if (restoreFab && restoreFab.parentNode) {
      try {
        restoreFab.parentNode.removeChild(restoreFab);
      } catch (_) {}
    }
    restoreFab = null;
  }

  function lockBodyScrollForOverlay() {
    try {
      PAGE.document.documentElement.style.overflow = 'hidden';
      PAGE.document.body.style.overflow = 'hidden';
    } catch (_) {}
  }

  function unlockBodyScrollForOverlay() {
    try {
      PAGE.document.documentElement.style.overflow = '';
      PAGE.document.body.style.overflow = '';
    } catch (_) {}
  }

  function hideDmOverlay() {
    if (hostEl) hostEl.style.display = 'none';
    unlockBodyScrollForOverlay();
    if (restoreFab) return;
    restoreFab = PAGE.document.createElement('button');
    restoreFab.type = 'button';
    restoreFab.textContent = 'DM combat view';
    Object.assign(restoreFab.style, {
      position: 'fixed',
      bottom: '18px',
      right: '18px',
      zIndex: '2147483646',
      padding: '12px 18px',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
      borderRadius: '10px',
      border: '2px solid #b91c1c',
      background: '#1c1917',
      color: '#fecaca',
      boxShadow: '0 8px 28px rgba(0,0,0,.55)',
    });
    restoreFab.addEventListener('click', function () {
      showDmOverlay();
    });
    PAGE.document.body.appendChild(restoreFab);
  }

  function showDmOverlay() {
    removeRestoreFab();
    if (hostEl) hostEl.style.display = '';
    lockBodyScrollForOverlay();
  }

  function unwrapCharacterPayload(j) {
    if (!j || typeof j !== 'object') return null;
    function innerFromData(d) {
      if (!d || typeof d !== 'object') return null;
      for (const key of ['character', 'characterSheet', 'sheet', 'characterData']) {
        const nested = d[key];
        if (nested && typeof nested === 'object' && nested.id != null && nested.name != null) return nested;
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

  /** Escape text for innerHTML fragments we build from sheet data. */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * `spellCasterInfo` from TeaWithLucas / character-tools module output (shape varies by bundle).
   * @see https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  function readSpellCasterInfoBundle(c) {
    if (!c || typeof c !== 'object') return null;
    const sci = c.spellCasterInfo;
    if (!sci || typeof sci !== 'object') return null;
    const dcRaw = sci.spellSaveDC ?? sci.spellSaveDc ?? sci.saveDc ?? sci.saveDC;
    const dc = Number(dcRaw);
    const atk = Number(
      sci.spellAttackBonus ?? sci.spellcastingAttackBonus ?? sci.attackBonus ?? sci.spellAttack ?? sci.toHit,
    );
    const mod = Number(
      sci.spellcastingAbilityModifier ?? sci.abilityModifier ?? sci.spellcastingModifier ?? sci.casterModifier,
    );
    const label = String(sci.className ?? sci.name ?? sci.class ?? '').trim();
    const out = { dc: null, attack: null, mod: null, label: label };
    if (Number.isFinite(dc) && dc >= 8 && dc <= 30) out.dc = Math.round(dc);
    if (Number.isFinite(atk) && atk >= -10 && atk <= 30) out.attack = Math.round(atk);
    if (Number.isFinite(mod) && mod >= -10 && mod <= 10) out.mod = Math.round(mod);
    if (out.dc != null || out.attack != null || out.mod != null || label) return out;
    return null;
  }

  function normalizePortraitUrl(s) {
    if (typeof s !== 'string') return '';
    const t = s.trim();
    if (!t || t.startsWith('data:')) return '';
    if (/^https?:\/\//i.test(t)) return t;
    if (/^\/\//.test(t)) return 'https:' + t;
    if (t.charAt(0) === '/') return 'https://www.dndbeyond.com' + t;
    return '';
  }

  /** Same idea as party ingest — v5 slim objects often keep the portrait only on nested `character`. */
  function resolvedAvatarUrl(c, depth) {
    if (!c || typeof c !== 'object') return '';
    const d = depth == null ? 0 : depth;
    if (d > 2) return '';
    const tryTop = ['avatarUrl', 'portraitUrl', 'thumbnailUrl', 'imageUrl'];
    for (let i = 0; i < tryTop.length; i++) {
      const v = c[tryTop[i]];
      const n = normalizePortraitUrl(typeof v === 'string' ? v : '');
      if (n) return n;
    }
    const db = c.defaultBackdrop;
    if (db && typeof db === 'object') {
      const keys = [
        'thumbnailBackdropAvatarUrl',
        'backdropAvatarUrl',
        'largeBackdropAvatarUrl',
        'smallBackdropAvatarUrl',
      ];
      for (let j = 0; j < keys.length; j++) {
        const n = normalizePortraitUrl(typeof db[keys[j]] === 'string' ? db[keys[j]] : '');
        if (n) return n;
      }
    }
    if (d === 0) {
      const nest = c.character || c.characterSheet || c.sheet;
      if (nest && typeof nest === 'object') {
        const sub = resolvedAvatarUrl(nest, d + 1);
        if (sub) return sub;
      }
    }
    return '';
  }

  /** Campaign cards already show the portrait — use when JSON has no URL (common with slim v5). */
  function scrapeCardPortraitUrl(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return '';
    try {
      const esc = id.replace(/[^0-9]/g, '');
      if (!esc) return '';
      function firstPortraitInCard(card) {
        if (!card) return '';
        const imgs = card.querySelectorAll('img[src]');
        for (let k = 0; k < imgs.length; k++) {
          const raw = imgs[k].getAttribute('src') || imgs[k].src || '';
          const abs = normalizePortraitUrl(raw);
          if (!abs || !/^https:\/\//i.test(abs)) continue;
          const low = abs.toLowerCase();
          if (low.indexOf('favicon') !== -1 || low.indexOf('sprite') !== -1) continue;
          return abs;
        }
        return '';
      }
      const specific = document.querySelectorAll(
        '.ddb-campaigns-character-card-footer-links-item-view[href*="/characters/' +
          esc +
          '"], .ddb-campaigns-character-card-footer-links-item-edit[href*="/characters/' +
          esc +
          '"]',
      );
      let i;
      for (i = 0; i < specific.length; i++) {
        const card =
          specific[i].closest('.ddb-campaigns-character-card') || specific[i].closest('li');
        const u = firstPortraitInCard(card);
        if (u) return u;
      }
      const anyLink = document.querySelectorAll(
        '.ddb-campaigns-detail-body-listing-active a[href*="/characters/' + esc + '"]',
      );
      for (i = 0; i < anyLink.length; i++) {
        const card =
          anyLink[i].closest('.ddb-campaigns-character-card') ||
          anyLink[i].closest('li') ||
          anyLink[i].closest('[class*="character-card"]');
        const u = firstPortraitInCard(card);
        if (u) return u;
      }
    } catch (_) {}
    return '';
  }

  function portraitUrlForCharacter(c, numericId) {
    let u = c ? resolvedAvatarUrl(c) : '';
    if (u) return u;
    if (numericId != null && Number.isFinite(Number(numericId))) u = scrapeCardPortraitUrl(numericId);
    return u || '';
  }

  function hpLine(c) {
    if (!c || typeof c !== 'object') return '—';
    const base = Number(c.baseHitPoints);
    const rem = Number(c.removedHitPoints) || 0;
    const tmp = Number(c.temporaryHitPoints) || 0;
    const ov = c.overrideHitPoints;
    const max = Number.isFinite(Number(ov)) && Number(ov) > 0 ? Number(ov) : Number.isFinite(base) ? base : '?';
    const cur =
      Number.isFinite(base) && base >= 0 ? Math.max(0, Math.floor(base - rem)) : '?';
    let s = cur + '/' + max;
    if (tmp > 0) s += ' +' + tmp + ' temp';
    return s;
  }

  function partySubtitleLine(c) {
    if (!c || typeof c !== 'object') return '';
    const parts = [];
    let totalLv = 0;
    const classBits = [];
    if (Array.isArray(c.classes)) {
      for (let i = 0; i < c.classes.length; i++) {
        const cl = c.classes[i];
        totalLv += Number(cl.level) || 0;
        const def = cl.definition;
        const cn = (def && def.name) || cl.name;
        if (typeof cn === 'string' && cn.trim()) classBits.push(cn.trim());
      }
    }
    if (totalLv > 0) parts.push('Lvl ' + totalLv);
    const race = c.race;
    let raceStr = '';
    if (race && typeof race === 'object') {
      raceStr = String(race.fullName || race.name || race.baseName || '').trim();
    }
    if (raceStr) parts.push(raceStr);
    if (classBits.length) parts.push(classBits.join(' · '));
    return parts.length ? parts.join(' · ') : '';
  }

  function raceLineForCard(c) {
    if (!c || typeof c !== 'object') return '';
    const race = c.race;
    if (race && typeof race === 'object') {
      return String(race.fullName || race.name || race.baseName || '').trim();
    }
    return '';
  }

  /** e.g. "Level 3 · Fighter 2 · Wizard 1" */
  function classLevelLineForCard(c) {
    if (!c || typeof c !== 'object') return '';
    let totalLv = 0;
    const classBits = [];
    if (Array.isArray(c.classes)) {
      for (let i = 0; i < c.classes.length; i++) {
        const cl = c.classes[i];
        const lv = Number(cl.level) || 0;
        totalLv += lv;
        const def = cl.definition;
        const cn = (def && def.name) || cl.name;
        if (typeof cn === 'string' && cn.trim()) classBits.push(cn.trim() + (lv ? ' ' + lv : ''));
      }
    }
    if (totalLv > 0 && classBits.length) return 'Level ' + totalLv + ' · ' + classBits.join(' · ');
    if (totalLv > 0) return 'Level ' + totalLv;
    return classBits.join(' · ');
  }

  function collectCharacterIdsFromDom() {
    const ids = new Set();
    const path = campaignPathname();
    const single = path.match(/\/characters\/(\d+)/i);
    if (single) ids.add(Number(single[1]));
    ['.ddb-campaigns-character-card-footer-links-item-view', '.ddb-campaigns-character-card-footer-links-item-edit'].forEach(
      (sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          const href = el.href || el.getAttribute('href') || '';
          const m = href.match(/\/characters\/(\d+)/i);
          if (m) ids.add(Number(m[1]));
        });
      },
    );
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
   * TeaWithLucas-style headers for character-service GET (append each Cobalt key).
   * Legacy `/json` often wants Content-Type text/json (party ingest parity).
   */
  function buildFetchHeaders(authRecord, legacyJson) {
    const h = new Headers();
    h.set('Accept', 'application/json');
    if (legacyJson) h.set('Content-Type', 'text/json');
    if (authRecord && typeof authRecord === 'object') {
      for (const k of Object.keys(authRecord)) {
        const v = authRecord[k];
        if (v != null && String(v).length > 0) h.append(k, String(v));
      }
    }
    return h;
  }

  /** Webpack jsonp replay + module 999080 — mirror ddb-party-ingest / TeaWithLucas loader pattern. */
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
      const chunkIds = data[0];
      const moreModules = data[1];
      const executeModules = data[2];
      let i = 0;
      const resolves = [];
      for (; i < chunkIds.length; i++) {
        const chunkId = chunkIds[i];
        if (Object.prototype.hasOwnProperty.call(installedChunks, chunkId) && installedChunks[chunkId]) {
          resolves.push(installedChunks[chunkId][0]);
        }
        installedChunks[chunkId] = 0;
      }
      for (const moduleId in moreModules) {
        if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
          modules[moduleId] = moreModules[moduleId];
        }
      }
      if (parentJsonpFunction) parentJsonpFunction(data);
      while (resolves.length) resolves.shift()();
      deferredModules.push.apply(deferredModules, executeModules || []);
      return checkDeferredModules();
    }
    function checkDeferredModules() {
      let result;
      for (let i = 0; i < deferredModules.length; i++) {
        const deferredModule = deferredModules[i];
        let fulfilled = true;
        for (let j = 1; j < deferredModule.length; j++) {
          if (installedChunks[deferredModule[j]] !== 0) fulfilled = false;
        }
        if (fulfilled) {
          deferredModules.splice(i--, 1);
          result = __webpack_require__((__webpack_require__.s = deferredModule[0]));
        }
      }
      return result;
    }
    const installedModules = {};
    const installedChunks = { 0: 0 };
    const deferredModules = [];
    function __webpack_require__(moduleId) {
      if (installedModules[moduleId]) return installedModules[moduleId].exports;
      const module = (installedModules[moduleId] = { i: moduleId, l: false, exports: {} });
      if (!modules[moduleId]) {
        console.warn('[ddb-init-bar] webpack missing module', moduleId);
        throw new Error('Update @require vendors~characterTools URL in script header');
      }
      modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
      module.l = true;
      return module.exports;
    }
    __webpack_require__.m = modules;
    __webpack_require__.c = installedModules;
    __webpack_require__.d = function (exports, name, getter) {
      if (!__webpack_require__.o(exports, name)) Object.defineProperty(exports, name, { enumerable: true, get: getter });
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
      const ns = Object.create(null);
      __webpack_require__.r(ns);
      Object.defineProperty(ns, 'default', { enumerable: true, value: value });
      if (mode & 2 && typeof value != 'string') {
        for (const key in value) {
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
      const getter =
        module && module.__esModule
          ? function () {
              return module.default;
            }
          : function () {
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
    var oldJsonpFunction = jsonpArray.push.bind(jsonpArray);
    jsonpArray.push2 = webpackJsonpCallback;
    jsonpArray = jsonpArray.slice();
    for (var ri = 0; ri < jsonpArray.length; ri++) webpackJsonpCallback(jsonpArray[ri]);
    var parentJsonpFunction = oldJsonpFunction;
    deferredModules.push([INGEST_AUTH_MODULE_ID, 2]);
    checkDeferredModules();
  }

  async function resolveDdbAuthHeaders() {
    try {
      var me = SW.moduleExport;
      if (me && typeof me.getAuthHeaders === 'function') {
        var h0 = await me.getAuthHeaders()();
        if (h0 && typeof h0 === 'object') return h0;
      }
    } catch (e) {
      console.warn('[ddb-init-bar] moduleExport (TeaWithLucas DM Screen?) auth failed', e);
    }
    try {
      if (SW.__ddbDmScreenIngestAuth && typeof SW.__ddbDmScreenIngestAuth.getAuthHeaders === 'function') {
        const headers = await SW.__ddbDmScreenIngestAuth.getAuthHeaders()();
        if (headers && typeof headers === 'object') return headers;
      }
    } catch (e2) {
      console.warn('[ddb-init-bar] ingest auth failed', e2);
    }
    try {
      bootstrapDdbAuthFromWebpack();
      const auth = SW.__ddbDmScreenIngestAuth;
      if (!auth || typeof auth.getAuthHeaders !== 'function') {
        console.warn('[ddb-init-bar] webpack bootstrap: no getAuthHeaders — update @require vendors~characterTools URL?');
        return {};
      }
      const headers = await auth.getAuthHeaders()();
      return headers && typeof headers === 'object' ? headers : {};
    } catch (e3) {
      console.warn('[ddb-init-bar] webpack auth bootstrap failed', e3);
      return {};
    }
  }

  async function fetchCharacterSheet(charId, authHeaders) {
    const ts = Date.now();
    const referer = 'https://www.dndbeyond.com/characters/' + charId + '/';
    async function tryGet(url, legacyJson) {
      try {
        const hdrs = buildFetchHeaders(authHeaders, legacyJson);
        hdrs.set('Referer', referer);
        const r = await fetch(url, { credentials: 'include', headers: hdrs });
        const text = await r.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          return null;
        }
        if (!r.ok) return null;
        /** Always unwrap — v5 often has `data.id`+`data.name` on a slim object while `data.character` holds avatarUrl. */
        return unwrapCharacterPayload(parsed);
      } catch {
        return null;
      }
    }
    /** Parallel legacy + v5, then merge (party ingest parity) — sequential legacy-only hid live conditions / death saves on v5. */
    const [legPlural, legSingular, svc] = await Promise.all([
      tryGet(LEGACY_PLURAL + charId + '/json?_ts=' + ts, true),
      tryGet(LEGACY + charId + '/json?_ts=' + ts, true),
      tryGet(V5_CHAR_BASE + charId + '?_ts=' + ts, false),
    ]);
    const leg = legPlural || legSingular;
    let u = leg && svc ? mergeDdbLegacyAndV5Character(leg, svc) : leg || svc;
    if (!u) u = await tryGet(V4_CHAR_BASE + charId + '?_ts=' + ts, false);
    return u;
  }

  async function refreshPartyRoster() {
    const ids = collectCharacterIdsFromDom();
    if (!ids.length) {
      if (rosterEl) rosterEl.innerHTML = '<div class="dib-empty">Open the campaign <strong>Characters</strong> tab so party links load.</div>';
      return;
    }
    const auth = await resolveDdbAuthHeaders();
    const next = {};
    await Promise.all(
      ids.map(async (id) => {
        const c = await fetchCharacterSheet(id, auth);
        if (c && c.id != null) next[String(id)] = c;
      }),
    );
    partyById = next;
    renderRoster();
    if (initiativeUi.list) renderLocalInitiativeUi();
  }

  function renderRoster() {
    if (!rosterEl) return;
    rosterEl.innerHTML = '';
    const ids = collectCharacterIdsFromDom();
    if (!ids.length) {
      rosterEl.innerHTML =
        '<div class="dib-empty">Open the campaign <strong>Characters</strong> tab so party links load.</div>';
      return;
    }
    /* Heart + shield: Lucide paths (ISC) — same as PartyCardStatIcons.tsx + DM web cards. */
    const SVG_HEART =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="#000" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    const SVG_SHIELD =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="#000" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';
    /* Spell save: filled white pentagon — same as PartyCardStatIcons IconSpellSaveD20. */
    const SVG_SPELL_D20 =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))"><path fill="#ffffff" stroke="#000" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" d="M12 2.3L21.99 9.56L18.17 21.3L5.83 21.3L2.01 9.56Z"/></svg>';

    function makeStatBadge(kind, svgHtml, valueMain, valueSub, ribbonLabel) {
      const wrap = document.createElement('div');
      wrap.className = 'dib-pc-stat-badge dib-pc-stat-badge--' + kind;
      const graphic = document.createElement('div');
      graphic.className = 'dib-pc-stat-badge-graphic';
      graphic.innerHTML = svgHtml;
      const nums = document.createElement('div');
      nums.className = 'dib-pc-stat-badge-nums';
      const v1 = document.createElement('span');
      v1.className = 'dib-pc-stat-badge-val';
      v1.textContent = valueMain;
      nums.appendChild(v1);
      if (valueSub) {
        const v2 = document.createElement('span');
        v2.className = 'dib-pc-stat-badge-sub';
        v2.textContent = valueSub;
        nums.appendChild(v2);
      }
      graphic.appendChild(nums);
      const rib = document.createElement('div');
      rib.className = 'dib-pc-stat-badge-ribbon';
      rib.textContent = ribbonLabel;
      wrap.appendChild(graphic);
      wrap.appendChild(rib);
      return wrap;
    }

    for (let ix = 0; ix < ids.length; ix++) {
      const id = ids[ix];
      const c = partyById[String(id)];
      const card = document.createElement('div');
      card.className = 'dib-party-card';
      card.setAttribute('data-ddb-char-id', String(id));
      card.addEventListener('click', function partyCardInitJump() {
        if (!localInitState || !localInitState.turnOrder.length) return;
        const ok = localInitState.turnOrder.some(function (tid) {
          const ent = localInitState.entries[tid];
          return ent && String(ent.entityId) === String(id);
        });
        if (!ok) return;
        mutateLocalInitiative(function (st) {
          return localSetCurrentTurnByEntityId(st, String(id));
        });
      });
      if (localInitState && localInitState.turnOrder.length) {
        const inOrder = localInitState.turnOrder.some(function (tid) {
          const ent = localInitState.entries[tid];
          return ent && String(ent.entityId) === String(id);
        });
        if (inOrder) {
          card.style.cursor = 'pointer';
          card.title = 'Jump initiative to this character';
        }
      }

      const stack = document.createElement('div');
      stack.className = 'dib-pc-stack';

      const hdr = document.createElement('div');
      hdr.className = 'dib-pc-head';
      const avWrap = document.createElement('div');
      avWrap.className = 'dib-pc-avatar-wrap';
      const url = portraitUrlForCharacter(c, id);
      if (url) {
        const img = document.createElement('img');
        img.className = 'dib-pc-avatar';
        img.alt = '';
        img.src = url;
        img.referrerPolicy = 'strict-origin-when-cross-origin';
        avWrap.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'dib-pc-ph';
        ph.textContent = c
          ? String(c.name || '?')
              .trim()
              .charAt(0)
              .toUpperCase() || '?'
          : '…';
        avWrap.appendChild(ph);
      }
      const titleBlock = document.createElement('div');
      titleBlock.className = 'dib-pc-titles';
      const nameEl = document.createElement('div');
      nameEl.className = 'dib-pc-name';
      nameEl.textContent = c ? String(c.name || '…').toUpperCase() : '… #' + id;
      const raceEl = document.createElement('div');
      raceEl.className = 'dib-pc-race';
      raceEl.textContent = c ? raceLineForCard(c) || '—' : '…';
      const classEl = document.createElement('div');
      classEl.className = 'dib-pc-classline';
      if (c) {
        const cln = classLevelLineForCard(c);
        classEl.textContent = cln || partySubtitleLine(c) || 'Live sheet';
      } else {
        classEl.textContent = 'Loading…';
      }
      titleBlock.appendChild(nameEl);
      if (c) {
        const sheetCondLabs = extractDdbConditionLabels(c);
        if (sheetCondLabs.length) {
          const inlineCond = document.createElement('div');
          inlineCond.className = 'dib-pc-inline-conds';
          for (let sci = 0; sci < sheetCondLabs.length; sci++) {
            const pill = document.createElement('span');
            pill.className = 'dib-pc-inline-cond-pill';
            const full = sheetCondLabs[sci];
            pill.title = full;
            pill.textContent = '[' + abbrevConditionLabel(full) + ']';
            inlineCond.appendChild(pill);
          }
          titleBlock.appendChild(inlineCond);
        }
      }
      titleBlock.appendChild(raceEl);
      titleBlock.appendChild(classEl);
      hdr.appendChild(avWrap);
      hdr.appendChild(titleBlock);
      stack.appendChild(hdr);

      const dcStr = c ? displaySpellSaveDc(c) : null;
      const hp = c ? hpBoxParts(c) : null;
      const hpMain = hp ? hp.cur : '—';
      const hpSub =
        hp && hp.max !== '—' ? '/ ' + hp.max + (hp.temp ? '  +' + hp.temp + ' temp' : '') : '';

      const statRow = document.createElement('div');
      statRow.className = 'dib-pc-stat-icon-row';
      statRow.appendChild(makeStatBadge('hp', SVG_HEART, hpMain, hpSub, 'Hit points'));
      statRow.appendChild(
        makeStatBadge('ac', SVG_SHIELD, c ? displayArmorClass(c) : '—', '', 'Armor class'),
      );
      statRow.appendChild(
        makeStatBadge(
          'dc',
          SVG_SPELL_D20,
          dcStr != null ? dcStr : '—',
          '',
          'Spell save',
        ),
      );
      stack.appendChild(statRow);

      const dsSkull =
        '<svg class="dib-pc-ds-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c-3.2 0-5.7 2.4-6 5.5V10c0 .9.3 1.8.8 2.5L5.2 17h13.6l-1.6-4.5c.5-.7.8-1.6.8-2.5V8.5C17.7 5.4 15.2 3 12 3zm-2.5 6c.8 0 1.5.7 1.5 1.5S10.3 12 9.5 12 8 11.3 8 10.5 8.7 9 9.5 9zm5 0c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5S11 11.3 11 10.5s.7-1.5 1.5-1.5zM9 18v3h2v-3H9zm4 0v3h2v-3h-2z"/></svg>';
      const dsWing =
        '<svg class="dib-pc-ds-svg" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><ellipse cx="9" cy="12.5" rx="3.2" ry="7" transform="rotate(-22 9 12.5)"/><ellipse cx="15" cy="12.5" rx="3.2" ry="7" transform="rotate(22 15 12.5)"/></g></svg>';
      const dsRow = document.createElement('div');
      dsRow.className = 'dib-pc-death-saves';
      const dsTitle = document.createElement('div');
      dsTitle.className = 'dib-pc-death-saves-title';
      dsTitle.textContent = 'Death saves';
      const dsFlex = document.createElement('div');
      dsFlex.className = 'dib-pc-ds-flex';
      const ds = c ? deathSavesFromCharacter(c) : { successes: 0, failures: 0 };
      const succGroup = document.createElement('div');
      succGroup.className = 'dib-pc-ds-group dib-pc-ds-group--success';
      succGroup.title = 'Successes (3 = stable)';
      for (let dsi = 0; dsi < 3; dsi++) {
        const pip = document.createElement('span');
        pip.className =
          'dib-pc-ds-pip dib-pc-ds-pip--success' + (dsi < ds.successes ? ' dib-pc-ds-pip--on' : '');
        pip.innerHTML = dsWing;
        succGroup.appendChild(pip);
      }
      const failGroup = document.createElement('div');
      failGroup.className = 'dib-pc-ds-group dib-pc-ds-group--fail';
      failGroup.title = 'Failures (3 = dead)';
      for (let dfi = 0; dfi < 3; dfi++) {
        const pip = document.createElement('span');
        pip.className =
          'dib-pc-ds-pip dib-pc-ds-pip--fail' + (dfi < ds.failures ? ' dib-pc-ds-pip--on' : '');
        pip.innerHTML = dsSkull;
        failGroup.appendChild(pip);
      }
      dsFlex.appendChild(succGroup);
      dsFlex.appendChild(failGroup);
      dsRow.appendChild(dsTitle);
      dsRow.appendChild(dsFlex);
      stack.appendChild(dsRow);

      const passH = document.createElement('div');
      passH.className = 'dib-pc-section-title';
      passH.textContent = 'Passive skills';
      stack.appendChild(passH);

      const passGrid = document.createElement('div');
      passGrid.className = 'dib-pc-passive-grid';
      function addPassCell(lab, val) {
        const cell = document.createElement('div');
        cell.className = 'dib-pc-pass-cell';
        const num = document.createElement('span');
        num.className = 'dib-pc-pass-num';
        num.textContent = val;
        const lb = document.createElement('span');
        lb.className = 'dib-pc-pass-lab';
        lb.textContent = lab;
        cell.appendChild(num);
        cell.appendChild(lb);
        passGrid.appendChild(cell);
      }
      if (c) {
        addPassCell('Perception', computePassiveSkill(c, 'perception'));
        addPassCell('Investigation', computePassiveSkill(c, 'investigation'));
        addPassCell('Insight', computePassiveSkill(c, 'insight'));
      } else {
        addPassCell('Perception', '—');
        addPassCell('Investigation', '—');
        addPassCell('Insight', '—');
      }
      stack.appendChild(passGrid);

      if (c) {
        appendSpellSlotsToParent(stack, c);
        appendClassResourcesToParent(stack, c);
      } else {
        const ph = document.createElement('div');
        ph.className = 'dib-pc-stack-empty';
        ph.textContent = '…';
        stack.appendChild(ph);
      }

      card.appendChild(stack);
      rosterEl.appendChild(card);
    }
  }

  // --- Initiative (subset; localStorage) ---
  function __calcAbilityMod(score) {
    const n = Math.floor(Number(score));
    if (!Number.isFinite(n)) return 0;
    return Math.floor((n - 10) / 2);
  }

  function __getStatModFromCharacter(c, statId) {
    if (!c || typeof c !== 'object') return 0;
    let val;
    const ov = c.overrideStats;
    if (Array.isArray(ov)) {
      for (let i = 0; i < ov.length; i++) {
        if (ov[i] && ov[i].id === statId && ov[i].value != null) {
          val = ov[i].value;
          break;
        }
      }
    }
    if (val == null && Array.isArray(c.stats)) {
      for (let j = 0; j < c.stats.length; j++) {
        if (c.stats[j] && c.stats[j].id === statId && c.stats[j].value != null) {
          val = c.stats[j].value;
          break;
        }
      }
    }
    if (val == null) return 0;
    const statKeys = ['', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    const sk = statKeys[statId];
    let bonus = 0;
    const mods = c.modifiers;
    if (mods && typeof mods === 'object' && sk) {
      Object.keys(mods).forEach((bucket) => {
        const arr = mods[bucket];
        if (!Array.isArray(arr)) return;
        arr.forEach((m) => {
          if (m && m.type === 'bonus' && m.subType === sk + '-score') bonus += Number(m.value) || 0;
        });
      });
    }
    return __calcAbilityMod(Number(val) + bonus);
  }

  function __proficiencyBonusFromCharacter(c) {
    if (c && typeof c === 'object') {
      const pbTop = Number(c.proficiencyBonus);
      if (Number.isFinite(pbTop) && pbTop >= 2 && pbTop <= 6) return Math.round(pbTop);
    }
    const classes = c && c.classes;
    if (!Array.isArray(classes)) return 2;
    let level = 0;
    for (let i = 0; i < classes.length; i++) level += Number(classes[i].level) || 0;
    level = Math.max(1, Math.min(20, level));
    const table = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];
    return table[level - 1];
  }

  function __getInitiativeBonusFromCharacter(c) {
    if (!c || typeof c !== 'object') return 0;
    let bonus = __getStatModFromCharacter(c, 2);
    const mods = c.modifiers;
    if (mods && typeof mods === 'object') {
      let hasProf = false;
      Object.keys(mods).forEach((bucket) => {
        const arr = mods[bucket];
        if (!Array.isArray(arr)) return;
        arr.forEach((m) => {
          if (!m) return;
          if (m.type === 'proficiency' && m.subType === 'initiative') hasProf = true;
          if (m.type === 'bonus' && m.subType === 'initiative') bonus += Number(m.value) || 0;
        });
      });
      if (hasProf) bonus += __proficiencyBonusFromCharacter(c);
    }
    return bonus;
  }

  function __skillPassiveBonusFromProficiency(c, skill) {
    const mods = c.modifiers;
    if (!mods || typeof mods !== 'object') return 0;
    const pb = __proficiencyBonusFromCharacter(c);
    let expertise = false;
    let prof = false;
    Object.keys(mods).forEach(function (bucket) {
      const arr = mods[bucket];
      if (!Array.isArray(arr)) return;
      arr.forEach(function (m) {
        if (!m || m.subType !== skill) return;
        if (m.type === 'expertise') expertise = true;
        if (m.type === 'proficiency') prof = true;
      });
    });
    if (expertise) return 2 * pb;
    if (prof) return pb;
    return 0;
  }

  function __passiveNamedBonus(c, passiveSubType) {
    const mods = c.modifiers;
    if (!mods || typeof mods !== 'object') return 0;
    let s = 0;
    Object.keys(mods).forEach(function (bucket) {
      const arr = mods[bucket];
      if (!Array.isArray(arr)) return;
      arr.forEach(function (m) {
        if (m && m.type === 'bonus' && m.subType === passiveSubType) s += Number(m.value) || 0;
      });
    });
    return s;
  }

  function computePassiveSkill(c, skill) {
    if (!c || typeof c !== 'object') return '—';
    const key =
      skill === 'perception'
        ? 'passivePerception'
        : skill === 'investigation'
          ? 'passiveInvestigation'
          : 'passiveInsight';
    const direct = c[key];
    if (typeof direct === 'number' && Number.isFinite(direct)) return String(Math.floor(direct));
    const statId = skill === 'investigation' ? 4 : 5;
    const mod = __getStatModFromCharacter(c, statId);
    const profPart = __skillPassiveBonusFromProficiency(c, skill);
    const total = 10 + mod + profPart + __passiveNamedBonus(c, 'passive-' + skill);
    return String(total);
  }

  function displayArmorClass(c) {
    if (!c || typeof c !== 'object') return '—';
    const keys = ['armorClass', 'calculatedArmorClass', 'armor_class'];
    for (let i = 0; i < keys.length; i++) {
      const v = c[keys[i]];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 50) return String(Math.round(v));
      if (typeof v === 'string' && /^\d+$/.test(v.trim())) return v.trim();
    }
    return String(10 + __getStatModFromCharacter(c, 2));
  }

  function displaySpellSaveDc(c) {
    if (!c || typeof c !== 'object') return null;
    const sciBundle = readSpellCasterInfoBundle(c);
    if (sciBundle && sciBundle.dc != null) return String(sciBundle.dc);
    const tryKeys = ['spellSaveDC', 'spellSaveDc', 'spellcastingSaveDC'];
    for (let i = 0; i < tryKeys.length; i++) {
      const v = c[tryKeys[i]];
      if (typeof v === 'number' && v >= 8 && v <= 30) return String(Math.round(v));
    }
    const classes = c.classes;
    if (!Array.isArray(classes)) return null;
    const pb = __proficiencyBonusFromCharacter(c);
    for (let j = 0; j < classes.length; j++) {
      const def = classes[j].definition;
      if (!def || def.canCastSpells !== true) continue;
      const aid = Number(def.spellCastingAbilityId);
      if (!aid || aid < 1 || aid > 6) continue;
      const mod = __getStatModFromCharacter(c, aid);
      return String(8 + pb + mod);
    }
    return null;
  }

  /* Ported from apps/backend character.service.ts — aligns with TeaWithLucas module fields:
   * spellSlots, pactMagic, pactMagicSlots, classes[].definition.spellRules.levelSpellSlots
   * https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  
  function __readSpellSlotPartsUsr(item, inferredLevel) {
    if (!item || typeof item !== 'object') return null;
    var o = item;
    var level = Math.floor(Number(o.level ?? o.spellLevel ?? o.slotLevel));
    if (!Number.isFinite(level) || level < 1 || level > 9) {
      if (inferredLevel != null && inferredLevel >= 1 && inferredLevel <= 9) level = inferredLevel;
      else return null;
    }
    var used = Math.max(
      0,
      Math.floor(Number(o.used ?? o.numberUsed ?? o.expended ?? o.spent ?? o.numberExpended) || 0),
    );
    var rawAvail = Math.max(0, Math.floor(Number(o.available ?? o.numberAvailable ?? o.slots) || 0));
    var remRaw = o.remaining ?? o.slotsRemaining;
    var remainingField = null;
    if (remRaw != null && remRaw !== '' && Number.isFinite(Number(remRaw))) {
      remainingField = Math.max(0, Math.floor(Number(remRaw) || 0));
    }
    var maxField = o.max ?? o.total ?? o.maximum;
    var explicitMax =
      typeof maxField === 'number' && Number.isFinite(maxField) && maxField > 0
        ? Math.max(0, Math.floor(maxField))
        : 0;
    return { level: level, used: used, rawAvail: rawAvail, explicitMax: explicitMax, remainingField: remainingField };
  }
  
  function __computeSpellPoolForLevelUsr(tableCap, used, rawAvail, explicitMax, remainingDerivedPool) {
    if (remainingDerivedPool > 0) {
      return Math.max(tableCap, explicitMax, remainingDerivedPool);
    }
    if (tableCap > 0 && used > 0 && rawAvail > 0) {
      if (rawAvail + used === tableCap) return tableCap;
      if (rawAvail === tableCap) return tableCap;
    }
    if (tableCap === 0 && explicitMax > 0) {
      if (used > 0 && rawAvail + used === explicitMax) return explicitMax;
      if (rawAvail === explicitMax) return explicitMax;
    }
    var pool = Math.max(tableCap, explicitMax, rawAvail);
    if (used > 0 && rawAvail > 0) {
      pool = Math.max(pool, rawAvail + used);
    }
    return pool;
  }
  
  function __filterSpellcastingClassesUsr(classes) {
    if (!Array.isArray(classes)) return [];
    return classes.filter(function (c) {
      if (!c || typeof c !== 'object') return false;
      var def = c.definition;
      var sr = def && typeof def === 'object' ? def.spellRules : null;
      return Array.isArray(sr && sr.levelSpellSlots);
    });
  }
  
  function __getCombinedSpellcasterLevelUsr(allClasses) {
    var sum = 0;
    for (var i = 0; i < allClasses.length; i++) {
      var c = allClasses[i];
      if (!c || typeof c !== 'object') continue;
      var def = c.definition;
      if (!def || typeof def !== 'object') continue;
      var sr = def.spellRules;
      if (!sr || typeof sr !== 'object' || !Array.isArray(sr.levelSpellSlots)) continue;
      var classLevel = Math.floor(Number(c.level) || 0);
      if (classLevel < 1) continue;
      var divisor = Math.max(1, Math.floor(Number(sr.multiClassSpellSlotDivisor) || 1));
      sum += Math.floor(classLevel / divisor);
    }
    return sum;
  }
  
  function __getFirstLevelSpellSlotsTableUsr(allClasses) {
    for (var i = 0; i < allClasses.length; i++) {
      var c = allClasses[i];
      if (!c || typeof c !== 'object') continue;
      var def = c.definition;
      var sr = def && typeof def === 'object' ? def.spellRules : null;
      var t = sr && sr.levelSpellSlots;
      if (Array.isArray(t) && t.length > 0) return t;
    }
    return null;
  }
  
  function __capacityBySpellLevelFromTableUsr(table, rowIndex) {
    var m = new Map();
    if (!Array.isArray(table) || rowIndex < 1 || rowIndex >= table.length) return m;
    var row = table[rowIndex];
    if (!Array.isArray(row)) return m;
    for (var i = 0; i < Math.min(9, row.length); i++) {
      var n = Math.max(0, Math.floor(Number(row[i]) || 0));
      if (n > 0) m.set(i + 1, n);
    }
    return m;
  }
  
  function __collectSpellSlotSignalsUsr(r) {
    var usedByLevel = new Map();
    var rawAvailByLevel = new Map();
    var rawAvailMinByLevel = new Map();
    var rawAvailMinPositiveByLevel = new Map();
    var explicitMaxByLevel = new Map();
    var remainingPoolByLevel = new Map();
    var keys = [
      { key: 'spellSlots', inferNine: true },
      { key: 'pactMagic', inferNine: false },
      { key: 'pactMagicSlots', inferNine: false },
    ];
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki].key;
      var inferNine = keys[ki].inferNine;
      var arr = r[key];
      if (!Array.isArray(arr)) continue;
      var useNine = inferNine === true && arr.length === 9;
      for (var i = 0; i < arr.length; i++) {
        var p = __readSpellSlotPartsUsr(arr[i], useNine ? i + 1 : undefined);
        if (!p) continue;
        var lv = p.level;
        var prevU = usedByLevel.get(lv);
        usedByLevel.set(lv, prevU === undefined ? p.used : Math.min(prevU, p.used));
        rawAvailByLevel.set(lv, Math.max(rawAvailByLevel.get(lv) ?? 0, p.rawAvail));
        var prevAll = rawAvailMinByLevel.get(lv);
        rawAvailMinByLevel.set(lv, prevAll === undefined ? p.rawAvail : Math.min(prevAll, p.rawAvail));
        if (p.rawAvail > 0) {
          var prevMin = rawAvailMinPositiveByLevel.get(lv);
          rawAvailMinPositiveByLevel.set(
            lv,
            prevMin === undefined ? p.rawAvail : Math.min(prevMin, p.rawAvail),
          );
        }
        explicitMaxByLevel.set(lv, Math.max(explicitMaxByLevel.get(lv) ?? 0, p.explicitMax));
        if (p.remainingField != null) {
          var rp = p.remainingField + p.used;
          remainingPoolByLevel.set(lv, Math.max(remainingPoolByLevel.get(lv) ?? 0, rp));
        }
      }
    }
    return {
      usedByLevel: usedByLevel,
      rawAvailByLevel: rawAvailByLevel,
      rawAvailMinByLevel: rawAvailMinByLevel,
      rawAvailMinPositiveByLevel: rawAvailMinPositiveByLevel,
      explicitMaxByLevel: explicitMaxByLevel,
      remainingPoolByLevel: remainingPoolByLevel,
    };
  }
  
  function __ddbExtractSpellSlotSummariesUsr(raw) {
    var r = raw;
    if (!r || typeof r !== 'object') return [];
    var allClasses = Array.isArray(r.classes) ? r.classes : [];
    var spellClasses = __filterSpellcastingClassesUsr(allClasses);
  
    var capFromTable = new Map();
    var table = __getFirstLevelSpellSlotsTableUsr(allClasses);
    if (table && spellClasses.length > 0) {
      var rowIndex =
        spellClasses.length === 1
          ? Math.floor(Number(spellClasses[0].level) || 0)
          : __getCombinedSpellcasterLevelUsr(allClasses);
      var caps = __capacityBySpellLevelFromTableUsr(table, rowIndex);
      caps.forEach(function (cap, lv) {
        capFromTable.set(lv, cap);
      });
    }
  
    var sig = __collectSpellSlotSignalsUsr(r);
    var usedByLevel = sig.usedByLevel;
    var rawAvailByLevel = sig.rawAvailByLevel;
    var rawAvailMinByLevel = sig.rawAvailMinByLevel;
    var rawAvailMinPositiveByLevel = sig.rawAvailMinPositiveByLevel;
    var explicitMaxByLevel = sig.explicitMaxByLevel;
    var remainingPoolByLevel = sig.remainingPoolByLevel;
  
    var SPELL_SLOT_ARRAY_KEYS = [
      { key: 'spellSlots', inferLevelFromNineLengthArray: true },
      { key: 'pactMagic', inferLevelFromNineLengthArray: false },
      { key: 'pactMagicSlots', inferLevelFromNineLengthArray: false },
    ];
  
    var arrayMerged = new Map();
    for (var ai = 0; ai < SPELL_SLOT_ARRAY_KEYS.length; ai++) {
      var key = SPELL_SLOT_ARRAY_KEYS[ai].key;
      var inferNine = SPELL_SLOT_ARRAY_KEYS[ai].inferLevelFromNineLengthArray;
      var arr = r[key];
      if (!Array.isArray(arr)) continue;
      var useNine = inferNine === true && arr.length === 9;
      for (var i = 0; i < arr.length; i++) {
        var p = __readSpellSlotPartsUsr(arr[i], useNine ? i + 1 : undefined);
        if (!p) continue;
        var tc = capFromTable.get(p.level) ?? 0;
        var remDerived = p.remainingField != null ? p.remainingField + p.used : 0;
        var pool = __computeSpellPoolForLevelUsr(tc, p.used, p.rawAvail, p.explicitMax, remDerived);
        if (pool <= 0 && p.used <= 0) continue;
        var row = { level: p.level, available: pool, used: p.used };
        var prev = arrayMerged.get(row.level);
        if (!prev) arrayMerged.set(row.level, row);
        else {
          var prefer =
            row.available > prev.available ||
            (row.available === prev.available && row.used < prev.used);
          if (prefer) arrayMerged.set(row.level, row);
        }
      }
    }
  
    var levels = new Set();
    function addMapKeys(m) {
      m.forEach(function (_v, k) {
        levels.add(k);
      });
    }
    addMapKeys(usedByLevel);
    addMapKeys(rawAvailByLevel);
    addMapKeys(explicitMaxByLevel);
    addMapKeys(remainingPoolByLevel);
    addMapKeys(capFromTable);
    arrayMerged.forEach(function (_v, k) {
      levels.add(k);
    });
  
    var sortedLevels = Array.from(levels).sort(function (a, b) {
      return a - b;
    });
    var out = [];
    for (var si = 0; si < sortedLevels.length; si++) {
      var level = sortedLevels[si];
      var tableCap = capFromTable.get(level) ?? 0;
      var used = usedByLevel.get(level) ?? 0;
      var rawAvail = rawAvailByLevel.get(level) ?? 0;
      var explicitMax = explicitMaxByLevel.get(level) ?? 0;
      var remPool = remainingPoolByLevel.get(level) ?? 0;
      var fromArr = arrayMerged.get(level);
      var poolFromSignals = __computeSpellPoolForLevelUsr(
        tableCap,
        used,
        rawAvail,
        explicitMax,
        remPool,
      );
      var arrayCap = fromArr ? fromArr.available : 0;
      var arrayUsed = fromArr ? fromArr.used : 0;
      var available = Math.max(poolFromSignals, arrayCap, used, arrayUsed);
      if (available <= 0 && used <= 0 && arrayUsed <= 0) continue;
      var mergedUsed = Math.max(used, arrayUsed);
      if (mergedUsed === 0 && available > 0) {
        var rawMax = rawAvailByLevel.get(level) ?? 0;
        var rawMinAll = rawAvailMinByLevel.get(level);
        var minPos = rawAvailMinPositiveByLevel.get(level);
        if (tableCap > 0 && rawMinAll === 0 && rawMax >= available && rawMax > 0) {
          mergedUsed = available;
        }
        if (mergedUsed === 0) {
          var rawTop = rawMax;
          if (tableCap > 0 && minPos !== undefined && minPos > 0 && rawMax > minPos) {
            rawTop = minPos;
          }
          if (rawTop > 0 && rawTop < available) {
            var inferred = available - rawTop;
            if (inferred > 0 && inferred <= available) mergedUsed = inferred;
          }
        }
      }
      out.push({
        level: level,
        available: available,
        used: Math.min(mergedUsed, available),
      });
    }
    return out;
  }
  
  function __classResourceDedupeKeyUsr(displayName) {
    var n = String(displayName)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (n.indexOf('lay on hands') !== -1) return 'lay on hands';
    if (n === 'healing pool') return 'lay on hands';
    if (/\bhealing pool\b/.test(n)) return 'lay on hands';
    return n;
  }
  
  function __getPaladinLayOnHandsPoolCapUsr(raw) {
    var classes = raw.classes;
    if (!Array.isArray(classes)) return 0;
    var paladinLevels = 0;
    for (var i = 0; i < classes.length; i++) {
      var c = classes[i];
      if (!c || typeof c !== 'object') continue;
      var lv = Math.floor(Number(c.level) || 0);
      if (lv <= 0) continue;
      var def = c.definition;
      var cn =
        def && typeof def === 'object' && typeof def.name === 'string'
          ? String(def.name)
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim()
          : '';
      if (cn.indexOf('paladin') !== -1) paladinLevels += lv;
    }
    return paladinLevels > 0 ? paladinLevels * 5 : 0;
  }
  
  var __LIMITED_USE_ACTION_BUCKETS_USR = ['class', 'race', 'feat', 'background', 'bonusAction', 'special'];
  
  function __ddbExtractClassResourcesFromActionsUsr(raw) {
    var r = raw;
    if (!r || typeof r !== 'object') return [];
    var actions = r.actions;
    if (!actions || typeof actions !== 'object' || Array.isArray(actions)) return [];
  
    var byDedupeKey = new Map();
    var paladinLohCap = __getPaladinLayOnHandsPoolCapUsr(r);
  
    for (var bi = 0; bi < __LIMITED_USE_ACTION_BUCKETS_USR.length; bi++) {
      var bucket = __LIMITED_USE_ACTION_BUCKETS_USR[bi];
      var arr = actions[bucket];
      if (!Array.isArray(arr)) continue;
      for (var j = 0; j < arr.length; j++) {
        var item = arr[j];
        if (!item || typeof item !== 'object') continue;
        if (item.usesSpellSlot === true) continue;
        var lu = item.limitedUse;
        if (!lu || typeof lu !== 'object') continue;
        var maxUses = Math.floor(
          Number(lu.maxUses ?? lu.numberAvailable ?? lu.max ?? lu.uses) || 0,
        );
        if (!Number.isFinite(maxUses) || maxUses <= 0) continue;
        var numberUsed = Math.max(
          0,
          Math.floor(Number(lu.numberUsed ?? lu.used ?? lu.numberExpended ?? lu.expended) || 0),
        );
        var def = item.definition;
        var defName =
          def && typeof def === 'object' && typeof def.name === 'string' ? String(def.name).trim() : '';
        var name = (typeof item.name === 'string' && item.name.trim()) || defName || 'Resource';
        var dedupeKey = __classResourceDedupeKeyUsr(name);
        var available = maxUses;
        var used = Math.min(numberUsed, available);
        if (dedupeKey === 'lay on hands' && paladinLohCap > 0) {
          available = Math.max(available, paladinLohCap);
          used = Math.min(used, available);
        }
        var prev = byDedupeKey.get(dedupeKey);
        if (!prev) {
          byDedupeKey.set(dedupeKey, { name: name, used: used, max: available });
        } else {
          var mergedAvail = Math.max(prev.max, available);
          var mergedUsed = Math.min(prev.used, used);
          if (dedupeKey === 'lay on hands' && paladinLohCap > 0) {
            mergedAvail = Math.max(mergedAvail, paladinLohCap);
            mergedUsed = Math.min(mergedUsed, mergedAvail);
          }
          var longerLabel = name.length > prev.name.length ? name : prev.name;
          byDedupeKey.set(dedupeKey, {
            name: longerLabel,
            used: Math.min(mergedUsed, mergedAvail),
            max: mergedAvail,
          });
        }
      }
    }
  
    var PRIORITY = ['ki', 'rage', 'bardic inspiration', 'sorcery points', 'superiority dice'];
    function rank(label) {
      var low = label.toLowerCase();
      for (var p = 0; p < PRIORITY.length; p++) {
        if (low.indexOf(PRIORITY[p]) !== -1) return p;
      }
      return PRIORITY.length;
    }
    var list = Array.from(byDedupeKey.values());
    list.sort(function (a, b) {
      var dr = rank(a.name) - rank(b.name);
      if (dr !== 0) return dr;
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function summarizeSpellSlotRows(c) {
    if (!c || typeof c !== 'object') return [];
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
    const summaries = __ddbExtractSpellSlotSummariesUsr(c);
    const lines = [];
    for (let i = 0; i < summaries.length; i++) {
      const s = summaries[i];
      const lv = s.level;
      const max = Math.max(0, Math.floor(Number(s.available) || 0));
      const used = Math.max(0, Math.min(max, Math.floor(Number(s.used) || 0)));
      const rem = Math.max(0, max - used);
      if (max <= 0 && used <= 0) continue;
      lines.push({
        level: lv,
        label: ordinals[lv] || lv + 'th',
        remaining: rem,
        max: max,
      });
    }
    return lines;
  }

  /**
   * Spell rows from loaded character JSON, aligned with TeaWithLucas module output:
   * spellSlots, pactMagic, pactMagicSlots, classes[].definition.spellRules.levelSpellSlots.
   * @see https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  function extractSpellSlotsFromCharacter(c) {
    return summarizeSpellSlotRows(c);
  }

  /** Only levels where the character has at least one slot (max > 0). */
  function getAvailableSpellSlots(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(function (r) {
      return r && typeof r === 'object' && Number(r.max) > 0;
    });
  }

  /**
   * Renders compact horizontal groups: "1st ●●○○" (filled vs empty).
   * @param {HTMLElement} mountEl - container; cleared and receives one .dib-pc-slots-compact row
   * @param {Array} rows - output of summarizeSpellSlotRows / extractSpellSlotsFromCharacter
   */
  function renderCompactSpellSlots(mountEl, rows) {
    if (!mountEl) return;
    mountEl.textContent = '';
    const filtered = getAvailableSpellSlots(rows);
    if (!filtered.length) return;
    const flex = document.createElement('div');
    flex.className = 'dib-pc-slots-compact';
    for (let i = 0; i < filtered.length; i++) {
      const s = filtered[i];
      const grp = document.createElement('span');
      grp.className = 'dib-pc-slot-group';
      const lv = document.createElement('span');
      lv.className = 'dib-pc-slot-lv';
      lv.textContent = s.label;
      const dots = document.createElement('span');
      dots.className = 'dib-pc-slot-dots';
      const cap = Math.min(12, Math.max(1, Number(s.max) || 0));
      const rem = Math.max(0, Math.min(cap, Number(s.remaining) || 0));
      for (let d = 0; d < cap; d++) {
        const g = document.createElement('span');
        g.className = 'dib-pc-slot-glyph' + (d < rem ? ' dib-pc-slot-glyph--on' : ' dib-pc-slot-glyph--off');
        g.textContent = d < rem ? '\u25cf' : '\u25cb';
        g.setAttribute('aria-hidden', 'true');
        dots.appendChild(g);
      }
      grp.appendChild(lv);
      grp.appendChild(dots);
      flex.appendChild(grp);
    }
    mountEl.appendChild(flex);
  }

  /**
   * Same dot row as spell slots; label = feature name. If max > 12, uses 12 dots proportionally.
   */
  function renderCompactClassResourceDots(mountEl, res) {
    if (!mountEl || !Array.isArray(res) || !res.length) return;
    mountEl.textContent = '';
    const flex = document.createElement('div');
    flex.className = 'dib-pc-slots-compact dib-pc-class-res-dots';
    for (let i = 0; i < res.length; i++) {
      const r = res[i];
      if (!r || typeof r !== 'object') continue;
      const max = Math.max(1, Math.floor(Number(r.max) || 0));
      const used = Math.max(0, Math.min(max, Math.floor(Number(r.used) || 0)));
      const remaining = Math.max(0, max - used);
      var cap;
      var remDots;
      if (max <= 12) {
        cap = max;
        remDots = remaining;
      } else {
        cap = 12;
        remDots = Math.min(cap, Math.ceil((remaining / max) * cap));
      }
      const grp = document.createElement('span');
      grp.className = 'dib-pc-slot-group';
      const lv = document.createElement('span');
      lv.className = 'dib-pc-slot-lv dib-pc-class-res-lv';
      const fullName = String(r.name || '').trim();
      lv.textContent = fullName.length > 14 ? fullName.slice(0, 13) + '\u2026' : fullName || '—';
      lv.title = fullName + (max > 12 ? ' (' + remaining + '/' + max + ')' : '');
      const dots = document.createElement('span');
      dots.className = 'dib-pc-slot-dots';
      for (let d = 0; d < cap; d++) {
        const g = document.createElement('span');
        g.className = 'dib-pc-slot-glyph' + (d < remDots ? ' dib-pc-slot-glyph--on' : ' dib-pc-slot-glyph--off');
        g.textContent = d < remDots ? '\u25cf' : '\u25cb';
        g.setAttribute('aria-hidden', 'true');
        dots.appendChild(g);
      }
      grp.appendChild(lv);
      grp.appendChild(dots);
      flex.appendChild(grp);
    }
    mountEl.appendChild(flex);
  }

  /**
   * Roster spell blocks refresh via refreshPartyRoster polling + renderRoster — no native DDB DOM to observe.
   * Hook here if you later inject into a live page subtree that re-renders without full card rebuild.
   */
  function observeSpellSlotChanges() {}

  function summarizeClassResourceRows(c) {
    if (!c || typeof c !== 'object') return [];
    const byKey = new Map();
    function addResourceRow(displayName, used, maxVal) {
      const max = Math.floor(Number(maxVal) || 0);
      if (!displayName || !Number.isFinite(max) || max < 1) return;
      const name = String(displayName).trim();
      const key = __classResourceDedupeKeyUsr(name);
      const usedN = Math.max(0, Math.min(max, Math.floor(Number(used) || 0)));
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { name: name.slice(0, 48), used: usedN, max: max });
        return;
      }
      const mergedMax = Math.max(prev.max, max);
      const mergedUsed = Math.min(prev.used, usedN);
      const longer = name.length > prev.name.length ? name.slice(0, 48) : prev.name;
      byKey.set(key, {
        name: longer,
        used: Math.min(mergedUsed, mergedMax),
        max: mergedMax,
      });
    }
    const fromActions = __ddbExtractClassResourcesFromActionsUsr(c);
    for (let ai = 0; ai < fromActions.length; ai++) {
      const r = fromActions[ai];
      addResourceRow(r.name, r.used, r.max);
    }
    const inv = c.inventory;
    if (Array.isArray(inv)) {
      for (let ii = 0; ii < inv.length; ii++) {
        const item = inv[ii];
        const lu = item && item.limitedUse;
        if (!lu || typeof lu !== 'object') continue;
        const maxUses = Number(lu.maxUses ?? lu.max);
        if (!Number.isFinite(maxUses) || maxUses < 1) continue;
        const def = item.definition;
        const name =
          (def && typeof def.name === 'string' && def.name.trim()) ||
          (typeof item.name === 'string' && item.name.trim()) ||
          '';
        if (!name) continue;
        const used = Number(lu.numberUsed ?? lu.used ?? 0) || 0;
        addResourceRow(name, used, maxUses);
      }
    }
    const list = Array.from(byKey.values());
    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    return list.slice(0, 12);
  }

  /** PHB standard condition definition ids (legacy /json rows often omit `name`). */
  const DDB_STD_CONDITION_ID_TO_LABEL = {
    1: 'Blinded',
    2: 'Charmed',
    3: 'Deafened',
    4: 'Exhaustion',
    5: 'Frightened',
    6: 'Grappled',
    7: 'Incapacitated',
    8: 'Invisible',
    9: 'Paralyzed',
    10: 'Petrified',
    11: 'Poisoned',
    12: 'Prone',
    13: 'Restrained',
    14: 'Stunned',
    15: 'Unconscious',
  };

  const DDB_CONDITION_PLACEHOLDER_LOWER = new Set([
    'add active conditions',
    'manage conditions',
    'no active conditions',
    'no conditions',
    'actions',
    'proficiencies & training',
    'inventory',
    'features & traits',
    'extras',
    'spells',
    '0',
    '+0',
  ]);

  function isDdbConditionPlaceholderLabel(s) {
    const t = String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!t) return true;
    if (DDB_CONDITION_PLACEHOLDER_LOWER.has(t)) return true;
    if (t.startsWith('add ') && t.includes('condition')) return true;
    if (t.includes('add active conditions')) return true;
    return false;
  }

  function tryStdCondDefId(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return DDB_STD_CONDITION_ID_TO_LABEL[v] != null ? v : null;
  }

  function resolveStdConditionDefIdFromObject(o) {
    if (!o || typeof o !== 'object') return null;
    const keys = ['definitionId', 'conditionDefinitionId', 'standardConditionDefinitionId'];
    for (let i = 0; i < keys.length; i++) {
      const t = tryStdCondDefId(o[keys[i]]);
      if (t != null) return t;
    }
    const def = o.definition;
    if (def && typeof def === 'object' && !Array.isArray(def)) {
      const d = def;
      const dk = tryStdCondDefId(d.id);
      if (dk != null) return dk;
      const dd = tryStdCondDefId(d.definitionId);
      if (dd != null) return dd;
    }
    return tryStdCondDefId(o.id);
  }

  function labelFromStdConditionRef(o) {
    const defId = resolveStdConditionDefIdFromObject(o);
    if (defId == null) return null;
    const base = DDB_STD_CONDITION_ID_TO_LABEL[defId];
    if (!base) return null;
    if (base === 'Exhaustion') {
      const lv = o.level;
      if (typeof lv === 'number' && lv >= 1 && lv <= 6) return 'Exhaustion ' + lv;
      return 'Exhaustion';
    }
    return base;
  }

  function isLikelySpellSlotLeakConditionRow(o) {
    if (!o || typeof o !== 'object') return false;
    if (typeof o.name === 'string' && o.name.trim()) return false;
    if (typeof o.label === 'string' && o.label.trim()) return false;
    const def = o.definition;
    if (def && typeof def === 'object' && typeof def.name === 'string' && def.name.trim()) return false;
    if (typeof o.id !== 'number' || !Number.isFinite(o.id)) return false;
    if (DDB_STD_CONDITION_ID_TO_LABEL[o.id]) return false;
    const lv = o.level;
    if (lv !== null && lv !== undefined && typeof lv !== 'number') return false;
    return true;
  }

  function ddbConditionEntryToLabel(x) {
    if (typeof x === 'string') {
      const t = x.trim();
      return t || '';
    }
    if (!x || typeof x !== 'object') return '';
    const o = x;
    if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
    if (typeof o.label === 'string' && o.label.trim()) return o.label.trim();
    const def = o.definition;
    if (def && typeof def === 'object' && typeof def.name === 'string' && def.name.trim()) return def.name.trim();
    const fromStd = labelFromStdConditionRef(o);
    if (fromStd) return fromStd;
    if (isLikelySpellSlotLeakConditionRow(o)) return '';
    try {
      return JSON.stringify(x);
    } catch (_) {
      return String(x);
    }
  }

  function __cloneJsonValueUsr(v) {
    if (v === null || typeof v !== 'object') return v;
    try {
      if (typeof structuredClone === 'function') return structuredClone(v);
    } catch (_) {}
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (__) {
      return v;
    }
  }

  function __conditionRowDedupeKeyUsr(row) {
    if (!row || typeof row !== 'object') return '';
    const id = Number(row.id ?? row.conditionId ?? row.conditionDefinitionId ?? row.definitionId);
    if (Number.isFinite(id) && id > 0) return 'id:' + id;
    const lb = ddbConditionEntryToLabel(row);
    if (lb && typeof lb === 'string') {
      const t = lb.trim().toLowerCase();
      if (t && t.length < 400) return 'lb:' + t;
    }
    return '';
  }

  function __mergeConditionLikeArraysUsr(a, b) {
    const A = Array.isArray(a) ? a : [];
    const B = Array.isArray(b) ? b : [];
    if (!B.length) return __cloneJsonValueUsr(A);
    if (!A.length) return __cloneJsonValueUsr(B);
    const seen = new Set();
    const out = [];
    function pushArr(arr) {
      for (let i = 0; i < arr.length; i++) {
        const row = arr[i];
        const k = __conditionRowDedupeKeyUsr(row);
        if (k) {
          if (seen.has(k)) continue;
          seen.add(k);
        }
        out.push(__cloneJsonValueUsr(row));
      }
    }
    pushArr(A);
    pushArr(B);
    return out;
  }

  function __modifierRowDedupeKeyUsr(m) {
    if (!m || typeof m !== 'object') return '';
    const id = Number(m.id ?? m.modifierId ?? m.entityId);
    if (Number.isFinite(id) && id > 0) return 'id:' + id;
    try {
      return 'j:' + JSON.stringify(m);
    } catch (_) {
      return '';
    }
  }

  /**
   * Richer legacy `/json` as base, overlay character-service v5; union `conditions` / `activeConditions` / `modifiers` buckets
   * so slim v5 + full legacy (or split condition sources) do not drop rows.
   */
  function mergeDdbLegacyAndV5Character(legacy, live) {
    if (!legacy || typeof legacy !== 'object') return live ? __cloneJsonValueUsr(live) : legacy;
    if (!live || typeof live !== 'object') return __cloneJsonValueUsr(legacy);
    const target = __cloneJsonValueUsr(legacy);
    const keys = Object.keys(live);
    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki];
      const lv = live[key];
      if (lv === undefined) continue;
      if (key === 'conditions') {
        target.conditions = __mergeConditionLikeArraysUsr(target.conditions, lv);
        continue;
      }
      if (key === 'activeConditions') {
        target.activeConditions = __mergeConditionLikeArraysUsr(target.activeConditions, lv);
        continue;
      }
      if (key === 'hitPointInfo' && lv && typeof lv === 'object' && !Array.isArray(lv)) {
        const prev = target.hitPointInfo && typeof target.hitPointInfo === 'object' ? target.hitPointInfo : {};
        target.hitPointInfo = Object.assign({}, __cloneJsonValueUsr(prev), __cloneJsonValueUsr(lv));
        continue;
      }
      if (key === 'deathSaveInfo' && lv && typeof lv === 'object' && !Array.isArray(lv)) {
        const prev = target.deathSaveInfo && typeof target.deathSaveInfo === 'object' ? target.deathSaveInfo : {};
        target.deathSaveInfo = Object.assign({}, __cloneJsonValueUsr(prev), __cloneJsonValueUsr(lv));
        continue;
      }
      if (key === 'modifiers' && lv && typeof lv === 'object' && !Array.isArray(lv)) {
        const prev = target.modifiers && typeof target.modifiers === 'object' ? target.modifiers : {};
        const mergedMods = Object.assign({}, __cloneJsonValueUsr(prev));
        const bk = Object.keys(lv);
        for (let mj = 0; mj < bk.length; mj++) {
          const bucketKey = bk[mj];
          const liveBucket = lv[bucketKey];
          const prevBucket = mergedMods[bucketKey];
          if (Array.isArray(liveBucket) && Array.isArray(prevBucket)) {
            const seen = new Set();
            const out = [];
            function pushBucket(arr) {
              for (let i = 0; i < arr.length; i++) {
                const m = arr[i];
                const dk = __modifierRowDedupeKeyUsr(m);
                if (dk) {
                  if (seen.has(dk)) continue;
                  seen.add(dk);
                }
                out.push(__cloneJsonValueUsr(m));
              }
            }
            pushBucket(prevBucket);
            pushBucket(liveBucket);
            mergedMods[bucketKey] = out;
          } else {
            mergedMods[bucketKey] = __cloneJsonValueUsr(liveBucket);
          }
        }
        target.modifiers = mergedMods;
        continue;
      }
      if (lv === null) {
        target[key] = null;
        continue;
      }
      if (Array.isArray(lv)) {
        target[key] = __cloneJsonValueUsr(lv);
        continue;
      }
      if (typeof lv === 'object') {
        const tv = target[key];
        if (tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
          target[key] = Object.assign({}, __cloneJsonValueUsr(tv), __cloneJsonValueUsr(lv));
        } else {
          target[key] = __cloneJsonValueUsr(lv);
        }
        continue;
      }
      target[key] = lv;
    }
    return target;
  }

  function isLikelyStdConditionCatalogLeak(arr) {
    if (!Array.isArray(arr) || arr.length < 8) return false;
    const ids = [];
    for (let i = 0; i < arr.length; i++) {
      const id = resolveStdConditionDefIdFromObject(arr[i]);
      if (id == null) return false;
      ids.push(id);
    }
    const sorted = ids.slice().sort((a, b) => a - b);
    if (sorted.length !== arr.length) return false;
    for (let j = 0; j < sorted.length; j++) {
      if (sorted[j] !== j + 1) return false;
    }
    return true;
  }

  function expandGluedConditionTokens(label) {
    const s = String(label || '').trim();
    if (!s || s.indexOf(' ') !== -1 || s.indexOf(',') !== -1) return [s];
    const parts = s.match(/[A-Z][a-z]+/g);
    if (!parts || parts.length < 2) return [s];
    const known = new Set([
      'blinded',
      'charmed',
      'deafened',
      'exhaustion',
      'frightened',
      'grappled',
      'incapacitated',
      'invisible',
      'paralyzed',
      'petrified',
      'poisoned',
      'prone',
      'restrained',
      'stunned',
      'unconscious',
    ]);
    const lower = parts.map((p) => p.toLowerCase());
    if (!lower.every((w) => known.has(w))) return [s];
    return parts;
  }

  /**
   * Active conditions from DDB character JSON / TeaWithLucas module output (`conditions`, `activeConditions`).
   * @see https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  function extractDdbConditionLabels(c) {
    if (!c || typeof c !== 'object') return [];
    const r = c;
    const labels = new Set();
    const maxLabels = 24;
    function consume(arr) {
      if (!Array.isArray(arr)) return;
      if (isLikelyStdConditionCatalogLeak(arr)) return;
      for (let i = 0; i < arr.length; i++) {
        const lb = ddbConditionEntryToLabel(arr[i]);
        if (!lb || isDdbConditionPlaceholderLabel(lb)) continue;
        const pieces = expandGluedConditionTokens(lb);
        for (let p = 0; p < pieces.length; p++) {
          const piece = pieces[p];
          if (piece && !isDdbConditionPlaceholderLabel(piece)) labels.add(piece);
        }
        if (labels.size >= maxLabels) return;
      }
    }
    function consumeModifiers(modRoot) {
      if (!modRoot || typeof modRoot !== 'object' || Array.isArray(modRoot)) return;
      const mkeys = Object.keys(modRoot);
      for (let ki = 0; ki < mkeys.length; ki++) {
        const arr = modRoot[mkeys[ki]];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!m || typeof m !== 'object') continue;
          if (m.type !== 'condition') continue;
          const n = String(m.friendlySubtypeName || m.subType || m.name || '').trim();
          if (!n || isDdbConditionPlaceholderLabel(n)) continue;
          const pieces = expandGluedConditionTokens(n);
          for (let p = 0; p < pieces.length; p++) {
            const piece = pieces[p];
            if (piece && !isDdbConditionPlaceholderLabel(piece)) labels.add(piece);
          }
          if (labels.size >= maxLabels) return;
        }
      }
    }
    consume(r.conditions);
    consume(r.activeConditions);
    consumeModifiers(r.modifiers);
    return Array.from(labels).slice(0, maxLabels);
  }

  function conditionLabelsForCard(c) {
    return extractDdbConditionLabels(c);
  }

  function hpBoxParts(c) {
    if (!c || typeof c !== 'object') return { cur: '—', max: '—', temp: 0 };
    const hpi = c.hitPointInfo;
    if (hpi && typeof hpi === 'object') {
      const max = Number(
        hpi.maxHitPoints ?? hpi.max ?? hpi.hitPointsMax ?? hpi.maximumHitPoints ?? hpi.hitPointMaximum,
      );
      const cur = Number(
        hpi.currentHitPoints ?? hpi.current ?? hpi.hitPoints ?? hpi.hitPointsCurrent ?? hpi.remaining,
      );
      const tmp = Number(hpi.tempHitPoints ?? hpi.temp ?? hpi.temporaryHitPoints) || 0;
      if (Number.isFinite(max) && max > 0) {
        return {
          cur: Number.isFinite(cur) ? String(Math.max(0, Math.floor(cur))) : '—',
          max: String(Math.floor(max)),
          temp: tmp > 0 ? tmp : 0,
        };
      }
    }
    const base = Number(c.baseHitPoints);
    const rem = Number(c.removedHitPoints) || 0;
    const tmp = Number(c.temporaryHitPoints) || 0;
    const ov = c.overrideHitPoints;
    const max =
      Number.isFinite(Number(ov)) && Number(ov) > 0
        ? Math.floor(Number(ov))
        : Number.isFinite(base) && base >= 0
          ? Math.floor(base)
          : null;
    const cur =
      Number.isFinite(base) && base >= 0 ? Math.max(0, Math.floor(base - rem)) : null;
    return {
      cur: cur == null ? '—' : String(cur),
      max: max == null ? '—' : String(max),
      temp: tmp > 0 ? tmp : 0,
    };
  }

  function clampDeathSaveSlot(n) {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 0) return 0;
    return Math.min(3, x);
  }

  function countDeathSaveBoolArray(arr) {
    if (!Array.isArray(arr)) return null;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const x = arr[i];
      if (x === true || x === 1) n++;
    }
    return n;
  }

  function pickDeathSaveCountsFromObject(ds) {
    if (!ds || typeof ds !== 'object') return { s: null, f: null };
    let s =
      ds.successCount ??
      ds.successes ??
      ds.success ??
      ds.saveSuccesses ??
      ds.deathSavesSuccessCount ??
      ds.deathSaveSuccessCount;
    let f =
      ds.failureCount ??
      ds.failures ??
      ds.fail ??
      ds.fails ??
      ds.saveFailures ??
      ds.deathSavesFailCount ??
      ds.deathSaveFailCount;
    if (Array.isArray(s)) {
      const c = countDeathSaveBoolArray(s);
      s = c != null ? c : null;
    }
    if (Array.isArray(f)) {
      const c = countDeathSaveBoolArray(f);
      f = c != null ? c : null;
    }
    if (s == null || s === '') {
      const c2 = countDeathSaveBoolArray(ds.deathSaveSuccesses);
      if (c2 != null) s = c2;
    }
    if (f == null || f === '') {
      const c3 = countDeathSaveBoolArray(ds.deathSaveFailures);
      if (c3 != null) f = c3;
    }
    return { s: s, f: f };
  }

  /** DDB + TeaWithLucas module: hitPointInfo, deathSaveInfo, top-level successes/fails. @see Module-output wiki */
  function deathSavesFromCharacter(c) {
    const empty = { successes: 0, failures: 0 };
    if (!c || typeof c !== 'object') return empty;
    let s = null;
    let f = null;
    const hpi = c.hitPointInfo;
    if (hpi && typeof hpi === 'object') {
      s =
        hpi.deathSavesSuccessCount ??
        hpi.deathSaveSuccessCount ??
        hpi.deathSavesSuccess ??
        hpi.successCount ??
        hpi.successes ??
        hpi.success;
      f =
        hpi.deathSavesFailCount ??
        hpi.deathSaveFailCount ??
        hpi.deathSavesFail ??
        hpi.failureCount ??
        hpi.failures ??
        hpi.fail;
      if (Array.isArray(s)) {
        const c = countDeathSaveBoolArray(s);
        s = c != null ? c : null;
      }
      if (Array.isArray(f)) {
        const c = countDeathSaveBoolArray(f);
        f = c != null ? c : null;
      }
      if ((s == null || s === '') && (f == null || f === '') && hpi.deathSaveInfo && typeof hpi.deathSaveInfo === 'object') {
        const inner = pickDeathSaveCountsFromObject(hpi.deathSaveInfo);
        s = inner.s;
        f = inner.f;
      }
      if (s == null || s === '') {
        const bs = countDeathSaveBoolArray(hpi.deathSaveSuccesses);
        if (bs != null) s = bs;
      }
      if (f == null || f === '') {
        const bf = countDeathSaveBoolArray(hpi.deathSaveFailures);
        if (bf != null) f = bf;
      }
    }
    if ((s == null || s === '') && (f == null || f === '')) {
      const topDsi = c.deathSaveInfo;
      if (topDsi && typeof topDsi === 'object') {
        const inner = pickDeathSaveCountsFromObject(topDsi);
        if (s == null || s === '') s = inner.s;
        if (f == null || f === '') f = inner.f;
      }
    }
    if ((s == null || s === '') && (f == null || f === '')) {
      const ds = c.deathSaves ?? c.deathSave;
      if (ds && typeof ds === 'object') {
        const inner = pickDeathSaveCountsFromObject(ds);
        if (s == null || s === '') s = inner.s;
        if (f == null || f === '') f = inner.f;
      }
    }
    if (s == null || s === '') {
      const sv = c.successes;
      if (typeof sv === 'number' && Number.isFinite(sv)) s = sv;
      else if (Array.isArray(sv)) {
        const c0 = countDeathSaveBoolArray(sv);
        if (c0 != null) s = c0;
      }
    }
    if (f == null || f === '') {
      const fv = c.fails;
      if (typeof fv === 'number' && Number.isFinite(fv)) f = fv;
      else if (Array.isArray(fv)) {
        const c1 = countDeathSaveBoolArray(fv);
        if (c1 != null) f = c1;
      }
    }
    if ((s == null || s === '') && (f == null || f === '')) {
      const cTop = pickDeathSaveCountsFromObject(c);
      if (s == null || s === '') s = cTop.s;
      if (f == null || f === '') f = cTop.f;
    }
    return {
      successes: clampDeathSaveSlot(s),
      failures: clampDeathSaveSlot(f),
    };
  }

  function appendSpellSlotsToParent(parent, c) {
    if (!c) return;
    const rows = extractSpellSlotsFromCharacter(c);
    if (!getAvailableSpellSlots(rows).length) return;
    const sec = document.createElement('div');
    sec.className = 'dib-pc-block dib-pc-slots-block';
    const st = document.createElement('div');
    st.className = 'dib-pc-section-title';
    st.textContent = 'Spell slots';
    sec.appendChild(st);
    const wrap = document.createElement('div');
    wrap.className = 'dib-pc-slots-compact-wrap';
    renderCompactSpellSlots(wrap, rows);
    sec.appendChild(wrap);
    parent.appendChild(sec);
  }

  function appendClassResourcesToParent(parent, c) {
    if (!c) return;
    const res = summarizeClassResourceRows(c);
    if (!res.length) return;
    const sec2 = document.createElement('div');
    sec2.className = 'dib-pc-block dib-pc-resources-block';
    const st2 = document.createElement('div');
    st2.className = 'dib-pc-section-title';
    st2.textContent = 'Class features';
    sec2.appendChild(st2);
    const wrap = document.createElement('div');
    wrap.className = 'dib-pc-slots-compact-wrap';
    renderCompactClassResourceDots(wrap, res);
    sec2.appendChild(wrap);
    parent.appendChild(sec2);
  }

  function __localNewId() {
    return 'i' + Math.floor(Math.random() * 1e9).toString(36).slice(0, 8) + Date.now().toString(36);
  }

  function emptyLocalInitiativeState() {
    return {
      round: 1,
      currentTurnIndex: 0,
      turnOrder: [],
      entries: {},
      markedEntryId: null,
      revealedEntryIds: [],
      combatActive: false,
    };
  }

  function localRollD20() {
    return Math.floor(Math.random() * 20) + 1;
  }

  function localRollWithMode(mode) {
    if (mode === 'advantage') {
      const a = localRollD20();
      const b = localRollD20();
      return { rolls: [a, b], kept: Math.max(a, b) };
    }
    if (mode === 'disadvantage') {
      const a = localRollD20();
      const b = localRollD20();
      return { rolls: [a, b], kept: Math.min(a, b) };
    }
    const v = localRollD20();
    return { rolls: [v], kept: v };
  }

  function localAddCombatant(state, input) {
    const id = __localNewId();
    const entityId = input.entityId != null ? String(input.entityId) : id;
    const mod = input.mod != null ? Number(input.mod) : 0;
    const entry = {
      id,
      entityId,
      label: String(input.label || 'Combatant'),
      initiativeTotal: input.initiativeTotal != null ? Number(input.initiativeTotal) : 0,
      rollMode: input.rollMode || 'normal',
      mod: Number.isFinite(mod) ? mod : 0,
      conditions: Array.isArray(input.conditions) ? input.conditions.slice() : [],
    };
    if (input.dexMod != null && Number.isFinite(Number(input.dexMod))) entry.dexMod = Number(input.dexMod);
    if (input.avatarUrl) entry.avatarUrl = String(input.avatarUrl);
    const nextEntries = Object.assign({}, state.entries);
    nextEntries[id] = entry;
    return {
      round: state.round,
      currentTurnIndex: state.currentTurnIndex,
      markedEntryId: state.markedEntryId ?? null,
      combatActive: !!state.combatActive,
      entries: nextEntries,
      turnOrder: state.turnOrder.concat([id]),
      revealedEntryIds: Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds.slice() : [],
    };
  }

  function localRemoveCombatant(state, entryId) {
    const restEntries = Object.assign({}, state.entries);
    delete restEntries[entryId];
    const oldOrder = state.turnOrder;
    const idx = oldOrder.indexOf(entryId);
    const turnOrder = oldOrder.filter((x) => x !== entryId);
    let currentTurnIndex = state.currentTurnIndex;
    if (idx !== -1) {
      if (idx < currentTurnIndex) currentTurnIndex -= 1;
      else if (idx === currentTurnIndex)
        currentTurnIndex = Math.min(currentTurnIndex, Math.max(0, turnOrder.length - 1));
    }
    if (turnOrder.length === 0) currentTurnIndex = 0;
    else if (currentTurnIndex >= turnOrder.length) currentTurnIndex = turnOrder.length - 1;
    const markedEntryId = state.markedEntryId === entryId ? null : state.markedEntryId ?? null;
    const revealedEntryIds = (Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds : []).filter(
      function (rid) {
        return rid !== entryId && turnOrder.indexOf(rid) !== -1;
      },
    );
    return {
      round: state.round,
      currentTurnIndex,
      turnOrder,
      entries: restEntries,
      markedEntryId,
      revealedEntryIds,
      combatActive: turnOrder.length ? !!state.combatActive : false,
    };
  }

  function localRollInitiative(state, entryId) {
    const ids = entryId ? [entryId] : state.turnOrder.slice();
    let revealedEntryIds = Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds.slice() : [];
    if (!entryId) {
      revealedEntryIds = [];
    } else {
      revealedEntryIds = revealedEntryIds.filter(function (rid) {
        return ids.indexOf(rid) === -1;
      });
    }
    const nextEntries = Object.assign({}, state.entries);
    for (let i = 0; i < ids.length; i++) {
      const eid = ids[i];
      const e = nextEntries[eid];
      if (!e) continue;
      const mode = e.rollMode || 'normal';
      const r = localRollWithMode(mode);
      const mod = e.mod;
      const total = r.kept + mod;
      nextEntries[eid] = Object.assign({}, e, {
        initiativeTotal: total,
        rollBreakdown: { rolls: r.rolls, kept: r.kept, mod },
      });
    }
    return Object.assign({}, state, {
      entries: nextEntries,
      markedEntryId: state.markedEntryId ?? null,
      revealedEntryIds: revealedEntryIds,
    });
  }

  /** Sort entire turn order by initiative (desc), then DEX tiebreak, then mod. */
  function sortInitiative(state) {
    const order = state.turnOrder.slice();
    if (!order.length) return state;
    const sorted = order.slice().sort((a, b) => {
      const ea = state.entries[a];
      const eb = state.entries[b];
      const ta = ea ? ea.initiativeTotal : 0;
      const tb = eb ? eb.initiativeTotal : 0;
      if (tb !== ta) return tb - ta;
      const dexA = ea && ea.dexMod;
      const dexB = eb && eb.dexMod;
      const hasA = dexA != null && Number.isFinite(dexA);
      const hasB = dexB != null && Number.isFinite(dexB);
      if (hasA && hasB && dexB !== dexA) return dexB - dexA;
      const ma = ea ? ea.mod : 0;
      const mb = eb ? eb.mod : 0;
      if (mb !== ma) return mb - ma;
      return String(a).localeCompare(String(b));
    });
    return Object.assign({}, state, { turnOrder: sorted, markedEntryId: state.markedEntryId ?? null });
  }

  /** Roll everyone (omit entryId) or one combatant. */
  function rollAllInitiative(state) {
    return localRollInitiative(state);
  }

  /** Decrement condition durations; remove when duration reaches 0. Infinite (null) unchanged. */
  function updateConditions(state) {
    const nextEntries = Object.assign({}, state.entries);
    const ids = Object.keys(nextEntries);
    for (let i = 0; i < ids.length; i++) {
      const eid = ids[i];
      const e = nextEntries[eid];
      if (!e) continue;
      const conds = Array.isArray(e.conditions) ? e.conditions : [];
      const out = [];
      for (let j = 0; j < conds.length; j++) {
        const c = conds[j];
        if (!c || typeof c.name !== 'string') continue;
        const name = c.name.trim();
        if (!name) continue;
        const dur = c.duration;
        if (dur == null) {
          out.push({ name, duration: null });
          continue;
        }
        const n = Math.floor(Number(dur));
        if (!Number.isFinite(n)) {
          out.push({ name, duration: null });
          continue;
        }
        const nextDur = n - 1;
        if (nextDur > 0) out.push({ name, duration: nextDur });
      }
      nextEntries[eid] = Object.assign({}, e, { conditions: out });
    }
    return Object.assign({}, state, { entries: nextEntries, markedEntryId: state.markedEntryId ?? null });
  }

  function nextRound(state) {
    let s = updateConditions(state);
    s = Object.assign({}, s, { round: Math.max(1, (s.round || 1) + 1) });
    s = rollAllInitiative(s);
    s = sortInitiative(s);
    return Object.assign({}, s, {
      currentTurnIndex: 0,
      markedEntryId: s.markedEntryId ?? null,
    });
  }

  function localNextTurn(state) {
    if (!state.turnOrder.length) return state;
    const oldIdx = state.currentTurnIndex;
    const oldId = state.turnOrder[oldIdx];
    let revealedEntryIds = Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds.slice() : [];
    if (allCombatantsHaveRolled(state) && oldId && revealedEntryIds.indexOf(oldId) === -1) {
      revealedEntryIds.push(oldId);
    }
    const lastIdx = state.turnOrder.length - 1;
    if (
      state.combatActive &&
      allCombatantsHaveRolled(state) &&
      oldIdx === lastIdx &&
      revealedIdsCoverFullTurnOrder(state, revealedEntryIds)
    ) {
      return nextRound(state);
    }
    let nextIndex = oldIdx + 1;
    if (nextIndex >= state.turnOrder.length) {
      nextIndex = 0;
      revealedEntryIds = [];
    }
    return Object.assign({}, state, {
      currentTurnIndex: nextIndex,
      round: state.round,
      markedEntryId: state.markedEntryId ?? null,
      revealedEntryIds: revealedEntryIds,
    });
  }

  function localPrevTurn(state) {
    if (!state.turnOrder.length) return state;
    let nextIndex = state.currentTurnIndex - 1;
    if (nextIndex < 0) {
      nextIndex = state.turnOrder.length - 1;
    }
    return Object.assign({}, state, {
      currentTurnIndex: nextIndex,
      round: state.round,
      markedEntryId: state.markedEntryId ?? null,
      revealedEntryIds: Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds.slice() : [],
    });
  }

  function localSetRollMode(state, entryId, mode) {
    const e = state.entries[entryId];
    if (!e) return state;
    const next = Object.assign({}, e, { rollMode: mode });
    const ent = Object.assign({}, state.entries);
    ent[entryId] = next;
    return Object.assign({}, state, { entries: ent, markedEntryId: state.markedEntryId ?? null });
  }

  function applyRollModeAndRerollOne(state, entryId, mode) {
    let s = localSetRollMode(state, entryId, mode);
    s = localRollInitiative(s, entryId);
    return sortInitiative(s);
  }

  function entryHasRoll(e) {
    return !!(e && e.rollBreakdown && Array.isArray(e.rollBreakdown.rolls) && e.rollBreakdown.rolls.length);
  }

  function allCombatantsHaveRolled(s) {
    if (!s || !Array.isArray(s.turnOrder) || !s.turnOrder.length) return false;
    for (let i = 0; i < s.turnOrder.length; i++) {
      if (!entryHasRoll(s.entries[s.turnOrder[i]])) return false;
    }
    return true;
  }

  function revealedIdsCoverFullTurnOrder(state, revealedEntryIds) {
    if (!state.turnOrder.length) return false;
    const set = new Set(revealedEntryIds);
    for (let i = 0; i < state.turnOrder.length; i++) {
      if (!set.has(state.turnOrder[i])) return false;
    }
    return true;
  }

  function localSetCurrentTurnByEntityId(state, entityIdStr) {
    const want = String(entityIdStr);
    const idx = state.turnOrder.findIndex(function (tid) {
      const ent = state.entries[tid];
      return ent && String(ent.entityId) === want;
    });
    if (idx === -1) return state;
    const oldIdx = state.currentTurnIndex;
    const oldId = state.turnOrder[oldIdx];
    let revealedEntryIds = Array.isArray(state.revealedEntryIds) ? state.revealedEntryIds.slice() : [];
    if (idx !== oldIdx && allCombatantsHaveRolled(state) && oldId && revealedEntryIds.indexOf(oldId) === -1) {
      revealedEntryIds.push(oldId);
    }
    return Object.assign({}, state, {
      currentTurnIndex: idx,
      markedEntryId: state.markedEntryId ?? null,
      revealedEntryIds: revealedEntryIds,
    });
  }

  function migrateLoadedInitiativeState(p) {
    const entries = {};
    const src = p.entries && typeof p.entries === 'object' ? p.entries : {};
    Object.keys(src).forEach((eid) => {
      const e = src[eid];
      if (!e || typeof e !== 'object') return;
      const next = Object.assign({}, e);
      delete next.locked;
      delete next.delayed;
      delete next.ready;
      if (!Array.isArray(next.conditions)) next.conditions = [];
      else {
        next.conditions = next.conditions
          .map((c) => {
            if (!c || typeof c !== 'object') return null;
            const name = String(c.name || '').trim();
            if (!name) return null;
            let duration = c.duration;
            if (duration != null) {
              const n = Math.floor(Number(duration));
              duration = Number.isFinite(n) ? n : null;
            } else duration = null;
            return { name, duration };
          })
          .filter(Boolean);
      }
      entries[eid] = next;
    });
    const turnOrder = Array.isArray(p.turnOrder) ? p.turnOrder.filter((id) => entries[id]) : [];
    let combatActive = !!p.combatActive;
    if (!turnOrder.length) combatActive = false;
    const tmp = Object.assign({}, p, {
      entries,
      turnOrder,
      revealedEntryIds: Array.isArray(p.revealedEntryIds) ? p.revealedEntryIds.slice() : [],
    });
    if (!combatActive && turnOrder.length && allCombatantsHaveRolled(tmp)) combatActive = true;
    return Object.assign({}, p, {
      entries,
      turnOrder,
      round: typeof p.round === 'number' && p.round >= 1 ? p.round : 1,
      currentTurnIndex:
        typeof p.currentTurnIndex === 'number' && p.currentTurnIndex >= 0 ? p.currentTurnIndex : 0,
      markedEntryId: p.markedEntryId ?? null,
      revealedEntryIds: Array.isArray(p.revealedEntryIds) ? p.revealedEntryIds.slice() : [],
      combatActive,
    });
  }

  function loadLocalInitiativeState() {
    try {
      const raw = PAGE.localStorage.getItem(INIT_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object' && Array.isArray(p.turnOrder) && p.entries && typeof p.entries === 'object') {
          localInitState = migrateLoadedInitiativeState(p);
          return;
        }
      }
    } catch (_) {}
    localInitState = emptyLocalInitiativeState();
  }

  function saveLocalInitiativeState() {
    if (!localInitState) return;
    try {
      PAGE.localStorage.setItem(INIT_STORAGE_KEY, JSON.stringify(localInitState));
    } catch (_) {}
  }

  function mutateLocalInitiative(mutator) {
    localInitState = mutator(localInitState || emptyLocalInitiativeState());
    saveLocalInitiativeState();
    renderLocalInitiativeUi();
  }

  function buildPartyCombatState() {
    const ids = collectCharacterIdsFromDom();
    let s = emptyLocalInitiativeState();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const c = partyById[String(id)];
      if (!c) continue;
      const mod = __getInitiativeBonusFromCharacter(c);
      const dexMod = __getStatModFromCharacter(c, 2);
      const av = portraitUrlForCharacter(c, id);
      s = localAddCombatant(s, {
        label: String(c.name || 'Unknown'),
        entityId: String(id),
        mod,
        dexMod,
        avatarUrl: av || undefined,
      });
    }
    return s;
  }

  /** After confirmation: build roster from party DOM, roll all, sort DESC, round 1. */
  function startCombat() {
    let s = buildPartyCombatState();
    if (!s.turnOrder.length) return;
    s = rollAllInitiative(s);
    s = sortInitiative(s);
    s = Object.assign({}, s, {
      round: 1,
      currentTurnIndex: 0,
      combatActive: true,
    });
    localInitState = s;
    saveLocalInitiativeState();
    renderLocalInitiativeUi();
  }

  function abbrevConditionLabel(name) {
    const t = String(name || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    if (t.length <= 4) return t;
    return t.slice(0, 4);
  }

  function formatConditionPillText(c) {
    const ab = abbrevConditionLabel(c.name);
    if (c.duration != null) {
      const n = Math.floor(Number(c.duration));
      if (Number.isFinite(n)) return '[' + ab + ' ' + n + ']';
    }
    return '[' + ab + ']';
  }

  function localAddCondition(state, entryId, nameRaw, durationRaw) {
    const e = state.entries[entryId];
    if (!e) return state;
    const name = String(nameRaw || '').trim();
    if (!name) return state;
    let duration = null;
    if (durationRaw != null && String(durationRaw).trim() !== '') {
      const n = Math.floor(Number(durationRaw));
      if (Number.isFinite(n) && n > 0) duration = n;
    }
    const conds = Array.isArray(e.conditions) ? e.conditions.slice() : [];
    conds.push({ name, duration });
    const ent = Object.assign({}, state.entries);
    ent[entryId] = Object.assign({}, e, { conditions: conds });
    return Object.assign({}, state, { entries: ent, markedEntryId: state.markedEntryId ?? null });
  }

  function localRemoveConditionAt(state, entryId, index) {
    const e = state.entries[entryId];
    if (!e) return state;
    const conds = Array.isArray(e.conditions) ? e.conditions.slice() : [];
    if (index < 0 || index >= conds.length) return state;
    conds.splice(index, 1);
    const ent = Object.assign({}, state.entries);
    ent[entryId] = Object.assign({}, e, { conditions: conds });
    return Object.assign({}, state, { entries: ent, markedEntryId: state.markedEntryId ?? null });
  }

  function setConfirmStartModalVisible(visible) {
    const el = initiativeUi.confirmStartOverlay;
    if (!el) return;
    el.classList.toggle('dib-modal-overlay--hidden', !visible);
  }

  function setCondEditorVisible(visible) {
    const el = initiativeUi.condEditorOverlay;
    if (!el) return;
    el.classList.toggle('dib-modal-overlay--hidden', !visible);
    if (!visible) condEditorEntryId = null;
  }

  function setRerollModeModalVisible(visible) {
    const el = initiativeUi.rerollModeOverlay;
    if (!el) return;
    el.classList.toggle('dib-modal-overlay--hidden', !visible);
    if (!visible) {
      initiativeUi._rerollModeOnYes = null;
      initiativeUi._rerollModeOnNo = null;
    }
  }

  function finishRerollModeConfirm(yes) {
    const onY = initiativeUi._rerollModeOnYes;
    const onN = initiativeUi._rerollModeOnNo;
    initiativeUi._rerollModeOnYes = null;
    initiativeUi._rerollModeOnNo = null;
    setRerollModeModalVisible(false);
    if (yes) {
      if (typeof onY === 'function') onY();
    } else {
      if (typeof onN === 'function') onN();
    }
  }

  function openRerollModeConfirm(combatantLabel, onYes, onNo) {
    const msg = initiativeUi.rerollModeMsg;
    if (msg) {
      const lab = String(combatantLabel || 'this character').trim() || 'this character';
      msg.textContent = 'Do you want to re-roll initiative for ' + lab + ' now? (No saves Adv/Dis for the next round.)';
    }
    initiativeUi._rerollModeOnYes = onYes;
    initiativeUi._rerollModeOnNo = onNo;
    setRerollModeModalVisible(true);
  }

  function refreshConditionEditorList() {
    const list = initiativeUi.condEditorList;
    if (!list || !condEditorEntryId || !localInitState) return;
    list.innerHTML = '';
    const e = localInitState.entries[condEditorEntryId];
    const conds = e && Array.isArray(e.conditions) ? e.conditions : [];
    for (let i = 0; i < conds.length; i++) {
      const row = document.createElement('div');
      row.className = 'dib-cond-editor-row';
      const lab = document.createElement('span');
      lab.className = 'dib-cond-editor-row-label';
      lab.textContent = conds[i].name + (conds[i].duration != null ? ' (' + conds[i].duration + ')' : '');
      const bx = document.createElement('button');
      bx.type = 'button';
      bx.className = 'dib-cond-editor-remove';
      bx.textContent = '\u00d7';
      const idx = i;
      bx.addEventListener('click', (ev) => {
        ev.stopPropagation();
        mutateLocalInitiative((st) => localRemoveConditionAt(st, condEditorEntryId, idx));
        refreshConditionEditorList();
      });
      row.appendChild(lab);
      row.appendChild(bx);
      list.appendChild(row);
    }
  }

  function openConditionEditor(entryId) {
    condEditorEntryId = entryId;
    const e = localInitState && localInitState.entries[entryId];
    if (initiativeUi.condEditorTitle) {
      initiativeUi.condEditorTitle.textContent = e ? 'Conditions — ' + e.label : 'Conditions';
    }
    if (initiativeUi.condEditorName) initiativeUi.condEditorName.value = '';
    if (initiativeUi.condEditorDur) initiativeUi.condEditorDur.value = '';
    refreshConditionEditorList();
    setCondEditorVisible(true);
  }

  function fmtSignedMod(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return '+0';
    return (n >= 0 ? '+' : '') + n;
  }

  /** Fill missing `avatarUrl` on initiative rows from `partyById` (e.g. party loaded after combat started). */
  function hydrateInitiativeAvatarsFromParty() {
    if (!localInitState || !localInitState.turnOrder || !localInitState.turnOrder.length) return;
    let dirty = false;
    const nextEntries = Object.assign({}, localInitState.entries);
    for (let i = 0; i < localInitState.turnOrder.length; i++) {
      const eid = localInitState.turnOrder[i];
      const ent = nextEntries[eid];
      if (!ent || ent.entityId == null || ent.entityId === '') continue;
      const c = partyById[String(ent.entityId)];
      if (!c) continue;
      const url = portraitUrlForCharacter(c, ent.entityId);
      if (url && ent.avatarUrl !== url) {
        nextEntries[eid] = Object.assign({}, ent, { avatarUrl: url });
        dirty = true;
      }
    }
    if (dirty) {
      localInitState = Object.assign({}, localInitState, { entries: nextEntries });
      saveLocalInitiativeState();
    }
  }

  /**
   * Full sorted row always. After everyone has rolled, hide total + roll math for anyone except the current turn.
   */
  function buildInitiativeCard(s, eid, orderIndex, curId) {
    const e = s.entries[eid];
    if (!e) return null;
    const everyoneRolled = allCombatantsHaveRolled(s);
    const isCurrent = eid === curId;
    const revealedIds = Array.isArray(s.revealedEntryIds) ? s.revealedEntryIds : [];
    const wasRevealed = revealedIds.indexOf(eid) !== -1;
    const reveal = !everyoneRolled || isCurrent || wasRevealed;

    const card = document.createElement('div');
    card.className = 'dib-init-card' + (isCurrent ? ' dib-init-card-active' : '');

    const row = document.createElement('div');
    row.className = 'dib-init-card-row';

    const rank = document.createElement('div');
    rank.className = 'dib-init-rank';
    rank.textContent = String(orderIndex + 1);

    const avWrap = document.createElement('div');
    avWrap.className = 'dib-init-avatar-wrap';
    const avUrl = typeof e.avatarUrl === 'string' ? e.avatarUrl.trim() : '';
    if (avUrl) {
      const img = document.createElement('img');
      img.className = 'dib-init-avatar';
      img.alt = '';
      img.src = avUrl;
      img.referrerPolicy = 'strict-origin-when-cross-origin';
      avWrap.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'dib-init-ph';
      const ch = String(e.label || '?').trim().charAt(0) || '?';
      ph.textContent = ch.toUpperCase();
      avWrap.appendChild(ph);
    }

    const body = document.createElement('div');
    body.className = 'dib-init-body dib-init-body--click';
    body.title = 'Edit conditions';
    body.addEventListener('click', () => {
      openConditionEditor(eid);
    });

    const nameRow = document.createElement('div');
    nameRow.className = 'dib-init-name-row';
    const nameEl = document.createElement('div');
    nameEl.className = 'dib-init-name';
    nameEl.textContent = e.label;
    nameRow.appendChild(nameEl);
    const partyC = e.entityId != null && e.entityId !== '' ? partyById[String(e.entityId)] : null;
    const sheetCondLabs = partyC ? extractDdbConditionLabels(partyC) : [];
    const trackerAbbrevs = new Set(
      (Array.isArray(e.conditions) ? e.conditions : []).map(function (tc) {
        return abbrevConditionLabel(tc && tc.name);
      }),
    );
    for (let sxi = 0; sxi < sheetCondLabs.length; sxi++) {
      const slab = sheetCondLabs[sxi];
      const sab = abbrevConditionLabel(slab);
      if (trackerAbbrevs.has(sab)) continue;
      const sp = document.createElement('span');
      sp.className = 'dib-init-cond-pill dib-init-cond-pill--ddb';
      sp.textContent = '[' + sab + ']';
      sp.title = slab + ' (from sheet)';
      nameRow.appendChild(sp);
    }

    const condBar = document.createElement('div');
    condBar.className = 'dib-init-conds';
    const conds = Array.isArray(e.conditions) ? e.conditions : [];
    for (let ci = 0; ci < conds.length; ci++) {
      const pill = document.createElement('span');
      pill.className = 'dib-init-cond-pill';
      pill.appendChild(document.createTextNode(formatConditionPillText(conds[ci]) + '\u00a0'));
      const bx = document.createElement('button');
      bx.type = 'button';
      bx.className = 'dib-init-cond-pill-x';
      bx.setAttribute('aria-label', 'Remove condition');
      bx.textContent = '\u00d7';
      const cidx = ci;
      bx.addEventListener('click', (ev) => {
        ev.stopPropagation();
        mutateLocalInitiative((st) => localRemoveConditionAt(st, eid, cidx));
        if (condEditorEntryId === eid) refreshConditionEditorList();
      });
      pill.appendChild(bx);
      condBar.appendChild(pill);
    }

    const rollLine = document.createElement('div');
    rollLine.className = 'dib-init-roll';
    const bd = e.rollBreakdown;
    const modUsed = bd && bd.mod != null ? bd.mod : e.mod;
    if (reveal) {
      if (bd && bd.rolls && bd.rolls.length) {
        const kept = bd.kept != null ? bd.kept : bd.rolls[bd.rolls.length - 1];
        rollLine.textContent =
          'Roll ' + bd.rolls.join(' · ') + ' → ' + kept + ' ' + fmtSignedMod(modUsed) + ' = ' + e.initiativeTotal;
      } else {
        rollLine.textContent = 'Not rolled — initiative mod ' + fmtSignedMod(e.mod);
      }
    } else {
      rollLine.className = 'dib-init-roll dib-init-roll--pending';
      rollLine.textContent = entryHasRoll(e) ? 'Rolled — total hidden until this turn' : 'Not rolled — mod ' + fmtSignedMod(e.mod);
    }

    const tieLine = document.createElement('div');
    tieLine.className = 'dib-init-tie';
    if (reveal && e.dexMod != null && Number.isFinite(Number(e.dexMod))) {
      tieLine.textContent = 'Tiebreak DEX ' + fmtSignedMod(e.dexMod);
    } else {
      tieLine.textContent = '\u00a0';
    }

    body.appendChild(nameRow);
    body.appendChild(condBar);
    body.appendChild(rollLine);
    body.appendChild(tieLine);

    const aside = document.createElement('div');
    aside.className = 'dib-init-aside';
    const totalEl = document.createElement('div');
    totalEl.className = 'dib-init-total' + (reveal ? '' : ' dib-init-total--hidden');
    totalEl.textContent = reveal ? String(e.initiativeTotal) : '\u2014';
    totalEl.setAttribute('aria-hidden', reveal ? 'false' : 'true');

    const actions = document.createElement('div');
    actions.className = 'dib-init-actions';
    const sel = document.createElement('select');
    [['normal', 'd20'], ['advantage', 'Adv'], ['disadvantage', 'Dis']].forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt[0];
      o.textContent = opt[1];
      if (e.rollMode === opt[0]) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('click', (ev) => {
      ev.stopPropagation();
    });
    let committedMode = e.rollMode || 'normal';
    sel.addEventListener('change', () => {
      const newMode = sel.value;
      if (newMode === committedMode) return;
      if (newMode === 'normal') {
        mutateLocalInitiative((st) => localSetRollMode(st, eid, 'normal'));
        committedMode = 'normal';
        return;
      }
      openRerollModeConfirm(
        e.label,
        () => {
          committedMode = newMode;
          mutateLocalInitiative((st) => applyRollModeAndRerollOne(st, eid, newMode));
        },
        () => {
          committedMode = newMode;
          mutateLocalInitiative((st) => localSetRollMode(st, eid, newMode));
        },
      );
    });
    const bRm = document.createElement('button');
    bRm.type = 'button';
    bRm.className = 'dib-init-btn-remove';
    bRm.textContent = '×';
    bRm.title = 'Remove';
    bRm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      mutateLocalInitiative((st) => localRemoveCombatant(st, eid));
    });
    actions.appendChild(sel);
    actions.appendChild(bRm);

    aside.appendChild(totalEl);
    aside.appendChild(actions);

    row.appendChild(rank);
    row.appendChild(avWrap);
    row.appendChild(body);
    row.appendChild(aside);
    card.appendChild(row);
    return card;
  }

  function renderLocalInitiativeUi() {
    if (!initiativeUi.meta || !initiativeUi.list) return;
    if (!localInitState) loadLocalInitiativeState();
    hydrateInitiativeAvatarsFromParty();
    const s = localInitState;
    const curId = s.turnOrder[s.currentTurnIndex];
    const cur = curId ? s.entries[curId] : null;

    initiativeUi.meta.textContent = 'Round ' + s.round + (cur ? ' — ' + cur.label : '');

    if (initiativeUi.nextRoundBtn) {
      initiativeUi.nextRoundBtn.style.display = s.combatActive && s.turnOrder.length ? '' : 'none';
    }

    initiativeUi.list.innerHTML = '';
    if (!s.turnOrder.length) {
      const empty = document.createElement('div');
      empty.className = 'dib-init-empty';
      empty.textContent =
        'Use Start Combat when the party roster (right) is loaded, or restore from saved state.';
      initiativeUi.list.appendChild(empty);
      return;
    }

    for (let i = 0; i < s.turnOrder.length; i++) {
      const eid = s.turnOrder[i];
      const card = buildInitiativeCard(s, eid, i, curId);
      if (card) initiativeUi.list.appendChild(card);
    }
  }

  function mkBtn(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function campaignPathname() {
    try {
      return String(PAGE.location.pathname || '');
    } catch (_) {
      return '';
    }
  }

  function isCampaignUrl() {
    return /^\/campaigns(\/|$)/.test(campaignPathname());
  }

  function teardownBar() {
    if (pollTimer) {
      try {
        PAGE.clearInterval(pollTimer);
      } catch (_) {}
      pollTimer = null;
    }
    if (spaMoTimer) {
      try {
        PAGE.clearTimeout(spaMoTimer);
      } catch (_) {}
      spaMoTimer = null;
    }
    if (rosterMo) {
      try {
        rosterMo.disconnect();
      } catch (_) {}
      rosterMo = null;
    }
    if (hostEl && hostEl.parentNode) {
      try {
        hostEl.parentNode.removeChild(hostEl);
      } catch (_) {}
    }
    hostEl = null;
    rosterEl = null;
    initiativeUi = {
      meta: null,
      list: null,
      nextRoundBtn: null,
      confirmStartOverlay: null,
      condEditorOverlay: null,
      condEditorTitle: null,
      condEditorList: null,
      condEditorName: null,
      condEditorDur: null,
      rerollModeOverlay: null,
      rerollModeMsg: null,
      _rerollModeOnYes: null,
      _rerollModeOnNo: null,
    };
    lastDomIdKey = '';
    removeRestoreFab();
    unlockBodyScrollForOverlay();
  }

  function installNavHooksOnce() {
    if (navHooksInstalled) return;
    navHooksInstalled = true;
    const onNav = function () {
      syncBarToRoute();
    };
    try {
      PAGE.addEventListener('popstate', onNav);
    } catch (_) {}
    try {
      PAGE.addEventListener('urlchange', onNav);
    } catch (_) {}
    try {
      var h = PAGE.history;
      if (h && typeof h.pushState === 'function' && !h.__ddbInitBarNavHook) {
        h.__ddbInitBarNavHook = true;
        var oPush = h.pushState.bind(h);
        var oReplace = h.replaceState.bind(h);
        h.pushState = function () {
          var r = oPush.apply(h, arguments);
          PAGE.setTimeout(onNav, 0);
          return r;
        };
        h.replaceState = function () {
          var r = oReplace.apply(h, arguments);
          PAGE.setTimeout(onNav, 0);
          return r;
        };
      }
    } catch (e) {
      console.warn('[ddb-init-bar] history hook', e);
    }
  }

  function syncBarToRoute() {
    if (!isCampaignUrl()) {
      teardownBar();
      lastRoutedCampaignPath = '';
      return;
    }
    if (!document.body) {
      PAGE.setTimeout(syncBarToRoute, 120);
      return;
    }
    var path = campaignPathname();
    if (!hostEl) {
      lastRoutedCampaignPath = path;
      ensureBar();
      return;
    }
    if (path !== lastRoutedCampaignPath) {
      lastRoutedCampaignPath = path;
      lastDomIdKey = '';
      partyById = {};
      if (rosterEl) {
        rosterEl.innerHTML = '<div class="dib-empty">Switched campaign — loading party…</div>';
      }
      void refreshPartyRoster();
    }
  }

  function ensureBar() {
    if (!document.body) return;
    if (hostEl && document.body.contains(hostEl)) return;

    hostEl = document.createElement('div');
    hostEl.id = 'ddb-campaign-init-bar-host';
    Object.assign(hostEl.style, {
      all: 'initial',
      display: 'block',
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '2147483647',
      pointerEvents: 'auto',
    });

    const shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      .dib-wrap {
        --dib-red: #b91c1c;
        --dib-red-hot: #ef4444;
        --dib-black: #050506;
        --dib-surface: #0e0e10;
        --dib-surface2: #16161a;
        --dib-border: #2a2a30;
        --dib-muted: #a8a29e;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        font: 12px/1.35 system-ui, "Segoe UI", sans-serif;
        color: #e7e5e4;
        background: var(--dib-black);
        border: none;
        border-radius: 0;
        box-shadow: none;
        overflow: hidden;
      }
      .dib-head {
        flex: 0 0 auto;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
        background: linear-gradient(180deg, #1a0c0e 0%, #0a0a0b 100%);
        border-bottom: 2px solid var(--dib-red);
        font-weight: 700;
        color: #fafaf9;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      .dib-head-title { flex: 1; min-width: 0; }
      .dib-head-actions { flex-shrink: 0; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .dib-head-actions button {
        cursor: pointer;
        border: 1px solid var(--dib-red-hot);
        background: #292524;
        color: #fecaca;
        border-radius: 6px;
        padding: 6px 12px;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .dib-head-actions button:hover { background: #450a0a; color: #fff; }
      .dib-main {
        display: flex;
        flex-direction: row;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
      }
      .dib-col {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }
      .dib-col-init {
        flex: 0 0 clamp(280px, 22vw, 360px);
        background: var(--dib-surface);
        border-right: 1px solid var(--dib-border);
      }
      .dib-col-party {
        flex: 1 1 400px;
        background: linear-gradient(180deg, #0a0a0c 0%, var(--dib-black) 100%);
        min-width: 0;
      }
      @media (max-width: 1100px) {
        .dib-party-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
      @media (max-width: 720px) {
        .dib-main { flex-direction: column; }
        .dib-col-init {
          flex: 0 0 auto;
          max-height: 42vh;
          border-right: none;
          border-bottom: 1px solid var(--dib-border);
        }
        .dib-party-grid { grid-template-columns: 1fr !important; }
      }
      .dib-subhead {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        padding: 8px 10px 4px;
      }
      .dib-subhead-init { color: var(--dib-muted); }
      .dib-subhead-party { color: var(--dib-red-hot); }
      .dib-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 8px; border-bottom: 1px solid var(--dib-border); }
      .dib-toolbar button, .dib-init-actions button {
        cursor: pointer;
        border: 1px solid #3f2026;
        background: var(--dib-surface2);
        color: #f5f5f4;
        border-radius: 4px;
        padding: 4px 7px;
        font: inherit;
        font-size: 11px;
      }
      .dib-toolbar button:hover, .dib-init-actions button:hover {
        border-color: var(--dib-red-hot);
        color: #fff;
      }
      .dib-meta { font-size: 11px; color: #fca5a5; padding: 6px 10px; border-bottom: 1px solid var(--dib-border); }
      .dib-init-list {
        flex: 1 1 auto;
        overflow: auto;
        overflow-x: hidden;
        background: #080809;
        padding: 8px 8px 4px;
      }
      .dib-init-card {
        margin-bottom: 10px;
        border-radius: 10px;
        border: 1px solid var(--dib-border);
        background: linear-gradient(165deg, #1a1a1f 0%, #101012 55%, #0c0c0e 100%);
        box-shadow: 0 6px 18px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.03);
      }
      .dib-init-card-active {
        border-color: var(--dib-red-hot);
        box-shadow: 0 0 0 2px rgba(239,68,68,.35), 0 8px 24px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05);
      }
      .dib-init-total--hidden {
        font-size: 22px;
        font-weight: 700;
        color: #475569;
        text-shadow: none;
        letter-spacing: 0.05em;
      }
      .dib-init-roll--pending {
        font-style: italic;
        color: #64748b;
      }
      .dib-init-card-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        padding: 12px 10px 12px 8px;
        min-height: 84px;
      }
      .dib-init-rank {
        flex: 0 0 22px;
        text-align: center;
        font-weight: 800;
        font-size: 15px;
        color: #57534e;
        font-variant-numeric: tabular-nums;
      }
      .dib-init-avatar-wrap {
        flex: 0 0 auto;
      }
      .dib-init-avatar {
        width: 64px;
        height: 64px;
        border-radius: 10px;
        object-fit: cover;
        display: block;
        border: 2px solid #3f2026;
        box-shadow: 0 4px 12px rgba(0,0,0,.45);
      }
      .dib-init-ph {
        width: 64px;
        height: 64px;
        border-radius: 10px;
        background: linear-gradient(135deg, #292524 0%, #1c1917 100%);
        border: 2px solid #3f2026;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        font-weight: 800;
        color: #78716c;
        box-shadow: 0 4px 12px rgba(0,0,0,.4);
      }
      .dib-init-body {
        flex: 1;
        min-width: 0;
      }
      .dib-init-name-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px 8px;
        margin-bottom: 3px;
      }
      .dib-init-name {
        font-weight: 700;
        font-size: 14px;
        color: #f8fafc;
        letter-spacing: 0.02em;
        line-height: 1.25;
        margin-bottom: 0;
        word-break: break-word;
        flex: 0 1 auto;
        min-width: 0;
      }
      .dib-init-cond-pill--ddb {
        flex: 0 0 auto;
        cursor: default;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 2px 5px;
        border-radius: 4px;
        background: rgba(125,211,252,.12);
        border: 1px solid rgba(56,189,248,.35);
        color: #7dd3fc;
        line-height: 1.2;
      }
      .dib-init-body--click { cursor: pointer; }
      .dib-init-conds {
        display: flex;
        flex-wrap: wrap;
        gap: 3px 5px;
        margin-bottom: 3px;
        min-height: 0;
      }
      .dib-init-conds:empty { display: none; }
      .dib-init-cond-pill {
        display: inline-flex;
        align-items: center;
        gap: 1px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 1px 4px 1px 5px;
        border-radius: 4px;
        background: rgba(201,169,98,.14);
        border: 1px solid rgba(201,169,98,.32);
        color: #e7d5a0;
        line-height: 1.2;
      }
      .dib-init-cond-pill-x {
        cursor: pointer;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 11px;
        line-height: 1;
        padding: 0 0 0 1px;
        opacity: 0.8;
      }
      .dib-init-cond-pill-x:hover { opacity: 1; color: #fff; }
      .dib-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,.55);
        padding: 16px;
      }
      .dib-modal-overlay--hidden { display: none !important; }
      .dib-modal {
        max-width: 360px;
        width: 100%;
        background: linear-gradient(165deg, #1f1f24 0%, #121214 100%);
        border: 1px solid var(--dib-border);
        border-radius: 10px;
        padding: 16px 18px;
        box-shadow: 0 20px 48px rgba(0,0,0,.65);
      }
      .dib-modal--cond { max-width: 320px; }
      .dib-modal-msg { margin: 0 0 14px; font-size: 13px; color: #e7e5e4; line-height: 1.45; }
      .dib-modal-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; color: #fafaf9; }
      .dib-modal-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .dib-modal-actions button {
        cursor: pointer;
        border: 1px solid #3f2026;
        background: var(--dib-surface2);
        color: #f5f5f4;
        border-radius: 4px;
        padding: 6px 12px;
        font: inherit;
        font-size: 11px;
      }
      .dib-modal-actions button:hover { border-color: var(--dib-red-hot); color: #fff; }
      .dib-modal-close {
        margin-top: 10px;
        width: 100%;
        cursor: pointer;
        border: 1px solid #3f2026;
        background: var(--dib-surface2);
        color: #f5f5f4;
        border-radius: 4px;
        padding: 6px 10px;
        font: inherit;
        font-size: 11px;
      }
      .dib-modal-close:hover { border-color: var(--dib-red-hot); color: #fff; }
      .dib-cond-editor-list { max-height: 120px; overflow: auto; margin-bottom: 8px; }
      .dib-cond-editor-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
        padding: 4px 0;
        border-bottom: 1px solid var(--dib-border);
        color: #d6d3d1;
      }
      .dib-cond-editor-row-label { flex: 1; min-width: 0; word-break: break-word; }
      .dib-cond-editor-remove {
        cursor: pointer;
        border: none;
        background: transparent;
        color: #f87171;
        font-size: 16px;
        line-height: 1;
        padding: 2px 6px;
      }
      .dib-cond-editor-add {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        margin-bottom: 6px;
      }
      .dib-cond-editor-add button {
        cursor: pointer;
        border: 1px solid #3f2026;
        background: var(--dib-surface2);
        color: #f5f5f4;
        border-radius: 4px;
        padding: 4px 10px;
        font: inherit;
        font-size: 11px;
      }
      .dib-cond-editor-add button:hover { border-color: var(--dib-red-hot); color: #fff; }
      .dib-cond-editor-input {
        flex: 1;
        min-width: 0;
        font: inherit;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #3f2026;
        background: var(--dib-surface2);
        color: #f5f5f4;
      }
      .dib-cond-editor-input--narrow { flex: 0 0 72px; min-width: 72px; }
      .dib-init-roll {
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.35;
      }
      .dib-init-tie {
        font-size: 10px;
        color: #64748b;
        margin-top: 3px;
        min-height: 14px;
      }
      .dib-init-aside {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: center;
        gap: 8px;
        min-width: 76px;
      }
      .dib-init-total {
        font-size: 28px;
        font-weight: 800;
        color: #fef2f2;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 20px rgba(239,68,68,.25), 0 2px 8px rgba(0,0,0,.5);
      }
      .dib-init-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: flex-end;
        max-width: 88px;
      }
      .dib-init-actions select {
        font-size: 10px;
        max-width: 54px;
        background: var(--dib-surface2);
        color: #f5f5f4;
        border: 1px solid #3f2026;
        border-radius: 4px;
        padding: 2px 0;
      }
      .dib-init-btn-remove {
        font-weight: 700;
        min-width: 26px;
        padding: 3px 6px !important;
      }
      .dib-init-empty, .dib-empty { padding: 8px 10px; font-size: 11px; color: var(--dib-muted); }
      .dib-party-grid {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding: 12px 14px 18px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-auto-rows: minmax(min-content, auto);
        gap: 14px 16px;
        align-content: start;
      }
      .dib-party-card {
        --pc-gold: #c9a962;
        --pc-gold-dim: #8a7a4a;
        --pc-teal: #3dd6c7;
        --pc-teal-dim: #1a9e8c;
        --pc-panel: #1a1614;
        --pc-ink: #0f0e0d;
        border: 1px solid #2a2520;
        border-radius: 10px;
        border-top: 3px solid var(--pc-gold-dim);
        background: linear-gradient(180deg, #1c1816 0%, #12100e 55%, #0e0c0b 100%);
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
        box-shadow: 0 10px 28px rgba(0,0,0,.55), inset 0 1px 0 rgba(201,169,98,.08);
        cursor: default;
      }
      .dib-pc-stack {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 10px 10px 10px;
        min-height: 0;
      }
      .dib-pc-head {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 10px;
        margin-bottom: 8px;
        border-bottom: 1px solid rgba(42,37,32,.9);
      }
      .dib-pc-avatar-wrap { flex-shrink: 0; }
      .dib-pc-avatar {
        width: 52px;
        height: 52px;
        border-radius: 4px;
        object-fit: cover;
        display: block;
        border: 2px solid var(--pc-gold-dim);
        box-shadow: 0 4px 12px rgba(0,0,0,.5);
      }
      .dib-pc-ph {
        width: 52px;
        height: 52px;
        border-radius: 4px;
        background: linear-gradient(135deg, #2a2420 0%, #1a1614 100%);
        border: 2px solid var(--pc-gold-dim);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: 800;
        color: #57534e;
      }
      .dib-pc-titles { flex: 1; min-width: 0; }
      .dib-pc-name {
        font-weight: 700;
        color: var(--pc-gold);
        font-size: 13px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        font-family: Georgia, "Times New Roman", serif;
        line-height: 1.2;
        word-break: break-word;
        text-shadow: 0 1px 2px rgba(0,0,0,.4);
      }
      .dib-pc-inline-conds {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 5px;
        margin-top: 5px;
        margin-bottom: 2px;
      }
      .dib-pc-inline-cond-pill {
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 2px 5px;
        border-radius: 999px;
        background: rgba(61,214,199,.12);
        border: 1px solid rgba(61,214,199,.35);
        color: var(--pc-teal);
      }
      .dib-pc-race {
        font-size: 10px;
        font-style: italic;
        color: #78716c;
        margin-top: 4px;
        line-height: 1.3;
      }
      .dib-pc-classline {
        font-size: 10px;
        color: #a8a29e;
        margin-top: 3px;
        line-height: 1.35;
      }
      .dib-pc-stat-icon-row {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: space-between;
        align-items: flex-end;
        gap: 6px;
        margin-bottom: 6px;
      }
      .dib-pc-stat-badge {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }
      .dib-pc-stat-badge-graphic {
        position: relative;
        width: 100%;
        max-width: 88px;
        margin: 0 auto;
        aspect-ratio: 1 / 1.05;
        color: #f5f5f4;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,.45));
      }
      .dib-pc-stat-svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .dib-pc-stat-badge-nums {
        position: absolute;
        left: 50%;
        top: 46%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        pointer-events: none;
      }
      .dib-pc-stat-badge-val {
        font-size: clamp(17px, 4.2vw, 22px);
        font-weight: 800;
        color: #1c1917;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 1px rgba(255,255,255,.35);
      }
      .dib-pc-stat-badge-sub {
        font-size: 9px;
        font-weight: 600;
        color: #44403c;
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
        max-width: 72px;
        line-height: 1.15;
      }
      .dib-pc-stat-badge-ribbon {
        margin-top: 2px;
        padding: 5px 4px 4px;
        background: linear-gradient(180deg, #0a0908 0%, #050403 100%);
        color: #fafaf9;
        font-size: 7px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        text-align: center;
        border-radius: 0 0 4px 4px;
        border: 1px solid #1f1c19;
        border-top: none;
      }
      .dib-pc-section-title {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: var(--pc-gold);
        margin: 10px 0 8px;
        text-shadow: 0 1px 2px rgba(0,0,0,.35);
      }
      .dib-pc-section-title--small {
        letter-spacing: 0.12em;
        margin: 8px 0 5px;
        font-size: 8px;
      }
      .dib-pc-passive-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px 6px;
        margin-bottom: 4px;
      }
      .dib-pc-pass-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 4px;
      }
      .dib-pc-pass-num {
        font-size: 20px;
        font-weight: 800;
        color: var(--pc-teal);
        line-height: 1;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 12px rgba(61,214,199,.35);
      }
      .dib-pc-pass-lab {
        font-size: 8px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #78716c;
      }
      .dib-pc-block { margin-top: 3px; }
      .dib-pc-stack-empty {
        font-size: 11px;
        color: #57534e;
        font-style: italic;
        padding: 8px 4px;
      }
      .dib-pc-death-saves {
        margin-top: 6px;
        padding: 6px 0 8px;
        border-bottom: 1px solid rgba(42,37,32,.85);
      }
      .dib-pc-death-saves-title {
        font-size: 8px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--pc-gold-dim);
        margin-bottom: 6px;
      }
      .dib-pc-ds-flex {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .dib-pc-ds-group {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
      }
      .dib-pc-ds-pip {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: 1px solid rgba(120,113,108,.4);
        background: rgba(0,0,0,.22);
        opacity: 0.32;
        color: #a8a29e;
      }
      .dib-pc-ds-pip--on { opacity: 1; }
      .dib-pc-ds-pip--success.dib-pc-ds-pip--on {
        border-color: rgba(52,211,153,.55);
        background: rgba(6,78,59,.32);
        color: #6ee7b7;
        box-shadow: 0 0 10px rgba(52,211,153,.22);
      }
      .dib-pc-ds-pip--fail.dib-pc-ds-pip--on {
        border-color: rgba(248,113,113,.55);
        background: rgba(127,29,29,.32);
        color: #fca5a5;
        box-shadow: 0 0 10px rgba(248,113,113,.2);
      }
      .dib-pc-ds-svg {
        width: 13px;
        height: 13px;
        display: block;
      }
      .dib-pc-spell-class {
        margin-top: 10px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.16em;
        color: var(--pc-gold);
        text-transform: uppercase;
        border-top: 1px solid rgba(42,37,32,.9);
        padding-top: 10px;
      }
      .dib-pc-spell-duo {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
      }
      .dib-pc-spell-cell {
        flex: 1 1 80px;
        min-width: 72px;
        text-align: center;
        background: var(--pc-panel);
        border: 1px solid #2a2520;
        border-radius: 6px;
        padding: 6px 5px;
      }
      .dib-pc-spell-cell-l {
        font-size: 7px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--pc-gold-dim);
        margin-bottom: 4px;
      }
      .dib-pc-spell-cell-v {
        font-size: 15px;
        font-weight: 800;
        color: #f5f5f4;
        font-variant-numeric: tabular-nums;
      }
      .dib-pc-slots-compact-wrap { width: 100%; }
      .dib-pc-slots-compact {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px 14px;
        font-size: 12px;
        line-height: 1.35;
      }
      .dib-pc-slot-group {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      }
      .dib-pc-slot-lv {
        font-weight: 700;
        color: #a8a29e;
        font-size: 11px;
      }
      .dib-pc-slot-dots {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
      }
      .dib-pc-slot-glyph {
        font-size: 11px;
        line-height: 1;
        user-select: none;
      }
      .dib-pc-slot-glyph--on {
        color: #fbbf24;
        text-shadow: 0 0 8px rgba(251,191,36,.55);
      }
      .dib-pc-slot-glyph--off {
        color: #57534e;
        opacity: 0.9;
      }
      .dib-pc-class-res-dots {
        gap: 5px 10px;
        font-size: 11px;
        line-height: 1.25;
      }
      .dib-pc-class-res-lv {
        max-width: 76px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 9px;
        font-weight: 600;
        color: #a8a29e;
      }
      .dib-pc-pills { display: flex; flex-wrap: wrap; gap: 5px; }
      .dib-pc-pill {
        font-size: 9px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba(201,169,98,.12);
        border: 1px solid var(--pc-gold-dim);
        color: var(--pc-gold);
      }
      .dib-foot {
        font-size: 9px;
        color: #57534e;
        padding: 6px 12px;
        border-top: 1px solid var(--dib-border);
        background: #080809;
      }
      .dib-foot a { color: #f87171 !important; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'dib-wrap';

    const head = document.createElement('div');
    head.className = 'dib-head';
    const headTitle = document.createElement('div');
    headTitle.className = 'dib-head-title';
    headTitle.textContent = 'Campaign combat';
    const headActions = document.createElement('div');
    headActions.className = 'dib-head-actions';
    const showDdbBtn = document.createElement('button');
    showDdbBtn.type = 'button';
    showDdbBtn.textContent = 'Show D&D Beyond';
    showDdbBtn.addEventListener('click', function () {
      hideDmOverlay();
    });
    headActions.appendChild(showDdbBtn);
    head.appendChild(headTitle);
    head.appendChild(headActions);

    const main = document.createElement('div');
    main.className = 'dib-main';

    const colInit = document.createElement('div');
    colInit.className = 'dib-col dib-col-init';

    const colParty = document.createElement('div');
    colParty.className = 'dib-col dib-col-party';

    const subInit = document.createElement('div');
    subInit.className = 'dib-subhead dib-subhead-init';
    subInit.textContent = 'Initiative';

    const initToolbar = document.createElement('div');
    initToolbar.className = 'dib-toolbar';
    initToolbar.appendChild(
      mkBtn('Start Combat', () => {
        setConfirmStartModalVisible(true);
      }),
    );
    const nextRoundBtn = mkBtn('Next Round', () => {
      mutateLocalInitiative((st) => nextRound(st));
    });
    nextRoundBtn.style.display = 'none';
    initiativeUi.nextRoundBtn = nextRoundBtn;
    initToolbar.appendChild(nextRoundBtn);
    initToolbar.appendChild(mkBtn('◀', () => mutateLocalInitiative(localPrevTurn)));
    initToolbar.appendChild(mkBtn('▶', () => mutateLocalInitiative(localNextTurn)));
    initToolbar.appendChild(
      mkBtn('Clear', () => {
        setConfirmStartModalVisible(false);
        setCondEditorVisible(false);
        localInitState = emptyLocalInitiativeState();
        saveLocalInitiativeState();
        renderLocalInitiativeUi();
      }),
    );

    const initMeta = document.createElement('div');
    initMeta.className = 'dib-meta';
    initiativeUi.meta = initMeta;

    const initList = document.createElement('div');
    initList.className = 'dib-init-list';
    initiativeUi.list = initList;

    const subParty = document.createElement('div');
    subParty.className = 'dib-subhead dib-subhead-party';
    subParty.textContent = 'Party · live';

    const partyToolbar = document.createElement('div');
    partyToolbar.className = 'dib-toolbar';
    partyToolbar.appendChild(
      mkBtn('Refresh now', () => {
        void refreshPartyRoster();
      }),
    );

    rosterEl = document.createElement('div');
    rosterEl.className = 'dib-party-grid';

    const foot = document.createElement('div');
    foot.className = 'dib-foot';
    foot.innerHTML =
      'Poll ~' +
      Math.round(POLL_MS / 1000) +
      's · legacy+json → v5 → v4 · <a href="https://github.com/TeaWithLucas/DNDBeyond-DM-Screen" target="_blank" rel="noopener">TeaWithLucas</a> · <a href="https://github.com/FaithLilley/DnDBeyond-Live-Campaign" target="_blank" rel="noopener">Live-Campaign</a>';

    colInit.appendChild(subInit);
    colInit.appendChild(initToolbar);
    colInit.appendChild(initMeta);
    colInit.appendChild(initList);

    colParty.appendChild(subParty);
    colParty.appendChild(partyToolbar);
    colParty.appendChild(rosterEl);

    wrap.appendChild(head);
    wrap.appendChild(main);
    main.appendChild(colInit);
    main.appendChild(colParty);
    wrap.appendChild(foot);

    const confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'dib-modal-overlay dib-modal-overlay--hidden';
    const confirmBox = document.createElement('div');
    confirmBox.className = 'dib-modal';
    confirmBox.addEventListener('click', (ev) => ev.stopPropagation());
    const confirmMsg = document.createElement('p');
    confirmMsg.className = 'dib-modal-msg';
    confirmMsg.textContent = 'Are you sure you want to start a new combat?';
    const confirmActions = document.createElement('div');
    confirmActions.className = 'dib-modal-actions';
    const yesStart = document.createElement('button');
    yesStart.type = 'button';
    yesStart.textContent = 'Yes';
    yesStart.addEventListener('click', () => {
      setConfirmStartModalVisible(false);
      startCombat();
    });
    const cancelStart = document.createElement('button');
    cancelStart.type = 'button';
    cancelStart.textContent = 'Cancel';
    cancelStart.addEventListener('click', () => setConfirmStartModalVisible(false));
    confirmActions.appendChild(yesStart);
    confirmActions.appendChild(cancelStart);
    confirmBox.appendChild(confirmMsg);
    confirmBox.appendChild(confirmActions);
    confirmOverlay.appendChild(confirmBox);
    confirmOverlay.addEventListener('click', () => setConfirmStartModalVisible(false));
    initiativeUi.confirmStartOverlay = confirmOverlay;

    const condOverlay = document.createElement('div');
    condOverlay.className = 'dib-modal-overlay dib-modal-overlay--hidden';
    const condBox = document.createElement('div');
    condBox.className = 'dib-modal dib-modal--cond';
    condBox.addEventListener('click', (ev) => ev.stopPropagation());
    const condTitle = document.createElement('div');
    condTitle.className = 'dib-modal-title';
    condTitle.textContent = 'Conditions';
    const condList = document.createElement('div');
    condList.className = 'dib-cond-editor-list';
    const condAddRow = document.createElement('div');
    condAddRow.className = 'dib-cond-editor-add';
    const condNameIn = document.createElement('input');
    condNameIn.type = 'text';
    condNameIn.className = 'dib-cond-editor-input';
    condNameIn.placeholder = 'Condition name';
    const condDurIn = document.createElement('input');
    condDurIn.type = 'number';
    condDurIn.className = 'dib-cond-editor-input dib-cond-editor-input--narrow';
    condDurIn.placeholder = 'Rounds';
    condDurIn.min = '1';
    const condAddBtn = document.createElement('button');
    condAddBtn.type = 'button';
    condAddBtn.textContent = 'Add';
    condAddBtn.addEventListener('click', () => {
      if (!condEditorEntryId) return;
      mutateLocalInitiative((st) =>
        localAddCondition(st, condEditorEntryId, condNameIn.value, condDurIn.value),
      );
      condNameIn.value = '';
      condDurIn.value = '';
      refreshConditionEditorList();
    });
    condAddRow.appendChild(condNameIn);
    condAddRow.appendChild(condDurIn);
    condAddRow.appendChild(condAddBtn);
    const condClose = document.createElement('button');
    condClose.type = 'button';
    condClose.className = 'dib-modal-close';
    condClose.textContent = 'Close';
    condClose.addEventListener('click', () => setCondEditorVisible(false));
    condBox.appendChild(condTitle);
    condBox.appendChild(condList);
    condBox.appendChild(condAddRow);
    condBox.appendChild(condClose);
    condOverlay.appendChild(condBox);
    condOverlay.addEventListener('click', () => setCondEditorVisible(false));
    initiativeUi.condEditorOverlay = condOverlay;
    initiativeUi.condEditorTitle = condTitle;
    initiativeUi.condEditorList = condList;
    initiativeUi.condEditorName = condNameIn;
    initiativeUi.condEditorDur = condDurIn;

    const rerollOverlay = document.createElement('div');
    rerollOverlay.className = 'dib-modal-overlay dib-modal-overlay--hidden';
    const rerollBox = document.createElement('div');
    rerollBox.className = 'dib-modal';
    rerollBox.addEventListener('click', (ev) => ev.stopPropagation());
    const rerollMsg = document.createElement('p');
    rerollMsg.className = 'dib-modal-msg';
    rerollMsg.textContent = 'Do you want to re-roll this character?';
    const rerollActions = document.createElement('div');
    rerollActions.className = 'dib-modal-actions';
    const rerollYes = document.createElement('button');
    rerollYes.type = 'button';
    rerollYes.textContent = 'Yes';
    rerollYes.addEventListener('click', () => finishRerollModeConfirm(true));
    const rerollNo = document.createElement('button');
    rerollNo.type = 'button';
    rerollNo.textContent = 'No';
    rerollNo.addEventListener('click', () => finishRerollModeConfirm(false));
    rerollActions.appendChild(rerollYes);
    rerollActions.appendChild(rerollNo);
    rerollBox.appendChild(rerollMsg);
    rerollBox.appendChild(rerollActions);
    rerollOverlay.appendChild(rerollBox);
    rerollOverlay.addEventListener('click', () => finishRerollModeConfirm(false));
    initiativeUi.rerollModeOverlay = rerollOverlay;
    initiativeUi.rerollModeMsg = rerollMsg;

    wrap.appendChild(confirmOverlay);
    wrap.appendChild(condOverlay);
    wrap.appendChild(rerollOverlay);

    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.body.appendChild(hostEl);
    lockBodyScrollForOverlay();

    loadLocalInitiativeState();
    renderLocalInitiativeUi();
    void refreshPartyRoster();
    pollTimer = PAGE.setInterval(() => {
      void refreshPartyRoster();
    }, POLL_MS);

    function domIdKey() {
      return collectCharacterIdsFromDom()
        .slice()
        .sort(function (a, b) {
          return a - b;
        })
        .join(',');
    }
    function onDomMaybeChanged() {
      if (spaMoTimer) PAGE.clearTimeout(spaMoTimer);
      spaMoTimer = PAGE.setTimeout(function () {
        spaMoTimer = null;
        const k = domIdKey();
        if (k === lastDomIdKey) return;
        lastDomIdKey = k;
        if (!k.length) {
          partyById = {};
          if (rosterEl) {
            rosterEl.innerHTML =
              '<div class="dib-empty">Open the campaign <strong>Characters</strong> tab so party links load.</div>';
          }
          return;
        }
        void refreshPartyRoster();
      }, 500);
    }
    lastDomIdKey = domIdKey();
    try {
      rosterMo = new MutationObserver(onDomMaybeChanged);
      rosterMo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[ddb-init-bar] MutationObserver', e);
    }
    PAGE.setTimeout(onDomMaybeChanged, 1500);
    PAGE.setTimeout(onDomMaybeChanged, 4500);
  }

  installNavHooksOnce();
  syncBarToRoute();
})();
