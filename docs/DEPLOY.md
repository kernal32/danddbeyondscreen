# Deployment notes

**Full runbook:** [RUNBOOK.md](./RUNBOOK.md) (Docker volumes, edge proxy, updates, recovery). This file keeps concise Compose and reverse-proxy snippets.

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

- **SQLite:** host directory `./data` is mounted at `/app/data` in the backend; DB file `ddb-screen.db` (and `-wal`/`-shm`) persist across recreates.
- **Backend:** `http://localhost:3001` (API + Socket.IO)
- **Frontend (nginx):** `http://localhost:8080` — proxies `/api` and `/socket.io` to the `backend` service

Use a single public hostname in production so the browser can use **relative** URLs (leave `VITE_API_BASE` and `VITE_SOCKET_URL` unset at build time). The bundled app calls `/api` and connects Socket.IO to the same origin.

## Environment variables

See [`.env.example`](../.env.example). For Compose, override `environment` on the `backend` service (ports, `CORS_ORIGIN`, `DDB_*`, rate limits).

**`AUTH_SECRET`** (32+ characters): required for **accounts**, **Tampermonkey API keys**, and `POST /api/ingest/party`. Without it, ingest returns 503.

Optional **`DDB_COOKIE`**: server-side D&D Beyond session for **Refresh party** / seed fetches only (see [README](../README.md)). Prefer injecting via secrets / `env_file`, never committing the value.

## Reverse proxy (HTTPS)

Terminate TLS at **NGINX**, **Caddy**, or **Traefik**, then:

- Proxy **`/api/`** to the Node backend.
- Proxy **`/socket.io/`** with **WebSocket** support:
  - `Upgrade` and `Connection: upgrade` headers
  - Long `proxy_read_timeout` for idle sockets (e.g. 24h)

Large **`POST /api/ingest/party`** bodies (Tampermonkey party upload) need a raised limit on **every** nginx that sees the request (edge + inner). Default **1MB** causes **413**.

```nginx
client_max_body_size 32m;
```

Put it in the **`server`** block (or the `location` that proxies to the app). The repo’s [docker/nginx.conf](../docker/nginx.conf) sets this for the frontend container; if you terminate TLS on another nginx (e.g. CrimsonAuth), add the same there.

Example NGINX snippet:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400s;
}
```

## Redis (optional)

The current build uses **in-memory** sessions and TTL cache. For multiple backend replicas, add Redis for session store and shared rate limiting (not implemented in this MVP).

## Same VPS as CrimsonAuth

If **CrimsonAuth** edge nginx already listens on **80/443**, point **`dnd.saltbushlabs.com`** at that nginx and proxy to this stack’s **frontend** port (**8080** on the host). Use Docker **`host.docker.internal:host-gateway`** from the edge container (see CrimsonAuth `docker-compose.yml` and deployment runbook). Keep the DnD **backend** published on **127.0.0.1:3001** only so traffic goes through the inner nginx on **8080** (API + Socket.IO stay same-origin for the browser). **Let’s Encrypt** for the public hostname is issued on the CrimsonAuth stack (SAN cert with the API host); see CrimsonAuth **`scripts/letsencrypt-issue.sh`** and **`docs/deployment-runbook.md`**.
