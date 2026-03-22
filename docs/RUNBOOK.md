# Runbook — D&D Beyond DM Screen

Operational procedures for running the DnD stack locally, in Docker, and behind the **CrimsonAuth** edge proxy. TLS issuance and VPS-wide Nginx are documented primarily in the CrimsonAuth repo; this runbook focuses on **this** application and how it attaches to the edge.

## Local development

From the DnD repository root:

```bash
npm install
npm run build --workspace=@ddb/shared-types
npm run dev --workspace=@ddb/backend
```

Second terminal:

```bash
npm run dev --workspace=@ddb/frontend
```

- Backend: `http://127.0.0.1:3001`
- Frontend (Vite): `http://127.0.0.1:5173` (proxies `/api` and `/socket.io` to 3001)

Environment: copy [`.env.example`](../.env.example) to `.env`. For accounts and Tampermonkey ingest, set `AUTH_SECRET` (32+ characters).

## Docker Compose (this repo)

```bash
docker compose up --build -d
```

- **Backend:** listens on container port `3001`. Compose publishes **`127.0.0.1:3001:3001`** — only the host loopback, not the public internet.
- **Frontend:** **`8080:80`** — inner nginx serves the SPA and reverse-proxies `/api` and `/socket.io` to the `backend` service.

Leave `VITE_API_BASE` and `VITE_SOCKET_URL` unset at build time for production so the browser uses **same-origin** `/api` and Socket.IO.

### SQLite persistence (Docker)

Root **`docker-compose.yml`** bind-mounts **`./data` on the host** → **`/app/data`** in the backend container and sets **`DATABASE_PATH=/app/data/ddb-screen.db`**. The `data/` directory is gitignored; create it implicitly on first start or run `mkdir -p data`.

**Optional:** For a fixed path outside the repo (e.g. `/opt/dnd/sqlite`), change the volume line to that host path and keep `DATABASE_PATH: /app/data/ddb-screen.db`.

**Backup:** copy the SQLite file while the backend is stopped or use SQLite backup tooling; test restore on a staging host.

### Environment variables

See [`.env.example`](../.env.example). Sensitive values (`AUTH_SECRET`, `DDB_COOKIE`) should come from `env_file` or secrets, never from git.

## Same VPS as CrimsonAuth edge

Typical layout:

1. DnD **frontend** exposes host port **8080** (Compose default).
2. DnD **backend** stays on **127.0.0.1:3001** only.
3. CrimsonAuth **nginx** proxies `dnd.saltbushlabs.com` to **`host.docker.internal:8080`**, with WebSocket upgrade headers and long read timeouts. Add **`client_max_body_size 32m;`** on that **server** (or `location`) — otherwise **`POST /api/ingest/party`** returns **413** for large Tampermonkey payloads before traffic reaches the DnD container.
4. CrimsonAuth `docker-compose` should include **`extra_hosts: host.docker.internal:host-gateway`** for the nginx service.

After starting or updating DnD, reload edge nginx if needed:

```bash
cd /path/to/CrimsonAuth
docker compose restart nginx
```

**Authoritative steps** (prerequisites, health checks, hostname curls): **CrimsonAuth** `docs/deployment-runbook.md` — section *DnD on the same VPS*.

## TLS / Let’s Encrypt

Do **not** duplicate Certbot procedures here. Use CrimsonAuth:

- **HTTP-01:** `scripts/letsencrypt-issue.sh`, `scripts/letsencrypt-renew.sh`
- **DNS-01 (Cloudflare):** `certbot/cloudflare.ini`, `scripts/letsencrypt-issue-dns-cloudflare.sh`, `scripts/letsencrypt-renew-dns-cloudflare.sh`

Cron and certificate volumes are described in the same deployment runbook.

## Updates

```bash
cd /path/to/DnD
git pull
docker compose up --build -d
```

Expect **all in-memory game sessions** to reset if the backend container restarts. SQLite-backed account data persists if the database file is on a mounted volume.

## Recovery

| Failure | Action |
|---------|--------|
| Lost SQLite file | Restore from backup; users re-register if no backup |
| Backend crash | `docker compose restart backend`; DM starts **new session** from home |
| 502 from edge to DnD | Confirm DnD frontend on **8080**, `host.docker.internal` from edge container, firewall |
| Ingest 503 | Set valid `AUTH_SECRET` (32+ chars), restart backend |
| Ingest 401 | Regenerate API key; fix Tampermonkey `Authorization` header |

## Tampermonkey / production URL

Userscript must list the real API origin in `@connect` (Tampermonkey blocks `GM_xmlhttpRequest` otherwise). Template: [userscripts/ddb-party-ingest.user.js](../userscripts/ddb-party-ingest.user.js). Set `BACKEND_URL` to your public origin (e.g. `https://dnd.saltbushlabs.com`).

## Reference

- [PROJECT_CANON.md](./PROJECT_CANON.md) — architecture summary
- [DEPLOY.md](./DEPLOY.md) — nginx snippet for `/socket.io`
- [SECURITY.md](./SECURITY.md) — secrets and abuse handling
