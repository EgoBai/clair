/**
 * 错误恢复管理器
 * 
 * 职责：
 * - 分级错误处理（L1/L2/L3）
 * - 自动重试 + 指数退避
 * - 优雅降级（缓存 → 模拟数据 → 空状态）
 * - 统一错误上报
 * 
 * 参考：Linear App 错误处理体验
 */

// ==================== 错误分级 ====================

export type ErrorLevel = 'L1' | 'L2' | 'L3';

export interface ErrorContext {
  /** 错误标识 */
  id: string;
  /** 错误级别 */
  level: ErrorLevel;
  /** 原始错误 */
  error: Error | string;
  /** 错误来源 */
  source: 'api' | 'websocket' | 'render' | 'network' | 'validation';
  /** 相关组件/页面 */
  component?: string;
  /** 用户可读消息 */
  userMessage: string;
  /** 是否可重试 */
  retryable: boolean;
  /** 发生时间 */
  timestamp: number;
  /** 附加数据 */
  metadata?: Record<string, unknown>;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'cache' | 'ignore' | 'redirect';
  label: string;
  execute: () => Promise<void> | void;
}

export interface RecoveryStrategy {
  /** 自动重试次数 */
  maxRetries: number;
  /** 初始重试延迟 (ms) */
  initialDelay: number;
  /** 退避乘数 */
  backoffMultiplier: number;
  /** 最大延迟 (ms) */
  maxDelay: number;
  /** 是否使用抖动 */
  jitter: boolean;
}

const DEFAULT_STRATEGY: RecoveryStrategy = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  jitter: true,
};

// ==================== 错误恢复管理器 ====================

export class ErrorRecoveryManager {
  private errorLog: ErrorContext[] = [];
  private retryCount: Map<string, number> = new Map();
  private maxLogSize: number;
  private strategy: RecoveryStrategy;
  private listeners: Set<(error: ErrorContext) => void> = new Set();

  constructor(strategy: Partial<RecoveryStrategy> = {}, maxLogSize = 100) {
    this.strategy = { ...DEFAULT_STRATEGY, ...strategy };
    this.maxLogSize = maxLogSize;
  }

  /**
   * 记录错误
   */
  report(error: ErrorContext): void {
    this.errorLog.unshift(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(0, this.maxLogSize);
    }
    this.listeners.forEach(fn => fn(error));
  }

  /**
   * 带自动重试的执行
   */
  async executeWithRetry<T>(
    id: string,
    fn: () => Promise<T>,
    options: {
      fallback?: () => T | Promise<T>;
      onRetry?: (attempt: number, delay: number) => void;
      source?: ErrorContext['source'];
      component?: string;
    } = {}
  ): Promise<T> {
    const { fallback, onRetry, source = 'api', component } = options;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.strategy.maxRetries; attempt++) {
      try {
        const result = await fn();
        this.retryCount.delete(id);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.strategy.maxRetries) {
          const delay = this.calculateDelay(attempt);
          onRetry?.(attempt + 1, delay);

          this.report({
            id: `${id}-retry-${attempt}`,
            level: 'L2',
            error: lastError,
            source,
            component,
            userMessage: `第${attempt + 1}次重试中...`,
            retryable: true,
            timestamp: Date.now(),
          });

          await this.sleep(delay);
        }
      }
    }

    // 所有重试失败
    this.report({
      id: `${id}-failed`,
      level: 'L3',
      error: lastError || new Error('Unknown error'),
      source,
      component,
      userMessage: '操作失败，请稍后重试',
      retryable: false,
      timestamp: Date.now(),
    });

    if (fallback) {
      return fallback();
    }

    throw lastError;
  }

  /**
   * 计算退避延迟
   */
  calculateDelay(attempt: number): number {
    let delay = this.strategy.initialDelay * Math.pow(this.strategy.backoffMultiplier, attempt);
    delay = Math.min(delay, this.strategy.maxDelay);

    if (this.strategy.jitter) {
      // ±20% 抖动
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      delay = Math.round(delay + jitter);
    }

    return Math.max(100, delay);
  }

  /**
   * 获取错误日志
   */
  getErrorLog(filter?: { level?: ErrorLevel; source?: ErrorContext['source']; since?: number }): ErrorContext[] {
    let result = this.errorLog;
    if (filter?.level) result = result.filter(e => e.level === filter.level);
    if (filter?.source) result = result.filter(e => e.source === filter.source);
    if (filter?.since) result = result.filter(e => e.timestamp >= filter.since!);
    return result;
  }

  /**
   * 获取错误统计
   */
  getStats(): { total: number; byLevel: Record<ErrorLevel, number>; bySource: Record<string, number>; recentErrors: number } {
    const now = Date.now();
    const hourAgo = now - 3600000;
    const byLevel: Record<ErrorLevel, number> = { L1: 0, L2: 0, L3: 0 };
    const bySource: Record<string, number> = {};

    for (const e of this.errorLog) {
      byLevel[e.level]++;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    }

    return {
      total: this.errorLog.length,
      byLevel,
      bySource,
      recentErrors: this.errorLog.filter(e => e.timestamp >= hourAgo).length,
    };
  }

  /**
   * 订阅错误事件
   */
  subscribe(listener: (error: ErrorContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 清空日志
   */
  clear(): void {
    this.errorLog = [];
    this.retryCount.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== 错误分类器 ====================

export function classifyError(error: Error | string): { level: ErrorLevel; retryable: boolean; userMessage: string } {
  const message = typeof error === 'string' ? error : error.message;
  const lower = message.toLowerCase();

  // 网络错误 → 可重试
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return { level: 'L2', retryable: true, userMessage: '网络连接异常，请检查网络后重试' };
  }

  // 4xx 客户端错误 → 不可重试
  if (lower.includes('400') || lower.includes('401') || lower.includes('403') || lower.includes('404')) {
    return { level: 'L1', retryable: false, userMessage: '请求参数有误' };
  }

  // 5xx 服务端错误 → 可重试
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504')) {
    return { level: 'L2', retryable: true, userMessage: '服务器繁忙，请稍后重试' };
  }

  // 限流
  if (lower.includes('429') || lower.includes('rate limit')) {
    return { level: 'L2', retryable: true, userMessage: '请求过于频繁，请稍后重试' };
  }

  // 默认
  return { level: 'L3', retryable: false, userMessage: '发生未知错误' };
}

// ==================== 导出默认实例 ====================

export const defaultErrorManager = new ErrorRecoveryManager();
