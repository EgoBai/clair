/**
 * 缓存中间件
 * Express中间件集成缓存层
 * 支持：响应缓存、请求去重、ETag、条件缓存
 * Round 102: 缓存中间件集成
 */

// 缓存配置
export interface CacheMiddlewareConfig {
  ttl: number; // 默认TTL(ms)
  methods: string[]; // 缓存的HTTP方法
  statusCodes: number[]; // 缓存的状态码
  keyGenerator?: (req: any) => string; // 自定义key生成
  shouldCache?: (req: any, res: any) => boolean; // 是否缓存判断
  varyByHeaders?: string[]; // 按请求头变化
  tags?: string[]; // 缓存标签
}

// 缓存响应
interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  timestamp: number;
  ttl: number;
  etag: string;
}

// 去重请求
interface PendingRequest {
  key: string;
  promise: Promise<any>;
  timestamp: number;
}

export class CacheMiddleware {
  private responseCache = new Map<string, CachedResponse>();
  private pendingRequests = new Map<string, PendingRequest>();
  private config: CacheMiddlewareConfig;
  private stats = {
    hits: 0,
    misses: 0,
    stale: 0,
    deduplicated: 0,
    bypassed: 0,
  };
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config?: Partial<CacheMiddlewareConfig>) {
    this.config = {
      ttl: 30000,
      methods: ['GET'],
      statusCodes: [200],
      varyByHeaders: [],
      tags: [],
      ...config,
    };

    this.cleanupTimer = setInterval(() => this.cleanup(), 60000);
  }

  // ========== 核心方法 ==========

  /**
   * 生成缓存key
   */
  generateKey(req: { method: string; url: string; headers?: Record<string, string> }): string {
    if (this.config.keyGenerator) {
      return this.config.keyGenerator(req);
    }

    let key = `${req.method}:${req.url}`;

    // vary by headers
    if (this.config.varyByHeaders?.length && req.headers) {
      const varyParts = this.config.varyByHeaders
        .map(h => `${h}=${req.headers![h.toLowerCase()] || ''}`)
        .join('&');
      key += `:${varyParts}`;
    }

    return key;
  }

  /**
   * 获取缓存响应
   */
  get(key: string): CachedResponse | null {
    const cached = this.responseCache.get(key);
    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // 检查过期
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.responseCache.delete(key);
      this.stats.stale++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return cached;
  }

  /**
   * 设置缓存响应
   */
  set(key: string, response: Omit<CachedResponse, 'timestamp' | 'etag'>): void {
    const etag = this.computeETag(response.body);
    this.responseCache.set(key, {
      ...response,
      timestamp: Date.now(),
      etag,
    });
  }

  /**
   * 检查ETag是否匹配
   */
  checkETag(key: string, ifNoneMatch?: string): { match: boolean; etag: string } | null {
    const cached = this.responseCache.get(key);
    if (!cached) return null;
    return {
      match: ifNoneMatch === cached.etag,
      etag: cached.etag,
    };
  }

  /**
   * 请求去重 - 同一key的并发请求只执行一次
   */
  async deduplicate<T>(key: string, executor: () => Promise<T>): Promise<T> {
    const existing = this.pendingRequests.get(key);
    if (existing && Date.now() - existing.timestamp < 30000) {
      this.stats.deduplicated++;
      return existing.promise as Promise<T>;
    }

    const promise = executor().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, {
      key,
      promise,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * 检查是否应缓存此请求
   */
  shouldCache(req: { method: string }, res?: { statusCode?: number }): boolean {
    if (!this.config.methods.includes(req.method)) {
      this.stats.bypassed++;
      return false;
    }

    if (res?.statusCode && !this.config.statusCodes.includes(res.statusCode)) {
      this.stats.bypassed++;
      return false;
    }

    if (this.config.shouldCache && res) {
      return this.config.shouldCache(req, res);
    }

    return true;
  }

  // ========== Express中间件 ==========

  /**
   * 返回Express中间件函数
   */
  middleware() {
    return (req: any, res: any, next: any) => {
      if (!this.shouldCache(req)) {
        return next();
      }

      const key = this.generateKey(req);
      const cached = this.get(key);

      if (cached) {
        // ETag检查
        const ifNoneMatch = req.headers?.['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === cached.etag) {
          res.status(304).end();
          return;
        }

        res.set({ ...cached.headers, 'X-Cache': 'HIT', ETag: cached.etag });
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      // 拦截响应以缓存
      const originalSend = res.send.bind(res);
      res.send = (body: any) => {
        if (this.shouldCache(req, res)) {
          this.set(key, {
            statusCode: res.statusCode,
            headers: res.getHeaders ? res.getHeaders() : {},
            body,
            ttl: this.config.ttl,
          });
        }
        res.set('X-Cache', 'MISS');
        return originalSend(body);
      };

      next();
    };
  }

  // ========== 统计 ==========

  getStats(): typeof this.stats & { cacheSize: number; pendingRequests: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      cacheSize: this.responseCache.size,
      pendingRequests: this.pendingRequests.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  // ========== 配置 ==========

  updateConfig(config: Partial<CacheMiddlewareConfig>): void {
    Object.assign(this.config, config);
  }

  getConfig(): CacheMiddlewareConfig {
    return { ...this.config };
  }

  // ========== 清理 ==========

  invalidate(pattern?: string): number {
    if (!pattern) {
      const size = this.responseCache.size;
      this.responseCache.clear();
      return size;
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let removed = 0;
    for (const key of this.responseCache.keys()) {
      if (regex.test(key)) {
        this.responseCache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, cached] of this.responseCache) {
      if (now - cached.timestamp > cached.ttl) {
        this.responseCache.delete(key);
      }
    }
    // 清理过期的pending请求
    for (const [key, pending] of this.pendingRequests) {
      if (now - pending.timestamp > 30000) {
        this.pendingRequests.delete(key);
      }
    }
  }

  clear(): void {
    this.responseCache.clear();
    this.pendingRequests.clear();
    this.stats = { hits: 0, misses: 0, stale: 0, deduplicated: 0, bypassed: 0 };
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.clear();
  }

  // ========== 内部 ==========

  private computeETag(body: any): string {
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `"${Math.abs(hash).toString(36)}"`;
  }
}

export const cacheMiddleware = new CacheMiddleware();
export default CacheMiddleware;
