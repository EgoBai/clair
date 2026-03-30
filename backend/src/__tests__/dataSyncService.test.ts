import { describe, it, expect } from 'vitest';

/**
 * 数据同步服务测试
 * 测试同步调度、增量更新、错误重试
 */
describe('Data Sync Service', () => {
  describe('Sync Scheduler', () => {
    interface SyncJob {
      id: string;
      type: 'full' | 'incremental';
      source: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      retries: number;
      maxRetries: number;
      lastRun?: Date;
      nextRun?: Date;
    }

    function createJob(type: 'full' | 'incremental', source: string): SyncJob {
      return {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type,
        source,
        status: 'pending',
        retries: 0,
        maxRetries: 3,
      };
    }

    function shouldRun(job: SyncJob): boolean {
      if (job.status === 'running') return false;
      if (job.retries >= job.maxRetries && job.status === 'failed') return false;
      if (job.nextRun && new Date() < job.nextRun) return false;
      return true;
    }

    it('should create pending job', () => {
      const job = createJob('incremental', 'eastmoney');
      expect(job.status).toBe('pending');
      expect(job.retries).toBe(0);
    });

    it('should not run if already running', () => {
      const job = createJob('full', 'eastmoney');
      job.status = 'running';
      expect(shouldRun(job)).toBe(false);
    });

    it('should not run if max retries exceeded', () => {
      const job = createJob('full', 'eastmoney');
      job.status = 'failed';
      job.retries = 3;
      job.maxRetries = 3;
      expect(shouldRun(job)).toBe(false);
    });

    it('should run pending job', () => {
      const job = createJob('incremental', 'eastmoney');
      expect(shouldRun(job)).toBe(true);
    });
  });

  describe('Incremental Sync Logic', () => {
    function needsSync(lastSync: Date | null, interval: number): boolean {
      if (!lastSync) return true;
      return Date.now() - lastSync.getTime() >= interval;
    }

    it('should sync if never synced', () => {
      expect(needsSync(null, 60000)).toBe(true);
    });

    it('should sync if interval elapsed', () => {
      const lastSync = new Date(Date.now() - 120000);
      expect(needsSync(lastSync, 60000)).toBe(true);
    });

    it('should not sync if interval not elapsed', () => {
      const lastSync = new Date(Date.now() - 30000);
      expect(needsSync(lastSync, 60000)).toBe(false);
    });
  });

  describe('Retry Logic', () => {
    function calculateRetryDelay(retryCount: number): number {
      const baseDelay = 1000;
      const maxDelay = 30000;
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
      return delay + Math.random() * 1000;
    }

    it('should increase delay with retries', () => {
      const d1 = calculateRetryDelay(0);
      const d2 = calculateRetryDelay(1);
      const d3 = calculateRetryDelay(2);
      expect(d1).toBeLessThan(d2);
      expect(d2).toBeLessThan(d3 + 1000); // account for jitter
    });

    it('should cap at max delay', () => {
      const delay = calculateRetryDelay(10);
      expect(delay).toBeLessThanOrEqual(31000);
    });
  });

  describe('Data Source Adapter', () => {
    interface DataSource {
      name: string;
      baseUrl: string;
      rateLimit: number; // requests per minute
      timeout: number;
      priority: number;
    }

    const sources: DataSource[] = [
      { name: 'eastmoney', baseUrl: 'https://push2.eastmoney.com', rateLimit: 30, timeout: 10000, priority: 1 },
      { name: 'sina', baseUrl: 'https://hq.sinajs.cn', rateLimit: 60, timeout: 5000, priority: 2 },
      { name: 'tencent', baseUrl: 'https://qt.gtimg.cn', rateLimit: 60, timeout: 5000, priority: 3 },
    ];

    it('should have data sources configured', () => {
      expect(sources.length).toBeGreaterThanOrEqual(2);
    });

    it('should select by priority', () => {
      const sorted = [...sources].sort((a, b) => a.priority - b.priority);
      expect(sorted[0].name).toBe('eastmoney');
    });

    it('should have valid rate limits', () => {
      sources.forEach(s => {
        expect(s.rateLimit).toBeGreaterThan(0);
        expect(s.timeout).toBeGreaterThan(0);
      });
    });

    it('should calculate request interval from rate limit', () => {
      const getInterval = (rateLimit: number) => 60000 / rateLimit;
      expect(getInterval(30)).toBe(2000);
      expect(getInterval(60)).toBe(1000);
    });
  });

  describe('Batch Processing', () => {
    function processBatches<T>(items: T[], batchSize: number): T[][] {
      const batches: T[][] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }
      return batches;
    }

    it('should split into batches', () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const batches = processBatches(items, 20);
      expect(batches.length).toBe(5);
      expect(batches[0].length).toBe(20);
    });

    it('should handle partial last batch', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const batches = processBatches(items, 10);
      expect(batches.length).toBe(3);
      expect(batches[2].length).toBe(5);
    });

    it('should handle empty input', () => {
      expect(processBatches([], 10).length).toBe(0);
    });

    it('should preserve order', () => {
      const items = [1, 2, 3, 4, 5];
      const batches = processBatches(items, 2);
      const flattened = batches.flat();
      expect(flattened).toEqual(items);
    });
  });

  describe('Conflict Resolution', () => {
    function resolveConflict(local: any, remote: any, strategy: 'local' | 'remote' | 'latest'): any {
      switch (strategy) {
        case 'local': return local;
        case 'remote': return remote;
        case 'latest':
          return (local.updatedAt > remote.updatedAt) ? local : remote;
        default: return remote;
      }
    }

    it('should prefer local when configured', () => {
      const local = { price: 100, updatedAt: 1000 };
      const remote = { price: 110, updatedAt: 2000 };
      expect(resolveConflict(local, remote, 'local').price).toBe(100);
    });

    it('should prefer remote when configured', () => {
      const local = { price: 100 };
      const remote = { price: 110 };
      expect(resolveConflict(local, remote, 'remote').price).toBe(110);
    });

    it('should prefer latest timestamp', () => {
      const local = { price: 100, updatedAt: 1000 };
      const remote = { price: 110, updatedAt: 2000 };
      expect(resolveConflict(local, remote, 'latest').price).toBe(110);
    });
  });
});
