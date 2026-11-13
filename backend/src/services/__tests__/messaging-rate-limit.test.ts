import { describe, expect, it } from "vitest";
import { createSlidingWindowLimiter } from "../messaging-rate-limit.service";

describe("createSlidingWindowLimiter", () => {
  it("rejects the next event for a key and reports when its oldest event expires", () => {
    let now = 0;
    const limiter = createSlidingWindowLimiter({ limit: 2, windowMs: 60_000, now: () => now });

    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1")).toEqual({ allowed: false, retryAfterSeconds: 60 });

    now = 60_000;
    expect(limiter.consume("user-1").allowed).toBe(true);
  });

  it("keeps limits isolated to each key", () => {
    const limiter = createSlidingWindowLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });

    expect(limiter.consume("customer-1").allowed).toBe(true);
    expect(limiter.consume("customer-2").allowed).toBe(true);
  });

  it("evicts stale one-off keys before admitting later traffic", () => {
    let now = 0;
    const limiter = createSlidingWindowLimiter({ limit: 1, windowMs: 60_000, maxKeys: 20, now: () => now });

    for (let index = 0; index < 10; index += 1) {
      expect(limiter.consume(`customer-${index}`).allowed).toBe(true);
    }
    expect(limiter.activeKeyCount()).toBe(10);

    now = 60_001;
    expect(limiter.consume("customer-fresh").allowed).toBe(true);
    expect(limiter.activeKeyCount()).toBe(1);
  });

  it("denies overflow until a full active key window expires", () => {
    let now = 0;
    const limiter = createSlidingWindowLimiter({ limit: 2, windowMs: 60_000, maxKeys: 2, now: () => now });

    expect(limiter.consume("customer-1").allowed).toBe(true);
    now = 50_000;
    expect(limiter.consume("customer-1").allowed).toBe(true);
    expect(limiter.consume("customer-2").allowed).toBe(true);
    expect(limiter.consume("customer-1")).toEqual({ allowed: false, retryAfterSeconds: 10 });
    expect(limiter.consume("customer-3")).toEqual({ allowed: false, retryAfterSeconds: 60 });

    expect(limiter.activeKeyCount()).toBe(2);
    now = 60_000;
    expect(limiter.consume("customer-3")).toEqual({ allowed: false, retryAfterSeconds: 50 });

    now = 110_000;
    expect(limiter.consume("customer-3").allowed).toBe(true);
  });
});
