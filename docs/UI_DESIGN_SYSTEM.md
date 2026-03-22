# UI design system — tokens, type, themes

Living document for the **DDB DM Screen** frontend. **Session theme enum** remains in `@ddb/shared-types` (`TableTheme`); CSS implementation lives here and in `apps/frontend/src/index.css`.

---

## 1. Typography

### 1.1 Families (current)

| Role | Font | Source |
|------|------|--------|
| Display / headings | Cinzel (600, 700) | Google Fonts, `tailwind.config.js` → `font-display` |
| Body / UI | Source Sans 3 (400, 600, 700) | Google Fonts → `font-sans` |

### 1.2 TV scale (target)

Use a **modular scale** on display routes (e.g. ratio ~1.25):

| Token | Typical use | Display (px, guidance) |
|-------|-------------|-------------------------|
| `text-tv-xs` | Meta, badges | 16–18 |
| `text-tv-sm` | Secondary | 18–20 |
| `text-tv-base` | Body | 20–24 |
| `text-tv-lg` | Section titles | 24–30 |
| `text-tv-xl` | Hero / campaign name | 36–48+ |

Implement via Tailwind theme extension + `clamp()` for viewport fluidity between 1080p and 4K.

### 1.3 Line height & measure

- Headings: tight (`leading-tight`).
- Body: relaxed (`leading-relaxed`) for legibility at distance.
- Max line width for prose blocks on TV: ~40–50 characters where possible.

---

## 2. Colour tokens (implemented)

Defined on `:root.theme-minimal` and `:root.theme-fantasy` in `apps/frontend/src/index.css`:

| Token | Purpose |
|-------|---------|
| `--bg` | Page background |
| `--surface` | Cards / panels |
| `--text` | Primary text |
| `--muted` | Secondary text |
| `--accent` | Highlights, links, key headings |
| `--danger` | Errors, destructive |
| `--ok` | Success / live connected |
| `--warn` | Caution |

Tailwind arbitrary values: `text-[var(--accent)]`, `bg-[var(--surface)]`, etc.

---

## 3. Planned themes (Phase 5)

These are **design targets**; naming must eventually align with `TableTheme` in shared-types + backend persistence.

### 3.1 Dark Arcane

- Deep blue-violet background, cool grey surfaces, cyan or violet accent, high contrast white/lavender text.
- Mood: night spellcasting, crystal UI.

### 3.2 Parchment

- Warm paper base, ink brown text, sepia muted, burgundy or forest accent.
- Mood: folio / tome; may require light-on-dark sidebar exceptions for contrast.

### 3.3 Stone Dungeon

- Grey stone `--bg`, torch-amber `--accent`, desaturated green optional for “safe” states.
- Mood: carved stone, torchlight.

**Implementation rule:** each theme = `:root.theme-<name> { ... }` with the **same token names** (`--bg`, `--surface`, …) so widgets never branch on theme name — only CSS variables change.

---

## 4. Spacing & layout

| Concept | Value / note |
|---------|----------------|
| Table grid gap | `1rem` today (`.table-layout-grid`); TV may use `clamp(1rem, 2vw, 2rem)` |
| Panel padding | `p-4` baseline; TV: `p-6`–`p-8` |
| Border radius | `rounded-xl` for cards — keep consistent family |
| Safe zone | Minimum `2–4%` margin from viewport edges on TV layouts (padding on root display container) |

---

## 5. Motion

- Prefer **reduced motion** respect: `@media (prefers-reduced-motion: reduce)` disables decorative transitions.
- Subtle fades (150–200ms) for widget mount; avoid distracting loops on the table display.

---

## 6. Focus & interaction (TV)

- Visible **`:focus-visible`** ring using `--accent` with 2px offset.
- Minimum touch/focus target **44×48px** for actionable controls on display surfaces.
- Do not rely on `:hover` for essential information.

---

## 7. Widget chrome

- Optional frame: `border border-white/10` (dark themes) — adjust per theme via token e.g. `--border-subtle` (future).
- Section titles: `font-display`, `text-[var(--accent)]`, consistent `mb-2` / `mb-3`.

---

## Related files

- `apps/frontend/src/index.css` — live tokens and `.table-layout-grid`
- `apps/frontend/tailwind.config.js` — font families
- `apps/frontend/index.html` — font loading
