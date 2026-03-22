/* global chrome */

function $(id) {
  return document.getElementById(id);
}

async function loadSettings() {
  const s = await chrome.storage.local.get(['backend', 'sessionId', 'dmToken']);
  $('backend').value = s.backend || 'http://127.0.0.1:3001';
  $('sessionId').value = s.sessionId || '';
  $('dmToken').value = s.dmToken || '';
}

async function saveSettings() {
  await chrome.storage.local.set({
    backend: $('backend').value.trim().replace(/\/$/, ''),
    sessionId: $('sessionId').value.trim(),
    dmToken: $('dmToken').value.trim(),
  });
  setStatus('Settings saved.', 'ok');
}

async function buildCookieHeader() {
  const url = 'https://www.dndbeyond.com/';
  const all = await chrome.cookies.getAll({ url });
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

function setStatus(msg, cls) {
  const el = $('status');
  el.textContent = msg;
  el.className = cls || '';
}

async function syncCookies() {
  const backend = $('backend').value.trim().replace(/\/$/, '');
  const sessionId = $('sessionId').value.trim();
  const dmToken = $('dmToken').value.trim();
  if (!backend.startsWith('http://127.0.0.1') && !backend.startsWith('http://localhost')) {
    setStatus('Only http://127.0.0.1 or http://localhost are allowed (safety).', 'err');
    return;
  }
  if (!sessionId || !dmToken) {
    setStatus('Session ID and DM token are required.', 'err');
    return;
  }
  setStatus('Reading cookies…', '');
  let cookie;
  try {
    cookie = await buildCookieHeader();
  } catch (e) {
    setStatus('Could not read cookies: ' + e, 'err');
    return;
  }
  if (!cookie) {
    setStatus('No cookies for dndbeyond.com. Log in on the site in this browser.', 'err');
    return;
  }
  setStatus('Sending…', '');
  try {
    const res = await fetch(`${backend}/api/sessions/${encodeURIComponent(sessionId)}/dndbeyond/cookie`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + dmToken,
      },
      body: JSON.stringify({ cookie }),
    });
    const text = await res.text();
    if (!res.ok) {
      setStatus('Failed: ' + res.status + ' ' + text, 'err');
      return;
    }
    setStatus('Success. Refresh party from the DM console.', 'ok');
  } catch (e) {
    setStatus('Network error: ' + e.message, 'err');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void loadSettings();
  $('save').addEventListener('click', () => void saveSettings());
  $('sync').addEventListener('click', () => void syncCookies());
});
