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
- Per-entry **advantage / disadvantage** selector with confirmation
- **Prev / Next turn** navigation with round counter and active-turn highlight
- Conditions per combatant (add / remove); death save tracking
- Roll breakdown shown below the character name; large initiative total on the right
- State persists across page reloads via `localStorage` (`ddbCampaignInitBarInitiativeV1`)

### Party Cards (right panel, live)

Party data is polled from the DDB character API approximately every **60 seconds**; click **↻ Refresh** in the header to force an immediate update.

Each card displays:

| Stat | Detail |
|---|---|
| HP | Current / max; temp HP sub-label; **low-HP pulse** at ≤ 25 %, **critical pulse** at ≤ 10 % |
| AC | Armor Class |
| Spell Save DC | Shown when the character has spellcasting |
| Passives | Perception, Investigation, Insight |
| Spell slots | Diamond pips per level |
| Class resources | Pips for features like Ki, Rage, Lay on Hands pool |
| Conditions | Inline badges from the DDB character sheet |
| Death saves | Success / failure pips |
| Inspiration | Gold shimmer on the card |

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
