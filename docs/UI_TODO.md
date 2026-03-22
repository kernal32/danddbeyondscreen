# UI platform — phased tasks

Backlog for the **TV-first fantasy dashboard** frontend. Aligned with [IMPLEMENTATION_TODO.md](./IMPLEMENTATION_TODO.md) Phase 3 and expanded here for execution detail.

**Architecture:** [UI_ARCHITECTURE.md](./UI_ARCHITECTURE.md) · **Progress:** [UI_PROGRESS.md](./UI_PROGRESS.md) · **Design tokens:** [UI_DESIGN_SYSTEM.md](./UI_DESIGN_SYSTEM.md)

---

## Phase 1 — Render existing layout (structure + parity)

Goal: **Same visual output** on display; codebase ready for registry and store.

- [x] **Extract widget components** from `TableLayoutView.tsx` into `apps/frontend/src/widgets/*` (one file per `WidgetType`); keep props typed with `@ddb/shared-types`.
- [x] **Introduce `TableLayoutRenderer`** (`apps/frontend/src/layout/TableLayoutRenderer.tsx`) — grid placement + `sortWidgets`; delegates via `renderTableWidget.tsx`.
- [x] **DM layout preview:** collapsible **TV layout preview** on `/dm` using `TableLayoutRenderer` + `min-w-[960px]` scroll container.
- [x] **Debug overlay (v1):** Ctrl+Shift+D — widget outlines, `id`/`type` badges, 12-col guides (`xl+`), raw JSON `<details>`; `sessionStorage` key `ddb_ui_debugLayout`.
- [x] **Verify:** `npm run build --workspace=@ddb/frontend`; display still uses `TableLayoutView` → renderer; reset layout unchanged.

---

## Phase 2 — Widget registry

- [x] Add `widgetRegistry.ts` — `WIDGET_REGISTRY` with `satisfies Record<WidgetType, WidgetDefinition>`; `isRegisteredWidgetType`, `getWidgetDefinition`.
- [x] `renderTableWidget.tsx` uses registry lookup; unknown `type` strings → `UnknownWidget` fallback.
- [x] Per-widget `configNotes` on definitions (informal until shared-types schemas).

---

## Phase 3 — Central store (Zustand)

- [x] Dependency `zustand` on `@ddb/frontend`.
- [x] `stores/sessionRuntimeStore.ts` — `publicSession`, `connected`, `hydrateDisplayBootstrap`, `setFromFullState`, `resetSession`, `uiMode`, `tvScale`, `debugLayout` + toggles.
- [x] `useSessionSocket` writes `state:full` / `connected` into store; returns `{ state, connected, emit }` from store + ref.
- [x] `TableScreen` / `DmConsole` / `DmSettingsPage` use store selectors where needed; display bootstrap avoids clobbering socket snapshot for same `sessionId`.
- [x] `SessionRuntimeHotkeys` in `App.tsx` — Ctrl+Shift+D → `toggleDebugLayout` (replaces `useDebugLayoutOverlay` hook).

---

## Phase 4 — Layout editing (DM)

- [x] **Custom grid editor** (`TableLayoutEditor.tsx`) — drag handle (snap on pointer up), SE corner resize, add/remove widgets, palette from `WIDGET_REGISTRY` (no extra npm deps).
- [x] **Persist:** `emit('session:setTableLayout', { tableLayout })` on **Apply layout to table** (same path as reset layout).
- [x] **Client validation** (`tableLayoutValidate.ts`) mirrors `apps/backend/src/util/table-layout.ts` (bounds, ids, types); `normalizeTableLayout` before emit.
- [ ] **Named layouts** / account default sync beyond Settings “Save seed & layout” — future; see `user_preferences.table_layout_json`.

---

## Phase 5 — Themes

- [x] CSS variable themes: **minimal**, **fantasy**, **darkArcane**, **parchment**, **stoneDungeon** (`index.css` + `:root` / `.theme-*` for widget subtrees).
- [x] `TableTheme` + `TABLE_THEME_IDS` / `isTableTheme` in `@ddb/shared-types`; `applyRootTableTheme` + DM picker; PATCH + `session:setTheme` validated on backend.
- [x] `widgetThemeSurfaceClass` + `TableLayoutRenderer` / `TableLayoutEditor` (valid `themeOverride` only).

---

## Phase 6 — TV optimisation

- [ ] **Scale system:** root `font-size` or CSS `clamp` driven by breakpoint / user “TV distance” setting (UI-only).
- [ ] **Keyboard:** global shortcuts for display-safe actions where product allows; focus trap only where needed.
- [ ] **Performance:** memoisation, virtualise long dice log if needed; Lighthouse / React Profiler on party-heavy sessions.

---

## Refinements / parking lot

- [ ] Consider subscribing to partial socket events if server ever emits them for bandwidth (not required while only `state:full` is used).
- [ ] Optional: Storybook or Ladle for widgets in isolation.
- [ ] i18n (not started).

---

## Next actions (immediate)

1. **Phase 6 — TV optimisation** (scale/`clamp`, keyboard on display, perf passes).
2. Optional: **named layouts** (Phase 4 parking lot) and **UI_DESIGN_SYSTEM.md** polish to match shipped tokens.
