import { describe, it, expect } from 'vitest';

/**
 * 错误处理逻辑测试
 * 错误分类/重试策略/降级/熔断
 */

type ErrorType = 'network' | 'timeout' | 'auth' | 'validation' | 'server' | 'unknown';

interface AppError {
  type: ErrorType;
  message: string;
  code: string;
  statusCode: number;
  retryable: boolean;
  timestamp: number;
  context?: Record<string, any>;
}

function classifyError(statusCode: number, message: string): AppError {
  let type: ErrorType = 'unknown';
  let retryable = false;
  if (statusCode === 401 || statusCode === 403) { type = 'auth'; retryable = false; }
  else if (statusCode === 408 || statusCode === 504 || message.includes('timeout')) { type = 'timeout'; retryable = true; }
  else if (statusCode === 429) { type = 'server'; retryable = true; }
  else if (statusCode >= 500) { type = 'server'; retryable = true; }
  else if (statusCode >= 400) { type = 'validation'; retryable = false; }
  else if (message.includes('network') || message.includes('ECONNREFUSED')) { type = 'network'; retryable = true; }
  return { type, message, code: `ERR_${type.toUpperCase()}`, statusCode, retryable, timestamp: Date.now() };
}

function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const try_ = () => {
      fn().then(resolve).catch(err => {
        attempt++;
        if (attempt >= maxRetries) { reject(err); return; }
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 100;
        setTimeout(try_, delay);
      });
    };
    try_();
  });
}

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private threshold: number;
  private resetTimeout: number;

  constructor(threshold = 5, resetTimeout = 30000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }

  canExecute(now: number): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (now - this.lastFailure > this.resetTimeout) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(now: number): void {
    this.failures++;
    this.lastFailure = now;
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): string { return this.state; }
}

function createFallback<T>(primary: () => T, fallback: () => T, predicate?: (err: any) => boolean): () => T {
  return () => {
    try {
      return primary();
    } catch (err) {
      if (predicate && !predicate(err)) throw err;
      return fallback();
    }
  };
}

function formatErrorForUser(error: AppError): string {
  switch (error.type) {
    case 'auth': return '请重新登录';
    case 'timeout': return '请求超时，请稍后重试';
    case 'network': return '网络连接异常，请检查网络';
    case 'validation': return '输入数据有误，请检查';
    case 'server': return '服务器繁忙，请稍后重试';
    default: return '未知错误，请联系客服';
  }
}

describe('错误处理逻辑', () => {
  describe('classifyError', () => {
    it('should classify auth errors', () => {
      const err = classifyError(401, 'Unauthorized');
      expect(err.type).toBe('auth');
      expect(err.retryable).toBe(false);
    });

    it('should classify timeout errors', () => {
      const err = classifyError(504, 'Gateway timeout');
      expect(err.type).toBe('timeout');
      expect(err.retryable).toBe(true);
    });

    it('should classify server errors as retryable', () => {
      const err = classifyError(500, 'Internal error');
      expect(err.type).toBe('server');
      expect(err.retryable).toBe(true);
    });

    it('should classify validation errors', () => {
      const err = classifyError(400, 'Bad request');
      expect(err.type).toBe('validation');
      expect(err.retryable).toBe(false);
    });

    it('should classify 429 as retryable', () => {
      const err = classifyError(429, 'Rate limited');
      expect(err.retryable).toBe(true);
    });
  });

  describe('CircuitBreaker', () => {
    it('should start closed', () => {
      const cb = new CircuitBreaker();
      expect(cb.getState()).toBe('closed');
      expect(cb.canExecute(1000)).toBe(true);
    });

    it('should open after threshold', () => {
      const cb = new CircuitBreaker(3);
      cb.recordFailure(1000);
      cb.recordFailure(2000);
      cb.recordFailure(3000);
      expect(cb.getState()).toBe('open');
      expect(cb.canExecute(4000)).toBe(false);
    });

    it('should half-open after timeout', () => {
      const cb = new CircuitBreaker(3, 5000);
      cb.recordFailure(1000);
      cb.recordFailure(2000);
      cb.recordFailure(3000);
      expect(cb.canExecute(9000)).toBe(true);
    });

    it('should close on success', () => {
      const cb = new CircuitBreaker(3);
      cb.recordFailure(1000);
      cb.recordFailure(2000);
      cb.recordFailure(3000);
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('createFallback', () => {
    it('should use primary when succeeds', () => {
      const fn = createFallback(() => 'primary', () => 'fallback');
      expect(fn()).toBe('primary');
    });

    it('should use fallback when primary fails', () => {
      const fn = createFallback(() => { throw new Error('fail'); }, () => 'fallback');
      expect(fn()).toBe('fallback');
    });
  });

  describe('formatErrorForUser', () => {
    it('should return user-friendly messages', () => {
      expect(formatErrorForUser(classifyError(401, ''))).toBe('请重新登录');
      expect(formatErrorForUser(classifyError(500, ''))).toBe('服务器繁忙，请稍后重试');
      expect(formatErrorForUser(classifyError(408, ''))).toBe('请求超时，请稍后重试');
    });
  });
});
