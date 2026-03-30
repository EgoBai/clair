import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlidingWindowLimiter, TokenBucketLimiter, RequestQueue } from '../services/rateLimiter';

describe('SlidingWindowLimiter', () => {
  let limiter: SlidingWindowLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  it('should allow requests within limit', () => {
    expect(limiter.canProceed()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canProceed()).toBe(true);
    limiter.recordRequest();
    expect(limiter.canProceed()).toBe(true);
    limiter.recordRequest();
  });

  it('should block requests over limit', () => {
    limiter.recordRequest();
    limiter.recordRequest();
    limiter.recordRequest();
    expect(limiter.canProceed()).toBe(false);
    expect(limiter.recordRequest()).toBe(false);
  });

  it('should allow requests after window expires', () => {
    vi.useFakeTimers();
    limiter.recordRequest();
    limiter.recordRequest();
    limiter.recordRequest();
    expect(limiter.canProceed()).toBe(false);
    vi.advanceTimersByTime(1100);
    expect(limiter.canProceed()).toBe(true);
    vi.useRealTimers();
  });

  it('should track remaining requests', () => {
    expect(limiter.getRemainingRequests()).toBe(3);
    limiter.recordRequest();
    expect(limiter.getRemainingRequests()).toBe(2);
  });

  it('should calculate reset time', () => {
    vi.useFakeTimers();
    limiter.recordRequest();
    const resetTime = limiter.getResetTime();
    expect(resetTime).toBeGreaterThan(0);
    expect(resetTime).toBeLessThanOrEqual(1000);
    vi.useRealTimers();
  });

  it('should return 0 reset time when empty', () => {
    expect(limiter.getResetTime()).toBe(0);
  });
});

describe('TokenBucketLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with full tokens', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    expect(bucket.getAvailableTokens()).toBe(10);
  });

  it('should consume tokens', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    expect(bucket.tryConsume(3)).toBe(true);
    expect(bucket.getAvailableTokens()).toBe(7);
  });

  it('should reject when not enough tokens', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    expect(bucket.tryConsume(10)).toBe(true);
    expect(bucket.tryConsume(1)).toBe(false);
  });

  it('should refill tokens over time', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    bucket.tryConsume(10);
    expect(bucket.getAvailableTokens()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(bucket.getAvailableTokens()).toBe(5);
  });

  it('should not exceed max tokens', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    vi.advanceTimersByTime(5000);
    expect(bucket.getAvailableTokens()).toBe(10);
  });

  it('should calculate wait time', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    bucket.tryConsume(10);
    expect(bucket.getWaitTime(1)).toBeGreaterThan(0);
  });

  it('should return 0 wait time when tokens available', () => {
    const bucket = new TokenBucketLimiter(10, 5);
    expect(bucket.getWaitTime()).toBe(0);
  });
});

describe('RequestQueue', () => {
  it('should execute requests sequentially', async () => {
    const queue = new RequestQueue({ maxRequests: 100, windowMs: 1000 });
    const results: number[] = [];

    const p1 = queue.enqueue(async () => { results.push(1); return 1; });
    const p2 = queue.enqueue(async () => { results.push(2); return 2; });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(results).toEqual([1, 2]);
  });

  it('should report queue stats', () => {
    const queue = new RequestQueue({ maxRequests: 10, windowMs: 1000 });
    const stats = queue.getStats();
    expect(stats.queueSize).toBe(0);
    expect(stats.remaining).toBe(10);
  });

  it('should clear queue and reject pending', async () => {
    const queue = new RequestQueue({ maxRequests: 0, windowMs: 60000 });
    const handler = vi.fn();
    const p = queue.enqueue(async () => 'x');
    p.catch(handler);
    expect(queue.getQueueSize()).toBe(1);
    queue.clear();
    expect(queue.getQueueSize()).toBe(0);
    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it('should report queue size', async () => {
    const queue = new RequestQueue({ maxRequests: 0, windowMs: 60000 });
    const p1 = queue.enqueue(async () => 'x').catch(() => {});
    const p2 = queue.enqueue(async () => 'y').catch(() => {});
    expect(queue.getQueueSize()).toBe(2);
    queue.clear();
    await Promise.allSettled([p1, p2]);
  });

  it('should handle async errors gracefully', async () => {
    const queue = new RequestQueue({ maxRequests: 100, windowMs: 1000 });
    await expect(
      queue.enqueue(async () => { throw new Error('fail'); })
    ).rejects.toThrow('fail');
  });
});
