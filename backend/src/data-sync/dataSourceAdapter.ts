/**
 * 数据源适配器
 * 统一接口对接 Tushare / AKShare 等数据源
 * 支持数据更新调度 + 质量监控
 */

export interface DataSourceConfig {
  name: string;
  type: 'tushare' | 'akshare' | 'eastmoney' | 'sina';
  token?: string;
  baseUrl: string;
  rateLimit: number; // 每分钟请求数
  priority: number;   // 优先级 1最高
  enabled: boolean;
}

export interface DataFetchResult<T> {
  success: boolean;
  data: T[];
  source: string;
  fetchTime: number; // 毫秒
  count: number;
  error?: string;
}

export interface DataQualityReport {
  source: string;
  checkTime: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  qualityScore: number; // 0-100
  issues: { type: string; count: number; examples: string[] }[];
  latency: { avg: number; max: number; min: number };
}

// ==================== 数据源配置 ====================

const DATA_SOURCES: DataSourceConfig[] = [
  {
    name: 'Tushare',
    type: 'tushare',
    baseUrl: 'https://api.tushare.pro',
    rateLimit: 200,
    priority: 1,
    enabled: true,
  },
  {
    name: 'AKShare',
    type: 'akshare',
    baseUrl: 'https://akshare.akfamily.xyz',
    rateLimit: 300,
    priority: 2,
    enabled: true,
  },
  {
    name: '东方财富',
    type: 'eastmoney',
    baseUrl: 'https://push2.eastmoney.com',
    rateLimit: 500,
    priority: 3,
    enabled: true,
  },
  {
    name: '新浪财经',
    type: 'sina',
    baseUrl: 'https://hq.sinajs.cn',
    rateLimit: 600,
    priority: 4,
    enabled: true,
  },
];

// ==================== 速率控制器 ====================

class RateLimiter {
  private requests: number[] = [];
  constructor(private limit: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < 60000);
    if (this.requests.length >= this.limit) {
      const waitTime = 60000 - (now - this.requests[0]) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.requests.push(Date.now());
  }

  getUsage(): { used: number; limit: number; remaining: number } {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < 60000);
    return {
      used: this.requests.length,
      limit: this.limit,
      remaining: this.limit - this.requests.length,
    };
  }
}

// ==================== 数据源适配器 ====================

export class DataSourceManager {
  private sources: DataSourceConfig[];
  private limiters: Map<string, RateLimiter>;
  private fetchStats: Map<string, { total: number; success: number; totalTime: number }>;

  constructor(sources = DATA_SOURCES) {
    this.sources = sources.sort((a, b) => a.priority - b.priority);
    this.limiters = new Map();
    this.fetchStats = new Map();

    this.sources.forEach(s => {
      this.limiters.set(s.name, new RateLimiter(s.rateLimit));
      this.fetchStats.set(s.name, { total: 0, success: 0, totalTime: 0 });
    });
  }

  /**
   * 获取可用数据源列表
   */
  getAvailableSources(): DataSourceConfig[] {
    return this.sources.filter(s => s.enabled);
  }

  /**
   * 从最优数据源获取数据
   */
  async fetchWithFallback<T>(
    fetchFn: (source: DataSourceConfig) => Promise<T[]>,
  ): Promise<DataFetchResult<T>> {
    const enabledSources = this.getAvailableSources();

    for (const source of enabledSources) {
      const limiter = this.limiters.get(source.name);
      const stats = this.fetchStats.get(source.name);
      if (!limiter || !stats) continue;

      try {
        await limiter.acquire();
        const start = Date.now();
        const data = await fetchFn(source);
        const elapsed = Date.now() - start;

        stats.total++;
        stats.success++;
        stats.totalTime += elapsed;

        return {
          success: true,
          data,
          source: source.name,
          fetchTime: elapsed,
          count: data.length,
        };
      } catch (error) {
        const stats = this.fetchStats.get(source.name);
        if (stats) stats.total++;
        console.warn(`数据源 ${source.name} 获取失败，尝试下一个:`, error);
        continue;
      }
    }

    return {
      success: false,
      data: [],
      source: 'none',
      fetchTime: 0,
      count: 0,
      error: '所有数据源均不可用',
    };
  }

  /**
   * 数据质量检查
   */
  checkDataQuality<T extends Record<string, unknown>>(
    data: T[],
    requiredFields: (keyof T)[],
    validators?: Partial<Record<keyof T, (val: unknown) => boolean>>,
  ): DataQualityReport {
    const issues: { type: string; count: number; examples: string[] }[] = [];
    let validRecords = 0;
    const latencies: number[] = [];

    const issueMap: Map<string, { count: number; examples: string[] }> = new Map();

    for (const record of data) {
      let isValid = true;

      // 检查必填字段
      for (const field of requiredFields) {
        if (record[field] === undefined || record[field] === null) {
          isValid = false;
          const issue = issueMap.get(`missing_${String(field)}`) || { count: 0, examples: [] };
          issue.count++;
          if (issue.examples.length < 3) {
            issue.examples.push(JSON.stringify(record).slice(0, 100));
          }
          issueMap.set(`missing_${String(field)}`, issue);
        }
      }

      // 自定义验证
      if (validators) {
        for (const [field, validator] of Object.entries(validators)) {
          if (record[field] !== undefined && !validator(record[field])) {
            isValid = false;
            const issue = issueMap.get(`invalid_${field}`) || { count: 0, examples: [] };
            issue.count++;
            if (issue.examples.length < 3) {
              issue.examples.push(`${field}=${record[field]}`);
            }
            issueMap.set(`invalid_${field}`, issue);
          }
        }
      }

      if (isValid) validRecords++;
    }

    for (const [type, detail] of issueMap) {
      issues.push({ type, ...detail });
    }

    const qualityScore = data.length > 0 ? Math.round((validRecords / data.length) * 100) : 100;

    return {
      source: 'data-quality-check',
      checkTime: new Date().toISOString(),
      totalRecords: data.length,
      validRecords,
      invalidRecords: data.length - validRecords,
      qualityScore,
      issues,
      latency: { avg: 0, max: 0, min: 0 },
    };
  }

  /**
   * 获取数据源状态
   */
  getSourceStatus() {
    return this.sources.map(source => {
      const stats = this.fetchStats.get(source.name);
      const limiter = this.limiters.get(source.name);
      const usage = limiter?.getUsage();

      return {
        name: source.name,
        type: source.type,
        enabled: source.enabled,
        priority: source.priority,
        stats: {
          totalRequests: stats?.total || 0,
          successRequests: stats?.success || 0,
          successRate: stats && stats.total > 0
            ? +((stats.success / stats.total) * 100).toFixed(1)
            : 0,
          avgLatency: stats && stats.success > 0
            ? +(stats.totalTime / stats.success).toFixed(0)
            : 0,
        },
        rateLimit: usage,
      };
    });
  }
}

// ==================== 调度器 ====================

export class DataUpdateScheduler {
  private timers: Map<string, NodeJS.Timer> = new Map();
  private manager: DataSourceManager;

  constructor(manager: DataSourceManager) {
    this.manager = manager;
  }

  /**
   * 注册定时更新任务
   */
  schedule(taskName: string, intervalMs: number, task: () => Promise<void>) {
    // 清除已有的同名任务
    this.cancel(taskName);

    const timer = setInterval(async () => {
      try {
        await task();
      } catch (error) {
        console.error(`定时任务 ${taskName} 执行失败:`, error);
      }
    }, intervalMs);

    this.timers.set(taskName, timer);
    console.log(`定时任务已注册: ${taskName}, 间隔: ${intervalMs / 1000}s`);
  }

  /**
   * 取消定时任务
   */
  cancel(taskName: string) {
    const timer = this.timers.get(taskName);
    if (timer) {
      clearInterval(timer as unknown as number);
      this.timers.delete(taskName);
    }
  }

  /**
   * 获取任务状态
   */
  getTaskStatus() {
    return {
      activeTasks: Array.from(this.timers.keys()),
      taskCount: this.timers.size,
      sourceStatus: this.manager.getSourceStatus(),
    };
  }

  /**
   * 停止所有任务
   */
  stopAll() {
    for (const [name, timer] of this.timers) {
      clearInterval(timer as unknown as number);
    }
    this.timers.clear();
  }
}

// 单例
export const dataSourceManager = new DataSourceManager();
export const dataUpdateScheduler = new DataUpdateScheduler(dataSourceManager);
