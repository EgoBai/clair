/**
 * API速率限制中间件
 * Rate Limiter Middleware
 *
 * 滑动窗口限流、IP/用户级别限制、自适应限流
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (identifier: string) => string;
  skipSuccessfulRequests?: boolean;
  headers?: boolean;
}

export interface RateLimitState {
  key: string;
  count: number;
  resetAt: number;
  remaining: number;
}

export interface RateLimitResult {
  allowed: boolean;
  state: RateLimitState;
  retryAfter?: number;
}

interface WindowEntry {
  timestamps: number[];
}

/**
 * 滑动窗口速率限制器
 */
export class SlidingWindowRateLimiter {
  private windows: Map<string, WindowEntry> = new Map();
  private readonly config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: 60_000,
      maxRequests: 100,
      headers: true,
      ...config,
    };
  }

  /**
   * 检查请求是否允许
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.windows.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(key, entry);
    }

    // 清理过期时间戳
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    const count = entry.timestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - count);
    const allowed = count < this.config.maxRequests;

    if (allowed) {
      entry.timestamps.push(now);
    }

    const resetAt = entry.timestamps.length > 0
      ? entry.timestamps[0] + this.config.windowMs
      : now + this.config.windowMs;

    return {
      allowed,
      state: { key, count: allowed ? count + 1 : count, resetAt, remaining: allowed ? remaining - 1 : remaining },
      retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  }

  /**
   * 获取当前状态
   */
  getState(key: string): RateLimitState | null {
    const entry = this.windows.get(key);
    if (!entry) return null;

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const count = entry.timestamps.filter(t => t > windowStart).length;
    const resetAt = entry.timestamps.length > 0 ? entry.timestamps[0] + this.config.windowMs : now;

    return {
      key,
      count,
      resetAt,
      remaining: Math.max(0, this.config.maxRequests - count),
    };
  }

  /**
   * 重置某key的限制
   */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /**
   * 清理所有过期窗口
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.windows) {
      entry.timestamps = entry.timestamps.filter(t => t > now - this.config.windowMs);
      if (entry.timestamps.length === 0) {
        this.windows.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 获取所有活跃key的统计
   */
  getStats(): { totalKeys: number; totalRequests: number } {
    const now = Date.now();
    let totalRequests = 0;
    for (const entry of this.windows.values()) {
      totalRequests += entry.timestamps.filter(t => t > now - this.config.windowMs).length;
    }
    return { totalKeys: this.windows.size, totalRequests };
  }
}

/**
 * 固定窗口速率限制器（更省内存）
 */
export class FixedWindowRateLimiter {
  private counters: Map<string, { count: number; windowStart: number }> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60_000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;

    let counter = this.counters.get(key);
    if (!counter || counter.windowStart < windowStart) {
      counter = { count: 0, windowStart };
      this.counters.set(key, counter);
    }

    const allowed = counter.count < this.maxRequests;
    if (allowed) counter.count++;

    const resetAt = windowStart + this.windowMs;
    return {
      allowed,
      state: {
        key,
        count: counter.count,
        resetAt,
        remaining: Math.max(0, this.maxRequests - counter.count),
      },
      retryAfter: allowed ? undefined : Math.ceil((resetAt - now) / 1000),
    };
  }

  reset(key: string): void {
    this.counters.delete(key);
  }
}

/**
 * 令牌桶限流器
 */
export class TokenBucketLimiter {
  private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per ms

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSecond / 1000;
  }

  check(key: string, tokens: number = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // 补充令牌
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillRate);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= tokens;
    if (allowed) bucket.tokens -= tokens;

    const deficit = allowed ? 0 : tokens - bucket.tokens;
    const retryAfter = allowed ? undefined : Math.ceil(deficit / this.refillRate / 1000);

    return {
      allowed,
      state: {
        key,
        count: Math.floor(this.capacity - bucket.tokens),
        resetAt: now + (this.capacity / this.refillRate),
        remaining: Math.floor(bucket.tokens),
      },
      retryAfter,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

/**
 * 多级限流组合器
 */
export class MultiTierRateLimiter {
  private limiters: Array<{ name: string; limiter: SlidingWindowRateLimiter | FixedWindowRateLimiter }>;

  constructor() {
    this.limiters = [];
  }

  addTier(name: string, limiter: SlidingWindowRateLimiter | FixedWindowRateLimiter): this {
    this.limiters.push({ name, limiter });
    return this;
  }

  check(key: string): RateLimitResult & { blockedBy?: string } {
    for (const { name, limiter } of this.limiters) {
      const result = limiter.check(key);
      if (!result.allowed) {
        return { ...result, blockedBy: name };
      }
    }
    return {
      allowed: true,
      state: { key, count: 0, resetAt: 0, remaining: Infinity },
    };
  }
}
