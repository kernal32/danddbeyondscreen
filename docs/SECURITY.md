# Security — threat model and controls

Applies to the **DnD DM Screen** stack (Fastify backend, React frontend, SQLite, Tampermonkey ingest). Edge TLS on the VPS is configured in **CrimsonAuth**; apply defense in depth at both layers.

## Assets to protect

| Asset | Sensitivity |
|-------|-------------|
| `AUTH_SECRET` | Signs user JWTs; encrypts stored D&D Beyond cookies — **compromise = full account layer** |
| User passwords | **bcrypt** (`bcryptjs`, cost 12) in `user-auth.service.ts` |
| API keys (`dnd_…`) | **Bearer secrets** — allow party ingest as that user |
| User JWT | Session to UI + import-upload — can load uploads into a session if combined with DM token |
| DM token | Full mutation power for one game session |
| `DDB_COOKIE` / saved cookie | **Equivalent to logged-in D&D Beyond** for many operations |
| SQLite file | All of the above at rest |

## Threat model (summary)

| Threat | Description | Current mitigations |
|--------|-------------|---------------------|
| **API key theft** | Key copied from userscript, logs, or XSS | Keys stored hashed; only `dnd_` prefix shown in UI; user can revoke; limit keys per user (10) |
| **JWT theft** | XSS or physical access reads `localStorage` | Short-term: 30d expiry; future: httpOnly cookies + refresh ([IMPLEMENTATION_TODO.md](./IMPLEMENTATION_TODO.md) Phase 4) |
| **Ingest abuse** | Flooding `/api/ingest/party` with valid or stolen keys | Per-key fixed window: **45 requests / 60s** (in-memory limiter); **401** on bad key; **32 MiB** body limit on route (aligned with nginx / Fastify) |
| **Replay of ingest** | Same payload posted repeatedly | Idempotent effect (latest overwrite) — **no extra harm** beyond rate limit; optional hardening below |
| **Broken auth gating** | Accounts disabled misconfigured | Without `AUTH_SECRET` (32+ chars), ingest returns **503** — fail closed for ingest |
| **SSRF via ingest body** | Attacker tricks server into calling internal URLs | Ingest path does not fetch arbitrary URLs from payload; DDB fetches use fixed services |
| **Leaked DDB cookie** | Operator pastes cookie into env or DB | Encrypted at rest with `AUTH_SECRET`; still **high value** — minimize retention, access, and logging |

## API key design

- Plain key format: `dnd_` + random material; shown **once** at creation.
- Storage: **SHA-256** hash only (`user_api_keys.key_hash`).
- Resolution updates `last_used_at` for auditing (not a security control by itself).

## JWT design

- Algorithm: **HS256** (`jose`), subject = user id, issued-at + **30d** expiry.
- Same secret used for cookie encryption — rotation requires re-login and re-encrypt strategy (document any future rotation runbook).

## Rate limiting

| Layer | Behaviour |
|-------|-----------|
| **Application** | `IngestRateLimiter` on hashed API key: 45/minute window |
| **DDB fetch** | `RATE_LIMIT_RPS` (default 2) for outbound character fetches |
| **Edge (recommended)** | Nginx `limit_req` on `location` matching `/api/ingest/party` to absorb abusive traffic before Node |

## Input validation

- Ingest: `parsePartySnapshotIngest` / `partyFromDdbJsonArray`; rejects empty or invalid party (**400**).
- `tableLayout`: server-side validation on PATCH / socket.

## Abuse scenarios

1. **Stolen Tampermonkey laptop:** Revoke keys from Account page; rotate `AUTH_SECRET` only if DB/JWT compromise suspected (disruptive).
2. **Public ingest endpoint hammering:** Edge rate limit + application 429; consider CAPTCHA only if abuse persists (usually unnecessary for authenticated ingest).
3. **Malicious large JSON:** 1 MiB cap reduces memory exhaustion risk.

## Replay and idempotency (planned hardening)

Today, duplicate ingests **overwrite** the same row — no financial-style double-spend. If you need stronger semantics:

- **Idempotency-Key** header: server stores last key + hash per user per window.
- **Monotonic `clientSeq`:** reject if `seq` ≤ last stored.
- **HMAC signed body:** only if untrusted networks require integrity (adds userscript complexity).

Document chosen approach in this file when implemented.

## Operational checklist

- [ ] `AUTH_SECRET` generated with `openssl rand -hex 32` (or stronger) and never committed
- [x] SQLite on **persistent volume** in Docker (`./data` bind mount in Compose)
- [ ] HTTPS termination and HSTS at edge
- [ ] Tampermonkey `@connect` limited to your real hostname
- [ ] Revoke unused API keys; educate users not to share keys

## Related

- [PROJECT_CANON.md](./PROJECT_CANON.md) — auth overview
- [RUNBOOK.md](./RUNBOOK.md) — secrets and recovery
