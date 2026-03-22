# D&D Beyond DM Screen — Reference Project Analysis

This document analyses [swichers/dndbeyond-screen](https://github.com/swichers/dndbeyond-screen) (PHP/Symfony) as implemented in the cloned reference under `dndbeyond-screen/`. It informs the greenfield TypeScript replacement in this repository.

## Tech stack (reference)

| Area | Technology |
|------|------------|
| Server | PHP 7.4+, Symfony 4.4 (Framework, Twig, Validator, Form, HttpClient) |
| HTTP client | Symfony HttpClient wrapped in `CachingHttpClient` |
| Caching | Filesystem HTTP cache (`kernel.cache_dir/http`) + Symfony `FilesystemAdapter` per character (5 min TTL) |
| Frontend build | Webpack Encore, Yarn |
| UI | Twig templates, Bootstrap 4, jQuery, Font Awesome |
| JS behaviour | ES modules: `CharacterUpdater`, `TimeSince` |

## How data is loaded from D&D Beyond

### Mechanism: unofficial JSON endpoint (not scraping)

- **URL:** `GET https://www.dndbeyond.com/character/{characterId}/json`
- **Validation:** `HEAD` to the same path returns 200 if the character JSON is reachable (`CharacterFetcherService::isValidId`).
- **No browser session, no OAuth, no cookie reuse.** Only **public** character sheets work. HTTP **403** is mapped to a private-character error; **404** to missing character.

### HTTP client headers (`DndBeyondClientFactory`)

The client sets:

- `Content-Type: text/json`
- `User-Agent`: Mozilla/Firefox-style string
- `Referer: https://www.dndbeyond.com/`

These mimic a normal browser context; they are **not** a supported API contract.

### Campaign / party discovery

1. User supplies one **seed** character ID (must be in a campaign).
2. Server fetches that character’s JSON.
3. It reads `character['campaign']['characters']` for other `characterId` values.
4. For each other ID, it fetches `.../character/{id}/json`, **skipping failures** (try/catch per character) so one broken/private peer does not fail the whole page (`ScreenController::campaignByCharacter`).

This is **sequential** in the reference implementation (N+1 latency).

### Character shape (internal use)

The app treats the JSON as a **large associative array** (PHP). Important top-level keys used in code/templates:

- Identity / display: `id`, `name`, `avatarUrl`
- Combat: `removedHitPoints`, `temporaryHitPoints`, `overrideHitPoints`, `baseHitPoints`, `bonusHitPoints`, `preferences.hitPointType`
- Stats: `stats`, `overrideStats`, `modifiers` (nested groups)
- Items: `inventory[]` with `equipped`, `definition` (armor, granted modifiers)
- Classes: `classes[]` with `level`, `definition.hitDice`, `isStartingClass`
- Campaign: `campaign` (name, link, description, `characters[]`)
- Spells: rendered via spell-related includes (not initiative/combat tracker)

**Conditions:** The reference **does not** render status conditions in Twig/UI. Any future support must map from DDB JSON fields if present, or allow **manual** conditions in the new system.

### AC, HP, passives — server-side recomputation

The reference does **not** trust a single “display AC” field alone. It recomputes:

- **AC** from Dex mod, equipped armor/shield, unarmored defense modifiers, and AC bonuses (`CharacterCalculatorService`, `ItemAcCalculatorService`, `DataModifierService`).
- **Max HP** from class hit dice, Con mod, preferences, modifiers, overrides (`getMaxHp`).
- **Passive scores** (perception, investigation, insight) from ability mods, proficiency, and passive bonuses (`getPassiveScore`).

Twig exposes these via filters in `CharacterCalculatorExtension` (`|ac`, `|max_hp`, `|passive`, etc.).

**Risk:** Any drift between this logic and D&D Beyond’s own engine can cause **discrepancies** on edge builds (homebrew, rare interactions).

## Rendering model

- **Primary:** **Server-rendered HTML** (Twig). The “sheet” is static HTML with Bootstrap cards.
- **Refresh:** The browser runs **`CharacterUpdater`** per card:
  - Default interval: **3 minutes**.
  - `fetch('/{characterId}/update', { cache: 'no-cache' })` returns **HTML fragment** for one card.
  - Compares `data-last-requested` (from upstream response **`Date`** header stored at render time) to avoid DOM swap if unchanged.
  - On error, shows error UI and **stops** the interval.

So: **not** a SPA; **not** WebSockets; **polling** with **HTML partial** replacement.

### Cache vs poll interaction

- Per-character Symfony cache TTL is **5 minutes** (`CharacterFetcherService` + `services.yaml` default 300s).
- Client polls every **3 minutes**.

Until the server cache expires, the JSON (and thus rendered card) may be **unchanged**, so `data-last-requested` may not move even though the client polls. This can **delay** visibility of updates from D&D Beyond relative to user expectations.

## Weaknesses and limitations

1. **Unofficial API** — URLs and JSON shape can change without notice.
2. **Rate limiting / captcha** — D&D Beyond may throttle or block aggressive polling; README warns about captcha on the main site.
3. **No private sheets** without a different (likely ToS-sensitive) approach.
4. **Calculator drift** vs live DDB rules.
5. **Sequential campaign fetches** — slow for large parties.
6. **Scaling** — filesystem cache and single-process PHP; no shared session layer for multiple app instances.
7. **Frontend architecture** — jQuery + HTML swap is brittle for rich features (initiative, live HP from DM, etc.).
8. **Feature gaps** — no conditions in UI, no initiative, no DM vs player views, no real-time collaboration.

## Client-side “hacks”

None in the sense of DOM scraping or extension injection. The only “workaround” is **HTTP headers** and the **public JSON** endpoint, which is still **server-side** fetch from PHP.

## Implications for the greenfield system

- Keep a **replaceable** `DndBeyondPort` / adapter: HTTP JSON today; optional file import or other sources later.
- Use **concurrency limits** + **rate limiting** when fetching many characters.
- Prefer **normalized DTOs** + **stale-while-revalidate** caching with change detection over blind HTML diffing.
- Treat **conditions** as: map from JSON if available, else **manual** overlays on normalized models.
- Drive **TV UI** and **initiative** from **JSON state** + **WebSockets**, not Twig partials.

See the repository root plan and optional `docs/ARCHITECTURE_SUMMARY.md` for the target architecture.
