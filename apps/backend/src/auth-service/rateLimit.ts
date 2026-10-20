/**
 * In-memory token bucket per client key (one backend process; a demo-sized limiter, not shared across replicas).
 * Each key may burst `capacity` requests and is refilled at `perSecond`.
 */
export class TokenBuckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity = 30,
    private readonly perSecond = 10,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes one token; false when the key is out of tokens (the caller answers 429). */
  take(key: string): boolean {
    const at = this.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at };
    const tokens = Math.min(this.capacity, bucket.tokens + ((at - bucket.at) / 1000) * this.perSecond);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, at });
      return false;
    }
    this.buckets.set(key, { tokens: tokens - 1, at });
    if (this.buckets.size > 10_000) this.prune(at);
    return true;
  }

  /** Seconds until the next token. */
  retryAfter(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    return Math.max(1, Math.ceil((1 - bucket.tokens) / this.perSecond));
  }

  private prune(at: number): void {
    for (const [key, bucket] of this.buckets) {
      if (at - bucket.at > (this.capacity / this.perSecond) * 1000) this.buckets.delete(key);
    }
  }
}
