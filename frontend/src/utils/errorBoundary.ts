/**
 * 错误边界 + 降级策略工具
 * Error Boundary & Fallback Utilities
 *
 * 全局错误捕获、错误分类、降级渲染、错误上报
 */

export type ErrorCategory = 'network' | 'render' | 'data' | 'permission' | 'unknown';

export interface ErrorInfo {
  category: ErrorCategory;
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  recoverable: boolean;
  retryable: boolean;
}

/**
 * 错误分类器
 */
export function classifyError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (name === 'networkerror' || message.includes('fetch') || message.includes('network') || message.includes('connection')) {
    return 'network';
  }
  if (message.includes('permission') || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'permission';
  }
  if (name === 'typeerror' || name === 'referenceerror' || name === 'syntaxerror') {
    return 'render';
  }
  if (message.includes('parse') || message.includes('invalid') || message.includes('data')) {
    return 'data';
  }
  return 'unknown';
}

/**
 * 构建错误信息
 */
export function buildErrorInfo(error: Error, componentStack?: string): ErrorInfo {
  const category = classifyError(error);
  return {
    category,
    message: error.message,
    stack: error.stack,
    componentStack,
    timestamp: Date.now(),
    recoverable: category === 'network' || category === 'data',
    retryable: category === 'network',
  };
}

/**
 * 错误上报队列
 */
export class ErrorReporter {
  private queue: ErrorInfo[] = [];
  private maxQueue: number;
  private endpoint: string | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(maxQueue: number = 50) {
    this.maxQueue = maxQueue;
  }

  /**
   * 设置上报端点
   */
  setEndpoint(url: string): void {
    this.endpoint = url;
  }

  /**
   * 上报错误
   */
  report(error: Error, componentStack?: string): void {
    const info = buildErrorInfo(error, componentStack);
    this.queue.push(info);
    if (this.queue.length > this.maxQueue) {
      this.queue.shift();
    }
  }

  /**
   * 获取待上报错误
   */
  getQueue(): ErrorInfo[] {
    return [...this.queue];
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * 获取错误统计
   */
  getStats(): Record<ErrorCategory, number> {
    const stats: Record<ErrorCategory, number> = {
      network: 0, render: 0, data: 0, permission: 0, unknown: 0,
    };
    for (const info of this.queue) {
      stats[info.category]++;
    }
    return stats;
  }
}

/**
 * 重试降级策略
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => T | Promise<T>,
  options: { retries?: number; retryDelay?: number } = {}
): Promise<T> {
  const { retries = 2, retryDelay = 1000 } = options;
  let lastError: Error | undefined;

  for (let i = 0; i <= retries; i++) {
    try {
      return await primary();
    } catch (err) {
      lastError = err as Error;
      if (i < retries) {
        await new Promise(r => setTimeout(r, retryDelay * (i + 1)));
      }
    }
  }

  try {
    return await fallback();
  } catch {
    throw lastError;
  }
}

/**
 * 断路降级 - 当错误率过高时使用降级方案
 */
export class CircuitFallback<T> {
  private failures = 0;
  private successes = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private lastFailureTime = 0;

  constructor(
    private primary: () => Promise<T>,
    private fallback: () => T | Promise<T>,
    private threshold: number = 5,
    private resetTimeout: number = 30_000
  ) {}

  async execute(): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half-open';
      } else {
        return this.fallback();
      }
    }

    try {
      const result = await this.primary();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return this.fallback();
    }
  }

  private onSuccess(): void {
    this.successes++;
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }
}
