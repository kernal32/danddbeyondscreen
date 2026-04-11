// ==UserScript==
// @name         BOB Screen — left initiative bar
// @namespace    https://github.com/kernal32/danddbeyondscreen
// @version      1.6.9
// @description  Fullscreen DM overlay on /campaigns/*: Start Combat / Next Round; settings panel (colour theme × 4 + card density, localStorage); passives match stat-badge font size; conditions + death saves (legacy+v5 merge). Wiki: https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output — legacy+v5 merge → v4. Cobalt 999080.
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
// @connect      *
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js
// ==/UserScript==

/* global qrcode, io */
(function () {
  'use strict';

  if (window.self !== window.top) return;

  /** Page window — localStorage timers only (Tampermonkey isolated storage otherwise). */
  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  /** Sandbox window — jsonpDDBCT, moduleExport (TeaWithLucas), __ddbDmScreenIngestAuth. */
  const SW = window;

  const POLL_MS = 60000;
  const INIT_STORAGE_KEY = 'ddbCampaignInitBarInitiativeV1';
  const SETTINGS_STORAGE_KEY = 'ddbInitBarSettingsV1';
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
  let barSettings = null; // populated by loadBarSettings() once helpers are defined below
  let settingsPanelEl = null;

  const BAR_THEMES = {
    crimson: {
      name: 'Crimson',
      swatch: '#b91c1c',
      vars: {
        '--dib-red': '#b91c1c',
        '--dib-red-hot': '#ef4444',
        '--dib-black': '#050506',
        '--dib-surface': '#0e0e10',
        '--dib-surface2': '#16161a',
        '--dib-border': '#2a2a30',
        '--dib-pc-gold': '#c9a962',
        '--dib-pc-gold-dim': '#8a7a4a',
        '--dib-pc-teal': '#3dd6c7',
        '--dib-pc-teal-dim': '#1a9e8c',
        '--dib-pc-panel': '#1a1614',
        '--dib-pc-bg-start': '#1c1816',
        '--dib-pc-bg-mid': '#12100e',
        '--dib-pc-bg-end': '#0e0c0b',
        '--dib-frame-outer': '#1a0a08',
        '--dib-frame-gold': '#d4a843',
        '--dib-frame-inset': 'rgba(212,168,67,.15)',
        '--dib-wood-dark': '#1c1008',
        '--dib-wood-mid': '#2e1c10',
        '--dib-wood-light': '#3d2a18',
        '--dib-iron': '#5a5a62',
        '--dib-iron-light': '#8a8a94',
        '--dib-glow': 'rgba(239,68,68,.45)',
        '--dib-glow-dim': 'rgba(239,68,68,.18)',
        '--dib-heading-font': "'Cinzel', Georgia, 'Times New Roman', serif",
        '--dib-divider': '#3d2a18',
      },
    },
    arcane: {
      name: 'Arcane',
      swatch: '#3b82f6',
      vars: {
        '--dib-red': '#1d4ed8',
        '--dib-red-hot': '#3b82f6',
        '--dib-black': '#04040a',
        '--dib-surface': '#080c14',
        '--dib-surface2': '#0f1522',
        '--dib-border': '#1e2a40',
        '--dib-pc-gold': '#7dd3fc',
        '--dib-pc-gold-dim': '#3b6ea8',
        '--dib-pc-teal': '#a78bfa',
        '--dib-pc-teal-dim': '#6d51c2',
        '--dib-pc-panel': '#0a0f1c',
        '--dib-pc-bg-start': '#0d1220',
        '--dib-pc-bg-mid': '#080e18',
        '--dib-pc-bg-end': '#050a12',
        '--dib-frame-outer': '#06081a',
        '--dib-frame-gold': '#7dd3fc',
        '--dib-frame-inset': 'rgba(125,211,252,.12)',
        '--dib-wood-dark': '#080c1c',
        '--dib-wood-mid': '#0d1428',
        '--dib-wood-light': '#141d38',
        '--dib-iron': '#3a4a6a',
        '--dib-iron-light': '#5a6a8a',
        '--dib-glow': 'rgba(59,130,246,.45)',
        '--dib-glow-dim': 'rgba(59,130,246,.18)',
        '--dib-heading-font': "'Cinzel', Georgia, 'Times New Roman', serif",
        '--dib-divider': '#141d38',
      },
    },
    forest: {
      name: 'Forest',
      swatch: '#22c55e',
      vars: {
        '--dib-red': '#15803d',
        '--dib-red-hot': '#22c55e',
        '--dib-black': '#030804',
        '--dib-surface': '#060e07',
        '--dib-surface2': '#0b170c',
        '--dib-border': '#1a2e1c',
        '--dib-pc-gold': '#86efac',
        '--dib-pc-gold-dim': '#3d8b5a',
        '--dib-pc-teal': '#fbbf24',
        '--dib-pc-teal-dim': '#b45309',
        '--dib-pc-panel': '#081009',
        '--dib-pc-bg-start': '#0c160d',
        '--dib-pc-bg-mid': '#080e09',
        '--dib-pc-bg-end': '#060a07',
        '--dib-frame-outer': '#040c04',
        '--dib-frame-gold': '#86efac',
        '--dib-frame-inset': 'rgba(134,239,172,.12)',
        '--dib-wood-dark': '#061008',
        '--dib-wood-mid': '#0e1e10',
        '--dib-wood-light': '#162a18',
        '--dib-iron': '#3a5a42',
        '--dib-iron-light': '#5a7a62',
        '--dib-glow': 'rgba(34,197,94,.45)',
        '--dib-glow-dim': 'rgba(34,197,94,.18)',
        '--dib-heading-font': "'Cinzel', Georgia, 'Times New Roman', serif",
        '--dib-divider': '#162a18',
      },
    },
    parchment: {
      name: 'Parchment',
      swatch: '#d97706',
      vars: {
        '--dib-red': '#92400e',
        '--dib-red-hot': '#d97706',
        '--dib-black': '#faf7f0',
        '--dib-surface': '#f5f0e8',
        '--dib-surface2': '#ede8de',
        '--dib-border': '#d6cfc0',
        '--dib-pc-gold': '#92400e',
        '--dib-pc-gold-dim': '#b45309',
        '--dib-pc-teal': '#1d4ed8',
        '--dib-pc-teal-dim': '#1e40af',
        '--dib-pc-panel': '#ede8de',
        '--dib-pc-bg-start': '#f0ebe2',
        '--dib-pc-bg-mid': '#e8e2d8',
        '--dib-pc-bg-end': '#e0d8cc',
        '--dib-frame-outer': '#7a5420',
        '--dib-frame-gold': '#92400e',
        '--dib-frame-inset': 'rgba(146,64,14,.12)',
        '--dib-wood-dark': '#d4c4a0',
        '--dib-wood-mid': '#c8b488',
        '--dib-wood-light': '#bca070',
        '--dib-iron': '#7a6a5a',
        '--dib-iron-light': '#9a8a7a',
        '--dib-glow': 'rgba(217,119,6,.45)',
        '--dib-glow-dim': 'rgba(217,119,6,.18)',
        '--dib-heading-font': "'Cinzel', Georgia, 'Times New Roman', serif",
        '--dib-divider': '#c4a882',
      },
    },
  };

  function defaultBarSettings() {
    return { theme: 'crimson', density: 'comfortable', badgeFill: '#ffffff', badgeIcon: '#f5f5f4', badgeText: '#1c1917', firstNameOnly: true };
  }

  function loadBarSettings() {
    try {
      const raw = PAGE.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return Object.assign({}, defaultBarSettings(), parsed);
        }
      }
    } catch (_) {}
    return defaultBarSettings();
  }

  function saveBarSettings() {
    try {
      PAGE.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(barSettings));
    } catch (_) {}
  }

  function applyBarSettings(settings, wrapEl) {
    if (!wrapEl || !settings) return;
    const theme = BAR_THEMES[settings.theme] || BAR_THEMES.crimson;
    const vars = theme.vars;
    const k = Object.keys(vars);
    for (let i = 0; i < k.length; i++) {
      wrapEl.style.setProperty(k[i], vars[k[i]]);
    }
    /** Density: override CSS custom properties for card sizing. */
    if (settings.density === 'compact') {
      wrapEl.style.setProperty('--dib-card-padding', '7px');
      wrapEl.style.setProperty('--dib-avatar-size', '40px');
      wrapEl.style.setProperty('--dib-stat-badge-size', '40px');
      wrapEl.style.setProperty('--dib-stat-val-size', 'clamp(14px,3.5vw,18px)');
      wrapEl.style.setProperty('--dib-name-size', '11px');
      wrapEl.style.setProperty('--dib-sub-size', '9px');
      wrapEl.style.setProperty('--dib-badge-maxw', '72px');
      wrapEl.style.setProperty('--dib-badge-sub-size', '8px');
      wrapEl.style.setProperty('--dib-ribbon-size', '6px');
      wrapEl.style.setProperty('--dib-ph-size', '16px');
      wrapEl.style.setProperty('--dib-init-avatar-size', '48px');
      wrapEl.style.setProperty('--dib-init-ph-size', '20px');
      wrapEl.style.setProperty('--dib-init-row-minheight', '66px');
      wrapEl.style.setProperty('--dib-init-row-pad', '8px 8px 8px 6px');
      wrapEl.style.setProperty('--dib-init-name-size', '12px');
      wrapEl.style.setProperty('--dib-init-rank-size', '13px');
      wrapEl.style.setProperty('--dib-init-total-size', '22px');
      wrapEl.style.setProperty('--dib-init-cond-size', '8px');
    } else if (settings.density === 'large') {
      wrapEl.style.setProperty('--dib-card-padding', '12px');
      wrapEl.style.setProperty('--dib-avatar-size', '92px');
      wrapEl.style.setProperty('--dib-stat-badge-size', '92px');
      wrapEl.style.setProperty('--dib-stat-val-size', 'clamp(24px,5.5vw,34px)');
      wrapEl.style.setProperty('--dib-name-size', '20px');
      wrapEl.style.setProperty('--dib-sub-size', '14px');
      wrapEl.style.setProperty('--dib-badge-maxw', '132px');
      wrapEl.style.setProperty('--dib-badge-sub-size', '13px');
      wrapEl.style.setProperty('--dib-ribbon-size', '11px');
      wrapEl.style.setProperty('--dib-ph-size', '34px');
      wrapEl.style.setProperty('--dib-init-avatar-size', '110px');
      wrapEl.style.setProperty('--dib-init-ph-size', '42px');
      wrapEl.style.setProperty('--dib-init-row-minheight', '100px');
      wrapEl.style.setProperty('--dib-init-row-pad', '10px 14px 10px 10px');
      wrapEl.style.setProperty('--dib-init-name-size', '30px');
      wrapEl.style.setProperty('--dib-init-rank-size', '24px');
      wrapEl.style.setProperty('--dib-init-total-size', '64px');
      wrapEl.style.setProperty('--dib-init-cond-size', '13px');
    } else {
      wrapEl.style.setProperty('--dib-card-padding', '10px');
      wrapEl.style.setProperty('--dib-avatar-size', '52px');
      wrapEl.style.setProperty('--dib-stat-badge-size', '52px');
      wrapEl.style.setProperty('--dib-stat-val-size', 'clamp(17px,4.2vw,22px)');
      wrapEl.style.setProperty('--dib-name-size', '13px');
      wrapEl.style.setProperty('--dib-sub-size', '10px');
      wrapEl.style.setProperty('--dib-badge-maxw', '88px');
      wrapEl.style.setProperty('--dib-badge-sub-size', '9px');
      wrapEl.style.setProperty('--dib-ribbon-size', '7px');
      wrapEl.style.setProperty('--dib-ph-size', '20px');
      wrapEl.style.setProperty('--dib-init-avatar-size', '64px');
      wrapEl.style.setProperty('--dib-init-ph-size', '26px');
      wrapEl.style.setProperty('--dib-init-row-minheight', '84px');
      wrapEl.style.setProperty('--dib-init-row-pad', '12px 10px 12px 8px');
      wrapEl.style.setProperty('--dib-init-name-size', '14px');
      wrapEl.style.setProperty('--dib-init-rank-size', '15px');
      wrapEl.style.setProperty('--dib-init-total-size', '28px');
      wrapEl.style.setProperty('--dib-init-cond-size', '9px');
    }
    /** Parchment needs light text on dark surfaces flipped — override body text colour. */
    if (settings.theme === 'parchment') {
      wrapEl.style.setProperty('--dib-text', '#1c1410');
      wrapEl.style.setProperty('--dib-muted', '#78716c');
    } else {
      wrapEl.style.setProperty('--dib-text', '#e7e5e4');
      wrapEl.style.setProperty('--dib-muted', '#a8a29e');
    }
    /** Icon background fill, line colour, text colour. */
    wrapEl.style.setProperty('--dib-badge-fill', settings.badgeFill || '#ffffff');
    wrapEl.style.setProperty('--dib-badge-icon', settings.badgeIcon || '#f5f5f4');
    wrapEl.style.setProperty('--dib-badge-text', settings.badgeText || '#1c1917');
    /** Refresh settings panel active states if open. */
    refreshSettingsPanelActiveStates(settings);
  }

  /** Seed barSettings as early as possible so click handlers can reference it before the overlay builds. */
  barSettings = loadBarSettings();

  function refreshSettingsPanelActiveStates(settings) {
    if (!settingsPanelEl) return;
    const swatches = settingsPanelEl.querySelectorAll('[data-dib-theme]');
    for (let i = 0; i < swatches.length; i++) {
      const el = swatches[i];
      el.classList.toggle('dib-settings-swatch--active', el.getAttribute('data-dib-theme') === settings.theme);
    }
    const densityBtns = settingsPanelEl.querySelectorAll('[data-dib-density]');
    for (let i = 0; i < densityBtns.length; i++) {
      const el = densityBtns[i];
      el.classList.toggle('dib-settings-density-btn--active', el.getAttribute('data-dib-density') === settings.density);
    }
    const fnToggle = settingsPanelEl.querySelector('[data-dib-firstname-toggle]');
    if (fnToggle) {
      fnToggle.classList.toggle('dib-settings-density-btn--active', settings.firstNameOnly !== false);
    }
  }

  function openSettingsPanel() {
    if (!settingsPanelEl) return;
    settingsPanelEl.classList.remove('dib-settings-overlay--hidden');
  }

  function closeSettingsPanel() {
    if (!settingsPanelEl) return;
    settingsPanelEl.classList.add('dib-settings-overlay--hidden');
  }

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
    // The rules engine returns spellCasterInfo.castingInfo.saveDcs (array of {value, sources}).
    const ci = sci.castingInfo;
    if (ci && typeof ci === 'object' && Array.isArray(ci.saveDcs) && ci.saveDcs.length > 0) {
      const first = ci.saveDcs[0];
      const dc = Number(first.value);
      if (Number.isFinite(dc) && dc >= 8 && dc <= 30) {
        const label = (first.sources && first.sources[0] && first.sources[0].definition)
          ? String(first.sources[0].definition.name || '').trim()
          : '';
        return { dc: Math.round(dc), attack: null, mod: null, label: label };
      }
    }
    // Raw API field names.
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
    // Prefer rules-engine computed hitPointInfo (totalHp / remainingHp).
    const hpi = c.hitPointInfo;
    if (hpi && typeof hpi === 'object') {
      const max = Number(hpi.totalHp ?? hpi.maxHitPoints);
      const cur = Number(hpi.remainingHp ?? hpi.currentHitPoints);
      const tmp = Number(hpi.tempHp ?? hpi.tempHitPoints) || 0;
      if (Number.isFinite(max) && max > 0) {
        let displayCur = Number.isFinite(cur) ? cur : max - (Number(hpi.removedHitPoints ?? c.removedHitPoints) || 0);
        let s = Math.max(0, Math.floor(displayCur)) + '/' + Math.floor(max);
        if (tmp > 0) s += ' +' + tmp + ' temp';
        return s;
      }
    }
    const base = Number(c.baseHitPoints);
    const rem = Number(c.removedHitPoints) || 0;
    const tmp = Number(c.temporaryHitPoints) || 0;
    const ov = c.overrideHitPoints;
    const max = Number.isFinite(Number(ov)) && Number(ov) > 0 ? Number(ov) : Number.isFinite(base) ? base : '?';
    const cur = typeof max === 'number' ? Math.max(0, Math.floor(max - rem)) : '?';
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
      // Mirror TeaWithLucas module 2080: load character_rules_engine_lib_es to compute AC, HP, etc.
      try {
        var charRulesLib = __webpack_require__(1);
        if (charRulesLib && typeof charRulesLib === 'object') {
          var charf = null;
          for (var k in charRulesLib) {
            if (charRulesLib[k] && typeof charRulesLib[k].getAbilities === 'function') {
              charf = charRulesLib[k];
              break;
            }
          }
          if (charf && typeof charf.getAcTotal === 'function') {
            // Expose via moduleExport only if TeaWithLucas didn't already set it.
            if (!SW.moduleExport || typeof SW.moduleExport.getCharData !== 'function') {
              var getCharData = function (state) {
                return {
                  armorClass: charf.getAcTotal(state),
                  hitPointInfo: charf.getHitPointInfo(state),
                  deathSaveInfo: charf.getDeathSaveInfo(state),
                  initiative: charf.getProcessedInitiative(state),
                  inspiration: charf.getInspiration(state),
                  conditions: charf.getActiveConditions(state),
                  proficiencyBonus: charf.getProficiencyBonus(state),
                  passivePerception: charf.getPassivePerception(state),
                  passiveInvestigation: charf.getPassiveInvestigation(state),
                  passiveInsight: charf.getPassiveInsight(state),
                  spellCasterInfo: charf.getSpellCasterInfo(state),
                };
              };
              if (!SW.moduleExport) SW.moduleExport = {};
              SW.moduleExport.getCharData = getCharData;
            }
          }
        }
      } catch (rulesErr) {
        console.warn('[ddb-init-bar] rules engine bootstrap skipped', rulesErr);
      }
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

  /**
   * Character-tools rules-engine bridge.
   * Mirror of TeaWithLucas/DNDBeyond-DM-Screen module 2080:
   *   __webpack_require__(1) → character_rules_engine_lib_es
   * Exposes getAcTotal(state), getHitPointInfo(state), etc.
   * @see https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  let __cachedRuleData = null;
  let __cachedVehiclesRuleData = null;
  const V5_RULE_DATA_URL = 'https://character-service.dndbeyond.com/character/v5/rule-data';
  const VEHICLES_RULE_DATA_URL = 'https://gamedata-service.dndbeyond.com/vehicles/v3/rule-data';
  const GAME_DATA_BASE = 'https://character-service.dndbeyond.com/character/v5/game-data/';
  const OPTIONAL_RULES = {
    optionalOrigins: { category: 'racial-trait', id: 'racialTraitId' },
    optionalClassFeatures: { category: 'class-feature', id: 'classFeatureId' },
  };

  async function __ensureRuleDataCached() {
    if (__cachedRuleData) return;
    try {
      const [r1, r2] = await Promise.all([
        fetch(V5_RULE_DATA_URL, { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
        fetch(VEHICLES_RULE_DATA_URL, { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      ]);
      if (r1 && r1.data) __cachedRuleData = r1.data;
      if (r2 && r2.data) __cachedVehiclesRuleData = r2.data;
    } catch (_) {}
  }

  /**
   * Fetch optional character-specific rules (optional origins / class features) and populate
   * the definitionPool exactly like the ootz0rz/TeaWithLucas GM Screen does.
   */
  async function __fetchOptionalCharRules(rawChar, serviceData) {
    if (!rawChar || typeof rawChar !== 'object') return;
    const keys = Object.keys(OPTIONAL_RULES);
    const fetches = [];
    for (let ki = 0; ki < keys.length; ki++) {
      const ruleKey = keys[ki];
      const cfg = OPTIONAL_RULES[ruleKey];
      const arr = rawChar[ruleKey];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const ids = [];
      for (let ai = 0; ai < arr.length; ai++) {
        const v = arr[ai] && arr[ai][cfg.id];
        if (v != null) ids.push(v);
      }
      if (!ids.length) continue;
      if (!serviceData.definitionPool[cfg.category]) {
        serviceData.definitionPool[cfg.category] = { accessTypeLookup: {}, definitionLookup: {} };
      }
      const pool = serviceData.definitionPool[cfg.category];
      fetches.push(
        fetch(GAME_DATA_BASE + cfg.category + '/collection', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: null, sharingSetting: 2, ids: ids }),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.success && j.data && Array.isArray(j.data.definitionData)) {
              for (let di = 0; di < j.data.definitionData.length; di++) {
                var d = j.data.definitionData[di];
                pool.definitionLookup[d.id] = d;
                pool.accessTypeLookup[d.id] = 1;
              }
            }
          })
          .catch(function () {}),
      );
    }
    if (fetches.length) await Promise.all(fetches);
  }

  /**
   * Build a state object matching ootz0rz/TeaWithLucas format, then call the character-tools
   * rules engine to compute AC, HP, etc.
   * @see https://github.com/TeaWithLucas/DNDBeyond-DM-Screen/wiki/Module-output
   */
  async function __computeViaRulesEngine(rawChar) {
    if (!rawChar || typeof rawChar !== 'object') return null;
    try {
      const me = SW.moduleExport;
      if (!me || typeof me.getCharData !== 'function') return null;
      const serviceData = {
        classAlwaysKnownSpells: {},
        classAlwaysPreparedSpells: {},
        definitionPool: {},
        infusionsMappings: [],
        knownInfusionsMappings: [],
        ruleDataPool: __cachedVehiclesRuleData || {},
        vehicleComponentMappings: [],
        vehicleMappings: [],
      };
      // Populate optional class feature / racial trait definitions.
      await __fetchOptionalCharRules(rawChar, serviceData);
      const state = {
        appEnv: {
          authEndpoint: 'https://auth-service.dndbeyond.com/v1/cobalt-token',
          characterEndpoint: '',
          characterId: rawChar.id,
          characterServiceBaseUrl: null,
          diceEnabled: true,
          diceFeatureConfiguration: {
            apiEndpoint: 'https://dice-service.dndbeyond.com',
            assetBaseLocation: 'https://www.dndbeyond.com/dice',
            enabled: true, menu: true, notification: false, trackingId: '',
          },
          dimensions: { sheet: { height: 0, width: 1200 }, styleSizeType: 4, window: { height: 571, width: 1920 } },
          isMobile: false,
          isReadonly: true,
          redirect: undefined,
          username: 'example',
        },
        appInfo: { error: null },
        character: rawChar,
        characterEnv: { context: 'SHEET', isReadonly: true, loadingStatus: 'LOADED' },
        confirmModal: { modals: [] },
        modal: { open: {} },
        ruleData: __cachedRuleData || {},
        serviceData: serviceData,
        sheet: { initError: null, initFailed: false },
        sidebar: { activePaneId: null, alignment: 'right', isLocked: false, isVisible: false, panes: [], placement: 'overlay', width: 340 },
        syncTransaction: { active: false, initiator: null },
        toastMessage: {},
      };
      const computed = me.getCharData(state);
      if (computed && typeof computed === 'object') return computed;
    } catch (e) {
      console.warn('[ddb-init-bar] rules engine via moduleExport failed', e);
    }
    return null;
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
    // Compute AC / HP / passives via DDB's own character-tools rules engine.
    // IMPORTANT: pass the raw v5 data (svc), NOT the merged result (u).
    // The merge unions modifier buckets from legacy+v5, causing the rules engine
    // to double-count bonuses (e.g. Defense FS appears twice → AC off by +1).
    // The ootz0rz GM Screen only feeds the v5 character-service response.
    const rawForEngine = svc || leg || u;
    if (u && rawForEngine) {
      try {
        await __ensureRuleDataCached();
        const computed = await __computeViaRulesEngine(rawForEngine);
        if (computed) {
          if (typeof computed.armorClass === 'number') u.armorClass = computed.armorClass;
          if (computed.hitPointInfo && typeof computed.hitPointInfo === 'object') {
            u.hitPointInfo = Object.assign({}, u.hitPointInfo || {}, computed.hitPointInfo);
          }
          if (typeof computed.passivePerception === 'number') u.passivePerception = computed.passivePerception;
          if (typeof computed.passiveInvestigation === 'number') u.passiveInvestigation = computed.passiveInvestigation;
          if (typeof computed.passiveInsight === 'number') u.passiveInsight = computed.passiveInsight;
          if (typeof computed.inspiration === 'boolean') u.inspiration = computed.inspiration;
          if (typeof computed.proficiencyBonus === 'number') u.proficiencyBonus = computed.proficiencyBonus;
          if (computed.spellCasterInfo) u.spellCasterInfo = computed.spellCasterInfo;
          if (computed.deathSaveInfo && typeof computed.deathSaveInfo === 'object') {
            u.deathSaveInfo = Object.assign({}, u.deathSaveInfo || {}, computed.deathSaveInfo);
          }
          if (Array.isArray(computed.conditions)) u.conditions = computed.conditions;
        }
      } catch (e) {
        console.warn('[ddb-init-bar] rules engine enrichment failed — using raw data', e);
      }
    }
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
    /* Clean D&D-themed badge icons — bold shapes optimised for TV viewing distance. */
    const SVG_HEART =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 1800 1800" aria-hidden="true">' +
        '<path class="dib-pc-stat-bg" d="M900 1540' +
          'C900 1540 140 1060 140 560' +
          'C140 330 305 175 510 175' +
          'C690 175 840 270 900 360' +
          'C960 270 1110 175 1290 175' +
          'C1495 175 1660 330 1660 560' +
          'C1660 1060 900 1540 900 1540Z"/>' +
        '<path fill="currentColor" stroke="#000" stroke-width="10" stroke-linejoin="round"' +
          ' d="M900 1540' +
          'C900 1540 140 1060 140 560' +
          'C140 330 305 175 510 175' +
          'C690 175 840 270 900 360' +
          'C960 270 1110 175 1290 175' +
          'C1495 175 1660 330 1660 560' +
          'C1660 1060 900 1540 900 1540Z' +
          'M900 420C856 376 796 332 730 306' +
          'M900 420C944 376 1004 332 1070 306"/>' +
      '</svg>';
    /* Heater shield — classic kite shape with quartering band and divider. */
    const SVG_SHIELD =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 1800 1800" aria-hidden="true">' +
        '<path class="dib-pc-stat-bg"' +
          ' d="M270 190L1530 190L1530 880Q1530 1160 900 1570Q270 1160 270 880Z"/>' +
        '<path fill="currentColor" stroke="#000" stroke-width="10" stroke-linejoin="round"' +
          ' d="M270 190L1530 190L1530 880Q1530 1160 900 1570Q270 1160 270 880Z' +
          'M900 190L900 1100' +
          'M270 640L1530 640"/>' +
      '</svg>';
    /* D20 — clean pentagon with triangular facet lines visible at distance. */
    const SVG_SPELL_D20 =
      '<svg class="dib-pc-stat-svg" viewBox="0 0 1800 1800" aria-hidden="true">' +
        '<path class="dib-pc-stat-bg"' +
          ' d="M900 110L1625 665L1318 1590L482 1590L175 665Z"/>' +
        '<path fill="currentColor" stroke="#000" stroke-width="10" stroke-linejoin="round"' +
          ' d="M900 110L1625 665L1318 1590L482 1590L175 665Z' +
          'M900 110L482 1590' +
          'M900 110L1318 1590' +
          'M175 665L1318 1590' +
          'M1625 665L482 1590' +
          'M175 665L1625 665"/>' +
      '</svg>';

    const SVG_INSPIRATION =
      '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M12 1L13.5 8.5L20.5 6L16.5 12L20.5 18L13.5 15.5L12 23L10.5 15.5L3.5 18L7.5 12L3.5 6L10.5 8.5Z"/>' +
        '<circle cx="12" cy="12" r="2.4"/>' +
      '</svg>';

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
      const rib = document.createElement('div');
      rib.className = 'dib-pc-stat-badge-ribbon';
      rib.textContent = ribbonLabel;
      graphic.appendChild(nums);
      graphic.appendChild(rib);
      wrap.appendChild(graphic);
      return wrap;
    }

    for (let ix = 0; ix < ids.length; ix++) {
      const id = ids[ix];
      const c = partyById[String(id)];
      const card = document.createElement('div');
      card.className = 'dib-party-card' + (c && c.inspiration ? ' dib-party-card--inspired' : '');
      card.setAttribute('data-ddb-char-id', String(id));
      if (c && c.inspiration) {
        const inspIcon = document.createElement('div');
        inspIcon.className = 'dib-pc-insp-icon';
        inspIcon.innerHTML = SVG_INSPIRATION;
        card.appendChild(inspIcon);
      }
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
      titleBlock.appendChild(raceEl);
      titleBlock.appendChild(classEl);
      if (c) {
        const pcCondLabs = extractDdbConditionLabels(c);
        if (pcCondLabs.length) {
          const pcCondRow = document.createElement('div');
          pcCondRow.className = 'dib-pc-cond-row';
          const pcCondLabel = document.createElement('span');
          pcCondLabel.className = 'dib-pc-cond-label';
          pcCondLabel.textContent = 'Conditions';
          pcCondRow.appendChild(pcCondLabel);
          for (let pci = 0; pci < pcCondLabs.length; pci++) {
            const pill = document.createElement('span');
            pill.className = 'dib-pc-inline-cond-pill';
            const full = pcCondLabs[pci];
            pill.title = full;
            pill.textContent = '[' + abbrevConditionLabel(full) + ']';
            pcCondRow.appendChild(pill);
          }
          titleBlock.appendChild(pcCondRow);
        }
      }
      hdr.appendChild(avWrap);
      hdr.appendChild(titleBlock);
      stack.appendChild(hdr);

      const dcStr = c ? displaySpellSaveDc(c) : null;
      const hp = c ? hpBoxParts(c) : null;
      const hpMain = hp ? (hp.temp ? String(hp.temp) : hp.cur) : '—';
      const hpSub = '';
      if (hp && Number(hp.cur) <= 0) {
        const koDiv = document.createElement('div');
        koDiv.className = 'dib-pc-ko-overlay';
        koDiv.textContent = 'ZzZ';
        avWrap.appendChild(koDiv);
      }

      const statRow = document.createElement('div');
      statRow.className = 'dib-pc-stat-icon-row';
      const hpBadge = makeStatBadge('hp', SVG_HEART, hpMain, hpSub, 'Hit points');
      if (hp && hp.max !== '—') {
        const cur = Number(hp.cur) || 0;
        const max = Number(hp.max) || 1;
        const ratio = cur / max;
        if (ratio <= 0.1) hpBadge.classList.add('dib-pc-stat-badge--hp-critical');
        else if (ratio <= 0.25) hpBadge.classList.add('dib-pc-stat-badge--hp-low');
      }
      statRow.appendChild(hpBadge);
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
      /** Combined row: death-save pips (left) + passive skills (right) */
      const dsPassRow = document.createElement('div');
      dsPassRow.className = 'dib-pc-ds-pass-row';

      const dsCol = document.createElement('div');
      dsCol.className = 'dib-pc-death-saves';
      const dsTitle = document.createElement('div');
      dsTitle.className = 'dib-pc-section-title';
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
      dsCol.appendChild(dsTitle);
      dsCol.appendChild(dsFlex);
      dsPassRow.appendChild(dsCol);

      const passCol = document.createElement('div');
      passCol.className = 'dib-pc-pass-inline';
      function addPassCell(lab, val, svgPath) {
        const cell = document.createElement('div');
        cell.className = 'dib-pc-pass-cell';
        const num = document.createElement('span');
        num.className = 'dib-pc-pass-num';
        num.textContent = val;
        cell.appendChild(num);
        const iconLab = document.createElement('span');
        iconLab.className = 'dib-pc-pass-icon-lab';
        if (svgPath) {
          const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          ico.setAttribute('class', 'dib-pc-pass-icon');
          ico.setAttribute('viewBox', '0 0 24 24');
          ico.setAttribute('aria-hidden', 'true');
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          p.setAttribute('d', svgPath);
          p.setAttribute('fill', 'currentColor');
          ico.appendChild(p);
          iconLab.appendChild(ico);
        }
        const lb = document.createElement('span');
        lb.className = 'dib-pc-pass-lab';
        lb.textContent = lab;
        iconLab.appendChild(lb);
        cell.appendChild(iconLab);
        passCol.appendChild(cell);
      }
      const PASS_EYE = 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z';
      const PASS_MAG = 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
      const PASS_BULB = 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z';
      if (c) {
        addPassCell('Perc', computePassiveSkill(c, 'perception'), PASS_EYE);
        addPassCell('Inv', computePassiveSkill(c, 'investigation'), PASS_MAG);
        addPassCell('Ins', computePassiveSkill(c, 'insight'), PASS_BULB);
      } else {
        addPassCell('Perc', '—', PASS_EYE);
        addPassCell('Inv', '—', PASS_MAG);
        addPassCell('Ins', '—', PASS_BULB);
      }
      dsPassRow.appendChild(passCol);
      stack.appendChild(dsPassRow);

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

  /**
   * Walk the React fibre tree on the campaign page to find DDB's own computed armorClass for
   * the given character ID.  DDB runs the full character-tools calculation client-side and
   * stores the result in component props — this lets us read the accurate value without
   * replicating all of DDB's AC rules ourselves.
   */
  function __readAcFromReactPage(charId) {
    try {
      const idStr = String(charId);
      // Locate any DOM element tied to this character (card link, card root, data-attribute).
      const candidates = [
        document.querySelector('[data-entity-id="' + idStr + '"]'),
        document.querySelector('[data-character-id="' + idStr + '"]'),
        document.querySelector('a[href*="/characters/' + idStr + '"]'),
      ];
      let startEl = null;
      for (let ci = 0; ci < candidates.length; ci++) {
        if (candidates[ci]) { startEl = candidates[ci]; break; }
      }
      if (!startEl) return null;
      // Walk up a few levels to reach the card root where richer props live.
      let rootEl = startEl;
      for (let up = 0; up < 6 && rootEl.parentElement; up++) rootEl = rootEl.parentElement;
      // Find the React internal fibre key (React 16+: __reactFiber$…; older: __reactInternalInstance$…).
      const fKey = Object.keys(rootEl).find(function (k) {
        return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
      });
      if (!fKey) return null;
      let fiber = rootEl[fKey];
      let depth = 0;
      while (fiber && depth < 60) {
        const props = fiber.memoizedProps || fiber.pendingProps || {};
        // Direct armorClass prop.
        if (typeof props.armorClass === 'number') return props.armorClass;
        // Nested under character / characterData / data / entity.
        const nested = props.character || props.characterData || props.data || props.entity;
        if (nested && typeof nested === 'object') {
          if (typeof nested.armorClass === 'number') return nested.armorClass;
        }
        fiber = fiber.return;
        depth++;
      }
    } catch (_) { /* non-critical */ }
    return null;
  }

  /**
   * Compute AC from raw DDB character JSON (inventory + modifiers).
   * Collects all equipped armors and picks the one that yields the HIGHEST effective AC
   * (prevents wrong result when DDB keeps multiple armors with equipped:true in inventory).
   *
   * DDB armorTypeId: 1=light, 2=medium, 3=heavy, 4=shield
   */
  function __computeArmorClassFromRaw(c) {
    if (!c || typeof c !== 'object') return null;
    const dexMod = __getStatModFromCharacter(c, 2);
    const inv = Array.isArray(c.inventory) ? c.inventory : [];
    const equippedArmors = [];
    let hasShield = false;
    for (let i = 0; i < inv.length; i++) {
      const item = inv[i];
      if (!item) continue;
      // Handle boolean, numeric, and string equipped flags.
      const eq = item.equipped ?? item.isEquipped;
      if (!eq || eq === '0' || eq === 'false') continue;
      const def = item.definition;
      if (!def || typeof def !== 'object') continue;
      const isArmor = def.filterType === 'Armor' || def.type === 'Armor' ||
                      (def.armorTypeId != null && def.armorTypeId !== 0);
      if (!isArmor) continue;
      const tid = Number(def.armorTypeId) || 0;
      if (tid === 4 || def.isShield === true) {
        hasShield = true;
      } else {
        const bac = Number(def.baseArmorClass);
        if (Number.isFinite(bac) && bac > 0) {
          equippedArmors.push({ bac: bac, tid: tid });
        }
      }
    }
    // Pick the armor that gives the highest effective AC (important when multiple are equipped).
    let baseAc = 10 + dexMod;
    for (let ai = 0; ai < equippedArmors.length; ai++) {
      const a = equippedArmors[ai];
      let eff;
      if (a.tid === 1) eff = a.bac + dexMod;
      else if (a.tid === 2) eff = a.bac + Math.min(2, dexMod);
      else eff = a.bac; // heavy (3) or unrecognised — no DEX
      if (eff > baseAc) baseAc = eff;
    }
    if (hasShield) baseAc += 2;
    // Add flat AC bonuses from all modifier buckets (e.g. Defense fighting style +1).
    const mods = c.modifiers;
    if (mods && typeof mods === 'object') {
      const buckets = Object.keys(mods);
      for (let bi = 0; bi < buckets.length; bi++) {
        const arr = mods[buckets[bi]];
        if (!Array.isArray(arr)) continue;
        for (let mi = 0; mi < arr.length; mi++) {
          const m = arr[mi];
          if (m && m.type === 'bonus' && m.subType === 'armor-class') {
            baseAc += Number(m.value) || 0;
          }
        }
      }
    }
    return Number.isFinite(baseAc) ? Math.round(baseAc) : null;
  }

  function displayArmorClass(c) {
    if (!c || typeof c !== 'object') return '—';
    // 1. Prefer any pre-computed field from legacy or processed endpoints.
    const topKeys = ['armorClass', 'calculatedArmorClass', 'armor_class'];
    for (let i = 0; i < topKeys.length; i++) {
      const v = c[topKeys[i]];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 50) return String(Math.round(v));
      if (typeof v === 'string' && /^\d+$/.test(v.trim())) return v.trim();
    }
    // 2. Try to read DDB's own computed value from the React component tree on the page.
    if (c.id) {
      const reactAc = __readAcFromReactPage(c.id);
      if (reactAc !== null && reactAc >= 1 && reactAc <= 50) return String(reactAc);
    }
    // 3. Compute from raw inventory + modifiers (handles most common armour + shield + FS combos).
    const computed = __computeArmorClassFromRaw(c);
    if (computed !== null) return String(computed);
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
      lv.textContent = fullName || '—';
      lv.title = fullName + ' (' + remaining + '/' + max + ')';
      grp.appendChild(lv);
      if (max > 4) {
        const numEl = document.createElement('span');
        numEl.className = 'dib-pc-class-res-count';
        numEl.textContent = remaining + '/' + max;
        grp.appendChild(numEl);
      } else {
        const dots = document.createElement('span');
        dots.className = 'dib-pc-slot-dots';
        for (let d = 0; d < cap; d++) {
          const g = document.createElement('span');
          g.className = 'dib-pc-slot-glyph' + (d < remDots ? ' dib-pc-slot-glyph--on' : ' dib-pc-slot-glyph--off');
          g.setAttribute('aria-hidden', 'true');
          dots.appendChild(g);
        }
        grp.appendChild(dots);
      }
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
    /** Skip entries DDB marks as inactive (active: false / removed: true). */
    if (o.active === false || o.removed === true) return '';
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
        // Legacy character-tools correctly computes maxHitPoints (honouring overrideHitPoints / Fixed HP).
        // v5 raw API omits the override so we let legacy win for computed totals, then re-derive
        // currentHitPoints from v5's live removedHitPoints so mid-session damage still shows.
        const merged = Object.assign({}, __cloneJsonValueUsr(lv), __cloneJsonValueUsr(prev));
        const liveRem = lv.removedHitPoints;
        const liveTmp = lv.temporaryHitPoints;
        if (typeof liveRem === 'number') {
          merged.removedHitPoints = liveRem;
          const maxNum = Number(merged.maxHitPoints ?? merged.max ?? merged.hitPointsMax ?? merged.maximumHitPoints);
          if (Number.isFinite(maxNum) && maxNum > 0) {
            merged.currentHitPoints = Math.max(0, maxNum - liveRem);
          }
        }
        if (typeof liveTmp === 'number') merged.temporaryHitPoints = liveTmp;
        target.hitPointInfo = merged;
        continue;
      }
      if (key === 'armorClass') {
        // v5 raw API returns null or the uncomputed base (10) for this field; it does not run
        // the full equipment calculation that character-tools (legacy endpoint) performs.
        // Prefer any valid value the legacy endpoint has already computed.
        const legAc = target.armorClass;
        if (typeof legAc === 'number' && Number.isFinite(legAc) && legAc >= 10) continue;
      }
      if (key === 'overrideHitPoints') {
        // v5 character-service may return null for overrideHitPoints even when Fixed HP is set;
        // prefer the legacy value when it is a valid positive number (the Fixed HP setting).
        const legOv = target.overrideHitPoints;
        if (typeof legOv === 'number' && Number.isFinite(legOv) && legOv > 0) continue;
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
    consume(r.conditions);
    consume(r.activeConditions);
    return Array.from(labels).slice(0, maxLabels);
  }

  function conditionLabelsForCard(c) {
    return extractDdbConditionLabels(c);
  }

  function hpBoxParts(c) {
    if (!c || typeof c !== 'object') return { cur: '—', max: '—', temp: 0 };
    const hpi = c.hitPointInfo;
    if (hpi && typeof hpi === 'object') {
      // The character-tools rules engine (ootz0rz / TeaWithLucas) returns:
      //   totalHp, remainingHp, tempHp, bonusHp
      // The raw v5 API returns:
      //   maxHitPoints, currentHitPoints, tempHitPoints, removedHitPoints
      const max = Number(hpi.totalHp ?? hpi.maxHitPoints ?? hpi.max ?? hpi.hitPointsMax ?? hpi.maximumHitPoints);
      const cur = Number(hpi.remainingHp ?? hpi.currentHitPoints ?? hpi.current ?? hpi.hitPoints);
      const tmp = Number(hpi.tempHp ?? hpi.tempHitPoints ?? hpi.temp ?? hpi.temporaryHitPoints) || 0;
      if (Number.isFinite(max) && max > 0) {
        let displayCur;
        if (Number.isFinite(cur)) {
          displayCur = cur;
        } else {
          const rem = Number(hpi.removedHitPoints ?? c.removedHitPoints) || 0;
          displayCur = max - rem;
        }
        return {
          cur: String(Math.max(0, Math.floor(displayCur))),
          max: String(Math.floor(max)),
          temp: tmp > 0 ? tmp : 0,
        };
      }
    }
    // Fallback: derive from top-level raw character fields.
    const ovRaw = c.overrideHitPoints;
    const ovNum = Number.isFinite(Number(ovRaw)) && Number(ovRaw) > 0 ? Math.floor(Number(ovRaw)) : null;
    const base = Number(c.baseHitPoints);
    const rem = Number(c.removedHitPoints) || 0;
    const tmp = Number(c.temporaryHitPoints) || 0;
    const max =
      ovNum !== null
        ? ovNum
        : Number.isFinite(base) && base >= 0
          ? Math.floor(base)
          : null;
    const cur = max != null ? Math.max(0, max - rem) : null;
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

  function __pickDsScalar(raw) {
    if (raw == null || raw === '') return null;
    if (Array.isArray(raw)) return countDeathSaveBoolArray(raw);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function pickDeathSaveCountsFromObject(ds) {
    if (!ds || typeof ds !== 'object') return { s: null, f: null };
    const sPick =
      ds.successCount ??
      ds.successes ??
      ds.success ??
      ds.saveSuccesses ??
      ds.deathSavesSuccessCount ??
      ds.deathSaveSuccessCount ??
      ds.deathSaveSuccesses ??
      ds.deathSavesSuccess;
    const fPick =
      ds.failureCount ??
      ds.failures ??
      ds.fail ??
      ds.fails ??
      ds.saveFailures ??
      ds.deathSavesFailCount ??
      ds.deathSaveFailCount ??
      ds.deathSaveFailures ??
      ds.deathSavesFail ??
      ds.failCount;
    let s = __pickDsScalar(sPick);
    let f = __pickDsScalar(fPick);
    if (s == null) {
      const c2 = countDeathSaveBoolArray(ds.deathSaveSuccesses ?? ds.successRolls);
      if (c2 != null) s = c2;
    }
    if (f == null) {
      const c3 = countDeathSaveBoolArray(ds.deathSaveFailures ?? ds.failRolls);
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

    function fillFromObj(src) {
      const inner = pickDeathSaveCountsFromObject(src);
      if (s == null) s = inner.s;
      if (f == null) f = inner.f;
    }

    const hpi = c.hitPointInfo;
    if (hpi && typeof hpi === 'object') {
      s = __pickDsScalar(
        hpi.deathSavesSuccessCount ??
        hpi.deathSaveSuccessCount ??
        hpi.deathSavesSuccess ??
        hpi.successCount ??
        hpi.successes ??
        hpi.success,
      );
      f = __pickDsScalar(
        hpi.deathSavesFailCount ??
        hpi.deathSaveFailCount ??
        hpi.deathSavesFail ??
        hpi.failureCount ??
        hpi.failures ??
        hpi.fail ??
        hpi.failCount,
      );
      /** Always fill missing side from nested deathSaveInfo — e.g. DDB puts successes flat but failures in deathSaveInfo. */
      if ((s == null || f == null) && hpi.deathSaveInfo && typeof hpi.deathSaveInfo === 'object') {
        fillFromObj(hpi.deathSaveInfo);
      }
      if (s == null) {
        const bs = countDeathSaveBoolArray(hpi.deathSaveSuccesses ?? hpi.successRolls);
        if (bs != null) s = bs;
      }
      if (f == null) {
        const bf = countDeathSaveBoolArray(hpi.deathSaveFailures ?? hpi.failRolls);
        if (bf != null) f = bf;
      }
    }

    const topDsi = c.deathSaveInfo;
    if ((s == null || f == null) && topDsi && typeof topDsi === 'object') {
      fillFromObj(topDsi);
    }

    const dsObj = c.deathSaves ?? c.deathSave;
    if ((s == null || f == null) && dsObj && typeof dsObj === 'object') {
      fillFromObj(dsObj);
    }

    if (s == null) s = __pickDsScalar(c.successes);
    if (f == null) f = __pickDsScalar(c.fails ?? c.failures);

    /** Last resort: try top-level as a deathSaveInfo-shaped object. */
    if (s == null || f == null) fillFromObj(c);

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
    remoteSync.pushState(localInitState);
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
    remoteSync.pushState(localInitState);
  }

  var COND_ABBREV = {
    'BLINDED':        'BLND',
    'CHARMED':        'CHRM',
    'DEAFENED':       'DEAF',
    'EXHAUSTION':     'EXHST',
    'FRIGHTENED':     'FRGHT',
    'GRAPPLED':       'GRPL',
    'INCAPACITATED':  'INCAP',
    'INVISIBLE':      'INVIS',
    'PARALYZED':      'PARA',
    'PETRIFIED':      'PETR',
    'POISONED':       'POIS',
    'PRONE':          'PRONE',
    'RESTRAINED':     'RSTR',
    'STUNNED':        'STUN',
    'UNCONSCIOUS':    'UNCON',
    'CONCENTRATION':  'CONC',
    'DEAD':           'DEAD',
    'DYING':          'DYING',
    'STABLE':         'STBL',
  };
  function abbrevConditionLabel(name) {
    const t = String(name || '').trim().toUpperCase();
    const m = t.match(/^([A-Z][A-Z\s]*)(\d+)$/);
    if (m) {
      const letters = m[1].replace(/\s+/g, '');
      const num = m[2];
      const known = COND_ABBREV[letters];
      const abbr = known || (letters.length <= 5 ? letters : letters.slice(0, 5));
      return abbr + num;
    }
    const flat = t.replace(/\s+/g, '');
    if (COND_ABBREV[flat]) return COND_ABBREV[flat];
    if (flat.length <= 5) return flat;
    return flat.slice(0, 5);
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
    body.title = 'Set active turn';
    body.addEventListener('click', () => {
      const turnIdx = localInitState ? localInitState.turnOrder.indexOf(eid) : -1;
      if (turnIdx === -1) return;
      mutateLocalInitiative(function (st) {
        var revealed = [];
        for (var i = 0; i < turnIdx; i++) {
          revealed.push(st.turnOrder[i]);
        }
        return Object.assign({}, st, {
          currentTurnIndex: turnIdx,
          revealedEntryIds: revealed,
        });
      });
    });

    const nameRow = document.createElement('div');
    nameRow.className = 'dib-init-name-row';
    const nameEl = document.createElement('div');
    nameEl.className = 'dib-init-name';
    const useFirstName = barSettings.firstNameOnly !== false;
    if (useFirstName) {
      const firstName = String(e.label || '').trim().split(/\s+/)[0] || e.label;
      nameEl.textContent = firstName;
      nameEl.setAttribute('data-dib-first-name', 'true');
      const lenBucket = firstName.length <= 4 ? 'xs'
        : firstName.length <= 6 ? 'sm'
        : firstName.length <= 8 ? 'md'
        : firstName.length <= 11 ? 'lg'
        : 'xl';
      nameEl.setAttribute('data-len', lenBucket);
    } else {
      nameEl.textContent = e.label;
    }
    nameRow.appendChild(nameEl);
    const partyC = e.entityId != null && e.entityId !== '' ? partyById[String(e.entityId)] : null;
    if (partyC && partyC.inspiration) card.classList.add('dib-init-card--inspired');
    if (partyC) {
      const koHp = hpBoxParts(partyC);
      if (koHp && Number(koHp.cur) <= 0) {
        const koDiv = document.createElement('div');
        koDiv.className = 'dib-init-ko-overlay';
        koDiv.textContent = 'ZzZ';
        avWrap.appendChild(koDiv);
      }
    }
    const sheetCondLabs = partyC ? extractDdbConditionLabels(partyC) : [];
    const trackerAbbrevs = new Set(
      (Array.isArray(e.conditions) ? e.conditions : []).map(function (tc) {
        return abbrevConditionLabel(tc && tc.name);
      }),
    );

    // Bottom condition row — full-width strip below the main card row.
    const condRow = document.createElement('div');
    condRow.className = 'dib-init-cond-row';

    // DDB sheet conditions (read-only, deduplicated against tracker conditions).
    for (let sxi = 0; sxi < sheetCondLabs.length; sxi++) {
      const slab = sheetCondLabs[sxi];
      const sab = abbrevConditionLabel(slab);
      if (trackerAbbrevs.has(sab)) continue;
      const sp = document.createElement('span');
      sp.className = 'dib-init-cond-pill dib-init-cond-pill--ddb';
      sp.textContent = '[' + sab + ']';
      sp.title = slab + ' (from sheet)';
      condRow.appendChild(sp);
    }

    // Tracker-editable conditions.
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
      condRow.appendChild(pill);
    }

    const rollLine = document.createElement('div');
    rollLine.className = 'dib-init-roll';
    const bd = e.rollBreakdown;
    const modUsed = bd && bd.mod != null ? bd.mod : e.mod;
    if (reveal) {
      if (bd && bd.rolls && bd.rolls.length) {
        const kept = bd.kept != null ? bd.kept : bd.rolls[bd.rolls.length - 1];
        rollLine.textContent = 'Roll ' + kept + ' ' + fmtSignedMod(modUsed);
      } else {
        rollLine.textContent = 'Mod ' + fmtSignedMod(e.mod);
      }
    } else {
      rollLine.className = 'dib-init-roll dib-init-roll--pending';
      rollLine.textContent = entryHasRoll(e) ? 'Rolled' : 'Mod ' + fmtSignedMod(e.mod);
    }

    const tieLine = document.createElement('div');
    tieLine.className = 'dib-init-tie';
    if (reveal && e.dexMod != null && Number.isFinite(Number(e.dexMod))) {
      tieLine.textContent = 'Tiebreak DEX ' + fmtSignedMod(e.dexMod);
    } else {
      tieLine.textContent = '\u00a0';
    }

    body.appendChild(nameRow);
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
    card.appendChild(condRow);
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
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&display=swap');
      * { box-sizing: border-box; }
      .dib-wrap {
        --dib-red: #b91c1c;
        --dib-red-hot: #ef4444;
        --dib-black: #050506;
        --dib-surface: #0e0e10;
        --dib-surface2: #16161a;
        --dib-border: #2a2a30;
        --dib-muted: #a8a29e;
        --dib-frame-outer: #1a0a08;
        --dib-frame-gold: #d4a843;
        --dib-frame-inset: rgba(212,168,67,.15);
        --dib-wood-dark: #1c1008;
        --dib-wood-mid: #2e1c10;
        --dib-wood-light: #3d2a18;
        --dib-iron: #5a5a62;
        --dib-iron-light: #8a8a94;
        --dib-glow: rgba(239,68,68,.45);
        --dib-glow-dim: rgba(239,68,68,.18);
        --dib-heading-font: 'Cinzel', Georgia, 'Times New Roman', serif;
        --dib-divider: #3d2a18;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        flex-direction: column;
        font: 12px/1.35 system-ui, "Segoe UI", sans-serif;
        color: var(--dib-text, #e7e5e4);
        background:
          repeating-linear-gradient(
            90deg,
            rgba(255,255,255,.013) 0px, rgba(255,255,255,.013) 1px,
            transparent 1px, transparent 72px
          ),
          repeating-linear-gradient(
            0deg,
            rgba(0,0,0,.09) 0px, rgba(0,0,0,.09) 1px,
            transparent 1px, transparent 26px
          ),
          linear-gradient(180deg, var(--dib-wood-dark, #1c1008) 0%, var(--dib-black, #050506) 100%);
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
        background: linear-gradient(180deg, var(--dib-wood-dark, #1a0c0e) 0%, #060406 100%);
        border-bottom: none;
        box-shadow:
          0 1px 0 var(--dib-iron, #5a5a62),
          0 2px 0 var(--dib-frame-gold, #d4a843),
          0 3px 0 var(--dib-iron, #5a5a62),
          0 8px 20px rgba(0,0,0,.7);
        font-weight: 700;
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        text-shadow: 0 1px 0 rgba(0,0,0,.9), 0 0 14px var(--dib-glow-dim, rgba(239,68,68,.18));
        position: relative;
        z-index: 2;
      }
      .dib-head-title { flex: 1; min-width: 0; }
      .dib-head-actions { flex-shrink: 0; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .dib-head-actions button {
        cursor: pointer;
        border: 1px solid var(--dib-frame-gold, #d4a843);
        background: linear-gradient(180deg, var(--dib-wood-mid, #2e1c10) 0%, var(--dib-wood-dark, #1c1008) 100%);
        color: var(--dib-frame-gold, #d4a843);
        border-radius: 4px;
        padding: 6px 12px;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 2px 6px rgba(0,0,0,.5);
        transition: background 0.2s ease, color 0.15s ease, box-shadow 0.2s ease;
      }
      .dib-head-actions button:hover {
        background: linear-gradient(180deg, var(--dib-wood-light, #3d2a18) 0%, var(--dib-wood-mid, #2e1c10) 100%);
        color: #fff;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 0 12px var(--dib-glow-dim, rgba(239,68,68,.2));
      }
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
        flex: 0 0 clamp(320px, 28vw, 440px);
        background: linear-gradient(180deg, var(--dib-wood-dark, #0e0c0b) 0%, var(--dib-surface, #0e0e10) 12%, var(--dib-surface, #0e0e10) 100%);
        border-right: none;
        box-shadow: 2px 0 0 var(--dib-frame-gold, #d4a843), 4px 0 16px rgba(0,0,0,.45);
        position: relative;
        z-index: 1;
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
      .dib-subhead-init { color: var(--dib-muted); margin-top: auto; text-align: center; border-top: 1px solid var(--dib-border); padding-top: 6px; }
      .dib-subhead-party { color: var(--dib-red-hot); }
      .dib-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 8px 8px; border-top: 1px solid var(--dib-border); justify-content: center; }
      .dib-toolbar button, .dib-init-actions button {
        cursor: pointer;
        border: 1px solid var(--dib-iron, #5a5a62);
        background: linear-gradient(180deg, var(--dib-surface2, #16161a) 0%, var(--dib-surface, #0e0e10) 100%);
        color: #d6d3d1;
        border-radius: 4px;
        padding: 4px 7px;
        font: inherit;
        font-size: 11px;
        transition: border-color 0.2s ease, color 0.15s ease, background 0.2s ease, box-shadow 0.2s ease;
      }
      .dib-toolbar button:hover, .dib-init-actions button:hover {
        border-color: var(--dib-frame-gold, #d4a843);
        color: var(--dib-frame-gold, #d4a843);
        background: linear-gradient(180deg, var(--dib-wood-mid, #2e1c10) 0%, var(--dib-wood-dark, #1c1008) 100%);
        box-shadow: 0 0 8px var(--dib-glow-dim, rgba(239,68,68,.18));
      }
      .dib-meta { font-size: 11px; color: #fca5a5; padding: 4px 10px; text-align: center; }
      .dib-init-list {
        flex: 1 1 0;
        min-height: 0;
        overflow: auto;
        overflow-x: hidden;
        background: #080809;
        padding: 8px 8px 4px;
      }
      .dib-init-card {
        margin-bottom: 8px;
        border-radius: 8px;
        border: 1px solid var(--dib-iron, #5a5a62);
        border-left: 3px solid var(--dib-iron, #5a5a62);
        background: linear-gradient(165deg, #1e1a17 0%, #100e0c 55%, #0c0a09 100%);
        box-shadow: 0 6px 20px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
      }
      .dib-init-card-active {
        border-color: var(--dib-frame-gold, #d4a843) !important;
        border-left-color: var(--dib-frame-gold, #d4a843) !important;
        background: linear-gradient(165deg, #241e16 0%, #140f09 55%, #0e0b06 100%);
        animation: dib-active-pulse 2.5s ease-in-out infinite;
      }
      .dib-init-card--inspired:not(.dib-init-card-active) {
        animation: dib-inspire-shimmer 3s ease-in-out infinite;
      }
      .dib-init-card-active.dib-init-card--inspired {
        animation: dib-active-pulse 2.5s ease-in-out infinite, dib-inspire-shimmer 3s ease-in-out infinite;
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
        padding: var(--dib-init-row-pad, 12px 10px 12px 8px);
        min-height: var(--dib-init-row-minheight, 84px);
      }
      .dib-init-rank {
        flex: 0 0 22px;
        text-align: center;
        font-weight: 700;
        font-size: var(--dib-init-rank-size, 15px);
        color: var(--dib-iron-light, #8a8a94);
        font-variant-numeric: tabular-nums;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
      }
      .dib-init-avatar-wrap {
        flex: 0 0 auto;
        position: relative;
      }
      .dib-init-ko-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.65);
        border-radius: 8px;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 28px;
        font-weight: 900;
        color: #e5e5e5;
        letter-spacing: 0.1em;
        text-shadow: 0 2px 8px rgba(0,0,0,.9), 0 0 12px rgba(200,200,200,.25);
        z-index: 2;
        pointer-events: none;
      }
      .dib-init-avatar {
        width: var(--dib-init-avatar-size, 64px);
        height: var(--dib-init-avatar-size, 64px);
        border-radius: 8px;
        object-fit: cover;
        display: block;
        border: 2px solid var(--dib-frame-gold, #d4a843);
        box-shadow: 0 0 0 1px var(--dib-iron, #5a5a62), 0 4px 14px rgba(0,0,0,.55), 0 0 12px var(--dib-glow-dim, rgba(212,168,67,.15));
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
      }
      .dib-init-ph {
        width: var(--dib-init-avatar-size, 64px);
        height: var(--dib-init-avatar-size, 64px);
        border-radius: 8px;
        background: linear-gradient(135deg, var(--dib-wood-mid, #292524) 0%, var(--dib-wood-dark, #1c1917) 100%);
        border: 2px solid var(--dib-frame-gold, #d4a843);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--dib-init-ph-size, 26px);
        font-weight: 800;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        color: var(--dib-frame-gold, #d4a843);
        box-shadow: 0 0 0 1px var(--dib-iron, #5a5a62), 0 4px 14px rgba(0,0,0,.5), 0 0 12px var(--dib-glow-dim, rgba(212,168,67,.15));
        transition: border-color 0.3s ease, box-shadow 0.3s ease;
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
        font-size: var(--dib-init-name-size, 14px);
        color: #f0ede8;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        letter-spacing: 0.04em;
        line-height: 1.25;
        margin-bottom: 0;
        word-break: break-word;
        flex: 0 1 auto;
        min-width: 0;
      }
      .dib-init-name[data-dib-first-name] {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        white-space: normal;
        line-height: 1.2;
        letter-spacing: 0.01em;
      }
      .dib-init-name[data-len="xs"] { font-size: 36px; }
      .dib-init-name[data-len="sm"] { font-size: 32px; }
      .dib-init-name[data-len="md"] { font-size: 28px; }
      .dib-init-name[data-len="lg"] { font-size: 24px; }
      .dib-init-name[data-len="xl"] { font-size: 20px; }
      .dib-init-body--click { cursor: pointer; }
      .dib-init-cond-row {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px 6px;
        padding: 5px 10px 6px 10px;
        border-top: 1px solid rgba(255,255,255,.07);
      }
      .dib-init-cond-row:empty { display: none; }
      .dib-init-cond-pill--ddb {
        flex: 0 0 auto;
        cursor: default;
        font-size: var(--dib-init-cond-size, 9px);
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(125,211,252,.2);
        border: 1px solid rgba(56,189,248,.5);
        color: #93d4f8;
        line-height: 1.2;
        text-shadow: 0 1px 2px rgba(0,0,0,.6);
      }
      .dib-init-cond-pill {
        display: inline-flex;
        align-items: center;
        gap: 1px;
        font-size: var(--dib-init-cond-size, 9px);
        font-weight: 700;
        letter-spacing: 0.04em;
        padding: 2px 5px 2px 6px;
        border-radius: 4px;
        background: rgba(212,168,67,.2);
        border: 1px solid rgba(212,168,67,.5);
        color: #f0d88a;
        line-height: 1.2;
        text-shadow: 0 1px 2px rgba(0,0,0,.6);
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
        transition: opacity 0.15s ease, color 0.15s ease;
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
        font-size: var(--dib-init-total-size, 28px);
        font-weight: 900;
        color: #f0ede8;
        line-height: 1;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 22px var(--dib-glow, rgba(239,68,68,.45)), 0 2px 8px rgba(0,0,0,.6);
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
        --pc-gold: var(--dib-pc-gold, #c9a962);
        --pc-gold-dim: var(--dib-pc-gold-dim, #8a7a4a);
        --pc-teal: var(--dib-pc-teal, #3dd6c7);
        --pc-teal-dim: var(--dib-pc-teal-dim, #1a9e8c);
        --pc-panel: var(--dib-pc-panel, #1a1614);
        --pc-ink: #0f0e0d;
        border: 2px solid var(--dib-iron, #5a5a62);
        border-top: 4px solid var(--dib-frame-gold, #d4a843);
        border-radius: 8px;
        background: linear-gradient(180deg, var(--dib-pc-bg-start, #1c1816) 0%, var(--dib-pc-bg-mid, #12100e) 55%, var(--dib-pc-bg-end, #0e0c0b) 100%);
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
        box-shadow:
          0 0 0 1px var(--dib-frame-outer, #1a0a08),
          inset 0 0 0 1px var(--dib-frame-inset, rgba(212,168,67,.12)),
          0 12px 32px rgba(0,0,0,.6);
        cursor: default;
        position: relative;
        transition: transform 0.2s ease, box-shadow 0.25s ease;
      }
      .dib-party-card::before,
      .dib-party-card::after {
        content: '';
        position: absolute;
        width: 12px;
        height: 12px;
        z-index: 2;
        pointer-events: none;
      }
      .dib-party-card::before {
        top: 4px;
        left: 4px;
        border-top: 2px solid var(--dib-frame-gold, #d4a843);
        border-left: 2px solid var(--dib-frame-gold, #d4a843);
      }
      .dib-party-card::after {
        bottom: 4px;
        right: 4px;
        border-bottom: 2px solid var(--dib-frame-gold, #d4a843);
        border-right: 2px solid var(--dib-frame-gold, #d4a843);
      }
      .dib-party-card:hover {
        transform: translateY(-3px);
        box-shadow:
          0 0 0 1px var(--dib-frame-outer, #1a0a08),
          inset 0 0 0 1px var(--dib-frame-inset, rgba(212,168,67,.2)),
          0 20px 44px rgba(0,0,0,.7),
          0 0 18px var(--dib-glow-dim, rgba(212,168,67,.12));
      }
      .dib-party-card--inspired {
        animation: dib-inspire-shimmer 3s ease-in-out infinite;
      }
      .dib-pc-stack {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: var(--dib-card-padding, 10px);
        min-height: 0;
      }
      .dib-pc-head {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 10px;
        padding-bottom: 6px;
        margin-bottom: 4px;
        border-bottom: none;
        position: relative;
      }
      .dib-pc-head::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg,
          transparent 0%,
          var(--dib-iron, #5a5a62) 15%,
          var(--dib-frame-gold, #d4a843) 50%,
          var(--dib-iron, #5a5a62) 85%,
          transparent 100%
        );
      }
      .dib-pc-avatar-wrap { flex-shrink: 0; position: relative; }
      .dib-pc-ko-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.65);
        border-radius: 6px;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 18px;
        font-weight: 900;
        color: #e5e5e5;
        letter-spacing: 0.1em;
        text-shadow: 0 2px 8px rgba(0,0,0,.9), 0 0 12px rgba(200,200,200,.25);
        z-index: 2;
        pointer-events: none;
      }
      .dib-pc-avatar {
        width: var(--dib-avatar-size, 52px);
        height: var(--dib-avatar-size, 52px);
        border-radius: 6px;
        object-fit: cover;
        display: block;
        border: 2px solid var(--dib-frame-gold, #d4a843);
        box-shadow: 0 0 0 1px var(--dib-iron, #5a5a62), 0 4px 14px rgba(0,0,0,.6), 0 0 12px var(--dib-glow-dim, rgba(212,168,67,.15));
      }
      .dib-pc-ph {
        width: var(--dib-avatar-size, 52px);
        height: var(--dib-avatar-size, 52px);
        border-radius: 6px;
        background: linear-gradient(135deg, var(--dib-wood-mid, #2a2420) 0%, var(--dib-wood-dark, #1a1614) 100%);
        border: 2px solid var(--dib-frame-gold, #d4a843);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--dib-ph-size, 20px);
        font-weight: 800;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        color: var(--dib-frame-gold, #d4a843);
        box-shadow: 0 0 0 1px var(--dib-iron, #5a5a62), 0 4px 14px rgba(0,0,0,.6), 0 0 12px var(--dib-glow-dim, rgba(212,168,67,.15));
      }
      .dib-pc-titles { flex: 1; min-width: 0; }
      .dib-pc-name {
        font-weight: 700;
        color: var(--dib-frame-gold, #d4a843);
        font-size: var(--dib-name-size, 13px);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        line-height: 1.2;
        word-break: break-word;
        text-shadow: 0 1px 0 rgba(0,0,0,.9), 0 0 16px var(--dib-glow-dim, rgba(212,168,67,.2));
      }
      .dib-pc-cond-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-start;
        gap: 4px 6px;
        padding: 4px 0 0;
      }
      .dib-pc-cond-row:empty { display: none; }
      .dib-pc-cond-label {
        flex-shrink: 0;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        text-shadow: 0 1px 0 rgba(0,0,0,.8);
        margin-right: 2px;
      }
      .dib-pc-inline-cond-pill {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(61,214,199,.18);
        border: 1px solid rgba(61,214,199,.45);
        color: var(--pc-teal);
        text-shadow: 0 1px 2px rgba(0,0,0,.5);
      }
      .dib-pc-race {
        font-size: var(--dib-sub-size, 10px);
        font-style: italic;
        color: #78716c;
        margin-top: 4px;
        line-height: 1.3;
      }
      .dib-pc-classline {
        font-size: var(--dib-sub-size, 10px);
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
        margin-bottom: 0;
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
        max-width: var(--dib-badge-maxw, 88px);
        margin: 0 auto;
        aspect-ratio: 1 / 1.05;
        color: var(--dib-badge-icon, #f5f5f4);
        filter: drop-shadow(0 2px 6px rgba(0,0,0,.45));
      }
      .dib-pc-stat-svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .dib-pc-stat-bg {
        fill: var(--dib-badge-fill, #ffffff);
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
        font-size: var(--dib-stat-val-size, clamp(17px,4.2vw,22px));
        font-weight: 800;
        color: var(--dib-badge-text, #1c1917);
        line-height: 1;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 1px rgba(255,255,255,.35);
      }
      .dib-pc-stat-badge-sub {
        font-size: var(--dib-badge-sub-size, 9px);
        font-weight: 600;
        color: var(--dib-badge-text, #1c1917);
        margin-top: 2px;
        font-variant-numeric: tabular-nums;
        max-width: 72px;
        line-height: 1.15;
      }
      /* ribbon rule overridden below by the absolute-positioned banner */
      .dib-pc-section-title {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        margin: 10px 0 8px;
        text-shadow: 0 1px 0 rgba(0,0,0,.8);
      }
      .dib-pc-section-title--small {
        letter-spacing: 0.10em;
        margin: 8px 0 5px;
        font-size: 11px;
      }
      .dib-pc-block { margin-top: 3px; }
      .dib-pc-stack-empty {
        font-size: 11px;
        color: #57534e;
        font-style: italic;
        padding: 8px 4px;
      }
      /** Outer row: death-save pips left, passives right */
      .dib-pc-ds-pass-row {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 6px;
        margin-top: 2px;
        padding: 3px 0 10px;
        border-bottom: none;
        position: relative;
      }
      .dib-pc-ds-pass-row::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg,
          transparent 0%,
          var(--dib-iron, #5a5a62) 20%,
          var(--dib-frame-gold, #d4a843) 50%,
          var(--dib-iron, #5a5a62) 80%,
          transparent 100%
        );
      }
      .dib-pc-death-saves {
        flex-shrink: 0;
      }
      .dib-pc-ds-flex {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
      }
      .dib-pc-pass-inline {
        flex: 1;
        min-width: 0;
        align-self: center;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        justify-items: center;
        align-items: start;
        padding-top: 2px;
      }
      .dib-pc-pass-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 2px;
        min-width: 0;
      }
      .dib-pc-pass-icon-lab {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 3px;
      }
      .dib-pc-pass-num {
        font-size: var(--dib-stat-val-size, clamp(17px,4.2vw,22px));
        font-weight: 800;
        color: var(--pc-teal);
        line-height: 1;
        font-family: Georgia, serif;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 14px var(--dib-glow-dim, rgba(61,214,199,.3));
      }
      .dib-pc-pass-lab {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        text-shadow: 0 1px 0 rgba(0,0,0,.8);
      }
      .dib-pc-pass-icon {
        width: 16px;
        height: 16px;
        color: var(--dib-frame-gold, #d4a843);
        opacity: 0.75;
        flex-shrink: 0;
        display: block;
      }
      .dib-pc-ds-group {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
      }
      .dib-pc-ds-pip {
        width: 32px;
        height: 32px;
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
        border-color: rgba(52,211,153,.65);
        background: rgba(6,78,59,.38);
        color: #6ee7b7;
        box-shadow: 0 0 16px rgba(52,211,153,.38);
      }
      .dib-pc-ds-pip--fail.dib-pc-ds-pip--on {
        border-color: rgba(248,113,113,.65);
        background: rgba(127,29,29,.38);
        color: #fca5a5;
        box-shadow: 0 0 16px rgba(248,113,113,.32);
      }
      .dib-pc-ds-svg {
        width: 18px;
        height: 18px;
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
        font-size: 16px;
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
        font-size: 16px;
      }
      .dib-pc-slot-dots {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 4px;
      }
      .dib-pc-slot-glyph {
        display: inline-block;
        width: 13px;
        height: 13px;
        font-size: 0;
        clip-path: polygon(50% 0%,100% 50%,50% 100%,0% 50%);
        vertical-align: middle;
        user-select: none;
        flex-shrink: 0;
      }
      .dib-pc-slot-glyph--on {
        background: var(--dib-frame-gold, #d4a843);
        box-shadow: 0 0 6px rgba(212,168,67,.6);
      }
      .dib-pc-slot-glyph--off {
        background: var(--dib-iron, #5a5a62);
        opacity: 0.65;
      }
      .dib-pc-class-res-dots {
        gap: 5px 10px;
        font-size: 16px;
        line-height: 1.25;
      }
      .dib-pc-class-res-lv {
        font-size: 14px;
        font-weight: 600;
        color: #a8a29e;
        word-break: break-word;
        line-height: 1.3;
      }
      .dib-pc-class-res-count {
        font-size: 15px;
        font-weight: 700;
        color: var(--pc-teal);
        font-family: Georgia, serif;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.04em;
        line-height: 1;
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
      .dib-settings-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,.62);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 200;
      }
      .dib-settings-overlay--hidden { display: none; }
      .dib-settings-panel {
        background: #0e0e10;
        border: 1px solid var(--dib-border);
        border-radius: 10px;
        width: clamp(300px,38vw,460px);
        box-shadow: 0 20px 60px rgba(0,0,0,.75);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .dib-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 12px;
        border-bottom: 1px solid var(--dib-border);
        background: linear-gradient(180deg, #1a0c0e 0%, #0a0a0b 100%);
      }
      .dib-settings-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: #fafaf9;
      }
      .dib-settings-close {
        cursor: pointer;
        background: none;
        border: 1px solid rgba(255,255,255,.12);
        color: #a8a29e;
        border-radius: 5px;
        padding: 3px 8px;
        font: inherit;
        font-size: 11px;
      }
      .dib-settings-close:hover { border-color: var(--dib-red-hot); color: #fff; }
      .dib-settings-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .dib-settings-section-title {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: var(--dib-red-hot);
        margin-bottom: 10px;
      }
      .dib-settings-swatches {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .dib-settings-swatch {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 7px 10px;
        border: 2px solid rgba(255,255,255,.1);
        border-radius: 8px;
        background: rgba(255,255,255,.04);
        flex: 1 1 80px;
        min-width: 70px;
      }
      .dib-settings-swatch:hover { border-color: rgba(255,255,255,.28); }
      .dib-settings-swatch--active { border-color: var(--dib-red-hot) !important; background: rgba(255,255,255,.08); }
      .dib-settings-swatch-dot {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,.18);
        flex-shrink: 0;
      }
      .dib-settings-swatch-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #a8a29e;
        text-align: center;
      }
      .dib-settings-swatch--active .dib-settings-swatch-label { color: #e7e5e4; }
      .dib-settings-density-row {
        display: flex;
        gap: 8px;
      }
      .dib-settings-density-btn {
        cursor: pointer;
        flex: 1;
        padding: 8px 10px;
        border: 2px solid rgba(255,255,255,.1);
        border-radius: 7px;
        background: rgba(255,255,255,.04);
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        color: #a8a29e;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: center;
      }
      .dib-settings-density-btn:hover { border-color: rgba(255,255,255,.28); color: #e7e5e4; }
      .dib-settings-density-btn--active { border-color: var(--dib-red-hot) !important; color: #e7e5e4; background: rgba(255,255,255,.08); }
      .dib-settings-density-hint {
        font-size: 8px;
        color: #57534e;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
      }
      .dib-settings-density-btn--active .dib-settings-density-hint { color: #78716c; }
      .dib-settings-footer {
        font-size: 9px;
        color: #57534e;
        padding: 10px 16px 14px;
        text-align: center;
        border-top: 1px solid var(--dib-border);
      }

      /* ===== KEYFRAME ANIMATIONS ===== */
      @keyframes dib-active-pulse {
        0%, 100% {
          box-shadow:
            0 0 0 2px var(--dib-glow, rgba(239,68,68,.45)),
            0 0 18px var(--dib-glow-dim, rgba(239,68,68,.18)),
            0 8px 24px rgba(0,0,0,.6);
        }
        50% {
          box-shadow:
            0 0 0 3px var(--dib-glow, rgba(239,68,68,.45)),
            0 0 36px var(--dib-glow, rgba(239,68,68,.45)),
            0 8px 24px rgba(0,0,0,.6);
        }
      }
      @keyframes dib-inspire-shimmer {
        0%, 100% {
          box-shadow:
            0 0 0 1px var(--dib-frame-outer, #1a0a08),
            inset 0 0 0 1px var(--dib-frame-inset, rgba(212,168,67,.12)),
            0 0 14px 4px rgba(255,215,0,.45),
            0 0 4px 1px rgba(255,215,0,.22),
            0 12px 32px rgba(0,0,0,.6);
        }
        50% {
          box-shadow:
            0 0 0 1px var(--dib-frame-outer, #1a0a08),
            inset 0 0 0 1px var(--dib-frame-inset, rgba(212,168,67,.22)),
            0 0 24px 8px rgba(255,215,0,.65),
            0 0 8px 2px rgba(255,215,0,.38),
            0 12px 32px rgba(0,0,0,.6);
        }
      }
      @keyframes dib-low-hp-pulse {
        0%, 100% { opacity: 1; color: #ef4444; }
        50% { opacity: 0.55; color: #dc2626; }
      }
      @keyframes dib-critical-hp-pulse {
        0%, 100% {
          opacity: 1;
          color: #ef4444;
          text-shadow: 0 0 14px rgba(239,68,68,.9);
        }
        50% {
          opacity: 0.45;
          color: #b91c1c;
          text-shadow: none;
        }
      }

      /* ===== ACTIVE TURN OVERRIDES ===== */
      .dib-init-card-active .dib-init-name {
        color: var(--dib-frame-gold, #d4a843);
        text-shadow: 0 0 14px var(--dib-glow-dim, rgba(239,68,68,.2));
      }
      .dib-init-card-active .dib-init-rank {
        color: var(--dib-frame-gold, #d4a843);
      }
      .dib-init-card-active .dib-init-total {
        color: var(--dib-frame-gold, #d4a843);
        text-shadow: 0 0 22px rgba(212,168,67,.65), 0 2px 8px rgba(0,0,0,.6);
      }
      .dib-init-card-active .dib-init-avatar,
      .dib-init-card-active .dib-init-ph {
        box-shadow: 0 0 0 1px var(--dib-iron, #5a5a62), 0 4px 14px rgba(0,0,0,.55), 0 0 24px var(--dib-glow, rgba(212,168,67,.35));
      }

      /* ===== LOW HP STATES ===== */
      .dib-pc-stat-badge--hp-low .dib-pc-stat-badge-val {
        color: #ef4444 !important;
        animation: dib-low-hp-pulse 1.8s ease-in-out infinite;
      }
      .dib-pc-stat-badge--hp-critical .dib-pc-stat-badge-val {
        color: #ef4444 !important;
        animation: dib-critical-hp-pulse 0.9s ease-in-out infinite;
      }

      /* ===== SCROLLBAR THEMING ===== */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track {
        background: var(--dib-wood-dark, #1c1008);
        border-left: 1px solid var(--dib-iron, #5a5a62);
      }
      ::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, var(--dib-iron, #5a5a62) 0%, var(--dib-wood-mid, #2e1c10) 100%);
        border: 1px solid var(--dib-frame-gold, #d4a843);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, var(--dib-frame-gold, #d4a843) 0%, var(--dib-iron, #5a5a62) 100%);
      }

      /* ===== MODAL ENHANCEMENTS ===== */
      .dib-modal {
        background: linear-gradient(165deg, var(--dib-wood-mid, #1f1f24) 0%, var(--dib-wood-dark, #121214) 100%);
        border: 1px solid var(--dib-iron, #5a5a62);
        box-shadow:
          inset 0 0 0 1px var(--dib-frame-inset, rgba(212,168,67,.1)),
          0 20px 60px rgba(0,0,0,.75);
      }
      .dib-modal-title {
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        color: var(--dib-frame-gold, #d4a843);
        letter-spacing: 0.08em;
      }
      .dib-modal-actions button,
      .dib-modal-close {
        transition: border-color 0.2s ease, color 0.15s ease, background 0.2s ease;
      }
      .dib-modal-actions button:hover,
      .dib-modal-close:hover {
        border-color: var(--dib-frame-gold, #d4a843) !important;
        color: var(--dib-frame-gold, #d4a843);
      }

      /* ===== SUBHEAD STYLING ===== */
      .dib-subhead-init {
        color: var(--dib-iron-light, #8a8a94);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 9px;
      }
      .dib-subhead-party {
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: 9px;
      }

      /* ===== PARTY CARD OVERFLOW FIX ===== */
      .dib-pc-stack { border-radius: 6px; }
      .dib-party-grid { padding: 6px 10px 8px; gap: 6px 14px; }

      /* ===== HIDE INITIATIVE TIE LINE + RANK; SHOW ROLL ===== */
      .dib-init-tie { display: none; }
      .dib-init-rank { display: none; }
      .dib-init-roll {
        font-size: 15px;
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--dib-frame-gold, #d4a843);
        text-align: left;
        white-space: normal;
        word-break: break-word;
        line-height: 1.4;
        margin-top: 2px;
      }
      .dib-init-roll--pending {
        color: var(--dib-muted, #64748b);
        font-style: normal;
      }

      /* ===== INIT ASIDE — SCORE TOP, ACTIONS BOTTOM ===== */
      .dib-init-aside {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: space-between;
        gap: 6px;
        min-width: 64px;
      }
      .dib-init-total {
        font-size: var(--dib-init-total-size, 36px);
        text-align: right;
        line-height: 1;
      }
      .dib-init-actions {
        justify-content: flex-end;
        align-items: flex-end;
        margin-top: auto;
      }

      /* ===== STAT BADGE RIBBON — OVERLAPPING BANNER ===== */
      .dib-pc-stat-badge-ribbon {
        position: absolute;
        bottom: 9%;
        left: 50%;
        transform: translateX(-50%);
        width: 86%;
        padding: 3px 8px;
        background: linear-gradient(180deg, var(--dib-wood-mid, #2e1c10) 0%, var(--dib-wood-dark, #1c1008) 100%);
        border-top: 1px solid var(--dib-frame-gold, #d4a843);
        border-bottom: 1px solid var(--dib-frame-gold, #d4a843);
        border-left: none;
        border-right: none;
        border-radius: 0;
        color: var(--dib-frame-gold, #d4a843);
        font-family: var(--dib-heading-font, 'Cinzel', Georgia, serif);
        font-size: var(--dib-ribbon-size, 7px);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        text-align: center;
        text-shadow: 0 1px 0 rgba(0,0,0,.8);
        z-index: 2;
        white-space: nowrap;
        margin-top: 0;
        box-shadow: 0 2px 6px rgba(0,0,0,.55);
      }
      .dib-pc-stat-badge-ribbon::before {
        content: '';
        position: absolute;
        left: -8px;
        top: 0;
        bottom: 0;
        width: 8px;
        background: var(--dib-wood-dark, #1c1008);
        clip-path: polygon(100% 0, 100% 100%, 0 50%);
      }
      .dib-pc-stat-badge-ribbon::after {
        content: '';
        position: absolute;
        right: -8px;
        top: 0;
        bottom: 0;
        width: 8px;
        background: var(--dib-wood-dark, #1c1008);
        clip-path: polygon(0 0, 0 100%, 100% 50%);
      }

      /* ===== INSPIRATION ICON ===== */
      .dib-pc-insp-icon {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 40px;
        height: 40px;
        color: var(--dib-frame-gold, #d4a843);
        filter: drop-shadow(0 0 6px rgba(212,168,67,.95))
                drop-shadow(0 0 14px rgba(212,168,67,.55));
        animation: dib-inspire-shimmer 3s ease-in-out infinite;
        pointer-events: none;
        z-index: 2;
      }
      .dib-pc-insp-icon svg {
        width: 100%;
        height: 100%;
        display: block;
      }
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
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.textContent = '\u2699 Settings';
    settingsBtn.addEventListener('click', openSettingsPanel);
    const showDdbBtn = document.createElement('button');
    showDdbBtn.type = 'button';
    showDdbBtn.textContent = 'Show D&D Beyond';
    showDdbBtn.addEventListener('click', function () {
      hideDmOverlay();
    });
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.textContent = '\u21bb Refresh';
    refreshBtn.addEventListener('click', function () {
      void refreshPartyRoster();
    });
    headActions.appendChild(settingsBtn);
    headActions.appendChild(refreshBtn);
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
        remoteSync.pushState(localInitState);
      }),
    );

    const initMeta = document.createElement('div');
    initMeta.className = 'dib-meta';
    initiativeUi.meta = initMeta;

    const initList = document.createElement('div');
    initList.className = 'dib-init-list';
    initiativeUi.list = initList;

    rosterEl = document.createElement('div');
    rosterEl.className = 'dib-party-grid';

    const foot = document.createElement('div');
    foot.className = 'dib-foot';
    foot.innerHTML =
      'Poll ~' +
      Math.round(POLL_MS / 1000) +
      's · legacy+json → v5 → v4 · <a href="https://github.com/TeaWithLucas/DNDBeyond-DM-Screen" target="_blank" rel="noopener">TeaWithLucas</a> · <a href="https://github.com/FaithLilley/DnDBeyond-Live-Campaign" target="_blank" rel="noopener">Live-Campaign</a>';

    colInit.appendChild(initList);
    colInit.appendChild(subInit);
    colInit.appendChild(initMeta);
    colInit.appendChild(initToolbar);

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

    /** Settings panel overlay */
    const settingsOverlay = document.createElement('div');
    settingsOverlay.className = 'dib-settings-overlay dib-settings-overlay--hidden';
    settingsOverlay.addEventListener('click', closeSettingsPanel);
    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'dib-settings-panel';
    settingsPanel.addEventListener('click', (ev) => ev.stopPropagation());

    const settingsHeader = document.createElement('div');
    settingsHeader.className = 'dib-settings-header';
    const settingsTitleEl = document.createElement('div');
    settingsTitleEl.className = 'dib-settings-title';
    settingsTitleEl.textContent = 'Settings';
    const settingsCloseBtn = document.createElement('button');
    settingsCloseBtn.type = 'button';
    settingsCloseBtn.className = 'dib-settings-close';
    settingsCloseBtn.textContent = '✕ Close';
    settingsCloseBtn.addEventListener('click', closeSettingsPanel);
    settingsHeader.appendChild(settingsTitleEl);
    settingsHeader.appendChild(settingsCloseBtn);

    const settingsBody = document.createElement('div');
    settingsBody.className = 'dib-settings-body';

    /** Colour theme section */
    const themeSection = document.createElement('div');
    const themeTitle = document.createElement('div');
    themeTitle.className = 'dib-settings-section-title';
    themeTitle.textContent = 'Colour Theme';
    themeSection.appendChild(themeTitle);
    const swatchRow = document.createElement('div');
    swatchRow.className = 'dib-settings-swatches';
    const themeIds = Object.keys(BAR_THEMES);
    for (let ti = 0; ti < themeIds.length; ti++) {
      const tid = themeIds[ti];
      const t = BAR_THEMES[tid];
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'dib-settings-swatch' + (barSettings.theme === tid ? ' dib-settings-swatch--active' : '');
      sw.setAttribute('data-dib-theme', tid);
      sw.title = t.name;
      const dot = document.createElement('div');
      dot.className = 'dib-settings-swatch-dot';
      dot.style.background = t.swatch;
      const lbl = document.createElement('div');
      lbl.className = 'dib-settings-swatch-label';
      lbl.textContent = t.name;
      sw.appendChild(dot);
      sw.appendChild(lbl);
      sw.addEventListener('click', () => {
        barSettings.theme = tid;
        saveBarSettings();
        applyBarSettings(barSettings, wrap);
      });
      swatchRow.appendChild(sw);
    }
    themeSection.appendChild(swatchRow);
    settingsBody.appendChild(themeSection);

    /** Card density section */
    const densitySection = document.createElement('div');
    const densityTitle = document.createElement('div');
    densityTitle.className = 'dib-settings-section-title';
    densityTitle.textContent = 'Card Density';
    densitySection.appendChild(densityTitle);
    const densityRow = document.createElement('div');
    densityRow.className = 'dib-settings-density-row';
    function makeDensityBtn(id, label, hint) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dib-settings-density-btn' + (barSettings.density === id ? ' dib-settings-density-btn--active' : '');
      btn.setAttribute('data-dib-density', id);
      const lbl = document.createElement('span');
      lbl.textContent = label;
      const hintEl = document.createElement('span');
      hintEl.className = 'dib-settings-density-hint';
      hintEl.textContent = hint;
      btn.appendChild(lbl);
      btn.appendChild(hintEl);
      btn.addEventListener('click', () => {
        barSettings.density = id;
        saveBarSettings();
        applyBarSettings(barSettings, wrap);
      });
      return btn;
    }
    densityRow.appendChild(makeDensityBtn('comfortable', 'Comfortable', 'Larger portraits & numbers'));
    densityRow.appendChild(makeDensityBtn('compact', 'Compact', 'More cards on screen'));
    densityRow.appendChild(makeDensityBtn('large', 'Large', 'Maximum size portraits & text'));
    densitySection.appendChild(densityRow);
    settingsBody.appendChild(densitySection);

    /** Name Display section */
    const nameDispSection = document.createElement('div');
    const nameDispTitle = document.createElement('div');
    nameDispTitle.className = 'dib-settings-section-title';
    nameDispTitle.textContent = 'Name Display';
    nameDispSection.appendChild(nameDispTitle);
    const nameDispRow = document.createElement('div');
    nameDispRow.className = 'dib-settings-density-row';
    const fnBtn = document.createElement('button');
    fnBtn.type = 'button';
    fnBtn.className = 'dib-settings-density-btn' + (barSettings.firstNameOnly !== false ? ' dib-settings-density-btn--active' : '');
    fnBtn.setAttribute('data-dib-firstname-toggle', 'true');
    const fnLbl = document.createElement('span');
    fnLbl.textContent = 'First Name Only';
    const fnHint = document.createElement('span');
    fnHint.className = 'dib-settings-density-hint';
    fnHint.textContent = 'Larger auto-scaled name';
    fnBtn.appendChild(fnLbl);
    fnBtn.appendChild(fnHint);
    fnBtn.addEventListener('click', () => {
      barSettings.firstNameOnly = barSettings.firstNameOnly === false ? true : false;
      saveBarSettings();
      applyBarSettings(barSettings, wrap);
      refreshSettingsPanelActiveStates(barSettings);
      renderLocalInitiativeUi();
    });
    nameDispRow.appendChild(fnBtn);
    nameDispSection.appendChild(nameDispRow);
    settingsBody.appendChild(nameDispSection);

    /** Icon colours section */
    const badgeColSection = document.createElement('div');
    const badgeColTitle = document.createElement('div');
    badgeColTitle.className = 'dib-settings-section-title';
    badgeColTitle.textContent = 'Icon Colours';
    badgeColSection.appendChild(badgeColTitle);
    function makeColourRow(label, settingKey, defaultVal) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:11px;min-width:70px;opacity:.75;';
      lbl.textContent = label;
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = barSettings[settingKey] || defaultVal;
      picker.style.cssText = 'width:36px;height:28px;padding:2px;border:1px solid rgba(255,255,255,.15);border-radius:5px;background:transparent;cursor:pointer;flex-shrink:0;';
      const hexLbl = document.createElement('span');
      hexLbl.style.cssText = 'font-size:10px;opacity:.5;flex:1;';
      hexLbl.textContent = barSettings[settingKey] || defaultVal;
      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset';
      resetBtn.style.cssText = 'font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:inherit;cursor:pointer;';
      picker.addEventListener('input', () => {
        barSettings[settingKey] = picker.value;
        hexLbl.textContent = picker.value;
        saveBarSettings();
        applyBarSettings(barSettings, wrap);
      });
      resetBtn.addEventListener('click', () => {
        barSettings[settingKey] = defaultVal;
        picker.value = defaultVal;
        hexLbl.textContent = defaultVal;
        saveBarSettings();
        applyBarSettings(barSettings, wrap);
      });
      row.appendChild(lbl);
      row.appendChild(picker);
      row.appendChild(hexLbl);
      row.appendChild(resetBtn);
      return row;
    }
    badgeColSection.appendChild(makeColourRow('Fill', 'badgeFill', '#ffffff'));
    badgeColSection.appendChild(makeColourRow('Lines', 'badgeIcon', '#f5f5f4'));
    badgeColSection.appendChild(makeColourRow('Number', 'badgeText', '#1c1917'));
    settingsBody.appendChild(badgeColSection);

    /** Remote Control section */
    var rcSection = document.createElement('div');
    rcSection.style.marginTop = '16px';
    var rcTitle = document.createElement('div');
    rcTitle.className = 'dib-settings-section-title';
    rcTitle.textContent = 'Remote Control';
    rcSection.appendChild(rcTitle);

    var rcServerRow = document.createElement('div');
    rcServerRow.style.marginBottom = '8px';
    var rcServerLabel = document.createElement('label');
    rcServerLabel.textContent = 'Server URL';
    rcServerLabel.style.cssText = 'display:block;font-size:11px;color:#aaa;margin-bottom:2px;';
    var rcServerInput = document.createElement('input');
    rcServerInput.type = 'text';
    rcServerInput.placeholder = 'https://your-server.example.com';
    rcServerInput.style.cssText = 'width:100%;box-sizing:border-box;padding:4px 6px;border-radius:4px;border:1px solid #555;background:#1a1a1e;color:#fff;font-size:12px;';
    try { var prevCfg = JSON.parse(PAGE.localStorage.getItem('ddbInitBarRemoteSyncV1') || '{}'); rcServerInput.value = prevCfg.serverUrl || ''; } catch (_) {}
    rcServerRow.appendChild(rcServerLabel);
    rcServerRow.appendChild(rcServerInput);
    rcSection.appendChild(rcServerRow);

    var rcStatus = document.createElement('div');
    rcStatus.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:8px;';
    rcStatus.textContent = 'Disconnected';

    var rcQrContainer = document.createElement('div');
    rcQrContainer.style.cssText = 'margin:8px 0;text-align:center;';

    remoteSync.setUiRefs(rcStatus, rcQrContainer);

    var rcBtnRow = document.createElement('div');
    rcBtnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;';

    function rcBtn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'padding:4px 10px;border-radius:4px;border:1px solid #555;background:#2a2a2e;color:#fff;font-size:11px;cursor:pointer;';
      b.addEventListener('click', fn);
      return b;
    }

    var rcEnableBtn = rcBtn('Enable Remote Control', function () {
      remoteSync.enable(rcServerInput.value.trim());
      PAGE.setTimeout(function () {
        if (remoteSync.getConfig()) {
          remoteSync.renderQrCode();
          rcOpenBtn.style.display = '';
          rcCopyBtn.style.display = '';
          rcRegenBtn.style.display = '';
          rcShowQrBtn.style.display = '';
          rcDisableBtn.style.display = '';
          rcEnableBtn.style.display = 'none';
        }
      }, 2500);
    });

    var rcDisableBtn = rcBtn('Disable', function () {
      remoteSync.disconnect();
      rcEnableBtn.style.display = '';
      rcDisableBtn.style.display = 'none';
      rcOpenBtn.style.display = 'none';
      rcCopyBtn.style.display = 'none';
      rcRegenBtn.style.display = 'none';
      rcShowQrBtn.style.display = 'none';
    });

    var rcOpenBtn = rcBtn('Open on this device', function () {
      var u = remoteSync.getRemoteUrl();
      if (u) PAGE.open(u, '_blank');
    });

    var rcCopyBtn = rcBtn('Copy link', function () {
      var u = remoteSync.getRemoteUrl();
      if (u && navigator.clipboard) navigator.clipboard.writeText(u);
    });

    var rcRegenBtn = rcBtn('Regenerate QR', function () {
      remoteSync.enable(rcServerInput.value.trim());
      PAGE.setTimeout(function () {
        if (remoteSync.getConfig()) remoteSync.renderQrCode();
      }, 2500);
    });

    var rcShowQrBtn = rcBtn('Show QR Code', function () {
      if (remoteSync.getConfig()) remoteSync.renderQrCode();
    });

    var hasExisting = !!remoteSync.getConfig();
    rcDisableBtn.style.display = hasExisting ? '' : 'none';
    rcOpenBtn.style.display = hasExisting ? '' : 'none';
    rcCopyBtn.style.display = hasExisting ? '' : 'none';
    rcRegenBtn.style.display = hasExisting ? '' : 'none';
    rcShowQrBtn.style.display = hasExisting ? '' : 'none';
    rcEnableBtn.style.display = hasExisting ? 'none' : '';

    rcBtnRow.appendChild(rcEnableBtn);
    rcBtnRow.appendChild(rcDisableBtn);
    rcBtnRow.appendChild(rcShowQrBtn);
    rcBtnRow.appendChild(rcOpenBtn);
    rcBtnRow.appendChild(rcCopyBtn);
    rcBtnRow.appendChild(rcRegenBtn);
    rcSection.appendChild(rcBtnRow);
    rcSection.appendChild(rcStatus);
    rcSection.appendChild(rcQrContainer);

    settingsBody.appendChild(rcSection);

    if (hasExisting) {
      PAGE.setTimeout(function () { remoteSync.renderQrCode(); }, 500);
    }

    settingsPanel.appendChild(settingsHeader);
    settingsPanel.appendChild(settingsBody);
    const settingsFooter = document.createElement('div');
    settingsFooter.className = 'dib-settings-footer';
    settingsFooter.textContent = 'Changes apply immediately and are saved across sessions.';
    settingsPanel.appendChild(settingsFooter);
    settingsOverlay.appendChild(settingsPanel);
    settingsPanelEl = settingsOverlay;

    wrap.appendChild(confirmOverlay);
    wrap.appendChild(condOverlay);
    wrap.appendChild(rerollOverlay);
    wrap.appendChild(settingsOverlay);

    shadow.appendChild(style);
    shadow.appendChild(wrap);
    document.body.appendChild(hostEl);
    lockBodyScrollForOverlay();

    /** Apply persisted settings immediately after wrap is in DOM. */
    barSettings = loadBarSettings();
    applyBarSettings(barSettings, wrap);

    remoteSync.loadConfig();
    if (remoteSync.getConfig()) {
      remoteSync.loadSocketIoThenConnect();
    }

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

  /* ═══════════════════════════════════════════════════════════════════════
     RemoteSyncAdapter — bridges initiative state to/from the relay server
     ═══════════════════════════════════════════════════════════════════════ */
  var remoteSync = (function () {
    var CONFIG_KEY = 'ddbInitBarRemoteSyncV1';
    var config = null;
    var socket = null;
    var statusEl = null;
    var qrContainerEl = null;

    function loadConfig() {
      try {
        var raw = PAGE.localStorage.getItem(CONFIG_KEY);
        if (raw) config = JSON.parse(raw);
      } catch (_) {}
    }

    function saveConfig() {
      try {
        PAGE.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      } catch (_) {}
    }

    function clearConfig() {
      config = null;
      try { PAGE.localStorage.removeItem(CONFIG_KEY); } catch (_) {}
    }

    function enable(serverUrl, userToken) {
      var url = (serverUrl || '').replace(/\/+$/, '');
      if (!url) { updateStatus('error', 'No server URL'); return; }
      updateStatus('reconnecting', 'Creating session…');
      GM_xmlhttpRequest({
        method: 'POST',
        url: url + '/api/sessions',
        headers: { 'Content-Type': 'application/json' },
        data: '{}',
        onload: function (resp) {
          try {
            var d = JSON.parse(resp.responseText);
            config = {
              serverUrl: url,
              sessionId: d.sessionId,
              dmToken: d.dmToken,
              displayToken: d.displayToken,
              userToken: userToken || null,
            };
            saveConfig();
            loadSocketIoThenConnect();
          } catch (e) {
            updateStatus('error', 'Session creation failed');
          }
        },
        onerror: function () {
          updateStatus('error', 'Network error — check server URL');
        },
      });
    }

    function loadSocketIoThenConnect() {
      if (!config) return;
      if (typeof io !== 'undefined') { connect(); return; }
      var s = document.createElement('script');
      s.src = config.serverUrl + '/socket.io/socket.io.js';
      s.onload = function () { connect(); };
      s.onerror = function () {
        updateStatus('error', 'Could not load socket.io client');
      };
      document.head.appendChild(s);
    }

    function connect() {
      if (!config) return;
      if (socket) { socket.disconnect(); socket = null; }
      updateStatus('reconnecting', 'Connecting…');
      socket = io(config.serverUrl, { transports: ['websocket', 'polling'] });
      socket.on('connect', function () {
        socket.emit('session:subscribe', { sessionId: config.sessionId, token: config.dmToken });
        socket.emit('session:enableRelay');
        updateStatus('connected', 'Connected');
        if (localInitState) pushState(localInitState);
      });
      socket.on('disconnect', function () {
        updateStatus('reconnecting', 'Reconnecting…');
      });
      socket.on('error', function (p) {
        updateStatus('error', (p && p.message) || 'Socket error');
      });
      socket.on('remote:command', function (cmd) {
        if (!cmd || !cmd.type) return;
        handleRemoteCommand(cmd);
      });
    }

    function disconnect() {
      if (socket) { socket.disconnect(); socket = null; }
      clearConfig();
      clearQr();
      updateStatus('disconnected', 'Disconnected');
    }

    function pushState(initState) {
      if (!socket || !socket.connected || !initState) return;
      socket.emit('initiative:pushState', { state: mapToServerState(initState) });
    }

    function mapToServerState(ls) {
      var entries = {};
      var ids = ls.turnOrder || [];
      for (var i = 0; i < ids.length; i++) {
        var e = ls.entries[ids[i]];
        if (!e) continue;
        var conds = [];
        if (e.conditions && e.conditions.length) {
          for (var j = 0; j < e.conditions.length; j++) {
            var c = e.conditions[j];
            conds.push(typeof c === 'string' ? c : (c.name || String(c)));
          }
        }
        entries[e.id] = {
          id: e.id,
          entityId: e.entityId || e.id,
          label: e.label || 'Unknown',
          initiativeTotal: e.initiativeTotal || 0,
          rollMode: e.rollMode || 'normal',
          mod: e.mod || 0,
          dexMod: e.dexMod,
          locked: !!e.locked,
          delayed: !!e.delayed,
          ready: !!e.ready,
          groupId: e.groupId || undefined,
          rollBreakdown: e.rollBreakdown || undefined,
          avatarUrl: e.avatarUrl || undefined,
          conditions: conds.length ? conds : undefined,
          combatTags: e.combatTags || undefined,
        };
      }
      return {
        round: ls.round || 1,
        currentTurnIndex: ls.currentTurnIndex || 0,
        turnOrder: ids,
        entries: entries,
        markedEntryId: ls.markedEntryId || null,
      };
    }

    function handleRemoteCommand(cmd) {
      var t = cmd.type;
      if (t === 'initiative:next') {
        mutateLocalInitiative(localNextTurn);
      } else if (t === 'initiative:prev') {
        mutateLocalInitiative(localPrevTurn);
      } else if (t === 'initiative:nextRound') {
        mutateLocalInitiative(nextRound);
      } else if (t === 'initiative:startCombat') {
        startCombat();
      } else if (t === 'initiative:clear') {
        localInitState = emptyLocalInitiativeState();
        saveLocalInitiativeState();
        renderLocalInitiativeUi();
        pushState(localInitState);
      } else if (t === 'initiative:rerollAll') {
        mutateLocalInitiative(function (s) {
          s = rollAllInitiative(s);
          s = sortInitiative(s);
          return Object.assign({}, s, { currentTurnIndex: 0, markedEntryId: null });
        });
      } else if (t === 'initiative:markEntry') {
        var args = cmd.args || {};
        mutateLocalInitiative(function (s) {
          return Object.assign({}, s, { markedEntryId: args.entryId || null });
        });
      } else if (t === 'initiative:setCombatTags' && cmd.args) {
        var eid = cmd.args.entryId;
        var tags = cmd.args.combatTags;
        if (eid && Array.isArray(tags)) {
          mutateLocalInitiative(function (s) {
            var e = s.entries[eid];
            if (!e) return s;
            var entries = Object.assign({}, s.entries);
            entries[eid] = Object.assign({}, e, { combatTags: tags.length ? tags : undefined });
            return Object.assign({}, s, { entries: entries });
          });
        }
      }
    }

    function getRemoteUrl() {
      if (!config) return null;
      return config.serverUrl + '/dm-remote?s=' +
        encodeURIComponent(config.sessionId) + '&t=' +
        encodeURIComponent(config.dmToken);
    }

    function renderQrCode() {
      var url = getRemoteUrl();
      if (!url || !qrContainerEl) return;
      qrContainerEl.innerHTML = '';
      try {
        var qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        var img = qr.createImgTag(4, 8);
        qrContainerEl.innerHTML = img;
        var imgEl = qrContainerEl.querySelector('img');
        if (imgEl) {
          imgEl.style.borderRadius = '8px';
          imgEl.style.maxWidth = '200px';
        }
      } catch (e) {
        qrContainerEl.textContent = 'QR failed: ' + e.message;
      }
    }

    function clearQr() {
      if (qrContainerEl) qrContainerEl.innerHTML = '';
    }

    function updateStatus(state, text) {
      if (!statusEl) return;
      var colors = {
        connected: '#22c55e', reconnecting: '#f59e0b',
        error: '#ef4444', disconnected: '#6b7280',
      };
      statusEl.textContent = text;
      statusEl.style.color = colors[state] || '#6b7280';
    }

    function isConnected() {
      return socket && socket.connected;
    }

    function setUiRefs(status, qrContainer) {
      statusEl = status;
      qrContainerEl = qrContainer;
    }

    return {
      enable: enable,
      disconnect: disconnect,
      pushState: pushState,
      loadConfig: loadConfig,
      isConnected: isConnected,
      getRemoteUrl: getRemoteUrl,
      renderQrCode: renderQrCode,
      connect: connect,
      loadSocketIoThenConnect: loadSocketIoThenConnect,
      setUiRefs: setUiRefs,
      getConfig: function () { return config; },
    };
  })();

  installNavHooksOnce();
  syncBarToRoute();
})();
