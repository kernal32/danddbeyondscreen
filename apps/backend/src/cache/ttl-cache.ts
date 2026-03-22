export class TtlCache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(private defaultTtlMs: number) {}

  get(key: string): T | undefined {
    const row = this.store.get(key);
    if (!row) return undefined;
    if (Date.now() > row.expires) {
      this.store.delete(key);
      return undefined;
    }
    return row.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, { value, expires: Date.now() + ttl });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}
