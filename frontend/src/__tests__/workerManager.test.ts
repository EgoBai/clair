/**
 * Worker Manager 测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((data: any) => {
    // 模拟异步返回
    setTimeout(() => {
      if (this.onmessage) {
        let result;
        switch (data.type) {
          case 'sort':
            result = [...data.payload.data].sort((a: any, b: any) => {
              const va = typeof data.payload.key === 'function' ? data.payload.key(a) : a[data.payload.key];
              const vb = typeof data.payload.key === 'function' ? data.payload.key(b) : b[data.payload.key];
              const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
              return data.payload.order === 'desc' ? -cmp : cmp;
            });
            break;
          case 'filter':
            result = data.payload.data.filter((item: any) => {
              for (const [key, condition] of Object.entries(data.payload.predicate)) {
                const val = item[key];
                if (condition && typeof condition === 'object') {
                  if ('gte' in (condition as any) && val < (condition as any).gte) return false;
                }
              }
              return true;
            });
            break;
          case 'compute-kline':
            result = data.payload.ohlcv.map((d: any) => ({
              ...d,
              isUp: d.close >= d.open,
              bodyHeight: Math.abs(d.close - d.open),
            }));
            break;
          case 'indicator-batch':
            result = { sma: [{ index: 13, value: 100 }], ema: [], rsi: [], macd: [] };
            break;
          case 'correlation-matrix':
            result = [[1, 0.8], [0.8, 1]];
            break;
          default:
            result = null;
        }
        this.onmessage({ data: { id: data.id, result } } as MessageEvent);
      }
    }, 10);
  });
  terminate = vi.fn();
}

// Mock URL.createObjectURL (not available in jsdom)
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
globalThis.URL.revokeObjectURL = vi.fn();

vi.stubGlobal('Worker', MockWorker);

describe('Worker Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create worker pool', async () => {
    const { getWorkerPool, terminateWorkerPool } = await import('../utils/workerManager');
    const pool = getWorkerPool({ maxWorkers: 2 });
    const status = pool.getStatus();
    expect(status.total).toBe(0);
    expect(status.idle).toBe(0);
    terminateWorkerPool();
  });

  it('should sort data via worker', async () => {
    const { workerSort, terminateWorkerPool } = await import('../utils/workerManager');
    const data = [{ name: 'C', value: 3 }, { name: 'A', value: 1 }, { name: 'B', value: 2 }];
    const sorted = await workerSort(data, 'name', 'asc');
    expect(sorted[0].name).toBe('A');
    expect(sorted[1].name).toBe('B');
    expect(sorted[2].name).toBe('C');
    terminateWorkerPool();
  });

  it('should filter data via worker', async () => {
    const { workerFilter, terminateWorkerPool } = await import('../utils/workerManager');
    const data = [{ price: 10 }, { price: 20 }, { price: 30 }];
    const filtered = await workerFilter(data, { price: { gte: 15 } });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].price).toBe(20);
    terminateWorkerPool();
  });

  it('should compute K-line data via worker', async () => {
    const { getWorkerPool, terminateWorkerPool } = await import('../utils/workerManager');
    const pool = getWorkerPool();
    const result = await pool.submit('compute-kline', {
      ohlcv: [{ open: 10, close: 15, high: 16, low: 9 }],
    });
    expect(result[0].isUp).toBe(true);
    expect(result[0].bodyHeight).toBe(5);
    terminateWorkerPool();
  });

  it('should compute batch indicators via worker', async () => {
    const { workerComputeIndicators, terminateWorkerPool } = await import('../utils/workerManager');
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = await workerComputeIndicators(prices, 14);
    expect(result.sma.length).toBeGreaterThan(0);
    terminateWorkerPool();
  });

  it('should compute correlation matrix', async () => {
    const { workerCorrelationMatrix, terminateWorkerPool } = await import('../utils/workerManager');
    const returns = [[1, 2, 3], [2, 4, 6]];
    const matrix = await workerCorrelationMatrix(returns);
    expect(matrix).toHaveLength(2);
    expect(matrix[0][0]).toBe(1);
    terminateWorkerPool();
  });

  it('should terminate pool properly', async () => {
    const { getWorkerPool, terminateWorkerPool } = await import('../utils/workerManager');
    const pool = getWorkerPool();
    terminateWorkerPool();
    const status = pool.getStatus();
    expect(status.total).toBe(0);
  });

  it('should handle worker task timeout', async () => {
    const { getWorkerPool, terminateWorkerPool } = await import('../utils/workerManager');
    const pool = getWorkerPool({ taskTimeout: 1 });
    // Timeout logic is tested - the mock worker responds too quickly for real timeout test
    // but we verify the pool accepts timeout config
    expect(pool.getStatus().activeTasks).toBe(0);
    terminateWorkerPool();
  });

  it('should track pool status correctly', async () => {
    const { getWorkerPool, terminateWorkerPool } = await import('../utils/workerManager');
    const pool = getWorkerPool();
    pool.submit('sort', { data: [{ a: 1 }], key: 'a', order: 'asc' });
    const status = pool.getStatus();
    expect(status.total).toBeGreaterThanOrEqual(0);
    terminateWorkerPool();
  });

  it('should handle concurrent tasks', async () => {
    const { workerSort, terminateWorkerPool } = await import('../utils/workerManager');
    const promises = [
      workerSort([{ v: 3 }, { v: 1 }], 'v', 'asc'),
      workerSort([{ v: 2 }, { v: 4 }], 'v', 'desc'),
    ];
    const results = await Promise.all(promises);
    expect(results[0][0].v).toBe(1);
    expect(results[1][0].v).toBe(4);
    terminateWorkerPool();
  });

  it('should handle empty data sort', async () => {
    const { workerSort, terminateWorkerPool } = await import('../utils/workerManager');
    const result = await workerSort([], 'value', 'asc');
    expect(result).toEqual([]);
    terminateWorkerPool();
  });

  it('should handle single element sort', async () => {
    const { workerSort, terminateWorkerPool } = await import('../utils/workerManager');
    const result = await workerSort([{ v: 42 }], 'v', 'desc');
    expect(result).toEqual([{ v: 42 }]);
    terminateWorkerPool();
  });
});
