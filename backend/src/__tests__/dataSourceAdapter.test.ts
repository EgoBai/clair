/**
 * 数据源适配器测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataSourceManager, DataUpdateScheduler } from '../data-sync/dataSourceAdapter';

describe('DataSourceManager', () => {
  let manager: DataSourceManager;

  beforeEach(() => {
    manager = new DataSourceManager();
  });

  describe('Data Source Configuration', () => {
    it('should initialize with default sources', () => {
      const sources = manager.getAvailableSources();
      expect(sources.length).toBeGreaterThan(0);
    });

    it('should return only enabled sources', () => {
      const sources = manager.getAvailableSources();
      sources.forEach(s => expect(s.enabled).toBe(true));
    });

    it('should sort sources by priority', () => {
      const sources = manager.getAvailableSources();
      for (let i = 1; i < sources.length; i++) {
        expect(sources[i].priority).toBeGreaterThanOrEqual(sources[i - 1].priority);
      }
    });
  });

  describe('Fetch With Fallback', () => {
    it('should return data from first successful source', async () => {
      const mockData = [{ code: '000001', name: '平安银行' }];
      const result = await manager.fetchWithFallback(async () => mockData);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.count).toBe(1);
    });

    it('should fallback to next source on failure', async () => {
      let callCount = 0;
      const result = await manager.fetchWithFallback(async (source) => {
        callCount++;
        if (source.priority === 1) throw new Error('Source 1 failed');
        return [{ code: '000002' }];
      });
      expect(result.success).toBe(true);
      expect(callCount).toBeGreaterThan(1);
    });

    it('should return failure when all sources fail', async () => {
      const result = await manager.fetchWithFallback(async () => {
        throw new Error('All sources down');
      });
      expect(result.success).toBe(false);
      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('should include fetch time in result', async () => {
      const result = await manager.fetchWithFallback(async () => {
        await new Promise(r => setTimeout(r, 10));
        return [{ code: '000001' }];
      });
      expect(result.fetchTime).toBeGreaterThanOrEqual(0);
    });

    it('should track source name in result', async () => {
      const result = await manager.fetchWithFallback(async () => [{ code: '000001' }]);
      expect(result.source).toBeTruthy();
      expect(typeof result.source).toBe('string');
    });
  });

  describe('Data Quality Check', () => {
    it('should validate required fields', () => {
      const data = [
        { code: '000001', name: '平安银行', price: 10.5 },
        { code: '000002', name: '万科A', price: 15.2 },
      ];
      const report = manager.checkDataQuality(data, ['code', 'name']);
      expect(report.totalRecords).toBe(2);
      expect(report.validRecords).toBe(2);
      expect(report.qualityScore).toBe(100);
    });

    it('should detect missing required fields', () => {
      const data = [
        { code: '000001', name: '平安银行' },
        { code: '000002' }, // missing name
      ];
      const report = manager.checkDataQuality(data, ['code', 'name']);
      expect(report.invalidRecords).toBe(1);
      expect(report.qualityScore).toBe(50);
    });

    it('should run custom validators', () => {
      const data = [
        { code: '000001', price: 10.5 },
        { code: '000002', price: -5 },
      ];
      const report = manager.checkDataQuality(
        data,
        ['code'],
        { price: (v: unknown) => typeof v === 'number' && v > 0 }
      );
      expect(report.validRecords).toBe(1);
      expect(report.invalidRecords).toBe(1);
    });

    it('should handle empty data', () => {
      const report = manager.checkDataQuality([], ['code']);
      expect(report.totalRecords).toBe(0);
      expect(report.qualityScore).toBe(100);
    });

    it('should include issue details', () => {
      const data = [
        { code: null, name: 'test' },
        { code: null, name: 'test2' },
      ];
      const report = manager.checkDataQuality(data, ['code']);
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0].type).toContain('missing');
    });

    it('should limit examples to 3 per issue', () => {
      const data = Array(10).fill({ name: 'test' }); // all missing code
      const report = manager.checkDataQuality(data, ['code']);
      const codeIssue = report.issues.find(i => i.type.includes('code'));
      expect(codeIssue?.examples.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Source Status', () => {
    it('should return status for all sources', () => {
      const status = manager.getSourceStatus();
      expect(status.length).toBeGreaterThan(0);
      status.forEach(s => {
        expect(s.name).toBeTruthy();
        expect(s.type).toBeTruthy();
        expect(typeof s.enabled).toBe('boolean');
        expect(typeof s.priority).toBe('number');
      });
    });

    it('should include stats with zero initial values', () => {
      const status = manager.getSourceStatus();
      status.forEach(s => {
        expect(s.stats.totalRequests).toBe(0);
        expect(s.stats.successRequests).toBe(0);
        expect(s.stats.successRate).toBe(0);
      });
    });

    it('should include rate limit info', () => {
      const status = manager.getSourceStatus();
      status.forEach(s => {
        if (s.rateLimit) {
          expect(s.rateLimit.used).toBe(0);
          expect(s.rateLimit.limit).toBeGreaterThan(0);
          expect(s.rateLimit.remaining).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Custom Sources', () => {
    it('should accept custom source configuration', () => {
      const customSources = [{
        name: 'Custom',
        type: 'tushare' as const,
        baseUrl: 'https://custom.api',
        rateLimit: 100,
        priority: 1,
        enabled: true,
      }];
      const customManager = new DataSourceManager(customSources);
      const sources = customManager.getAvailableSources();
      expect(sources).toHaveLength(1);
      expect(sources[0].name).toBe('Custom');
    });

    it('should handle disabled sources', () => {
      const sources = [{
        name: 'Disabled',
        type: 'sina' as const,
        baseUrl: 'https://disabled.api',
        rateLimit: 100,
        priority: 1,
        enabled: false,
      }];
      const customManager = new DataSourceManager(sources);
      expect(customManager.getAvailableSources()).toHaveLength(0);
    });
  });
});

describe('DataUpdateScheduler', () => {
  let manager: DataSourceManager;
  let scheduler: DataUpdateScheduler;

  beforeEach(() => {
    manager = new DataSourceManager();
    scheduler = new DataUpdateScheduler(manager);
  });

  describe('Task Scheduling', () => {
    it('should register a scheduled task', () => {
      scheduler.schedule('test-task', 1000, async () => {});
      const status = scheduler.getTaskStatus();
      expect(status.activeTasks).toContain('test-task');
      expect(status.taskCount).toBe(1);
    });

    it('should replace existing task with same name', () => {
      scheduler.schedule('test-task', 1000, async () => {});
      scheduler.schedule('test-task', 2000, async () => {});
      const status = scheduler.getTaskStatus();
      expect(status.taskCount).toBe(1);
    });

    it('should track multiple tasks', () => {
      scheduler.schedule('task1', 1000, async () => {});
      scheduler.schedule('task2', 2000, async () => {});
      const status = scheduler.getTaskStatus();
      expect(status.taskCount).toBe(2);
    });
  });

  describe('Task Cancellation', () => {
    it('should cancel a specific task', () => {
      scheduler.schedule('task1', 1000, async () => {});
      scheduler.cancel('task1');
      const status = scheduler.getTaskStatus();
      expect(status.activeTasks).not.toContain('task1');
    });

    it('should handle cancelling non-existent task', () => {
      scheduler.cancel('non-existent');
      // Should not throw
    });
  });

  describe('Stop All', () => {
    it('should stop all tasks', () => {
      scheduler.schedule('task1', 1000, async () => {});
      scheduler.schedule('task2', 2000, async () => {});
      scheduler.stopAll();
      const status = scheduler.getTaskStatus();
      expect(status.taskCount).toBe(0);
    });
  });

  describe('Task Status', () => {
    it('should include source status', () => {
      const status = scheduler.getTaskStatus();
      expect(status.sourceStatus).toBeDefined();
      expect(Array.isArray(status.sourceStatus)).toBe(true);
    });
  });
});
