/** Simple token bucket: average `rate` acquires per second. */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private rate: number,
    private burst = rate,
  ) {
    this.tokens = burst;
    this.last = Date.now();
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
    if (this.tokens < 1) {
      const wait = ((1 - this.tokens) / this.rate) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      this.tokens = 0;
      this.last = Date.now();
      return;
    }
    this.tokens -= 1;
  }
}
