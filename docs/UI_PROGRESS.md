# UI platform — progress log

**Append-only.** Add new dated sections at the top. Do not delete or rewrite historical entries.

---

## 2026-03-22 — Phase 4 layout editor (DM)

**Added:**

- `apps/frontend/src/layout/tableLayoutValidate.ts` — `validateTableLayoutForServer`, `normalizeTableLayout` (aligned with backend `parseTableLayoutPayload` rules).
- `apps/frontend/src/layout/TableLayoutEditor.tsx` — 12-col grid: move, resize, add/remove, Apply / Revert.

**Changed:**

- `DmConsole.tsx` — **TV layout & editor** `<details>` embeds `TableLayoutEditor` (replaces read-only preview + debug overlay there; display route unchanged for Ctrl+Shift+D).

**Notes:**

- `npm run build --workspace=@ddb/frontend` passes. Phase 5: theme tokens (Dark Arcane / Parchment / Stone).

---

## 2026-03-22 — Phase 3 Zustand session runtime store

**Added:**

- `apps/frontend/src/stores/sessionRuntimeStore.ts` — `publicSession`, `connected`, `uiMode`, `tvScale`, `debugLayout`, `hydrateDisplayBootstrap`, etc.
- `apps/frontend/src/components/SessionRuntimeHotkeys.tsx` — global Ctrl+Shift+D (replaces deleted `useDebugLayoutOverlay.ts`).

**Changed:**

- `useSessionSocket.ts` — subscribes to store; `state:full` → `setFromFullState`; `resetSession` on disconnect / missing ids.
- `TableScreen.tsx` — `useLayoutEffect` clears stale session when `displayToken` changes; REST bootstrap calls `hydrateDisplayBootstrap`.
- `DmConsole.tsx`, `DmSettingsPage.tsx` — `useSessionSocket(..., { uiMode: 'dm' })`; debug from store.
- `App.tsx` — mounts `SessionRuntimeHotkeys`.

**Notes:**

- `npm run build --workspace=@ddb/frontend` passes. Phase 4 next: layout editing.

---

## 2026-03-22 — Phase 2 widget registry

**Added:**

- `apps/frontend/src/widgets/widgetRegistry.ts` — exhaustive `WIDGET_REGISTRY`, `configNotes`, `isRegisteredWidgetType`, `getWidgetDefinition`.
- `apps/frontend/src/widgets/UnknownWidget.tsx` — fallback when layout JSON references an unknown `type`.

**Changed:**

- `renderTableWidget.tsx` — registry dispatch instead of `switch`.

**Notes:**

- `npm run build --workspace=@ddb/frontend` passes. Phase 3 next: Zustand session store.

---

## 2026-03-22 — Phase 1 implementation

**Added:**

- `apps/frontend/src/widgets/*` — `PartyWidget`, `InitiativeWidget`, `TimedEffectsWidget`, `DiceLogWidget`, `ClockWidget`, `SpacerWidget`, `renderTableWidget.tsx`, `types.ts`, `sortWidgets.ts`.
- `apps/frontend/src/layout/TableLayoutRenderer.tsx` — 12-col grid shell, optional debug (outlines, column guides, raw `PublicSessionState` JSON).
- `apps/frontend/src/hooks/useDebugLayoutOverlay.ts` — Ctrl+Shift+D toggle, persists `ddb_ui_debugLayout` in `sessionStorage`.

**Changed:**

- `TableLayoutView.tsx` — thin wrapper around `TableLayoutRenderer` (+ optional `debugLayout` prop).
- `TableScreen.tsx` — debug hook + footer hint.
- `DmConsole.tsx` — **TV layout preview** `<details>` + shared debug overlay.

**Notes:**

- `npm run build --workspace=@ddb/frontend` passes. Phase 2 next: `widgetRegistry.ts` with exhaustive `WidgetType` map.

---

## 2026-03-22

**Added:**

- `docs/UI_ARCHITECTURE.md` — widget + layout + store + theme + TV mode; options analysis; mapping to current files.
- `docs/UI_TODO.md` — phased tasks (1–6) with concrete next steps.
- `docs/UI_DESIGN_SYSTEM.md` — current CSS tokens, typography, spacing; planned fantasy themes.
- `docs/UI_PROGRESS.md` — this log.

**Analysis (recorded in UI_ARCHITECTURE):**

- **Display** boots from `GET /api/public/display/:token`, then hydrates from Socket.IO `state:full` only; `TableLayoutView` renders `tableLayout` as a 12-column CSS grid.
- **DM console** does not render `tableLayout` today (hardcoded 3-column console layout); “Reset TV layout” emits `session:setTableLayout` only.
- Widget rendering is a monolithic `switch` in `TableLayoutView.tsx` — registry and Zustand are planned, not yet implemented.

**Changed:**

- `tasks/todo.md` — pointer to UI platform docs.

**Next:**

- Execute UI_TODO Phase 1 (widget extraction, DM preview, debug overlay v1).

---
