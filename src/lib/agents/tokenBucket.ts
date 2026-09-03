/**
 * Token-Bucket Rate Limiter — Huntflow Crawler Engine
 *
 * Enforces per-domain request spacing and global concurrent limits
 * to prevent 429 rate limits during aggressive multi-board crawls.
 */

export interface TokenBucketOptions {
  capacity: number; // Max burst tokens
  refillRatePerSec: number; // Tokens added per second
}

export class TokenBucket {
  private capacity: number;
  private refillRate: number;
  private tokens: number;
  private lastRefill: number;

  constructor(opts: TokenBucketOptions = { capacity: 5, refillRatePerSec: 2 }) {
    this.capacity = opts.capacity;
    this.refillRate = opts.refillRatePerSec;
    this.tokens = opts.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillRate);
    this.lastRefill = now;
  }

  /** Attempt to consume 1 token immediately */
  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Wait until 1 token is available, then consume it */
  async waitForToken(timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.tryConsume()) return true;
      const waitMs = Math.max(50, Math.min(500, Math.ceil((1 / this.refillRate) * 1000)));
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, waitMs);
      await promise;
    }
    return false;
  }
}

export class DomainRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private defaultOptions: TokenBucketOptions;

  constructor(defaultOptions: TokenBucketOptions = { capacity: 3, refillRatePerSec: 1.5 }) {
    this.defaultOptions = defaultOptions;
  }

  getBucket(domain: string): TokenBucket {
    const key = domain.toLowerCase().trim();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.defaultOptions);
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  async acquire(domain: string, timeoutMs = 10000): Promise<boolean> {
    const bucket = this.getBucket(domain);
    return bucket.waitForToken(timeoutMs);
  }
}

export const globalCrawlerRateLimiter = new DomainRateLimiter({
  capacity: 4,
  refillRatePerSec: 2,
});
