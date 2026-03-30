/**
 * 高级限流策略测试
 */
import { describe, it, expect } from 'vitest';

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private capacity: number, private refillRate: number, startTokens?: number) {
    this.tokens = startTokens ?? capacity;
    this.lastRefill = 0;
  }

  tryConsume(now: number): boolean {
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  getTokens(): number {
    return this.tokens;
  }
}

class SlidingWindowLog {
  private timestamps: number[] = [];
  constructor(private windowMs: number, private maxRequests: number) {}

  allowRequest(now: number): boolean {
    const windowStart = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t >= windowStart);
    if (this.timestamps.length >= this.maxRequests) return false;
    this.timestamps.push(now);
    return true;
  }

  getCurrentCount(now: number): number {
    const windowStart = now - this.windowMs;
    this.timestamps = this.timestamps.filter(t => t >= windowStart);
    return this.timestamps.length;
  }
}

class LeakyBucket {
  private queue: number[] = [];
  private lastLeak: number;
  constructor(private capacity: number, private leakRatePerSec: number) {
    this.lastLeak = 0;
  }

  tryEnqueue(timestamp: number): boolean {
    this.leak(timestamp);
    if (this.queue.length < this.capacity) {
      this.queue.push(timestamp);
      return true;
    }
    return false;
  }

  private leak(now: number): void {
    const elapsed = (now - this.lastLeak) / 1000;
    const toLeak = Math.floor(elapsed * this.leakRatePerSec);
    this.queue.splice(0, Math.min(toLeak, this.queue.length));
    this.lastLeak = now;
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}

describe('高级限流策略', () => {
  describe('令牌桶', () => {
    it('初始满桶', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.getTokens()).toBe(10);
    });

    it('消耗令牌', () => {
      const bucket = new TokenBucket(5, 1);
      expect(bucket.tryConsume(0)).toBe(true);
      expect(bucket.getTokens()).toBeCloseTo(4);
    });

    it('桶空拒绝', () => {
      const bucket = new TokenBucket(1, 1);
      bucket.tryConsume(0);
      expect(bucket.tryConsume(100)).toBe(false);
    });

    it('令牌恢复', () => {
      const bucket = new TokenBucket(5, 1);
      bucket.tryConsume(0);
      bucket.tryConsume(100);
      expect(bucket.tryConsume(2100)).toBe(true);
    });

    it('桶上限不溢出', () => {
      const bucket = new TokenBucket(5, 100);
      bucket.tryConsume(10000); // long elapsed time
      expect(bucket.getTokens()).toBeLessThanOrEqual(5);
    });
  });

  describe('滑动窗口日志', () => {
    it('窗口内允许请求', () => {
      const limiter = new SlidingWindowLog(1000, 5);
      expect(limiter.allowRequest(0)).toBe(true);
      expect(limiter.allowRequest(100)).toBe(true);
    });

    it('超限拒绝', () => {
      const limiter = new SlidingWindowLog(1000, 2);
      limiter.allowRequest(0);
      limiter.allowRequest(100);
      expect(limiter.allowRequest(200)).toBe(false);
    });

    it('窗口外过期释放', () => {
      const limiter = new SlidingWindowLog(1000, 2);
      limiter.allowRequest(0);
      limiter.allowRequest(100);
      expect(limiter.allowRequest(1100)).toBe(true);
    });

    it('当前计数正确', () => {
      const limiter = new SlidingWindowLog(1000, 10);
      limiter.allowRequest(0);
      limiter.allowRequest(100);
      limiter.allowRequest(200);
      expect(limiter.getCurrentCount(300)).toBe(3);
    });
  });

  describe('漏桶', () => {
    it('队列未满接受', () => {
      const bucket = new LeakyBucket(5, 1);
      expect(bucket.tryEnqueue(0)).toBe(true);
    });

    it('队列满拒绝', () => {
      const bucket = new LeakyBucket(2, 1);
      bucket.tryEnqueue(0);
      bucket.tryEnqueue(100);
      expect(bucket.tryEnqueue(200)).toBe(false);
    });

    it('漏出释放空间', () => {
      const bucket = new LeakyBucket(2, 10); // 10/s 漏出率 = 1 per 100ms
      bucket.tryEnqueue(0);
      bucket.tryEnqueue(50);
      // only 50ms elapsed, floor(0.05*10)=0 leak → still 2 items → reject
      expect(bucket.tryEnqueue(80)).toBe(false);
      // 200ms later = floor(0.28*10)=2 leaks → both drained → accept
      expect(bucket.tryEnqueue(280)).toBe(true);
    });

    it('队列大小跟踪', () => {
      const bucket = new LeakyBucket(10, 1);
      bucket.tryEnqueue(0);
      bucket.tryEnqueue(100);
      expect(bucket.getQueueSize()).toBe(2);
    });
  });
});
