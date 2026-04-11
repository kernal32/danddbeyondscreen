# DDB Campaign Initiative Bar

A standalone Tampermonkey / Violentmonkey userscript that adds a **full-screen DM overlay** to D&D Beyond campaign pages. No backend, no account, no API key required — everything is stored locally in `localStorage`.

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) browser extension
- A D&D Beyond account with at least one campaign
- The campaign page open in your browser (`dndbeyond.com/campaigns/…`)

## Installation

1. Open the raw URL of [`ddb-campaign-initiative-bar.user.js`](./ddb-campaign-initiative-bar.user.js) in your browser.
2. Tampermonkey / Violentmonkey will detect the `==UserScript==` header and prompt you to install.
3. Click **Install**. The overlay will appear automatically on any `/campaigns/` page.

> The script matches `https://www.dndbeyond.com/*` and `https://dndbeyond.com/*` and only mounts the overlay when the URL path is under `/campaigns/`.

## Features

### Initiative Tracker (left panel)

- **Start Combat** — builds combatants from the live party roster, rolls initiative for each using their DDB modifier (DEX + proficiency + flat bonuses)
- Per-entry **advantage / disadvantage** selector; both d20 results are shown with the dropped roll struck through and dimmed
- **Prev / Next turn** navigation with round counter and active-turn highlight
- **Click any card to jump to that combatant's turn** — all rolls up to that point are revealed automatically
- **Combat Time** counter in the footer (Round × 6 seconds), formatted as `Xm Ys` once over a minute; resets when a new combat starts
- Roll breakdown (`ROLL 17 / ~~8~~ +3`) displayed beneath the character name; large initiative total on the right
- Knocked-out overlay ("ZzZ") on portrait when a combatant's HP reaches 0
- Controls (Start Combat, Next Round, arrows, Clear) anchored to the bottom of the panel so initiative cards align with the party cards
- State persists across page reloads via `localStorage` (`ddbCampaignInitBarInitiativeV1`)

### Party Cards (right panel, live)

Party data is polled from the DDB character API approximately every **60 seconds**; click **↻ Refresh** (top-right header) to force an immediate update.

Cards stretch vertically to fill the screen height, aligned across all rows.

Each card displays:

| Stat | Detail |
|---|---|
| HP | Total hit points as a large number; temporary HP overrides the display when present; **low-HP pulse** at ≤ 25 %, **critical pulse** at ≤ 10 % |
| AC | Armor Class |
| Spell Save DC | Shown when the character has spellcasting |
| Passives | Perception, Investigation, Insight — icon + gold label below the number |
| Spell slots | Diamond pips per level |
| Class resources | Pips for features with ≤ 4 charges; `used/total` count for larger pools (e.g. 6/10) |
| Conditions | Inline badges with full abbreviations (INVIS, BLND, etc.) and a CONDITIONS label |
| Death saves | Success / failure pips |
| Inspiration | Glowing 8-pointed star icon in the top-right corner when active |
| Knocked-out | "ZzZ" overlay on portrait when HP reaches 0 |

### Settings Panel

Click **⚙ Settings** in the top-right header to open the settings panel:

| Setting | Options |
|---|---|
| Colour theme | Crimson · Obsidian · Forest · Ocean |
| Card density | Compact · Normal · Large |
| Name display | First name only · Full name |
| Remote / TV display | Generate a QR code to open the initiative remote view on a TV or secondary device |

### Remote / TV Display

The initiative state can be broadcast to an external device (TV, tablet) via the built-in WebSocket remote. Open **Settings → External Connection** and scan the QR code on the target device.

## Colour Themes

| Theme | Accent |
|---|---|
| Crimson | Deep red / gold |
| Obsidian | Cool grey / silver |
| Forest | Green / brass |
| Ocean | Teal / steel |

## Known Caveats

- **`@require` bundle** — the script requires DDB's `vendors~characterTools` bundle from `media.dndbeyond.com`. If character data stops loading after a DDB deploy, update the `@require` URL in the script header to match the current filename on that CDN (same pattern as [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen)). Current pin: **Cobalt 999080**.
- The overlay only mounts on top-level frames (`@noframes`); it will not appear inside iframes.
- DDB is a single-page application — the script listens for `popstate` / `pushState` / `replaceState` so the overlay mounts correctly after client-side navigation.

## Credits

- [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen) — character API patterns, Cobalt auth shim
- [FaithLilley/DnDBeyond-Live-Campaign](https://github.com/FaithLilley/DnDBeyond-Live-Campaign) — original campaign overlay concept
