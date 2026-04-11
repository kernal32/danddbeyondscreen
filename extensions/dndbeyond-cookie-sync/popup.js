/* global chrome */

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function setStatus(message, kind) {
  const el = $('status');
  el.textContent = message;
  el.className = kind || '';
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '—';
  return d.toLocaleString();
}

function stateBadgeHtml(state) {
  const s = (state || 'idle').toLowerCase();
  let cls = 'badge-idle';
  if (s === 'polling') cls = 'badge-polling';
  if (s === 'error') cls = 'badge-error';
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

function formatDebugActivityLines(feed) {
  if (!Array.isArray(feed) || feed.length < 1) {
    return '(No activity yet — run Sync now with debug enabled.)';
  }
  return feed
    .map((e) => {
      if (!e || typeof e !== 'object') return String(e);
      const ts = e.at || '';
      if (e.kind === 'http') {
        const st = e.status != null ? String(e.status) : '?';
        const ok = e.ok ? 'ok' : 'fail';
        const extra = [e.note, e.phase].filter(Boolean).join(' ');
        return `${ts}  HTTP ${st} ${ok}  ${e.url || ''}${extra ? '  ' + extra : ''}`;
      }
      if (e.kind === 'domScrapeReport') {
        const prev = (e.labelsPreview || []).join(', ');
        return `${ts}  DOM scrape (tab)  id=${e.characterId}  ${e.labelsCount} label(s)  [${prev}]  ${e.strategy || ''}  ${e.reason || ''}`;
      }
      if (e.kind === 'domScrapeMerge') {
        const prev = (e.labelsPreview || []).join(', ');
        return `${ts}  DOM→upload  id=${e.characterId}  merged ${e.labelsCount} condition(s)  [${prev}]  wasJson=${e.replacedJsonConditionsCount}  ${e.strategy || ''}`;
      }
      if (e.kind === 'domScrapeHint') {
        return `${ts}  DOM hint  ${e.message || ''}  cachedIds=${(e.cachedCharacterIds || []).join(',')}`;
      }
      if (e.kind === 'characterMerge') {
        const nm = e.name != null ? String(e.name) : '';
        const slots = e.spellSlotsUsedSum != null ? ` slotsUsedΣ=${e.spellSlotsUsedSum}` : '';
        const lu = e.limitedUseCount != null ? ` limitedUse=${e.limitedUseCount}` : '';
        return `${ts}  merge  ${e.mergeKind || ''}  id=${e.characterId}  ${nm}  cond=${e.conditionsCount}  tmpHP=${e.tempHp ?? '—'}${slots}${lu}`;
      }
      let tail = '';
      if (e.detail !== undefined) {
        try {
          tail = ' ' + JSON.stringify(e.detail);
        } catch {
          tail = ' ' + String(e.detail);
        }
      }
      return `${ts}  ${e.message || 'log'}${tail}`;
    })
    .join('\n');
}

function renderStatus(status) {
  const grid = $('statusGrid');
  const t = status.telemetry || {};
  const rows = [
    ['State', stateBadgeHtml(t.state)],
    ['Campaign', esc(status.campaignId || '—')],
    ['API key', status.apiKeyConfigured ? 'Saved' : 'Not set'],
    ['Sheet CONDITIONS scrape', status.sheetScrapeConditions !== false ? 'On' : 'Off'],
    ['Debug', status.debugLogging ? 'On' : 'Off'],
    ['Last success', esc(formatWhen(t.lastSuccessAt))],
    ['Last attempt', esc(formatWhen(t.lastAttemptAt))],
    ['Next run', esc(formatWhen(t.nextPollAt))],
    ['Chrome alarm', esc(formatWhen(status.alarmScheduledFor))],
    ['Characters', esc(String(t.lastCharacterCount ?? 0))],
  ];
  if (t.lastError) {
    rows.push(['Note', esc(t.lastError)]);
  }
  grid.innerHTML = rows
    .map(
      ([k, v]) =>
        `<dt>${esc(k)}</dt><dd>${v}</dd>`,
    )
    .join('');

  const scrapeCb = $('sheetScrapeConditions');
  if (scrapeCb) scrapeCb.checked = status.sheetScrapeConditions !== false;
  const dbgCb = $('debugLogging');
  if (dbgCb) dbgCb.checked = status.debugLogging === true;

  const traceSection = $('debugTraceSection');
  const tracePre = $('debugTracePre');
  const activityPre = $('debugActivityPre');
  if (traceSection && tracePre) {
    const show = status.debugLogging === true;
    traceSection.hidden = !show;
    if (show) {
      if (activityPre) {
        activityPre.textContent = formatDebugActivityLines(t.lastDebugFeed);
      }
      const trace = t.lastEndpointTrace || t.endpointTrace;
      tracePre.textContent =
        trace && Array.isArray(trace) && trace.length > 0
          ? JSON.stringify(trace, null, 2)
          : '(No HTTP trace rows yet — run Sync now.)';
    }
  }
}

async function sendMessage(type, payload) {
  const res = await chrome.runtime.sendMessage({ type, payload });
  if (!res || !res.ok) throw new Error((res && res.error) || 'Operation failed');
  return res.result;
}

function hydrateForm(status) {
  $('backendValue').textContent = status.backend || 'https://dnd.saltbushlabs.com';
  $('campaignInput').value = status.campaignInput || '';
  if (!status.apiKeyConfigured) $('apiKey').value = '';
  $('pollIntervalMs').value = String(status.pollIntervalMs || 180000);
  $('pollingEnabled').checked = status.pollingEnabled === true;
  renderStatus(status);
}

async function refreshStatus() {
  const status = await sendMessage('get-status');
  hydrateForm(status);
  return status;
}

async function saveSettings() {
  const apiKeyInput = $('apiKey').value.trim();
  const payload = {
    campaignInput: $('campaignInput').value.trim(),
    apiKey: apiKeyInput,
    pollIntervalMs: Number($('pollIntervalMs').value),
    pollingEnabled: $('pollingEnabled').checked,
    sheetScrapeConditions: $('sheetScrapeConditions') ? $('sheetScrapeConditions').checked : true,
  };
  const status = await sendMessage('save-settings', payload);
  hydrateForm(status);
  if (apiKeyInput) $('apiKey').value = '';
  setStatus('Settings saved.', 'ok');
}

async function togglePolling() {
  const status = await sendMessage('set-polling-enabled', {
    enabled: $('pollingEnabled').checked,
  });
  hydrateForm(status);
  setStatus(status.pollingEnabled ? 'Automatic polling on.' : 'Automatic polling off.', 'ok');
}

async function refreshNow() {
  setStatus('Syncing…', '');
  const result = await sendMessage('refresh-now');
  const status = await sendMessage('get-status');
  hydrateForm(status);
  const warnings = Array.isArray(result.warnings) && result.warnings.length > 0;
  setStatus(
    warnings
      ? `Uploaded ${result.characterCount} character(s) with warnings.`
      : `Uploaded ${result.characterCount} character(s).`,
    warnings ? 'err' : 'ok',
  );
}

async function toggleDebugLogging() {
  const status = await sendMessage('set-debug-logging', {
    enabled: $('debugLogging').checked,
  });
  hydrateForm(status);
  setStatus(
    $('debugLogging').checked
      ? 'Debug on — open ⚙ Settings to see the activity log after Sync.'
      : 'Debug logging off.',
    'ok',
  );
}

async function toggleSheetScrape() {
  const el = $('sheetScrapeConditions');
  const status = await sendMessage('set-sheet-scrape', {
    enabled: el ? el.checked : true,
  });
  hydrateForm(status);
  setStatus(
    el && el.checked
      ? 'Sheet CONDITIONS scrape on — keep character tabs open while syncing.'
      : 'Sheet CONDITIONS scrape off — uploads use JSON only.',
    'ok',
  );
}

function toggleSettingsPanel() {
  const panel = $('settingsPanel');
  const btn = $('settingsToggle');
  if (!panel || !btn) return;
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

async function copyDebugSnapshot() {
  const status = await sendMessage('get-status');
  const t = status.telemetry || {};
  const snap = {
    at: new Date().toISOString(),
    debugLogging: status.debugLogging,
    sheetScrapeConditions: status.sheetScrapeConditions !== false,
    state: t.state,
    lastError: t.lastError,
    lastSuccessAt: t.lastSuccessAt,
    lastAttemptAt: t.lastAttemptAt,
    characterCount: t.lastCharacterCount,
    campaignId: status.campaignId,
    activityLog: t.lastDebugFeed || [],
    endpointTrace: t.lastEndpointTrace || t.endpointTrace || [],
  };
  const text = JSON.stringify(snap, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Full debug JSON copied (activity + HTTP trace).', 'ok');
  } catch {
    setStatus('Could not copy (clipboard permission).', 'err');
  }
}


async function copyActivityLog() {
  const status = await sendMessage('get-status');
  const t = status.telemetry || {};
  const text = formatDebugActivityLines(t.lastDebugFeed);
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Activity log copied.', 'ok');
  } catch {
    setStatus('Could not copy (clipboard permission).', 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void refreshStatus().catch((e) => setStatus(e.message || String(e), 'err'));
  $('save').addEventListener('click', () => {
    void saveSettings().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  $('pollingEnabled').addEventListener('change', () => {
    void togglePolling().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  const scrape = $('sheetScrapeConditions');
  if (scrape) {
    scrape.addEventListener('change', () => {
      void toggleSheetScrape().catch((e) => setStatus(e.message || String(e), 'err'));
    });
  }
  const dbg = $('debugLogging');
  if (dbg) {
    dbg.addEventListener('change', () => {
      void toggleDebugLogging().catch((e) => setStatus(e.message || String(e), 'err'));
    });
  }
  const st = $('settingsToggle');
  if (st) st.addEventListener('click', () => toggleSettingsPanel());
  const cp = $('copyDebugSnapshot');
  if (cp) cp.addEventListener('click', () => void copyDebugSnapshot().catch((e) => setStatus(e.message || String(e), 'err')));
  const cpAct = $('copyActivityLog');
  if (cpAct) cpAct.addEventListener('click', () => void copyActivityLog().catch((e) => setStatus(e.message || String(e), 'err')));
  $('refreshNow').addEventListener('click', () => {
    void refreshNow().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  $('reloadStatus').addEventListener('click', () => {
    void refreshStatus()
      .then(() => setStatus('Status updated.', 'ok'))
      .catch((e) => setStatus(e.message || String(e), 'err'));
  });
});
