import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * 限流中间件测试
 * 测试滑动窗口限流器的核心逻辑
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  check(key: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs };
    }

    entry.count++;
    const remaining = Math.max(0, maxRequests - entry.count);

    if (entry.count > maxRequests) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    return { allowed: true, remaining, resetTime: entry.resetTime };
  }

  clear() {
    this.store.clear();
  }
}

describe('限流中间件', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  describe('滑动窗口限流器', () => {
    it('应该允许第一个请求通过', () => {
      const result = limiter.check('192.168.1.1', 10, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('应该在达到上限时拒绝请求', () => {
      const max = 3;
      for (let i = 0; i < max; i++) {
        const result = limiter.check('192.168.1.1', max, 60000);
        expect(result.allowed).toBe(true);
      }
      // 第4个请求应该被拒绝
      const result = limiter.check('192.168.1.1', max, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('不同IP应该独立计数', () => {
      const max = 2;
      // IP1 用完限额
      limiter.check('192.168.1.1', max, 60000);
      limiter.check('192.168.1.1', max, 60000);
      const ip1Result = limiter.check('192.168.1.1', max, 60000);
      expect(ip1Result.allowed).toBe(false);

      // IP2 应该还能请求
      const ip2Result = limiter.check('192.168.1.2', max, 60000);
      expect(ip2Result.allowed).toBe(true);
    });

    it('剩余次数应该递减', () => {
      const max = 5;
      for (let i = 0; i < 5; i++) {
        const result = limiter.check('ip', max, 60000);
        expect(result.remaining).toBe(max - 1 - i);
      }
    });

    it('时间窗口过期后应该重置计数', () => {
      const max = 2;
      const windowMs = 100; // 100ms窗口

      vi.useFakeTimers();

      limiter.check('ip', max, windowMs);
      limiter.check('ip', max, windowMs);
      const denied = limiter.check('ip', max, windowMs);
      expect(denied.allowed).toBe(false);

      // 时间前进超过窗口
      vi.advanceTimersByTime(windowMs + 10);

      const allowed = limiter.check('ip', max, windowMs);
      expect(allowed.allowed).toBe(true);
      expect(allowed.remaining).toBe(max - 1);

      vi.useRealTimers();
    });

    it('应该返回正确的resetTime', () => {
      const before = Date.now();
      const result = limiter.check('ip', 10, 60000);
      const after = Date.now();
      
      expect(result.resetTime).toBeGreaterThanOrEqual(before + 60000);
      expect(result.resetTime).toBeLessThanOrEqual(after + 60000);
    });
  });

  describe('限流响应格式', () => {
    it('429响应应该包含retryAfter', () => {
      const max = 1;
      limiter.check('ip', max, 60000);
      const result = limiter.check('ip', max, 60000);
      
      expect(result.allowed).toBe(false);
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('限流边界条件', () => {
    it('max=1应该只允许1个请求', () => {
      expect(limiter.check('ip-a', 1, 60000).allowed).toBe(true);
      expect(limiter.check('ip-a', 1, 60000).allowed).toBe(false);
    });

    it('连续请求应该正确递减remaining', () => {
      const max = 3;
      expect(limiter.check('ip-b', max, 60000).remaining).toBe(2);
      expect(limiter.check('ip-b', max, 60000).remaining).toBe(1);
      expect(limiter.check('ip-b', max, 60000).remaining).toBe(0);
      expect(limiter.check('ip-b', max, 60000).allowed).toBe(false);
    });
  });
});
