import { describe, it, expect, beforeEach, vi } from 'vitest';

// Rate limiter implementations
class TokenBucketLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per ms

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

class SlidingWindowLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowSize: number;
  private maxRequests: number;

  constructor(windowSizeMs: number, maxRequests: number) {
    this.windowSize = windowSizeMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string, now = Date.now()): boolean {
    const timestamps = this.requests.get(key) || [];
    const windowStart = now - this.windowSize;
    const validRequests = timestamps.filter(t => t > windowStart);
    
    if (validRequests.length >= this.maxRequests) {
      this.requests.set(key, validRequests);
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  getRequestCount(key: string, now = Date.now()): number {
    const timestamps = this.requests.get(key) || [];
    const windowStart = now - this.windowSize;
    return timestamps.filter(t => t > windowStart).length;
  }

  reset(key: string): void {
    this.requests.delete(key);
  }

  resetAll(): void {
    this.requests.clear();
  }
}

class FixedWindowLimiter {
  private windows: Map<string, { start: number; count: number }> = new Map();
  private windowSize: number;
  private maxRequests: number;

  constructor(windowSizeMs: number, maxRequests: number) {
    this.windowSize = windowSizeMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string, now = Date.now()): boolean {
    const windowStart = Math.floor(now / this.windowSize) * this.windowSize;
    const window = this.windows.get(key);

    if (!window || window.start !== windowStart) {
      this.windows.set(key, { start: windowStart, count: 1 });
      return true;
    }

    if (window.count >= this.maxRequests) {
      return false;
    }

    window.count++;
    return true;
  }

  getCount(key: string): number {
    return this.windows.get(key)?.count || 0;
  }
}

describe('Rate Limiter 深度测试', () => {
  describe('TokenBucketLimiter', () => {
    let limiter: TokenBucketLimiter;

    beforeEach(() => {
      limiter = new TokenBucketLimiter(10, 1); // 10 tokens, 1/sec refill
    });

    it('应该允许在token充足时消费', () => {
      expect(limiter.tryConsume(1)).toBe(true);
      expect(limiter.tryConsume(5)).toBe(true);
    });

    it('应该在token不足时拒绝', () => {
      limiter.tryConsume(10);
      expect(limiter.tryConsume(1)).toBe(false);
    });

    it('应该返回当前可用token数', () => {
      limiter.tryConsume(3);
      expect(limiter.getAvailableTokens()).toBe(7);
    });

    it('应该支持批量消费', () => {
      expect(limiter.tryConsume(10)).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(0);
    });

    it('超过容量的批量消费应该失败', () => {
      expect(limiter.tryConsume(11)).toBe(false);
    });

    it('token不应该超过容量', () => {
      const smallLimiter = new TokenBucketLimiter(5, 100);
      // 等价于1秒后
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
      expect(smallLimiter.getAvailableTokens()).toBe(5);
      vi.restoreAllMocks();
    });
  });

  describe('SlidingWindowLimiter', () => {
    let limiter: SlidingWindowLimiter;

    beforeEach(() => {
      limiter = new SlidingWindowLimiter(60000, 5); // 5 req/min
    });

    it('应该在窗口内限制请求', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('user1', now)).toBe(true);
      }
      expect(limiter.isAllowed('user1', now)).toBe(false);
    });

    it('不同key独立计数', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('user1', now);
      }
      expect(limiter.isAllowed('user1', now)).toBe(false);
      expect(limiter.isAllowed('user2', now)).toBe(true);
    });

    it('窗口滑动后应该允许新请求', () => {
      const t0 = Date.now();
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('user1', t0);
      }
      expect(limiter.isAllowed('user1', t0)).toBe(false);
      // 61秒后窗口滑动
      expect(limiter.isAllowed('user1', t0 + 61000)).toBe(true);
    });

    it('应该正确计数窗口内请求', () => {
      const now = Date.now();
      limiter.isAllowed('user1', now);
      limiter.isAllowed('user1', now + 1000);
      limiter.isAllowed('user1', now + 2000);
      expect(limiter.getRequestCount('user1', now + 3000)).toBe(3);
    });

    it('应该重置单个key', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed('user1', now);
      }
      limiter.reset('user1');
      expect(limiter.isAllowed('user1', now)).toBe(true);
    });

    it('应该重置所有key', () => {
      const now = Date.now();
      limiter.isAllowed('user1', now);
      limiter.isAllowed('user2', now);
      limiter.resetAll();
      expect(limiter.getRequestCount('user1', now)).toBe(0);
      expect(limiter.getRequestCount('user2', now)).toBe(0);
    });

    it('边界:刚好在窗口边界', () => {
      const t0 = 1000000;
      limiter.isAllowed('u', t0);
      // 正好在60秒边界
      expect(limiter.isAllowed('u', t0 + 60000)).toBe(true);
      // 刚刚过60秒
      expect(limiter.getRequestCount('u', t0 + 60001)).toBe(1);
    });

    it('应该处理高频请求', () => {
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        limiter.isAllowed('user1', now + i * 10);
      }
      expect(limiter.getRequestCount('user1', now + 1000)).toBe(5); // 只有前5个在窗口内
    });
  });

  describe('FixedWindowLimiter', () => {
    let limiter: FixedWindowLimiter;

    beforeEach(() => {
      limiter = new FixedWindowLimiter(60000, 3); // 3 req per minute
    });

    it('应该在固定窗口内限制', () => {
      const now = 120000; // 2分钟整
      expect(limiter.isAllowed('u', now)).toBe(true);
      expect(limiter.isAllowed('u', now)).toBe(true);
      expect(limiter.isAllowed('u', now)).toBe(true);
      expect(limiter.isAllowed('u', now)).toBe(false);
    });

    it('新窗口重置计数', () => {
      const w1 = 120000; // 窗口1
      const w2 = 180000; // 窗口2
      limiter.isAllowed('u', w1);
      limiter.isAllowed('u', w1);
      limiter.isAllowed('u', w1);
      expect(limiter.isAllowed('u', w1)).toBe(false);
      expect(limiter.isAllowed('u', w2)).toBe(true);
    });

    it('不同key独立计数', () => {
      const now = 120000;
      limiter.isAllowed('a', now);
      limiter.isAllowed('a', now);
      limiter.isAllowed('a', now);
      expect(limiter.isAllowed('a', now)).toBe(false);
      expect(limiter.isAllowed('b', now)).toBe(true);
    });

    it('应该正确返回当前窗口计数', () => {
      const now = 120000;
      limiter.isAllowed('u', now);
      limiter.isAllowed('u', now);
      expect(limiter.getCount('u')).toBe(2);
    });

    it('窗口边界精确测试', () => {
      // 60秒窗口，0-59999是一个窗口
      expect(limiter.isAllowed('u', 0)).toBe(true);
      expect(limiter.isAllowed('u', 59999)).toBe(true);
      expect(limiter.isAllowed('u', 60000)).toBe(true); // 新窗口
    });
  });

  describe('组合场景', () => {
    it('多层限流: 用户级 + IP级', () => {
      const userLimit = new SlidingWindowLimiter(60000, 10);
      const ipLimit = new SlidingWindowLimiter(60000, 50);
      const now = Date.now();

      // 模拟5个不同用户从同一IP访问
      let ipCount = 0;
      for (let u = 0; u < 5; u++) {
        for (let r = 0; r < 10; r++) {
          const userOk = userLimit.isAllowed(`user${u}`, now);
          const ipOk = ipLimit.isAllowed('ip1', now);
          if (userOk && ipOk) ipCount++;
        }
      }
      expect(ipCount).toBeLessThanOrEqual(50);
    });

    it('优先级: VIP用户更高限额', () => {
      const normalLimit = new SlidingWindowLimiter(60000, 5);
      const vipLimit = new SlidingWindowLimiter(60000, 20);
      const now = Date.now();

      const checkLimit = (userId: string, isVip: boolean) => {
        return isVip ? vipLimit.isAllowed(userId, now) : normalLimit.isAllowed(userId, now);
      };

      // 普通用户5次就满了
      for (let i = 0; i < 5; i++) checkLimit('normal', false);
      expect(checkLimit('normal', false)).toBe(false);

      // VIP可以20次
      for (let i = 0; i < 20; i++) expect(checkLimit('vip', true)).toBe(true);
      expect(checkLimit('vip', true)).toBe(false);
    });
  });
});
