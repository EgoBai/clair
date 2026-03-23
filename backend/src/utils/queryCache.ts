/**
 * 数据库查询缓存层
 * 内存缓存 + TTL + 慢查询监控
 * 参考 Bloomberg 数据管道设计
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
}

interface QueryStats {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  slowQueries: number;
  avgQueryTime: number;
  slowestQuery: { sql: string; duration: number } | null;
}

class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private stats: QueryStats = {
    totalQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    slowQueries: 0,
    avgQueryTime: 0,
    slowestQuery: null,
  };
  private queryTimes: number[] = [];
  private slowThreshold: number; // 慢查询阈值(ms)
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(slowThreshold = 500) {
    this.slowThreshold = slowThreshold;

    // 每5分钟清理过期缓存
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 带缓存的查询执行
   */
  async query<T>(
    cacheKey: string,
    fn: () => Promise<T>,
    ttl: number = 30000
  ): Promise<T> {
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      cached.hits++;
      this.stats.cacheHits++;
      return cached.data as T;
    }

    // 执行查询
    this.stats.cacheMisses++;
    this.stats.totalQueries++;

    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;

      // 记录查询时间
      this.queryTimes.push(duration);
      if (this.queryTimes.length > 1000) this.queryTimes = this.queryTimes.slice(-500);

      // 更新平均时间
      this.stats.avgQueryTime = this.queryTimes.reduce((a, b) => a + b, 0) / this.queryTimes.length;

      // 慢查询检测
      if (duration > this.slowThreshold) {
        this.stats.slowQueries++;
        if (!this.stats.slowestQuery || duration > this.stats.slowestQuery.duration) {
          this.stats.slowestQuery = { sql: cacheKey, duration };
        }
        console.warn(`[QueryCache] 慢查询: ${cacheKey} (${duration}ms)`);
      }

      // 写入缓存
      this.cache.set(cacheKey, { data: result, timestamp: Date.now(), ttl, hits: 0 });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`[QueryCache] 查询失败: ${cacheKey} (${duration}ms)`, error);
      throw error;
    }
  }

  /**
   * 手动失效缓存
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): QueryStats & { cacheSize: number; hitRate: number } {
    const total = this.stats.cacheHits + this.stats.cacheMisses;
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      hitRate: total > 0 ? this.stats.cacheHits / total : 0,
    };
  }

  /**
   * 获取热门缓存
   */
  getTopCached(limit = 10): Array<{ key: string; hits: number; ttl: number; age: number }> {
    return Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        hits: entry.hits,
        ttl: entry.ttl,
        age: Date.now() - entry.timestamp,
      }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[QueryCache] 清理 ${cleaned} 条过期缓存`);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.cache.clear();
  }
}

// 单例
export const queryCache = new QueryCache();

export default QueryCache;
