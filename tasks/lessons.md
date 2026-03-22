## Lessons

### Mistake

On Windows, `npm` lifecycle scripts that invoke workspace `.cmd` shims (e.g. `tsc`, `vitest`) failed when the repo path contained `&` (`d:\dev\d&d`), producing broken paths like `d\node_modules\.bin\`.

### Root cause

`cmd.exe` treats `&` as a command separator; generated shim paths were not safely quoted for such paths.

### Preventative rule

For Windows-sensitive repos, prefer **`node ../../node_modules/<pkg>/...`** in workspace `package.json` scripts instead of relying on `.bin` shims.

### Mistake

D&D Beyond party sync stayed at **404** after the user pasted a “cookie” in the DM console; the string looked like **Google** SSO cookies (`HSID`, `SAPISID`, `NID`, etc.), not the **`www.dndbeyond.com/character/{id}/json`** request.

### Root cause

DevTools **Network** lists many requests; copying **Cookie** from the wrong row (often Google) does not authenticate DDB’s legacy JSON or character-service calls.

### Preventative rule

Document and surface errors that distinguish **Google-heavy** pastes from **dndbeyond.com** `json` request cookies; prefer the extension or the exact **`/character/{id}/json`** row.

### Mistake

User saw `{"error":"Unauthorized"}` when saving the D&D Beyond cookie; **Socket.IO still showed “Connected.”**

### Root cause

**401** means the **DM Bearer token / sessionId** are not in the server’s in-memory store (e.g. backend restarted). The WebSocket connection succeeds independently; subscribe may fail without a prominent UI signal.

### Preventative rule

Explain **in-memory sessions** in README and DM console; on **401** from session-scoped APIs, show a clear “start a new session” path and avoid raw JSON error blobs for `error` fields.

### Mistake

Tampermonkey **Pull** used `fetch` + `credentials: 'include'` only; **character-service** returned **401** and the queue stayed empty, while community DM screens still worked.

### Root cause

D&D Beyond expects **Cobalt / Bearer** headers from `makeGetAuthorizationHeaders` (bundled in `vendors~characterTools`), not cookies alone — same pattern as [TeaWithLucas/DNDBeyond-DM-Screen](https://github.com/TeaWithLucas/DNDBeyond-DM-Screen).

### Preventative rule

For ingest/pull against character-service, **`@require`** the current DDB vendors bundle, replay `jsonpDDBCT`, and merge those headers into GETs; keep **v5 + v4** URL fallbacks and document updating the bundle hash after DDB deploys.

### Mistake

Party card widget settings appeared to **crash** the UI (or break checkboxes) when applying or syncing options.

### Root cause

`{ ...defaults, ...partial }` **overwrites with `undefined`** when `partial` contains explicit undefined values, producing invalid booleans for React `checked` and for `PartyCardDisplayOptions`. Missing `tableLayout.widgets` or `party.characters` on bad payloads also caused runtime errors in the table layout renderer / party widget.

### Preventative rule

Merge option objects by **assigning only defined booleans per known keys** (or skip `undefined` in spread). On the client, guard `tableLayout.widgets` and `party.characters` with fallbacks; coerce checkbox `checked` with `!!` when values may be absent. Surface REST/socket failures from **Apply** with try/catch instead of silent rejections.
