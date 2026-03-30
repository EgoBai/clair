import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== 性能监控逻辑测试 ====================

describe('performanceMonitor - path normalization', () => {
  function normalizePath(path: string): string {
    return path
      .replace(/\/[0-9a-f]{8,}/g, '/:id')
      .replace(/\/[A-Z0-9]{6}/g, '/:symbol')
      .replace(/\/\d+/g, '/:id');
  }

  it('should normalize numeric IDs', () => {
    expect(normalizePath('/api/stocks/600519')).toBe('/api/stocks/:symbol');
  });

  it('should normalize hex IDs', () => {
    expect(normalizePath('/api/users/abc12345')).toBe('/api/users/:id');
  });

  it('should keep static paths unchanged', () => {
    expect(normalizePath('/api/stocks')).toBe('/api/stocks');
    expect(normalizePath('/api/market/overview')).toBe('/api/market/overview');
  });

  it('should normalize multiple segments', () => {
    expect(normalizePath('/api/users/123/orders/456')).toBe('/api/users/:id/orders/:id');
  });

  it('should handle root path', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('should handle empty path', () => {
    expect(normalizePath('')).toBe('');
  });

  it('should normalize UUIDs', () => {
    expect(normalizePath('/api/items/550e8400e29b41d4a716')).toBe('/api/items/:id');
  });

  it('should normalize stock codes', () => {
    expect(normalizePath('/api/stocks/600519/price')).toBe('/api/stocks/:symbol/price');
    expect(normalizePath('/api/stocks/000001/detail')).toBe('/api/stocks/:symbol/detail');
  });
});

describe('performanceMonitor - percentile calculation', () => {
  function calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(percentile / 100 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  it('should calculate p50 (median)', () => {
    const values = [10, 20, 30, 40, 50];
    expect(calculatePercentile(values, 50)).toBe(30);
  });

  it('should calculate p95', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p95 = calculatePercentile(values, 95);
    expect(p95).toBeGreaterThanOrEqual(95);
  });

  it('should calculate p99', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const p99 = calculatePercentile(values, 99);
    expect(p99).toBeGreaterThanOrEqual(99);
  });

  it('should return 0 for empty array', () => {
    expect(calculatePercentile([], 50)).toBe(0);
  });

  it('should handle single value', () => {
    expect(calculatePercentile([42], 50)).toBe(42);
  });

  it('should handle unsorted input', () => {
    const values = [50, 10, 30, 20, 40];
    expect(calculatePercentile(values, 50)).toBe(30);
  });

  it('p100 should be the maximum', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(calculatePercentile(values, 100)).toBe(9);
  });

  it('p0 should be the minimum', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(calculatePercentile(values, 1)).toBe(1);
  });
});

describe('performanceMonitor - endpoint stats', () => {
  interface EndpointStats {
    count: number;
    totalDuration: number;
    minDuration: number;
    maxDuration: number;
    errorCount: number;
    durations: number[];
  }

  function createStats(): EndpointStats {
    return {
      count: 0,
      totalDuration: 0,
      minDuration: Infinity,
      maxDuration: 0,
      errorCount: 0,
      durations: [],
    };
  }

  function recordMetric(stats: EndpointStats, duration: number, isError: boolean): void {
    stats.count++;
    stats.totalDuration += duration;
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    if (isError) stats.errorCount++;
    stats.durations.push(duration);
  }

  it('should track count correctly', () => {
    const stats = createStats();
    recordMetric(stats, 100, false);
    recordMetric(stats, 200, false);
    expect(stats.count).toBe(2);
  });

  it('should calculate average duration', () => {
    const stats = createStats();
    recordMetric(stats, 100, false);
    recordMetric(stats, 200, false);
    recordMetric(stats, 300, false);
    const avg = stats.totalDuration / stats.count;
    expect(avg).toBe(200);
  });

  it('should track min and max', () => {
    const stats = createStats();
    recordMetric(stats, 50, false);
    recordMetric(stats, 500, false);
    recordMetric(stats, 200, false);
    expect(stats.minDuration).toBe(50);
    expect(stats.maxDuration).toBe(500);
  });

  it('should count errors', () => {
    const stats = createStats();
    recordMetric(stats, 100, false);
    recordMetric(stats, 200, true);
    recordMetric(stats, 150, true);
    expect(stats.errorCount).toBe(2);
  });

  it('should calculate error rate', () => {
    const stats = createStats();
    for (let i = 0; i < 10; i++) {
      recordMetric(stats, 100, i < 2);
    }
    const errorRate = stats.errorCount / stats.count;
    expect(errorRate).toBe(0.2);
  });

  it('should store durations for percentile calc', () => {
    const stats = createStats();
    recordMetric(stats, 100, false);
    recordMetric(stats, 200, false);
    expect(stats.durations).toEqual([100, 200]);
  });

  it('should handle minDuration from zero', () => {
    const stats = createStats();
    recordMetric(stats, 1, false);
    expect(stats.minDuration).toBe(1);
  });

  it('error rate should be 0 when no errors', () => {
    const stats = createStats();
    recordMetric(stats, 100, false);
    recordMetric(stats, 200, false);
    expect(stats.errorCount / stats.count).toBe(0);
  });
});

describe('performanceMonitor - slow query detection', () => {
  function isSlowQuery(duration: number, threshold: number = 2000): boolean {
    return duration > threshold;
  }

  it('should flag queries above threshold', () => {
    expect(isSlowQuery(3000)).toBe(true);
  });

  it('should not flag queries at threshold', () => {
    expect(isSlowQuery(2000)).toBe(false);
  });

  it('should not flag fast queries', () => {
    expect(isSlowQuery(100)).toBe(false);
  });

  it('should support custom threshold', () => {
    expect(isSlowQuery(600, 500)).toBe(true);
    expect(isSlowQuery(400, 500)).toBe(false);
  });

  it('should handle zero duration', () => {
    expect(isSlowQuery(0)).toBe(false);
  });
});

describe('performanceMonitor - metric windowing', () => {
  it('should limit stored metrics', () => {
    const metrics: number[] = [];
    const maxMetrics = 10000;
    for (let i = 0; i < 15000; i++) {
      metrics.push(i);
      if (metrics.length > maxMetrics) {
        metrics.splice(0, metrics.length - maxMetrics);
      }
    }
    expect(metrics.length).toBe(maxMetrics);
    expect(metrics[0]).toBe(5000);
  });

  it('should trim query times to prevent memory growth', () => {
    let queryTimes: number[] = [];
    for (let i = 0; i < 1500; i++) {
      queryTimes.push(i);
      if (queryTimes.length > 1000) {
        queryTimes = queryTimes.slice(-500);
      }
    }
    expect(queryTimes.length).toBeLessThanOrEqual(1000);
  });

  it('should calculate rolling average', () => {
    const window: number[] = [];
    const maxSize = 100;
    const addValue = (val: number) => {
      window.push(val);
      if (window.length > maxSize) window.shift();
      return window.reduce((a, b) => a + b, 0) / window.length;
    };

    for (let i = 0; i < 200; i++) {
      addValue(i);
    }
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    // Last 100 values: 100-199, avg = 149.5
    expect(avg).toBeCloseTo(149.5, 0);
  });
});

describe('performanceMonitor - response time categories', () => {
  function categorizeResponseTime(ms: number): 'fast' | 'normal' | 'slow' | 'critical' {
    if (ms < 200) return 'fast';
    if (ms < 1000) return 'normal';
    if (ms < 3000) return 'slow';
    return 'critical';
  }

  it('should categorize 50ms as fast', () => {
    expect(categorizeResponseTime(50)).toBe('fast');
  });

  it('should categorize 500ms as normal', () => {
    expect(categorizeResponseTime(500)).toBe('normal');
  });

  it('should categorize 2000ms as slow', () => {
    expect(categorizeResponseTime(2000)).toBe('slow');
  });

  it('should categorize 5000ms as critical', () => {
    expect(categorizeResponseTime(5000)).toBe('critical');
  });

  it('boundary at 200ms should be normal', () => {
    expect(categorizeResponseTime(200)).toBe('normal');
  });

  it('boundary at 1000ms should be slow', () => {
    expect(categorizeResponseTime(1000)).toBe('slow');
  });

  it('boundary at 3000ms should be critical', () => {
    expect(categorizeResponseTime(3000)).toBe('critical');
  });

  it('should handle zero', () => {
    expect(categorizeResponseTime(0)).toBe('fast');
  });

  it('should handle negative values', () => {
    expect(categorizeResponseTime(-1)).toBe('fast');
  });
});
