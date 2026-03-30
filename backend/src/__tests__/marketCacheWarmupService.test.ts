import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketCacheWarmupService, createDefaultWarmupTasks } from '../utils/marketCacheWarmupService.js';

describe('MarketCacheWarmupService', () => {
  let service: MarketCacheWarmupService;

  beforeEach(() => {
    service = new MarketCacheWarmupService();
  });

  describe('任务管理', () => {
    it('注册任务', () => {
      service.registerTask({
        id: 'test',
        name: 'Test',
        category: 'stock',
        priority: 5,
        loader: async () => 'data',
        ttl: 60000,
        tags: [],
      });
      expect(service.getTask('test')).toBeDefined();
      expect(service.getTask('test')?.name).toBe('Test');
    });

    it('批量注册', () => {
      service.registerTasks([
        { id: 'a', name: 'A', category: 'stock', priority: 1, loader: async () => null, ttl: 60000, tags: [] },
        { id: 'b', name: 'B', category: 'index', priority: 2, loader: async () => null, ttl: 60000, tags: [] },
      ]);
      expect(service.listTasks().length).toBe(2);
    });

    it('移除任务', () => {
      service.registerTask({ id: 'x', name: 'X', category: 'market', priority: 5, loader: async () => null, ttl: 60000, tags: [] });
      expect(service.removeTask('x')).toBe(true);
      expect(service.getTask('x')).toBeUndefined();
    });

    it('移除不存在的任务返回false', () => {
      expect(service.removeTask('nonexistent')).toBe(false);
    });

    it('按优先级排序列出', () => {
      service.registerTasks([
        { id: 'low', name: 'Low', category: 'stock', priority: 1, loader: async () => null, ttl: 60000, tags: [] },
        { id: 'high', name: 'High', category: 'stock', priority: 10, loader: async () => null, ttl: 60000, tags: [] },
        { id: 'mid', name: 'Mid', category: 'stock', priority: 5, loader: async () => null, ttl: 60000, tags: [] },
      ]);
      const tasks = service.listTasks();
      expect(tasks[0].id).toBe('high');
      expect(tasks[2].id).toBe('low');
    });
  });

  describe('计划管理', () => {
    it('添加计划', () => {
      service.addSchedule({
        name: 'pre-open',
        trigger: 'pre-open',
        tasks: ['task1', 'task2'],
      });
      expect(service.getSchedules().length).toBe(1);
    });

    it('获取计划列表', () => {
      service.addSchedule({ name: 's1', trigger: 'manual', tasks: [] });
      service.addSchedule({ name: 's2', trigger: 'manual', tasks: [] });
      expect(service.getSchedules().length).toBe(2);
    });
  });

  describe('执行', () => {
    it('执行单个任务成功', async () => {
      service.registerTask({
        id: 't1',
        name: 'T1',
        category: 'stock',
        priority: 5,
        loader: async () => ({ data: 'test' }),
        ttl: 60000,
        tags: ['test'],
      });

      const result = await service.executeTask('t1');
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('t1');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.dataSize).toBeGreaterThan(0);
    });

    it('执行不存在的任务', async () => {
      const result = await service.executeTask('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });

    it('执行失败的任务', async () => {
      service.registerTask({
        id: 'fail',
        name: 'Fail',
        category: 'stock',
        priority: 5,
        loader: async () => { throw new Error('load error'); },
        ttl: 60000,
        tags: [],
      });

      const result = await service.executeTask('fail');
      expect(result.success).toBe(false);
      expect(result.error).toContain('load error');
    });

    it('执行计划', async () => {
      service.registerTasks([
        { id: 'a', name: 'A', category: 'stock', priority: 5, loader: async () => 'a', ttl: 60000, tags: [] },
        { id: 'b', name: 'B', category: 'stock', priority: 3, loader: async () => 'b', ttl: 60000, tags: [] },
      ]);
      service.addSchedule({ name: 'test-schedule', trigger: 'manual', tasks: ['a', 'b'] });

      const result = await service.executeSchedule('test-schedule');
      expect(result.schedule).toBe('test-schedule');
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(0);
    });

    it('执行不存在的计划', async () => {
      const result = await service.executeSchedule('no-such');
      expect(result.results.length).toBe(0);
    });

    it('执行全部任务', async () => {
      service.registerTasks([
        { id: 'a', name: 'A', category: 'stock', priority: 5, loader: async () => 'a', ttl: 60000, tags: [] },
        { id: 'b', name: 'B', category: 'index', priority: 10, loader: async () => 'b', ttl: 60000, tags: [] },
      ]);

      const results = await service.executeAll();
      expect(results.length).toBe(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('并发运行中不重复执行', async () => {
      service.registerTask({
        id: 'slow',
        name: 'Slow',
        category: 'market',
        priority: 5,
        loader: async () => { await new Promise(r => setTimeout(r, 50)); return 'done'; },
        ttl: 60000,
        tags: [],
      });

      const [r1, r2] = await Promise.all([
        service.executeAll(),
        service.executeAll(),
      ]);
      // 至少一个返回空
      expect(r1.length + r2.length).toBe(1);
    });
  });

  describe('查询统计', () => {
    it('获取执行结果', async () => {
      service.registerTask({
        id: 't1', name: 'T1', category: 'stock', priority: 5,
        loader: async () => 'data', ttl: 60000, tags: [],
      });
      await service.executeTask('t1');
      expect(service.getResults().length).toBe(1);
    });

    it('统计信息', async () => {
      service.registerTasks([
        { id: 'a', name: 'A', category: 'stock', priority: 5, loader: async () => 'a', ttl: 60000, tags: [] },
        { id: 'b', name: 'B', category: 'index', priority: 5, loader: async () => { throw new Error('fail'); }, ttl: 60000, tags: [] },
      ]);
      await service.executeTask('a');
      await service.executeTask('b');

      const stats = service.getStats();
      expect(stats.totalTasks).toBe(2);
      expect(stats.totalExecutions).toBe(2);
      expect(stats.successRate).toBe(0.5);
      expect(stats.byCategory['stock'].count).toBe(1);
      expect(stats.byCategory['index'].count).toBe(1);
    });

    it('isRunning状态', () => {
      expect(service.isRunning()).toBe(false);
    });
  });

  describe('预设任务', () => {
    it('创建默认预热任务', () => {
      const tasks = createDefaultWarmupTasks();
      expect(tasks.length).toBe(5);
      expect(tasks.some(t => t.id === 'market-status')).toBe(true);
      expect(tasks.some(t => t.id === 'main-indices')).toBe(true);
    });

    it('默认任务按优先级排序', () => {
      const tasks = createDefaultWarmupTasks();
      service.registerTasks(tasks);
      const sorted = service.listTasks();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });

  describe('清理', () => {
    it('clear重置所有', async () => {
      service.registerTask({ id: 't', name: 'T', category: 'market', priority: 5, loader: async () => 'd', ttl: 60000, tags: [] });
      service.addSchedule({ name: 's', trigger: 'manual', tasks: ['t'] });
      await service.executeTask('t');
      service.clear();
      expect(service.listTasks().length).toBe(0);
      expect(service.getSchedules().length).toBe(0);
      expect(service.getResults().length).toBe(0);
    });
  });
});
