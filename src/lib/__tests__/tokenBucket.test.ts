import { describe, it, expect } from "vitest";
import { TokenBucket, DomainRateLimiter } from "../agents/tokenBucket";

describe("Token-Bucket Rate Limiter", () => {
  it("allows immediate consumption within burst capacity", () => {
    const bucket = new TokenBucket({ capacity: 3, refillRatePerSec: 1 });

    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false); // Exhausted
  });

  it("manages separate buckets per domain in DomainRateLimiter", async () => {
    const limiter = new DomainRateLimiter({ capacity: 2, refillRatePerSec: 2 });

    const allowedGreenhouse1 = await limiter.acquire("boards.greenhouse.io");
    const allowedGreenhouse2 = await limiter.acquire("boards.greenhouse.io");
    expect(allowedGreenhouse1).toBe(true);
    expect(allowedGreenhouse2).toBe(true);

    // Independent domain has its own bucket
    const allowedLever = await limiter.acquire("jobs.lever.co");
    expect(allowedLever).toBe(true);
  });
});
