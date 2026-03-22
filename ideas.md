# Ideas backlog

Short notes for features to explore later. Add new bullets as you think of them.

---

## Character highlight by state

Highlight a character in different colours on the table / party UI when they have certain states — e.g. **Inspiration** could tint the name or portrait area **gold** (border, glow, or subtle background). Extend the same pattern for other conditions or buffs later (concentration, blessed, etc.) if we can map them reliably from party data or DM toggles.

---

## Conditions: DDB sync vs player self-edit

**Today:** Party `conditions` are set in the DM console (comma list) or overwritten when party data is ingested from D&D Beyond. The table and player cards are read-only for players.

**Later (separate project):** Authenticated per-character links so players could PATCH conditions over the API would need auth, rate limits, and audit — not bundled with the stat-tile UI.

**Initiative combat cues** (`firstNextRound`, `lastNextRound`, `advNextAttack`, `disNextAttack`) are DM-only, stored on initiative rows, and are not synced from DDB; round-advance clears the first/last-next-round pair.

---

## More ideas

_(add below)_
