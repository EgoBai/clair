import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SlidingWindowRateLimiter,
  FixedWindowRateLimiter,
  TokenBucketLimiter,
  MultiTierRateLimiter,
} from '../middleware/rateLimiter';

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxRequests: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests within limit', () => {
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('should block requests exceeding limit', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    const result = limiter.check('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should track remaining correctly', () => {
    const r1 = limiter.check('user1');
    expect(r1.state.remaining).toBe(2);
    limiter.check('user1');
    const r3 = limiter.check('user1');
    expect(r3.state.remaining).toBe(0);
  });

  it('should allow requests after window expires', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    vi.advanceTimersByTime(1100);
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('should isolate different keys', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    expect(limiter.check('user2').allowed).toBe(true);
  });

  it('should reset key', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);
    limiter.reset('user1');
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('should cleanup expired entries', () => {
    limiter.check('user1');
    vi.advanceTimersByTime(1500);
    const cleaned = limiter.cleanup();
    expect(cleaned).toBeGreaterThan(0);
  });

  it('should return null state for unknown key', () => {
    expect(limiter.getState('unknown')).toBeNull();
  });

  it('should return state for known key', () => {
    limiter.check('user1');
    const state = limiter.getState('user1');
    expect(state).not.toBeNull();
    expect(state!.count).toBe(1);
  });

  it('should get stats', () => {
    limiter.check('user1');
    limiter.check('user2');
    const stats = limiter.getStats();
    expect(stats.totalKeys).toBe(2);
    expect(stats.totalRequests).toBe(2);
  });
});

describe('FixedWindowRateLimiter', () => {
  let limiter: FixedWindowRateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new FixedWindowRateLimiter(1000, 3);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow within limit', () => {
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('should block over limit', () => {
    limiter.check('k');
    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
  });

  it('should reset after window', () => {
    limiter.check('k');
    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('should reset manually', () => {
    limiter.check('k');
    limiter.check('k');
    limiter.check('k');
    limiter.reset('k');
    expect(limiter.check('k').allowed).toBe(true);
  });
});

describe('TokenBucketLimiter', () => {
  let limiter: TokenBucketLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new TokenBucketLimiter(5, 1); // 5 tokens, 1 per second
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow requests when tokens available', () => {
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('should block when no tokens', () => {
    for (let i = 0; i < 5; i++) limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
  });

  it('should refill tokens over time', () => {
    for (let i = 0; i < 5; i++) limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
    vi.advanceTimersByTime(2000); // refill 2 tokens
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(false);
  });

  it('should not exceed capacity', () => {
    vi.advanceTimersByTime(10000); // way more than capacity
    const state = limiter.check('k');
    expect(state.state.remaining).toBeLessThanOrEqual(5);
  });

  it('should reset bucket', () => {
    for (let i = 0; i < 5; i++) limiter.check('k');
    limiter.reset('k');
    expect(limiter.check('k').allowed).toBe(true);
  });
});

describe('MultiTierRateLimiter', () => {
  it('should allow when all tiers allow', () => {
    const multi = new MultiTierRateLimiter();
    multi.addTier('short', new FixedWindowRateLimiter(1000, 10));
    multi.addTier('long', new FixedWindowRateLimiter(60_000, 100));

    expect(multi.check('k').allowed).toBe(true);
  });

  it('should block when any tier blocks', () => {
    const multi = new MultiTierRateLimiter();
    multi.addTier('strict', new FixedWindowRateLimiter(1000, 2));
    multi.addTier('lenient', new FixedWindowRateLimiter(1000, 100));

    multi.check('k');
    multi.check('k');
    const result = multi.check('k');
    expect(result.allowed).toBe(false);
    expect(result.blockedBy).toBe('strict');
  });
});
