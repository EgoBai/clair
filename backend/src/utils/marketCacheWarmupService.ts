/**
 * 行情缓存预热服务
 * 针对A股市场的智能预热策略
 * Round 101: 缓存预热
 */

import { multiLevelCache } from './multiLevelCache.js';

// 预热任务
export interface WarmupTask {
  id: string;
  name: string;
  category: 'market' | 'stock' | 'sector' | 'index' | 'financial';
  priority: number;
  loader: () => Promise<any>;
  ttl: number;
  tags: string[];
}

// 预热结果
export interface WarmupResult {
  taskId: string;
  success: boolean;
  duration: number;
  dataSize: number;
  error?: string;
}

// 预热计划
export interface WarmupSchedule {
  name: string;
  trigger: 'pre-open' | 'post-open' | 'midday' | 'pre-close' | 'post-close' | 'manual';
  tasks: string[]; // task IDs
}

export class MarketCacheWarmupService {
  private tasks = new Map<string, WarmupTask>();
  private schedules: WarmupSchedule[] = [];
  private results: WarmupResult[] = [];
  private resultLimit = 200;
  private running = false;

  // ========== 任务管理 ==========

  registerTask(task: WarmupTask): void {
    this.tasks.set(task.id, task);
  }

  registerTasks(tasks: WarmupTask[]): void {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  removeTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  getTask(id: string): WarmupTask | undefined {
    return this.tasks.get(id);
  }

  listTasks(): WarmupTask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.priority - a.priority);
  }

  // ========== 计划管理 ==========

  addSchedule(schedule: WarmupSchedule): void {
    this.schedules.push(schedule);
  }

  getSchedules(): WarmupSchedule[] {
    return [...this.schedules];
  }

  // ========== 执行 ==========

  async executeTask(taskId: string): Promise<WarmupResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { taskId, success: false, duration: 0, dataSize: 0, error: 'Task not found' };
    }

    const start = Date.now();
    try {
      const data = await task.loader();
      const dataStr = JSON.stringify(data);
      const dataSize = dataStr.length * 2;

      multiLevelCache.setL2(
        `warmup:${task.category}:${task.id}`,
        data,
        task.ttl,
        task.tags
      );

      const result: WarmupResult = {
        taskId,
        success: true,
        duration: Date.now() - start,
        dataSize,
      };
      this.recordResult(result);
      return result;
    } catch (err) {
      const result: WarmupResult = {
        taskId,
        success: false,
        duration: Date.now() - start,
        dataSize: 0,
        error: String(err),
      };
      this.recordResult(result);
      return result;
    }
  }

  async executeSchedule(scheduleName: string): Promise<{
    schedule: string;
    results: WarmupResult[];
    totalDuration: number;
    successCount: number;
    failCount: number;
  }> {
    const schedule = this.schedules.find(s => s.name === scheduleName);
    if (!schedule) {
      return { schedule: scheduleName, results: [], totalDuration: 0, successCount: 0, failCount: 0 };
    }

    const start = Date.now();
    const results: WarmupResult[] = [];

    // 按优先级排序执行
    const sortedTasks = schedule.tasks
      .map(id => this.tasks.get(id))
      .filter((t): t is WarmupTask => !!t)
      .sort((a, b) => b.priority - a.priority);

    for (const task of sortedTasks) {
      const result = await this.executeTask(task.id);
      results.push(result);
    }

    return {
      schedule: scheduleName,
      results,
      totalDuration: Date.now() - start,
      successCount: results.filter(r => r.success).length,
      failCount: results.filter(r => !r.success).length,
    };
  }

  async executeAll(): Promise<WarmupResult[]> {
    if (this.running) return [];
    this.running = true;

    try {
      const sorted = this.listTasks();
      const results: WarmupResult[] = [];

      // 并行执行相同优先级的任务
      const byPriority = new Map<number, WarmupTask[]>();
      for (const task of sorted) {
        const group = byPriority.get(task.priority) || [];
        group.push(task);
        byPriority.set(task.priority, group);
      }

      const priorities = Array.from(byPriority.keys()).sort((a, b) => b - a);
      for (const priority of priorities) {
        const group = byPriority.get(priority)!;
        const batchResults = await Promise.all(
          group.map(t => this.executeTask(t.id))
        );
        results.push(...batchResults);
      }

      return results;
    } finally {
      this.running = false;
    }
  }

  // ========== 查询 ==========

  getResults(limit = 50): WarmupResult[] {
    return this.results.slice(-limit);
  }

  getStats(): {
    totalTasks: number;
    totalExecutions: number;
    successRate: number;
    avgDuration: number;
    totalDataSize: number;
    byCategory: Record<string, { count: number; successRate: number }>;
  } {
    const totalExecutions = this.results.length;
    const successes = this.results.filter(r => r.success).length;
    const avgDuration = totalExecutions > 0
      ? this.results.reduce((s, r) => s + r.duration, 0) / totalExecutions
      : 0;
    const totalDataSize = this.results.reduce((s, r) => s + r.dataSize, 0);

    const byCategory: Record<string, { count: number; successRate: number }> = {};
    for (const task of this.tasks.values()) {
      const taskResults = this.results.filter(r => r.taskId === task.id);
      byCategory[task.category] = byCategory[task.category] || { count: 0, successRate: 0 };
      byCategory[task.category].count += taskResults.length;
      const catSuccesses = taskResults.filter(r => r.success).length;
      byCategory[task.category].successRate = taskResults.length > 0
        ? catSuccesses / taskResults.length
        : 0;
    }

    return {
      totalTasks: this.tasks.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? successes / totalExecutions : 0,
      avgDuration,
      totalDataSize,
      byCategory,
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  // ========== 清理 ==========

  clear(): void {
    this.tasks.clear();
    this.schedules = [];
    this.results = [];
    this.running = false;
  }

  // ========== 内部 ==========

  private recordResult(result: WarmupResult): void {
    this.results.push(result);
    if (this.results.length > this.resultLimit) {
      this.results = this.results.slice(-Math.floor(this.resultLimit / 2));
    }
  }
}

// 预定义的A股预热任务
export function createDefaultWarmupTasks(): WarmupTask[] {
  return [
    {
      id: 'market-status',
      name: '市场状态',
      category: 'market',
      priority: 10,
      loader: async () => ({ status: 'trading', session: 'continuous' }),
      ttl: 30000,
      tags: ['market', 'status'],
    },
    {
      id: 'top-stocks',
      name: '热门股票Top50',
      category: 'stock',
      priority: 8,
      loader: async () => [], // placeholder
      ttl: 60000,
      tags: ['stocks', 'hot'],
    },
    {
      id: 'sector-summary',
      name: '板块概况',
      category: 'sector',
      priority: 7,
      loader: async () => [],
      ttl: 120000,
      tags: ['sectors'],
    },
    {
      id: 'main-indices',
      name: '主要指数',
      category: 'index',
      priority: 9,
      loader: async () => [
        { code: 'sh000001', name: '上证指数' },
        { code: 'sz399001', name: '深证成指' },
        { code: 'sz399006', name: '创业板指' },
      ],
      ttl: 30000,
      tags: ['indices', 'main'],
    },
    {
      id: 'financial-calendar',
      name: '财经日历',
      category: 'financial',
      priority: 5,
      loader: async () => [],
      ttl: 3600000,
      tags: ['financial', 'calendar'],
    },
  ];
}

export const marketCacheWarmupService = new MarketCacheWarmupService();
export default MarketCacheWarmupService;
