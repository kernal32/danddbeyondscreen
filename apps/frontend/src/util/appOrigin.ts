/**
 * Origin for shareable links (QR, copy). Use when the app is opened via `localhost` on the
 * host but phones should use a LAN URL — set `VITE_PUBLIC_APP_ORIGIN` (e.g. http://192.168.1.5:5173).
 */
export function getAppOriginForLinks(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
