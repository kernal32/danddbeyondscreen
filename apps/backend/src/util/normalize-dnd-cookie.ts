/** Strip accidental `Cookie:` prefix from pasted DevTools text. */
export function normalizePastedCookieHeader(raw: string): string {
  let s = raw.trim();
  if (/^cookie\s*:/i.test(s)) {
    s = s.replace(/^cookie\s*:\s*/i, '').trim();
  }
  return s;
}
