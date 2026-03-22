# Greenfield architecture (summary)

**Canon docs:** [PROJECT_CANON.md](./PROJECT_CANON.md) (system truth), [ARCHITECTURE.md](./ARCHITECTURE.md) (detailed design), [RUNBOOK.md](./RUNBOOK.md) (operations).

This repo implements the plan described in the Cursor plan file (not committed here): a **Node.js / TypeScript** backend (**Fastify** + **Socket.IO**), **React + Vite + Tailwind** frontend, and **`@ddb/shared-types`** for shared contracts.

## Runtime flow

1. **Sessions** are created in memory (`SessionService`). Each has a **display token** (read-only) and **DM token** (mutations).
2. **D&D Beyond** data is fetched server-side via `DndBeyondService` → `CharacterService` (JSON endpoint + calculator port from the PHP reference).
3. **Initiative** is a pure state machine in `initiative.service.ts`; mutations run on the server and **broadcast** filtered `PublicSessionState` to Socket.IO rooms `session:{id}`.
4. **Table display** uses `GET /api/public/display/:displayToken` for first paint, then Socket.IO for live updates.
5. **DM console** uses the DM token over REST + Socket.IO.

## Extensibility

- Replace D&D Beyond integration by introducing a new adapter behind the same fetch/normalize boundary (`DndBeyondService` / `CharacterService`).
- **Timed effects**, **dice log** (with `dmOnly` entries), and **NPC templates** are first-class on the session model for future encounter tools.

## Deployment

See [DEPLOY.md](./DEPLOY.md) for Docker, reverse proxy, and WebSocket headers.
