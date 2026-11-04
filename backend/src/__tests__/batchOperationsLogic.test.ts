/**
 * 批量操作逻辑测试（影子测试迁移）
 *
 * 迁移说明（测试内自实现 → import 生产真源）：
 * - chunkArray → chunk：backend/src/services/batchOperations.ts:121
 *   契约一致：(arr: T[], size: number) => T[][]，空数组、size > length 行为一致。
 * - 新增生产绑定 batchExecute：backend/src/services/batchOperations.ts:90（并发执行 + 按输入序返回 + 单项错误收集）
 * - 新增生产绑定 processInChunks：backend/src/services/batchOperations.ts:132（分片顺序处理）
 *
 * 保留内联（生产无同契约导出，逐条说明候选为何不符）：
 * - calcChunksNeeded：候选 backend/src/utils/apiResponse.ts:93 的 totalPages 是「分页页码」语义，
 *   且封装在响应构造器内部（非独立导出）；没有任何导出接受「总数 + 分片大小」并返回分片数。
 * - estimateBatchDuration：生产 batchExecute(L90) 只负责执行，不做耗时估算，无估算函数导出。
 * - calcRateLimitDelay / canProceedRateLimit / createRateLimiter：
 *   候选 backend/src/middleware/rateLimit.ts:16 的 RateLimiter 类**未导出**；导出的是
 *   rateLimit(L90) 中间件（按客户端 key 计数、内部读取 Date.now、无法注入 now），
 *   与测试的 canProceed(now)/recordRequest 纯逻辑签名不同，无法逐断言绑定。
 *   生产限流中间件行为已由 rateLimit.test.ts / securityEnhancements.test.ts 覆盖。
 * - summarizeResults / partitionBySuccess：入参 BatchResult{id,success,duration} 与
 *   batchExecute 返回的 {item,result?,error?} 形状/语义不同，不可直接绑定。
 * - createRetryPolicy：生产重试为线性退避（backend/src/services/taskScheduler.ts:220
 *   `retryDelay * task.retries`），不存在指数退避策略对象导出，也无 shouldRetry(attempt) 签名。
 * - createProgressTracker：生产无进度跟踪器导出。
 *
 * 非确定性清理：
 * - createRateLimiter.reset() 原先读取系统时钟重置窗口，改为 windowStart = -Infinity
 *   （语义等价：下一次 canProceed(now) 会以传入的 now 开启新窗口），测试不再读墙钟。
 */

import { describe, it, expect } from 'vitest';
import { batchExecute, chunk, processInChunks } from '../services/batchOperations';

interface BatchItem<T = any> {
  id: string;
  data: T;
}

interface BatchResult<T = any> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
  duration: number;
}

interface BatchConfig {
  concurrency: number;
  chunkSize: number;
  retryCount: number;
  retryDelay: number;
  rateLimitPerSecond: number;
}

function calcChunksNeeded(totalItems: number, chunkSize: number): number {
  return Math.ceil(totalItems / chunkSize);
}

function estimateBatchDuration(
  totalItems: number,
  avgItemDuration: number,
  concurrency: number
): number {
  if (concurrency <= 0) return Infinity;
  const batches = Math.ceil(totalItems / concurrency);
  return batches * avgItemDuration;
}

function calcRateLimitDelay(ratePerSecond: number): number {
  if (ratePerSecond <= 0) return Infinity;
  return 1000 / ratePerSecond;
}

function canProceedRateLimit(
  requestCount: number,
  windowStart: number,
  ratePerSecond: number,
  now: number
): boolean {
  const elapsed = now - windowStart;
  if (elapsed >= 1000) return true; // New window
  return requestCount < ratePerSecond;
}

function createRateLimiter(ratePerSecond: number): {
  canProceed: (now: number) => boolean;
  recordRequest: () => void;
  reset: () => void;
} {
  let count = 0;
  let windowStart = 0;
  return {
    canProceed(now: number) {
      if (now - windowStart >= 1000) {
        count = 0;
        windowStart = now;
      }
      return count < ratePerSecond;
    },
    recordRequest() {
      count++;
    },
    reset() {
      count = 0;
      // 不读取系统时钟：置为 -Infinity，下一次 canProceed(now) 必定开启新窗口
      windowStart = -Infinity;
    },
  };
}

function summarizeResults(results: BatchResult[]): {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  avgDuration: number;
  totalDuration: number;
  failedIds: string[];
} {
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  return {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    successRate: results.length > 0 ? succeeded.length / results.length : 0,
    avgDuration: results.length > 0 ? totalDuration / results.length : 0,
    totalDuration,
    failedIds: failed.map(r => r.id),
  };
}

function createRetryPolicy(maxRetries: number, baseDelay: number): {
  shouldRetry: (attempt: number) => boolean;
  getDelay: (attempt: number) => number;
  getMaxAttempts: () => number;
} {
  return {
    shouldRetry(attempt: number) {
      return attempt < maxRetries;
    },
    getDelay(attempt: number) {
      return baseDelay * Math.pow(2, attempt);
    },
    getMaxAttempts() {
      return maxRetries + 1;
    },
  };
}

function partitionBySuccess(results: BatchResult[]): {
  succeeded: BatchResult[];
  failed: BatchResult[];
} {
  return {
    succeeded: results.filter(r => r.success),
    failed: results.filter(r => !r.success),
  };
}

function createProgressTracker(total: number): {
  complete: () => void;
  getProgress: () => { completed: number; total: number; percent: number };
  isComplete: () => boolean;
} {
  let completed = 0;
  return {
    complete() {
      completed = Math.min(completed + 1, total);
    },
    getProgress() {
      return {
        completed,
        total,
        percent: total > 0 ? Math.round((completed / total) * 100) : 100,
      };
    },
    isComplete() {
      return completed >= total;
    },
  };
}

describe('批量操作逻辑', () => {
  describe('chunk（生产：services/batchOperations.ts:121）', () => {
    it('should split into chunks', () => {
      const chunks = chunk([1, 2, 3, 4, 5], 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle exact division', () => {
      const chunks = chunk([1, 2, 3, 4], 2);
      expect(chunks).toHaveLength(2);
    });

    it('should handle chunk larger than array', () => {
      const chunks = chunk([1, 2], 10);
      expect(chunks).toEqual([[1, 2]]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 5)).toEqual([]);
    });
  });

  describe('calcChunksNeeded', () => {
    it('should calculate chunks', () => {
      expect(calcChunksNeeded(10, 3)).toBe(4);
      expect(calcChunksNeeded(9, 3)).toBe(3);
      expect(calcChunksNeeded(1, 3)).toBe(1);
    });

    it('should handle zero items', () => {
      expect(calcChunksNeeded(0, 3)).toBe(0);
    });
  });

  describe('estimateBatchDuration', () => {
    it('should estimate total duration', () => {
      expect(estimateBatchDuration(10, 100, 2)).toBe(500);
      expect(estimateBatchDuration(10, 100, 5)).toBe(200);
    });

    it('should handle zero concurrency', () => {
      expect(estimateBatchDuration(10, 100, 0)).toBe(Infinity);
    });
  });

  describe('calcRateLimitDelay', () => {
    it('should calculate delay between requests', () => {
      expect(calcRateLimitDelay(10)).toBe(100);
      expect(calcRateLimitDelay(1)).toBe(1000);
      expect(calcRateLimitDelay(100)).toBe(10);
    });

    it('should handle zero rate', () => {
      expect(calcRateLimitDelay(0)).toBe(Infinity);
    });
  });

  describe('canProceedRateLimit', () => {
    it('should allow within rate', () => {
      expect(canProceedRateLimit(5, 1000, 10, 1500)).toBe(true);
    });

    it('should deny at rate', () => {
      expect(canProceedRateLimit(10, 1000, 10, 1500)).toBe(false);
    });

    it('should allow after window reset', () => {
      expect(canProceedRateLimit(10, 1000, 10, 2001)).toBe(true);
    });
  });

  describe('createRateLimiter', () => {
    it('should track requests within window', () => {
      const limiter = createRateLimiter(5);
      for (let i = 0; i < 5; i++) {
        expect(limiter.canProceed(1000)).toBe(true);
        limiter.recordRequest();
      }
      expect(limiter.canProceed(1000)).toBe(false);
    });

    it('should reset after window', () => {
      const limiter = createRateLimiter(5);
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }
      expect(limiter.canProceed(2001)).toBe(true);
    });
  });

  describe('summarizeResults', () => {
    const results: BatchResult[] = [
      { id: '1', success: true, duration: 100 },
      { id: '2', success: false, error: 'fail', duration: 200 },
      { id: '3', success: true, duration: 150 },
    ];

    it('should count succeeded/failed', () => {
      const summary = summarizeResults(results);
      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('should calculate success rate', () => {
      expect(summarizeResults(results).successRate).toBeCloseTo(2 / 3);
    });

    it('should list failed ids', () => {
      expect(summarizeResults(results).failedIds).toEqual(['2']);
    });

    it('should handle empty results', () => {
      const summary = summarizeResults([]);
      expect(summary.total).toBe(0);
      expect(summary.successRate).toBe(0);
    });
  });

  describe('createRetryPolicy', () => {
    it('should allow retries within limit', () => {
      const policy = createRetryPolicy(3, 100);
      expect(policy.shouldRetry(0)).toBe(true);
      expect(policy.shouldRetry(2)).toBe(true);
      expect(policy.shouldRetry(3)).toBe(false);
    });

    it('should use exponential backoff', () => {
      const policy = createRetryPolicy(3, 100);
      expect(policy.getDelay(0)).toBe(100);
      expect(policy.getDelay(1)).toBe(200);
      expect(policy.getDelay(2)).toBe(400);
    });

    it('should return correct max attempts', () => {
      expect(createRetryPolicy(3, 100).getMaxAttempts()).toBe(4);
    });
  });

  describe('partitionBySuccess', () => {
    it('should separate succeeded and failed', () => {
      const results: BatchResult[] = [
        { id: '1', success: true, duration: 100 },
        { id: '2', success: false, duration: 200 },
      ];
      const { succeeded, failed } = partitionBySuccess(results);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });

  describe('createProgressTracker', () => {
    it('should track completion', () => {
      const tracker = createProgressTracker(10);
      expect(tracker.getProgress().percent).toBe(0);

      tracker.complete();
      tracker.complete();
      tracker.complete();
      expect(tracker.getProgress()).toEqual({ completed: 3, total: 10, percent: 30 });
    });

    it('should detect completion', () => {
      const tracker = createProgressTracker(2);
      tracker.complete();
      expect(tracker.isComplete()).toBe(false);
      tracker.complete();
      expect(tracker.isComplete()).toBe(true);
    });

    it('should not exceed total', () => {
      const tracker = createProgressTracker(1);
      tracker.complete();
      tracker.complete();
      expect(tracker.getProgress().completed).toBe(1);
    });
  });

  // ==================== 生产真源绑定（新增） ====================

  describe('batchExecute（生产：services/batchOperations.ts:90）', () => {
    it('should preserve input order and collect per-item errors', async () => {
      const results = await batchExecute(
        [1, 2, 3],
        async n => {
          if (n === 2) throw new Error('boom');
          return n * 10;
        },
        2
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ item: 1, result: 10 });
      expect(results[1].item).toBe(2);
      expect(results[1].error).toBeInstanceOf(Error);
      expect(results[2]).toEqual({ item: 3, result: 30 });
    });

    it('should execute every item once', async () => {
      const seen: number[] = [];
      const results = await batchExecute(
        [5, 6, 7, 8],
        async n => {
          seen.push(n);
          return n;
        },
        3
      );

      expect(results.map(r => r.result)).toEqual([5, 6, 7, 8]);
      expect(seen.sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
    });

    it('should return empty array for empty input', async () => {
      const results = await batchExecute([], async (n: number) => n);
      expect(results).toEqual([]);
    });
  });

  describe('processInChunks（生产：services/batchOperations.ts:132）', () => {
    it('should process in chunks preserving order', async () => {
      const results = await processInChunks([1, 2, 3, 4, 5], async n => n * 2, 2, 0);
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should return empty array for empty input', async () => {
      const results = await processInChunks([], async (n: number) => n, 2, 0);
      expect(results).toEqual([]);
    });
  });
});
