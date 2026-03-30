/**
 * API Rate Limiter
 * 前端API请求限流 - 滑动窗口 + 令牌桶
 */

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
  queueMaxSize: number;
  retryAfter: number;
}

export interface QueuedRequest {
  id: string;
  execute: () => Promise<unknown>;
  priority: number;
  timestamp: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class SlidingWindowLimiter {
  private requests: number[] = [];
  private config: RateLimiterConfig;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxRequests: 60,
      windowMs: 60000,
      queueMaxSize: 100,
      retryAfter: 1000,
      ...config,
    };
  }

  private cleanOldRequests(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    this.requests = this.requests.filter(t => t > cutoff);
  }

  canProceed(): boolean {
    this.cleanOldRequests();
    return this.requests.length < this.config.maxRequests;
  }

  recordRequest(): boolean {
    if (!this.canProceed()) return false;
    this.requests.push(Date.now());
    return true;
  }

  getRemainingRequests(): number {
    this.cleanOldRequests();
    return Math.max(0, this.config.maxRequests - this.requests.length);
  }

  getResetTime(): number {
    if (this.requests.length === 0) return 0;
    return Math.max(0, this.requests[0] + this.config.windowMs - Date.now());
  }
}

export class TokenBucketLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per ms

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
    this.refillRate = refillRatePerSecond / 1000;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  getWaitTime(count = 1): number {
    this.refill();
    if (this.tokens >= count) return 0;
    const needed = count - this.tokens;
    return Math.ceil(needed / this.refillRate);
  }
}

export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private limiter: SlidingWindowLimiter;
  private processing: boolean = false;
  private idCounter: number = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.limiter = new SlidingWindowLimiter(config);
  }

  enqueue<T>(
    execute: () => Promise<T>,
    priority: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: `req_${++this.idCounter}`,
        execute,
        priority,
        timestamp: Date.now(),
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      // Insert sorted by priority (higher first)
      const insertIdx = this.queue.findIndex(r => r.priority < priority);
      if (insertIdx === -1) {
        this.queue.push(request);
      } else {
        this.queue.splice(insertIdx, 0, request);
      }

      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (!this.limiter.canProceed()) {
        await this.delay(this.limiter.getResetTime() || 1000);
        continue;
      }

      const request = this.queue.shift()!;
      this.limiter.recordRequest();

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }

    this.processing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, Math.min(ms, 5000)));
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear(): void {
    const err = new Error('Queue cleared');
    this.queue.forEach(r => r.reject(err));
    this.queue = [];
  }

  getStats(): { queueSize: number; remaining: number; resetIn: number } {
    return {
      queueSize: this.queue.length,
      remaining: this.limiter.getRemainingRequests(),
      resetIn: this.limiter.getResetTime(),
    };
  }
}

export const stockApiLimiter = new RequestQueue({ maxRequests: 30, windowMs: 60000 });
export const generalApiLimiter = new RequestQueue({ maxRequests: 60, windowMs: 60000 });
