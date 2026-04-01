import { describe, it, expect } from 'vitest';

/**
 * 批量操作服务逻辑测试
 * BatchOperations 并发/分片/限流逻辑
 */

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

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
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
      windowStart = Date.now();
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
  describe('chunkArray', () => {
    it('should split into chunks', () => {
      const chunks = chunkArray([1, 2, 3, 4, 5], 2);
      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle exact division', () => {
      const chunks = chunkArray([1, 2, 3, 4], 2);
      expect(chunks).toHaveLength(2);
    });

    it('should handle chunk larger than array', () => {
      const chunks = chunkArray([1, 2], 10);
      expect(chunks).toEqual([[1, 2]]);
    });

    it('should handle empty array', () => {
      expect(chunkArray([], 5)).toEqual([]);
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
});
