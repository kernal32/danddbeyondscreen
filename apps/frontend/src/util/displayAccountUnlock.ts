import { apiPost, ApiHttpError } from '../api';
import { USER_TOKEN_KEY } from '../auth-storage';

/**
 * If the browser has a user JWT and this display session was created while that user was signed in,
 * the server returns the current pin revision (same as entering the 4-digit code).
 */
export async function tryDisplayUnlockWithAccount(
  displayToken: string,
): Promise<{ displayPinRevision: number } | null> {
  let userTok: string | null = null;
  try {
    userTok = localStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
  if (!userTok) return null;
  try {
    return await apiPost<{ ok: true; displayPinRevision: number }>(
      `/api/public/display/${displayToken}/unlock-account`,
      {},
      userTok,
    );
  } catch (e) {
    if (e instanceof ApiHttpError) return null;
    throw e;
  }
}
