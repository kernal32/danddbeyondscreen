# D&D Beyond DM Screen (greenfield)

Self-hosted **table display** and **initiative tracker** inspired by [swichers/dndbeyond-screen](https://github.com/swichers/dndbeyond-screen). This version uses **Node.js / TypeScript**, **Fastify**, **Socket.IO**, and **React + Tailwind**.

> **Warning:** D&D Beyond does not publish a stable public API. This tool uses the same unofficial `character/{id}/json` pattern as the reference PHP project. Respect rate limits; see [docs/analysis.md](./docs/analysis.md).

### Why “character not found” (404) even with a valid sheet URL?

Your browser uses URLs like `https://www.dndbeyond.com/characters/89992293`. This app requests **`https://www.dndbeyond.com/character/89992293/json`** (singular `character`), which is what [dndbeyond-screen](https://github.com/swichers/dndbeyond-screen) used.

D&D Beyond often responds **`404 Resource Not Found`** on that legacy JSON URL for real characters today. When you provide a session cookie (`.env` `DDB_COOKIE` or **Settings → Save cookie to session**), the backend tries **`character-service.dndbeyond.com`** as a fallback with the same cookies.

**Still 404 after saving a cookie?** The pasted line is often copied from the wrong Network row—e.g. **`accounts.google.com`** or other Google requests (cookies with `HSID`, `SAPISID`, etc.). You need the **`cookie` header from the request whose URL is** `https://www.dndbeyond.com/character/YOUR_ID/json`, or use the [Chrome extension](./extensions/dndbeyond-cookie-sync) while logged in on D&D Beyond.

**What still works without DDB sync:** initiative, manual HP/conditions, themes, display link, NPC templates, dice log, timed effects.

**Other workarounds:** characters that still return JSON on the legacy URL (rare); future paste-JSON export (mind ToS and security).

### Optional: reuse your browser session (`DDB_COOKIE`)

There is no official “Sign in with D&D Beyond” for third-party tools. If **`/character/{id}/json` works in your browser only while logged in**, you can let the **backend** send the same session cookies:

1. Log in at [dndbeyond.com](https://www.dndbeyond.com).
2. Open DevTools → **Network**, load  
   `https://www.dndbeyond.com/character/YOUR_ID/json`  
   (same numeric ID as the sheet).
3. Select that request → **Headers** → copy the full **`Cookie`** request header value.
4. At the **repo root**, create `.env` from [`.env.example`](./.env.example) and set:
   ```env
   DDB_COOKIE=paste_the_entire_cookie_header_here
   ```
5. **Restart the backend** so it picks up the variable. The server loads `../../../.env` relative to `apps/backend/src` (dev) or `dist` (production start).

**Behaviour:** the backend attaches that `Cookie` on every D&D Beyond fetch (a static copy of your session). It is **not** an interactive login screen and it does **not** auto-refresh when DDB rotates cookies—you paste again when requests start failing.

**Security (important):**

- That string is **as powerful as your D&D Beyond login** for many actions. Do **not** commit it, paste it in chat, or run it on a shared server without isolation.
- Prefer **localhost** or a **private** VPS; combine with HTTPS and firewall.
- Review [D&D Beyond Terms of Service](https://www.dndbeyond.com/terms-of-service); automated use may be restricted.

**Not implemented (possible later):** a small **browser extension** that POSTs JSON to `localhost` (no cookie on disk), or **OAuth** if Wizards ever ships a public API.

### Making it easier for end users

| Option | Status | UX |
|--------|--------|-----|
| **Cookie in .env** | Implemented | Technical; “paste once per session,” expires. |
| **Paste JSON** | Not yet | User copies character JSON from DevTools (or future DDB export) and pastes into the app; no credential on server. Good next step. |
| **Browser extension** | Deprecated | Prefer Tampermonkey + account API key below. |
| **Party ingest (userscript)** | [userscripts/](./userscripts/) | **Account → API key** (starts with `dnd_`). Tampermonkey on `dndbeyond.com` uses `GM_xmlhttpRequest` to `POST /api/ingest/party` with `Authorization: Bearer <key>`; data is stored per **account**. **DM console → Load upload into this table** pulls it into a live session. Rate-limited; **revoke** keys when idle. |
| **Sign in (this app)** | Required for API keys — set `AUTH_SECRET` (32+ chars) | SQLite + JWT; **Account** page for keys; save seed / table layout; new sessions preload layout/seed when the browser is signed in. |
| **Official API** | Up to Wizards | Would allow proper “Connect D&D Beyond” if/when they offer it. |

For **self-hosters**, server **`DDB_COOKIE`** still supports **Refresh party** from D&D Beyond when that flow works. For **players / DDB pages**, Tampermonkey + **account API key** is the supported path to push party JSON without per-session ingest tokens.

## Monorepo layout

| Path | Description |
|------|-------------|
| `apps/backend` | Fastify API, Socket.IO, DDB fetch + calculator, initiative engine |
| `apps/frontend` | React (Vite) DM console + TV/table display |
| `packages/shared-types` | Shared TypeScript types |
| `extensions/dndbeyond-cookie-sync` | Deprecated Chrome extension (cookie sync) |
| `userscripts/` | Tampermonkey template + docs for party JSON ingest |
| `docs/` | Canon + architecture, security, runbook, roadmap ([PROJECT_CANON.md](./docs/PROJECT_CANON.md)) |

## Prerequisites

- **Node.js 20+**
- npm (workspaces)

## Local development

Terminal 1 — backend (port **3001**):

```bash
npm install
npm run build --workspace=@ddb/shared-types
npm run dev --workspace=@ddb/backend
```

Terminal 2 — frontend (port **5173**, proxies API + WebSocket to 3001):

```bash
npm run dev --workspace=@ddb/frontend
```

Open `http://127.0.0.1:5173`, create a session, open **Settings** (`/dm`, then **Settings**) for the **display link**, **D&D Beyond seed**, **Refresh party**, and **session cookie** / extension session ID. Use the **DM console** for combat, party HP, and initiative.

**Table (TV) layout:** Each session has a **`tableLayout`** (12-column grid widgets: party, initiative, effects, etc.) in `PublicSessionState`. The display uses it automatically. DM can **Reset TV layout** in the console, or `PATCH /api/sessions/:id` with `{ "tableLayout": { ... } }` / Socket **`session:setTableLayout`** (validated server-side).

**Sessions are in-memory:** restarting the backend clears every game session. The browser may still show Socket.IO **Connected**, but REST calls (save cookie, etc.) return **`401 Unauthorized`** until you go home and **start a new session**.

### User accounts (optional)

Set **`AUTH_SECRET`** in `.env` to a **string at least 32 characters** (e.g. `openssl rand -hex 32`). Optional **`DATABASE_PATH`** defaults to `data/ddb-screen.db` (created automatically; folder is gitignored).

- UI: **`/register`**, **`/login`**, and **Settings → Your account** (save/load seed, D&D Beyond cookie, table layout).
- Stored DDB cookies are **encrypted at rest** (AES-256-GCM); the same secret signs **user JWTs** (30-day expiry, held in `localStorage`).
- **New session** on the home page sends the user JWT when present so the new **game** session copies your saved preferences (seed, session cookie override, layout). Per-table **DM** and **display** tokens are unchanged.

If `AUTH_SECRET` is missing or too short, account APIs stay off and the app behaves as before.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all workspaces that define `build` |
| `npm run dev:backend` | Backend with hot reload (`tsx watch`) |
| `npm run dev:frontend` | Vite dev server |
| `npm run test` | Backend Vitest suite |

> **Windows + folder names containing `&`:** workspace scripts call `node ../../node_modules/...` so `.cmd` shims are not required.

## Docker

See [docs/DEPLOY.md](./docs/DEPLOY.md) and root `docker-compose.yml`.

## Documentation

- [docs/PROJECT_CANON.md](./docs/PROJECT_CANON.md) — source of truth: layers, auth, deployment
- [docs/RUNBOOK.md](./docs/RUNBOOK.md) — Docker, SQLite persistence, edge/TLS pointers
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — components, schema, data flows
- [docs/SECURITY.md](./docs/SECURITY.md) — threat model, API keys, rate limits
- [docs/IMPLEMENTATION_TODO.md](./docs/IMPLEMENTATION_TODO.md) — phased roadmap
- [docs/PROJECT_PROGRESS.md](./docs/PROJECT_PROGRESS.md) — chronological log
- [docs/analysis.md](./docs/analysis.md) — how the reference PHP project works
- [docs/ARCHITECTURE_SUMMARY.md](./docs/ARCHITECTURE_SUMMARY.md) — short summary (see also ARCHITECTURE.md)
- [docs/DEPLOY.md](./docs/DEPLOY.md) — production / proxy / TLS snippets

## License

Implementation in this repo: choose a license for your own use. The cloned reference project `dndbeyond-screen/` remains **LGPL-3.0** (upstream).
