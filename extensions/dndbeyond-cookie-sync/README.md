# Chrome extension: D&D Beyond campaign poller (API key upload)

This extension polls a D&D Beyond campaign directly from Chrome background context and uploads the party snapshot to your account stash using your website-generated API key.

## What it does

- Reads your logged-in D&D Beyond cookies from Chrome.
- Resolves character IDs from the configured campaign.
- Fetches each character JSON payload.
- Uploads to your backend via `POST /api/ingest/party` with:
  - `Authorization: Bearer dnd_...`
  - body `{ format: "ddb_characters", replaceParty: true, characters: [...] }`

This runs without keeping a DDB tab open.

## Install (developer / unpacked)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. Click **Load unpacked** and select `extensions/dndbeyond-cookie-sync`.
3. Pin the extension.

## Setup

1. Start backend (default `http://127.0.0.1:3001`).
2. In your app account page, generate an API key (`dnd_...`).
3. Sign in to [dndbeyond.com](https://www.dndbeyond.com) in the same Chrome profile.
4. Open extension popup and fill:
   - Backend is fixed to `https://dnd.saltbushlabs.com`
   - Campaign ID or campaign URL
   - API key
   - Poll interval (ms)
5. Enable polling and click **Save settings**.
6. Optional: click **Refresh now** to force an immediate cycle.

## DM session usage

Uploads go to your account stash, not directly into a live table.  
In DM console, use your existing **Load upload** / auto-load upload workflow to bring the latest stash into the active table.

## Test checklist

1. Save settings with valid API key and campaign URL.
2. Click **Refresh now** and verify success status.
3. Confirm backend receives `/api/ingest/party` with `format: ddb_characters`.
4. Turn polling on, close popup, wait one interval, confirm another upload occurs.
5. Disable polling and verify uploads stop.
6. Use an invalid API key and verify 401 appears in popup status.
7. Log out from DDB and verify error reports missing/invalid auth cookies.

## Security notes

- Backend is fixed to `https://dnd.saltbushlabs.com`.
- API key is stored in `chrome.storage.local` on your machine.
- DDB cookies are read at poll time and are not persisted in extension storage.
- Treat API keys and cookies as secrets.

## Chrome Web Store

For a complete submission checklist and required policy/listing artifacts, see `CHROME_WEB_STORE_SUBMISSION.md` in this folder.
