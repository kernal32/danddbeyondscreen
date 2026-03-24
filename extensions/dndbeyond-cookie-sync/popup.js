/* global chrome */

function $(id) {
  return document.getElementById(id);
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

function formatStatusBlock(status) {
  const t = status.telemetry || {};
  const lines = [
    `State: ${t.state || 'idle'}`,
    `Campaign ID: ${status.campaignId || '—'}`,
    `API key set: ${status.apiKeyConfigured ? 'yes' : 'no'}`,
    `Last success: ${formatWhen(t.lastSuccessAt)}`,
    `Last attempt: ${formatWhen(t.lastAttemptAt)}`,
    `Next poll: ${formatWhen(t.nextPollAt)}`,
    `Alarm: ${formatWhen(status.alarmScheduledFor)}`,
    `Last count: ${t.lastCharacterCount || 0}`,
  ];
  if (t.lastError) lines.push(`Last error: ${t.lastError}`);
  return lines.join('\n');
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
  $('liveStatus').textContent = formatStatusBlock(status);
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
  setStatus(status.pollingEnabled ? 'Polling enabled.' : 'Polling disabled.', 'ok');
}

async function refreshNow() {
  setStatus('Running poll now…', '');
  const result = await sendMessage('refresh-now');
  const status = await sendMessage('get-status');
  hydrateForm(status);
  const warnings = Array.isArray(result.warnings) && result.warnings.length > 0;
  setStatus(
    warnings
      ? `Upload succeeded (${result.characterCount} characters) with warnings.`
      : `Upload succeeded (${result.characterCount} characters).`,
    warnings ? 'err' : 'ok',
  );
}

document.addEventListener('DOMContentLoaded', () => {
  void refreshStatus().catch((e) => setStatus(e.message || String(e), 'err'));
  $('save').addEventListener('click', () => {
    void saveSettings().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  $('pollingEnabled').addEventListener('change', () => {
    void togglePolling().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  $('refreshNow').addEventListener('click', () => {
    void refreshNow().catch((e) => setStatus(e.message || String(e), 'err'));
  });
  $('reloadStatus').addEventListener('click', () => {
    void refreshStatus()
      .then(() => setStatus('Status refreshed.', 'ok'))
      .catch((e) => setStatus(e.message || String(e), 'err'));
  });
});
