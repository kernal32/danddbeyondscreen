const base = import.meta.env.VITE_API_BASE ?? '';

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  let message = text.trim() || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as { error?: string };
    if (typeof j?.error === 'string') message = j.error;
  } catch {
    /* keep message */
  }
  throw new ApiHttpError(message, res.status);
}

export async function apiPost<T>(path: string, body?: unknown, auth?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body !== undefined ? body : {}),
  });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, auth?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${base}${path}`, { headers });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown, auth: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown, auth: string): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string, auth: string): Promise<void> {
  const res = await fetch(`${base}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${auth}` },
  });
  await throwIfNotOk(res);
}

/** POST with arbitrary headers (e.g. DM token + X-User-Authorization). */
export async function apiPostWithHeaders<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
}
