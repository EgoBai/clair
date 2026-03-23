/**
 * 限流中间件
 * 基于内存的滑动窗口限流，防止API滥用
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // 每分钟清理过期条目
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }, 60000);
  }

  /**
   * 检查是否超过限流
   */
  check(key: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // 新窗口
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

  /**
   * 获取客户端标识
   */
  getClientKey(req: Request): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

const limiter = new RateLimiter();

interface RateLimitOptions {
  windowMs?: number;     // 时间窗口（毫秒）
  max?: number;          // 最大请求数
  message?: string;      // 超限消息
  skipPaths?: string[];  // 跳过的路径
}

/**
 * 创建限流中间件
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 60000,  // 默认1分钟
    max = 120,         // 默认120次/分钟
    message = '请求过于频繁，请稍后再试',
    skipPaths = ['/health'],
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // 跳过指定路径
    if (skipPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const key = limiter.getClientKey(req);
    const result = limiter.check(key, max, windowMs);

    // 设置响应头
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter,
      });
    }

    next();
  };
}

/**
 * API 限流（较宽松）
 */
export const apiRateLimit = rateLimit({
  windowMs: 60000,
  max: 120,
  message: 'API请求过于频繁，请稍后再试',
});

/**
 * 数据同步限流（较严格）
 */
export const syncRateLimit = rateLimit({
  windowMs: 60000,
  max: 5,
  message: '数据同步请求过于频繁，请稍后再试',
  skipPaths: [],
});
