# Chrome Web Store Submission Checklist

This document records everything needed to submit `extensions/dndbeyond-cookie-sync` to the Chrome Web Store.

## 1) Final extension package requirements

- `manifest.json` uses MV3 and includes:
  - `name`, `version`, `description`
  - `permissions`: `cookies`, `storage`, `alarms`
  - `host_permissions`:
    - `https://www.dndbeyond.com/*`
    - `https://dndbeyond.com/*`
    - `https://character-service.dndbeyond.com/*`
    - `https://dnd.saltbushlabs.com/*`
  - `background.service_worker`
  - `action.default_popup`
  - `icons` (`16`, `32`, `48`, `128`)
- Code is local (no remote hosted JavaScript loaded by extension pages/workers).
- No test/debug secrets in source.

## 2) Assets required by Chrome Web Store

Prepare these before submission:

- Extension icon in package: `128x128` (already present in `icons/`).
- Store icon: `128x128` PNG.
- At least one screenshot (recommended: 1280x800 or 640x400).
- Optional promo images:
  - Small promo tile: `440x280`
  - Large promo tile: `920x680`
  - Marquee promo tile: `1400x560`

## 3) Listing copy (draft)

Use this as a starting point in the CWS dashboard.

- **Name**: DDB DM Screen Campaign Poller
- **Short description**:
  - Poll D&D Beyond campaigns in the background and upload party data with your DM Screen API key.
- **Detailed description**:
  - This extension connects your D&D Beyond login session to DM Screen account uploads.
  - Enter a campaign link/ID and your DM Screen API key.
  - The extension polls campaign characters on a schedule and uploads snapshots to your account stash.
  - Use DM Screen's existing table import/autoload flow to apply uploads to live sessions.
  - No password entry in extension UI.

## 4) Privacy policy + disclosures

You must host a public privacy policy URL and link it in the CWS listing.

Policy/disclosure content should explicitly state:

- What data is used:
  - D&D Beyond session cookies (read locally in browser to authenticate DDB requests)
  - campaign identifier (ID/link)
  - DM Screen API key
  - fetched character JSON payloads
- Why data is used:
  - to poll campaign character data and upload to the user's DM Screen account stash
- Where data goes:
  - requests to D&D Beyond endpoints
  - uploads to `https://dnd.saltbushlabs.com/api/ingest/party`
- Storage:
  - API key and extension settings in `chrome.storage.local`
  - cookies are not persisted by extension storage
- Data sharing/retention statement:
  - define backend retention and user deletion/revocation path

## 5) CWS permissions justification text (ready-to-paste)

- `cookies`:
  - Needed to read the signed-in D&D Beyond cookie jar so background polling can authenticate without requiring an open DDB tab.
- `storage`:
  - Needed to save user settings (campaign ID/link, poll interval, enabled state, API key presence).
- `alarms`:
  - Needed to schedule background polling intervals.
- Host permissions:
  - `dndbeyond.com` + `www.dndbeyond.com` + `character-service.dndbeyond.com`: fetch campaign and character data.
  - `dnd.saltbushlabs.com`: upload snapshots to account ingest API.

## 6) QA test evidence to keep before submitting

Capture and keep internal notes/screenshots for:

- Successful save + refresh-now upload.
- Polling continues when popup is closed.
- Invalid API key -> clear 401 error shown.
- Signed-out DDB -> clear auth/cookie error shown.
- Polling disable stops scheduled uploads.

This helps respond quickly if CWS review requests clarification.

## 7) Packaging and submission steps

1. Increment `manifest.json` version for each upload.
2. Zip extension contents (not parent folder):
   - `manifest.json`
   - `background.js`
   - `popup.html`
   - `popup.js`
   - `icons/*`
   - docs/readme files as desired
3. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
4. Create new item, upload ZIP.
5. Complete listing copy, screenshots, category, and privacy policy URL.
6. Complete privacy/data usage questionnaire to match actual behavior.
7. Submit for review.

## 8) Post-release operations

- Monitor extension errors and backend ingest logs.
- If D&D Beyond endpoint shape changes, patch parser/fallback logic and submit update.
- Revoke compromised API keys via account UI.
