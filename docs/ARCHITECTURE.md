# Architecture — technical design

Companion to [PROJECT_CANON.md](./PROJECT_CANON.md). This file focuses on components, storage, and request sequences.

## Monorepo layout

| Path | Responsibility |
|------|----------------|
| `apps/backend` | Fastify HTTP API, Socket.IO, DDB fetch + character calculator, initiative engine |
| `apps/frontend` | React (Vite), DM console, public display |
| `packages/shared-types` | Shared TypeScript types (`PartySnapshot`, `TableLayout`, `PublicSessionState`, etc.) |
| `userscripts/` | Tampermonkey template for party ingest |

## Runtime components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (nginx or Vite)                 │
│  SPA ──► /api/*, /socket.io/* ──► Fastify backend           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Fastify (apps/backend/src/server.ts, routes/api.ts, auth)    │
│  • Session CRUD, party, initiative, NPC templates, public    │
│  • POST /api/ingest/party (API key auth)                     │
│  • POST .../party/import-upload (DM token + user JWT)        │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
 SessionService      CharacterService      UserApiKeyService
 (in-memory)         DndBeyondService      UserDdbUploadService
                     (outbound HTTP)      (SQLite)
```

- **SessionService:** One record per “table” session: party, initiative, timed effects, dice log, theme, `tableLayout`, seed character id, DM/display tokens.
- **CharacterService:** Normalizes DDB JSON into internal character model; builds `PartySnapshot` from seed or character arrays.
- **DndBeyondService:** Fetches unofficial JSON endpoints (with optional cookie from config or session).
- **Initiative:** Pure functions in `initiative.service.ts`; server applies mutations and broadcasts.

## WebSocket / Socket.IO

- Clients join rooms `session:{sessionId}`.
- Mutations that change visible state call `broadcast(sessionId)` → subscribers receive updated `PublicSessionState` (role-filtered: DM vs display).

## SQLite schema (accounts and uploads)

Defined in `apps/backend/src/db/sqlite.ts`:

| Table | Purpose |
|-------|---------|
| `users` | `id`, `email`, `password_hash`, `created_at` |
| `user_preferences` | Per-user defaults: `default_seed_character_id`, encrypted DDB cookie blob, `table_layout_json`, `updated_at` |
| `user_api_keys` | Hashed `dnd_` keys, prefix for display, label, `last_used_at` |
| `user_ddb_uploads` | **One row per user:** latest `party_json`, `character_count`, `updated_at` |

WAL mode enabled. **Game sessions are not persisted here.**

## Ingest and session load sequence

```
Tampermonkey                    Fastify                         SQLite
     │                             │                              │
     │ POST /api/ingest/party      │                              │
     │ Bearer dnd_*                │── resolve key ───────────────►│
     │ body: format + payload      │◄─ userId                     │
     │                             │── validate + normalize        │
     │                             │── saveParty(userId) ─────────►│ user_ddb_uploads
     │◄─ 200 { characterCount }    │                              │

Browser (DM logged in)            Fastify                    SessionService
     │                             │                              │
     │ POST .../party/import-upload│                              │
     │ Authorization: DM token     │                              │
     │ X-User-Authorization: JWT   │── verify JWT → userId        │
     │                             │── getParty(userId) ──► DB    │
     │                             │── setParty(session, party)     │
     │                             │── broadcast(sessionId) ───────►│ Socket.IO
     │◄─ 200                       │                              │
```

## Key HTTP routes (subset)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/sessions` | Optional Bearer user JWT (applies saved prefs) |
| `GET`/`PATCH` | `/api/sessions/:id` | DM token |
| `GET` | `/api/public/display/:displayToken` | None (secret in URL) |
| `POST` | `/api/ingest/party` | Bearer `dnd_*` API key |
| `POST` | `/api/sessions/:id/party/import-upload` | DM token + `X-User-Authorization: Bearer <JWT>` |

## Shared types

Package `@ddb/shared-types` (`packages/shared-types`) is the contract for session state, party shape, initiative, layout widgets. Frontend and backend import the same definitions after build.

## Deployment topology (typical)

```
Internet ──► CrimsonAuth nginx (443)
                 │
                 ├──► dnd.saltbushlabs.com ──► host:8080 ──► DnD frontend container
                 │                                    └──► backend:3001 (internal)
                 └──► crimsonauth... (separate API, not this repo)
```

See [RUNBOOK.md](./RUNBOOK.md) and CrimsonAuth `docs/deployment-runbook.md`.
