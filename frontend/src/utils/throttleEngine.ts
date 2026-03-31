/**
 * API请求节流引擎
 * 防止API过度调用，支持优先级队列和自动降级
 */

export interface ThrottleConfig {
  maxRequestsPerSecond: number;
  maxConcurrent: number;
  queueSize: number;
  timeout: number;
  retryOn429: boolean;
  backoffMultiplier: number;
}

export interface QueuedRequest<T = unknown> {
  id: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: number;
  attempts: number;
  maxRetries: number;
}

export interface ThrottleStats {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  queuedRequests: number;
  activeRequests: number;
  avgResponseTime: number;
  rateLimitedCount: number;
}

export class ThrottleEngine {
  private queue: QueuedRequest[] = [];
  private activeCount = 0;
  private config: ThrottleConfig;
  private stats: ThrottleStats = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    queuedRequests: 0,
    activeRequests: 0,
    avgResponseTime: 0,
    rateLimitedCount: 0,
  };
  private responseTimes: number[] = [];
  private processing = false;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = {
      maxRequestsPerSecond: 10,
      maxConcurrent: 5,
      queueSize: 100,
      timeout: 30000,
      retryOn429: true,
      backoffMultiplier: 2,
      ...config,
    };
  }

  /**
   * 提交请求到队列
   */
  async enqueue<T>(
    id: string,
    execute: () => Promise<T>,
    options: {
      priority?: 'critical' | 'high' | 'normal' | 'low';
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    if (this.queue.length >= this.config.queueSize) {
      throw new Error('请求队列已满，请稍后重试');
    }

    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id,
        priority: options.priority || 'normal',
        execute,
        resolve,
        reject,
        addedAt: Date.now(),
        attempts: 0,
        maxRetries: options.maxRetries ?? 2,
      };

      // 按优先级插入
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      const insertIdx = this.queue.findIndex(
        r => priorityOrder[r.priority] > priorityOrder[request.priority]
      );

      if (insertIdx === -1) {
        this.queue.push(request as QueuedRequest);
      } else {
        this.queue.splice(insertIdx, 0, request as QueuedRequest);
      }

      this.stats.totalRequests++;
      this.stats.queuedRequests = this.queue.length;
      this.processQueue();
    });
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.activeCount < this.config.maxConcurrent) {
      const request = this.queue.shift()!;
      this.stats.queuedRequests = this.queue.length;
      this.executeRequest(request);
    }

    this.processing = false;
  }

  /**
   * 执行单个请求
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    this.activeCount++;
    this.stats.activeRequests = this.activeCount;
    request.attempts++;

    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), this.config.timeout);
      });

      const result = await Promise.race([request.execute(), timeoutPromise]);

      const elapsed = Date.now() - startTime;
      this.responseTimes.push(elapsed);
      if (this.responseTimes.length > 100) this.responseTimes.shift();
      this.stats.avgResponseTime = Math.round(
        this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      );

      this.stats.completedRequests++;
      request.resolve(result);
    } catch (error) {
      const is429 = error instanceof Error && error.message.includes('429');

      if (is429) {
        this.stats.rateLimitedCount++;
      }

      if (
        request.attempts <= request.maxRetries &&
        (this.config.retryOn429 || !is429)
      ) {
        // 指数退避重试
        const delay = Math.pow(this.config.backoffMultiplier, request.attempts) * 1000;
        setTimeout(() => this.executeRequest(request), delay);
        this.activeCount--;
        this.stats.activeRequests = this.activeCount;
        return;
      }

      this.stats.failedRequests++;
      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (request.attempts > request.maxRetries ||
          this.stats.completedRequests > 0) {
        this.activeCount--;
        this.stats.activeRequests = this.activeCount;
      }
    }

    // 继续处理队列
    this.processQueue();
  }

  /**
   * 获取统计数据
   */
  getStats(): ThrottleStats {
    return { ...this.stats };
  }

  /**
   * 清空队列
   */
  clear(): void {
    const error = new Error('队列已清空');
    for (const request of this.queue) {
      request.reject(error);
    }
    this.queue = [];
    this.stats.queuedRequests = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ThrottleConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const throttleEngine = new ThrottleEngine();
export default ThrottleEngine;
