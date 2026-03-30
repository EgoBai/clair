/**
 * Retry Utility
 * 重试工具 - 带退避策略的请求重试
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  jitter: boolean;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  jitter: true,
  retryCondition: () => true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const result = await fn();
      return {
        result,
        attempts: attempt + 1,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error as Error;

      if (attempt >= cfg.maxRetries) break;
      if (cfg.retryCondition && !cfg.retryCondition(lastError)) break;

      const delay = calculateDelay(attempt, cfg);
      cfg.onRetry?.(attempt + 1, lastError, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelay * Math.pow(config.backoffFactor, attempt);
  const capped = Math.min(exponential, config.maxDelay);

  if (config.jitter) {
    // Full jitter
    return capped * (0.5 + Math.random() * 0.5);
  }

  return capped;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Circuit Breaker
 * 熔断器 - 防止级联故障
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitorInterval: number;
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successesInHalfOpen: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitorInterval: 5000,
      ...config,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.transitionTo('half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successesInHalfOpen++;
      if (this.successesInHalfOpen >= 3) {
        this.transitionTo('closed');
        this.failures = 0;
        this.successesInHalfOpen = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successesInHalfOpen = 0;

    if (this.state === 'half-open') {
      this.transitionTo('open');
    } else if (this.failures >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    const old = this.state;
    this.state = newState;
    this.config.onStateChange?.(old, newState);
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successesInHalfOpen = 0;
  }
}

/**
 * Bulkhead - concurrency limiter
 * 舱壁模式 - 并发限制器
 */
export class Bulkhead {
  private active: number = 0;
  private queue: Array<{ resolve: () => void }> = [];
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;

  constructor(maxConcurrent: number, maxQueue: number = Infinity) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        throw new Error('Bulkhead queue full');
      }
      await new Promise<void>(resolve => this.queue.push({ resolve }));
    }

    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next.resolve();
    }
  }

  getActiveCount(): number {
    return this.active;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
