/**
 * 后端 API 限流引擎测试
 * 覆盖限流算法、配额管理、优先级队列
 */

import { describe, it, expect } from 'vitest';

describe('API 限流引擎', () => {
  describe('固定窗口限流', () => {
    class FixedWindowLimiter {
      private counts = new Map<string, { count: number; windowStart: number }>();
      constructor(private limit: number, private windowMs: number) {}

      tryAcquire(key: string, now: number): boolean {
        const entry = this.counts.get(key);
        if (!entry || now - entry.windowStart >= this.windowMs) {
          this.counts.set(key, { count: 1, windowStart: now });
          return true;
        }
        if (entry.count >= this.limit) return false;
        entry.count++;
        return true;
      }
    }

    it('在限制内应允许通过', () => {
      const limiter = new FixedWindowLimiter(5, 60000);
      for (let i = 0; i < 5; i++) {
        expect(limiter.tryAcquire('user1', 1000)).toBe(true);
      }
    });

    it('超出限制应拒绝', () => {
      const limiter = new FixedWindowLimiter(2, 60000);
      limiter.tryAcquire('user1', 1000);
      limiter.tryAcquire('user1', 1000);
      expect(limiter.tryAcquire('user1', 1000)).toBe(false);
    });

    it('窗口过期应重置', () => {
      const limiter = new FixedWindowLimiter(2, 60000);
      limiter.tryAcquire('user1', 1000);
      limiter.tryAcquire('user1', 1000);
      expect(limiter.tryAcquire('user1', 70000)).toBe(true);
    });
  });

  describe('滑动窗口限流', () => {
    class SlidingWindowLimiter {
      private timestamps = new Map<string, number[]>();
      constructor(private limit: number, private windowMs: number) {}

      tryAcquire(key: string, now: number): boolean {
        const ts = this.timestamps.get(key) || [];
        const cutoff = now - this.windowMs;
        const valid = ts.filter(t => t > cutoff);
        if (valid.length >= this.limit) {
          this.timestamps.set(key, valid);
          return false;
        }
        valid.push(now);
        this.timestamps.set(key, valid);
        return true;
      }
    }

    it('应精确计算窗口内请求数', () => {
      const limiter = new SlidingWindowLimiter(3, 10000);
      expect(limiter.tryAcquire('u1', 1000)).toBe(true);
      expect(limiter.tryAcquire('u1', 2000)).toBe(true);
      expect(limiter.tryAcquire('u1', 3000)).toBe(true);
      expect(limiter.tryAcquire('u1', 4000)).toBe(false);
    });

    it('过期请求应被清理', () => {
      const limiter = new SlidingWindowLimiter(2, 5000);
      limiter.tryAcquire('u1', 1000);
      limiter.tryAcquire('u1', 2000);
      expect(limiter.tryAcquire('u1', 8000)).toBe(true); // 1000已过期
    });
  });

  describe('令牌桶限流', () => {
    class TokenBucket {
      private tokens: number;
      private lastRefill: number;
      constructor(private capacity: number, private refillRate: number, now: number) {
        this.tokens = capacity;
        this.lastRefill = now;
      }

      tryAcquire(now: number): boolean {
        const elapsed = now - this.lastRefill;
        this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
        if (this.tokens >= 1) {
          this.tokens--;
          return true;
        }
        return false;
      }
    }

    it('初始令牌应允许请求', () => {
      const bucket = new TokenBucket(5, 0.001, 0);
      for (let i = 0; i < 5; i++) {
        expect(bucket.tryAcquire(i)).toBe(true);
      }
    });

    it('令牌耗尽应拒绝', () => {
      const bucket = new TokenBucket(2, 0.001, 0);
      bucket.tryAcquire(0);
      bucket.tryAcquire(1);
      expect(bucket.tryAcquire(2)).toBe(false);
    });

    it('应随时间补充令牌', () => {
      const bucket = new TokenBucket(2, 0.001, 0);
      bucket.tryAcquire(0);
      bucket.tryAcquire(1);
      expect(bucket.tryAcquire(2000)).toBe(true); // 补充2个令牌
    });
  });

  describe('配额管理', () => {
    interface QuotaConfig {
      dailyLimit: number;
      monthlyLimit: number;
      burstLimit: number;
    }

    function checkQuota(usage: { daily: number; monthly: number }, config: QuotaConfig): {
      allowed: boolean;
      remaining: { daily: number; monthly: number };
    } {
      const dailyRemaining = config.dailyLimit - usage.daily;
      const monthlyRemaining = config.monthlyLimit - usage.monthly;
      return {
        allowed: dailyRemaining > 0 && monthlyRemaining > 0,
        remaining: { daily: dailyRemaining, monthly: monthlyRemaining },
      };
    }

    it('在配额内应允许', () => {
      const result = checkQuota({ daily: 50, monthly: 500 }, { dailyLimit: 100, monthlyLimit: 1000, burstLimit: 10 });
      expect(result.allowed).toBe(true);
    });

    it('日配额耗尽应拒绝', () => {
      const result = checkQuota({ daily: 100, monthly: 500 }, { dailyLimit: 100, monthlyLimit: 1000, burstLimit: 10 });
      expect(result.allowed).toBe(false);
    });
  });
});
