/** Simple fixed-window rate limiter per key (e.g. ingest token hash). */
export class IngestRateLimiter {
  private buckets = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxPerWindow: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (b.count >= this.maxPerWindow) return false;
    b.count += 1;
    return true;
  }
}
