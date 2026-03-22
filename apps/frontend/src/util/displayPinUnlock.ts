const STORAGE_PREFIX = 'ddb_display_unlock_rev_';

export function readStoredDisplayUnlockRev(displayToken: string): number | null {
  try {
    const v = localStorage.getItem(`${STORAGE_PREFIX}${displayToken}`);
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeStoredDisplayUnlockRev(displayToken: string, revision: number) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${displayToken}`, String(revision));
  } catch {
    /* ignore quota / private mode */
  }
}
