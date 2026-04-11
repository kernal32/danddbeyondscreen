/* global chrome */
/**
 * Scrapes active condition names from an open D&D Beyond character sheet (including open shadow roots
 * and late-mounted SPA content). Reports to the service worker for merge before upload.
 */
(function ddbDomConditionsScrape() {
  const DEBOUNCE_MS = 550;
  /** Late SPA paint — extra snapshots (ms). */
  const RETRY_DELAYS_MS = [400, 1500, 4000, 10000, 20000];

  /** Same set as backend `DDB_SHEET_NAV_LABELS` — sidebar tabs must never be scraped as conditions. */
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

  const PHB_CONDITIONS_LOWERCASE = new Set([
    'blinded',
    'charmed',
    'deafened',
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
    'exhaustion',
  ]);

  function pathnameSkipsScrape() {
    const p = window.location.pathname || '';
    if (p.endsWith('/json') || p.includes('/json/')) return true;
    return false;
  }

  function parseCharacterIdFromPath() {
    const m = (window.location.pathname || '').match(/\/(?:characters|character)\/(\d+)/i);
    return m ? m[1] : null;
  }

  function normLabel(t) {
    return String(t || '')
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function spellTablePlaceholderSegment(raw) {
    const t = String(raw || '').trim();
    if (t === '' || t === '…' || t === '...') return true;
    const low = t.toLowerCase();
    if (low === '--' || low === '—' || low === '–') return true;
    if (/^[\u002d\u2010\u2011\u2012\u2013\u2014\u2015\u2212]{1,6}$/.test(t)) return true;
    return false;
  }

  /** Spell row UI — align with backend `isDdbSpellDamageTableRowNoise`. */
  function looksLikeSpellDamageTableRow(raw) {
    const s = normLabel(raw);
    if (!s.includes(',')) return false;
    const parts = s.split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 0);
    if (parts.length < 3) return false;
    if (!parts.some((p) => p.toLowerCase() === 'damage')) return false;
    const last = parts[parts.length - 1];
    if (spellTablePlaceholderSegment(last)) return true;
    if (/^\d+$/.test(last)) return true;
    if (/^\d+d\d+$/i.test(last)) return true;
    return false;
  }

  function classHints(el) {
    if (!el || !el.className) return '';
    const c = el.className;
    return (typeof c === 'string' ? c : String(c.baseVal || '')).toLowerCase();
  }

  function addLabel(out, seen, raw) {
    const s = normLabel(raw);
    if (s.length < 2 || s.length > 72) return;
    const low = s.toLowerCase();
    if (seen.has(low)) return;
    if (/^conditions$/i.test(s)) return;
    if (/^conditions\s*\(/i.test(s)) return;
    if (/condition immunities/i.test(low)) return;
    if (/saving throws/i.test(low)) return;
    if (/^manage$/i.test(s)) return;
    if (/^remove$/i.test(s)) return;
    if (/add active conditions/i.test(s)) return;
    if (low === 'manage conditions' || low === 'no active conditions' || low === 'no conditions') return;
    if (/^add\s+/.test(low) && low.includes('condition')) return;
    if (DDB_SHEET_NAV_LABELS.has(low)) return;
    if (looksLikeSpellDamageTableRow(s)) return;
    seen.add(low);
    out.push(s);
  }

  /** Walk light DOM + open shadow roots. */
  function walkElements(node, visitor) {
    if (!node) return;
    if (node.nodeType === 1) {
      visitor(node);
      const ch = node.children;
      for (let i = 0; i < ch.length; i++) walkElements(ch[i], visitor);
      if (node.shadowRoot) walkElements(node.shadowRoot, visitor);
    }
  }

  function queryAllButtonsDeep(node, acc) {
    walkElements(node, (el) => {
      if (el.nodeType !== 1) return;
      const tag = el.tagName;
      const role = el.getAttribute && el.getAttribute('role');
      if (tag === 'BUTTON' || tag === 'A' || role === 'button' || role === 'listitem') acc.push(el);
    });
  }

  function isConditionsHeading(el) {
    const t = normLabel(el.textContent);
    if (!t || t.length > 36) return false;
    if (/condition immunities/i.test(t)) return false;
    return /^conditions\b(\s*\(\d*\))?$/i.test(t);
  }

  function scrapeFromConditionsHeadings() {
    const headingEls = [];
    walkElements(document.body, (el) => {
      if (el.nodeType === 1 && isConditionsHeading(el)) headingEls.push(el);
    });
    for (const h of headingEls) {
      let cur = h.parentElement;
      for (let i = 0; i < 20 && cur; i++) {
        const known = labelsFromKnownConditions(cur);
        if (known.length) return { labels: known, strategy: 'heading+phb' };
        const acc = [];
        queryAllButtonsDeep(cur, acc);
        const out = [];
        const seen = new Set();
        for (const el of acc) {
          const t = normLabel(el.textContent);
          if (t.length >= 2 && t.length <= 48) addLabel(out, seen, t);
        }
        if (out.length) return { labels: out, strategy: 'heading+buttons-climb' };
        cur = cur.parentElement;
      }
    }
    return null;
  }

  function labelsFromKnownConditions(sectionRoot) {
    const out = [];
    const seen = new Set();
    const tryText = (t) => {
      if (t.length < 2 || t.length > 48) return;
      const low = t.toLowerCase();
      if (PHB_CONDITIONS_LOWERCASE.has(low)) {
        addLabel(out, seen, t);
        return;
      }
      if (/^exhaustion\s+\d+$/i.test(t)) {
        addLabel(out, seen, t);
        return;
      }
      const first = low.split(/\s+/)[0];
      if (PHB_CONDITIONS_LOWERCASE.has(first) && low.length <= 24) addLabel(out, seen, t);
    };

    const acc = [];
    queryAllButtonsDeep(sectionRoot, acc);
    for (const el of acc) tryText(normLabel(el.textContent));

    if (out.length) return out;

    walkElements(sectionRoot, (el) => {
      if (el.nodeType !== 1 || el.children.length > 0) return;
      tryText(normLabel(el.textContent));
    });
    return out;
  }

  function labelsFromClassHints() {
    const out = [];
    const seen = new Set();
    const roots = new Set();
    walkElements(document.body, (el) => {
      const c = classHints(el);
      const tid = ((el.getAttribute && el.getAttribute('data-testid')) || '').toLowerCase();
      if (
        c.includes('ct-conditions') ||
        c.includes('conditionsummary') ||
        c.includes('conditions-summary') ||
        c.includes('activecondition') ||
        c.includes('active-condition') ||
        c.includes('condition-tag') ||
        c.includes('conditiontag') ||
        (c.includes('condition') && (c.includes('list') || c.includes('chip') || c.includes('pill'))) ||
        tid.includes('condition')
      ) {
        roots.add(el);
      }
    });
    for (const root of roots) {
      const chips = root.querySelectorAll(
        'button, a, [role="button"], [role="listitem"], li, span[class*="Chip"], span[class*="chip"], span[class*="Tag"], div[class*="chip"]',
      );
      if (chips.length) {
        chips.forEach((el) => addLabel(out, seen, el.textContent));
      } else {
        const acc = [];
        queryAllButtonsDeep(root, acc);
        acc.forEach((el) => addLabel(out, seen, el.textContent));
        if (acc.length === 0) {
          const block = normLabel(root.textContent);
          if (block.length > 1 && block.length <= 72) addLabel(out, seen, block);
        }
      }
    }
    return out;
  }

  /**
   * @returns {{ labels: string[], strategy: string }}
   */
  function scrapeConditions() {
    const fromClass = labelsFromClassHints();
    if (fromClass.length) return { labels: fromClass, strategy: 'class-deep' };

    const fromHead = scrapeFromConditionsHeadings();
    if (fromHead) return fromHead;

    const headings = document.querySelectorAll('h2, h3, h4, h5, [role="heading"]');
    for (const h of headings) {
      const ht = normLabel(h.textContent);
      if (!ht || !/^conditions\b/i.test(ht)) continue;
      let n = h.nextElementSibling;
      let guard = 0;
      const out = [];
      const seen = new Set();
      while (n && guard++ < 40) {
        const tag = n.tagName && n.tagName.toLowerCase();
        if (tag && /^h[1-6]$/.test(tag) && n !== h) break;
        const chips = n.querySelectorAll(
          'button, a[href], [role="button"], [role="listitem"], li, [class*="Chip"], [class*="chip"], [class*="Tag"], [class*="tag"]',
        );
        if (chips.length) chips.forEach((el) => addLabel(out, seen, el.textContent));
        n = n.nextElementSibling;
      }
      if (out.length) return { labels: out, strategy: 'heading-sibling' };
    }

    return { labels: [], strategy: 'none' };
  }

  let debounceTimer = null;
  let lastSentKey = '';

  function sendSnapshot(reason) {
    if (pathnameSkipsScrape()) return;
    const characterId = parseCharacterIdFromPath();
    if (!characterId) return;

    const { labels, strategy } = scrapeConditions();
    const key = `${characterId}|${labels.join('\u0001')}|${strategy}`;
    if (key === lastSentKey && reason !== 'force') return;
    lastSentKey = key;

    try {
      chrome.runtime.sendMessage({
        type: 'ddb-dom-conditions',
        payload: {
          characterId,
          labels,
          strategy,
          url: window.location.href,
          reason,
          at: Date.now(),
        },
      });
    } catch {
      /* extension context invalidated */
    }
  }

  function schedule(reason) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      sendSnapshot(reason);
    }, DEBOUNCE_MS);
  }

  if (!parseCharacterIdFromPath() || pathnameSkipsScrape()) return;

  sendSnapshot('load');

  RETRY_DELAYS_MS.forEach((ms, i) => {
    setTimeout(() => sendSnapshot(`retry-${i}`), ms);
  });

  const obs = new MutationObserver(() => schedule('mutation'));
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('pageshow', () => {
    lastSentKey = '';
    sendSnapshot('pageshow');
  });
  window.addEventListener('hashchange', () => {
    lastSentKey = '';
    schedule('hashchange');
  });
})();
