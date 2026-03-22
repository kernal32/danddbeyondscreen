# Project progress log

**Append-only.** New days add a new dated section at the top. Do not delete or rewrite historical entries.

---

## 2026-03-22

**Added:**

- UI platform documentation: `docs/UI_ARCHITECTURE.md`, `docs/UI_TODO.md`, `docs/UI_PROGRESS.md`, `docs/UI_DESIGN_SYSTEM.md` — widget/layout/store/theme plan aligned with existing `tableLayout` and Socket.IO `state:full` flow.
- **UI Phase 1–4 (frontend):** widgets, registry, Zustand runtime store, **DM table layout editor** (drag/resize, apply via `session:setTableLayout`, client validation).

**Changed:**

- `tasks/todo.md` — links to UI platform docs.
- `TableLayoutView.tsx`, `TableScreen.tsx`, `DmConsole.tsx` — wired to renderer + debug hook; see `docs/UI_PROGRESS.md`.

**Notes:**

- `npm run build --workspace=@ddb/frontend` verified after UI Phase 1.

---

## 2026-03-21

**Added:**

- `docker-compose.yml`: backend volume `./data:/app/data` and `DATABASE_PATH=/app/data/ddb-screen.db` for persistent SQLite (WAL files on same mount).

**Changed:**

- `docs/RUNBOOK.md`, `.env.example`, `PROJECT_CANON.md`, `IMPLEMENTATION_TODO.md`, `SECURITY.md` (checklist) aligned with default Compose persistence.

**Fixed:**

- (n/a)

**Notes:**

- Existing DB inside an old container layer is **not** migrated automatically; first start creates `DnD/data/ddb-screen.db` on the host (or use `docker cp` from a stopped container if you still have one).

---

## 2025-03-21

**Added:**

- `docs/PROJECT_CANON.md` — source-of-truth overview: layers, auth, deployment, data-flow diagram, boundaries vs D&D Beyond.
- `docs/RUNBOOK.md` — local dev, Docker, SQLite volume recommendation, CrimsonAuth edge integration pointers, update/recovery.
- `docs/IMPLEMENTATION_TODO.md` — phased roadmap (stabilisation through advanced features).
- `docs/ARCHITECTURE.md` — technical design: components, SQLite schema, ingest → session sequences.
- `docs/SECURITY.md` — threat model, JWT/API keys, rate limits, abuse scenarios, replay/idempotency notes.
- Cross-links from `docs/ARCHITECTURE_SUMMARY.md`, `docs/DEPLOY.md`, and `README.md` to the canon docs; `tasks/todo.md` points here for roadmap.

**Changed:**

- Documentation structure only; no application code changes in this pass.

**Fixed:**

- (n/a)

**Notes:**

- **Current architecture:** Tampermonkey → `POST /api/ingest/party` (`dnd_` API key) → SQLite `user_ddb_uploads`; DM → `POST .../party/import-upload` → in-memory `SessionService` → Socket.IO to displays. User JWT (HS256, ~30d) for account UI; DM/display tokens per game session.
- **Risks:** Default Docker Compose does not mount SQLite — **data loss on container recreate** unless `DATABASE_PATH` + volume configured. Backend restart **wipes in-memory sessions**. D&D Beyond integration remains unofficial; respect ToS and rate limits. API keys in userscripts are **high-value secrets** if leaked.
- **Real-time:** Live updates apply **within** an active session (Socket.IO), not automatically from each new ingest until import or refresh.
