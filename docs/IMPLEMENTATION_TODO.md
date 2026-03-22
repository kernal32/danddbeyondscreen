# Implementation TODO — phased roadmap

Structured backlog aligned with product direction. **Authoritative for roadmap**; historical build phases remain in [tasks/todo.md](../tasks/todo.md) for reference—keep that file’s pointer to this document in sync.

---

## Phase 1 — Stabilisation

- [x] **Docker SQLite volume:** `docker-compose.yml` mounts `./data:/app/data` and sets `DATABASE_PATH=/app/data/ddb-screen.db` ([RUNBOOK.md](./RUNBOOK.md)).
- [ ] **Verify Tampermonkey production:** Document `@connect` for public hostname; smoke-test `POST /api/ingest/party` through edge TLS.
- [ ] **Ingest reliability:** Optional retries/backoff in userscript; clear console logging toggle for “debug mode”.
- [ ] **Observability:** Structured request logging (at least `requestId` + route + status); optional correlation from ingest → `user_id` in logs (no secrets).

---

## Phase 2 — Data layer upgrade

- [ ] **Versioned party snapshot:** Add schema version field to stored JSON; migrate reader in `user_ddb_uploads` / `parsePartySnapshotIngest`.
- [ ] **Normalisation:** Single canonical internal shape for characters; document mapping from DDB JSON.
- [ ] **Postgres readiness:** Introduce repository boundary (same interface as current `better-sqlite3` access); document migration steps (connection string, Prisma/pg optional).

---

## Phase 3 — UI system

- [ ] **Widget model:** Extend `tableLayout` / shared types for pluggable widgets (party, initiative, effects, custom).
- [ ] **TV-friendly layout:** Larger type, safe zones, reduced chrome; test on 1080p/4K at viewing distance.
- [ ] **Theme engine:** Fantasy / WoW-adjacent presets; persist per session or per user.
- [ ] **Layout editor:** Drag/drop grid; save/load named layouts (align with `user_preferences.table_layout_json` or successor).

---

## Phase 4 — Auth upgrade

- [ ] **Google SSO** (OAuth2/OIDC).
- [ ] **Microsoft SSO** (Entra / Azure AD).
- [ ] **Email verification** (registration / passwordless codes).
- [ ] **Session hardening:** Refresh tokens, shorter access JWT, httpOnly cookies (requires same-site/TLS discipline).

---

## Phase 5 — Real-time (cross-session)

- [ ] **Notify DM on new ingest:** SSE or WebSocket channel keyed by user id (auth required); optional auto-offer “apply to current session”.
- [ ] **Optional Redis:** Shared rate-limit and session store if multiple backend replicas.

---

## Phase 6 — Advanced features

- [ ] **Initiative automation:** Hooks from parsed rolls or manual shortcuts (scope: table agreement / ToS safe).
- [ ] **Dice detection:** Integrate with dice log or external input (clear privacy/accuracy limits).
- [ ] **Multi-user sessions:** Roles beyond single DM token (invite links, player caps).

---

## Quick wins (any phase)

- [ ] **Edge rate limit:** `limit_req` on `POST /api/ingest/party` at Nginx (CrimsonAuth or inner nginx).
- [ ] **Idempotency / replay mitigation:** Optional `Idempotency-Key` or monotonic `clientSeq` on ingest ([SECURITY.md](./SECURITY.md)).
